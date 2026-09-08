// =========================
// GLOBALS
// =========================
let rawTimes = [];
let rawLevels = [];
let rawDates = [];
let cutMask = [];
let firstTimestamp = null;
let csvLoaded = false;


// =========================
// LOAD & DOWNSAMPLE CSV
// =========================
async function loadCSV() {
    try {
        // IMPORTANT: Spaces in filenames must be encoded
        const safePath = "TidalData.csv";

        const response = await fetch(safePath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();
        const lines = text.trim().split("\n").slice(1);

        let dates = [];
        let levels = [];

        for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split(",");
            if (parts.length < 2) continue;

            // Clean timestamp
            let ts = parts[0].trim().replace(/^"|"$/g, "");
            ts = ts.replace(" ", "T");

            const timestamp = new Date(ts);
            const waterLevel = parseFloat(parts[1].trim());

            if (!isNaN(timestamp.getTime()) && !isNaN(waterLevel)) {
                dates.push(timestamp);
                levels.push(waterLevel);
            }
        }

        if (dates.length === 0) throw new Error("No valid data points");

        // Sort by timestamp
        const zipped = dates.map((d, i) => ({ d, level: levels[i] }));
        zipped.sort((a, b) => a.d - b.d);

        // Downsample (optional)
        const downsampled = [];
        for (let i = 0; i < zipped.length; i += 2) {
            downsampled.push(zipped[i]);
        }

        rawDates = downsampled.map(z => z.d);
        rawLevels = downsampled.map(z => z.level);

        firstTimestamp = rawDates[0];
        rawTimes = rawDates.map(d => (d - firstTimestamp) / 60000);

        cutMask = new Array(rawTimes.length).fill(false);
        csvLoaded = true;

        console.log(`Loaded ${rawTimes.length} points`);
        plotRawData();

    } catch (error) {
        alert(`Error loading CSV: ${error.message}`);
        console.error(error);
    }
}


// =========================
// PLOT RAW DATA
// =========================
function plotRawData() {
    if (!csvLoaded) return;

    const keptDates = rawDates.filter((_, i) => !cutMask[i]);
    const keptLevels = rawLevels.filter((_, i) => !cutMask[i]);


    if (keptDates.length === 0) {
        alert("No data to display.");
        return;
    }

    // Find cut section boundaries
    let cutStartDate = null;
    let cutEndDate = null;
    
    for (let i = 0; i < cutMask.length; i++) {
        if (cutMask[i]) {
            if (cutStartDate === null) {
                cutStartDate = rawDates[i];
            }
            cutEndDate = rawDates[i];
        }
    }

    // Build vertical lines for cut section
    let shapes = [];
    if (cutStartDate !== null && cutEndDate !== null) {
        shapes.push(
            {
                type: "line",
                x0: cutStartDate,
                x1: cutStartDate,
                y0: 0,
                y1: 1,
                yref: "paper",
                line: { color: "red", width: 2, dash: "dot" }
            },
            {
                type: "line",
                x0: cutEndDate,
                x1: cutEndDate,
                y0: 0,
                y1: 1,
                yref: "paper",
                line: { color: "red", width: 2, dash: "dot" }
            }
        );
    }

    Plotly.newPlot("plot-area", [
        {
            x: keptDates,
            y: keptLevels,
            mode: "lines+markers",
            name: "Tidal Data",
            line: { color: "blue", width: 2 },
            marker: {
                size: 6,
                color: "white",
                line: { color: "blue", width: 2 }
            }
        }
    ], {
        title: "Tidal Data (Downsampled)",
        xaxis: { title: "Date & Time" },
        yaxis: { title: "Water Level (m)" },
        height: 500,
        shapes: shapes
    });
}

// =========================
// CUT SECTION BY TIME
// =========================
document.getElementById("cut-time-btn").addEventListener("click", () => {
    if (!csvLoaded) {
        alert("Data not loaded.");
        return;
    }

    const tStart = document.getElementById("cut-time-start").value;
    if (!tStart) {
        alert("Enter a start time");
        return;
    }

    let startDate = new Date(tStart.replace(" ", "T"));
    if (isNaN(startDate.getTime())) {
        alert("Invalid format: YYYY-MM-DD HH:MM");
        return;
    }

    // Define 1-week cut region
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const endDate = new Date(startDate.getTime() + oneWeekMs);

    // Mark cutMask for exactly 1 week
    cutMask = rawDates.map(d => (d >= startDate && d <= endDate));

    console.log("Cut region:", startDate, "to", endDate);

    // Show the cut region visually
    plotRawData();

    // Now interpolate over the cut region
    interpolate();
});


// =========================
// RBF INTERPOLATOR
// =========================
const Kernels = {
    GA: (r, e) => Math.exp(-((e * r) ** 2)),
    MQ: (r, e) => Math.sqrt(1 + (e * r) ** 2),
    IMQ: (r, e) => 1 / Math.sqrt(1 + (e * r) ** 2),
    IQ: (r, e) => 1 / (1 + (e * r) ** 2)
};

class RBFInterpolator {
    constructor(x, y, epsilon, kernelName) {
        this.x = x;
        this.y = y;
        this.epsilon = epsilon;
        this.kernel = Kernels[kernelName];
        this.weights = this.computeWeights();
    }

    computeWeights() {
        try {
            const n = this.x.length;
            let A = [];

            for (let i = 0; i < n; i++) {
                let row = [];
                for (let j = 0; j < n; j++) {
                    const r = Math.abs(this.x[i] - this.x[j]);
                    row.push(this.kernel(r, this.epsilon));
                }
                A.push(row);
            }

            const yMatrix = this.y.map(v => [v]);
            const w = math.lusolve(A, yMatrix);
            console.log(`${w}}`);
            console.log(`Weights length: ${w.length}`);
            return w.map(row => row[0]);
        } catch (err) {
        console.error("RBF matrix solve failed:", err);
        throw new Error("RBF matrix is singular or ill-conditioned");
        }
    }

   predict(xVal) {
    let total = 0;
    for (let j = 0; j < this.x.length; j++) {
        const r = Math.abs(xVal - this.x[j]);
        const k = this.kernel(r, this.epsilon);
        if (!isFinite(k)) throw new Error("Kernel returned NaN");
        total += this.weights[j] * k;
    }
    if (!isFinite(total)) throw new Error("Prediction returned NaN");
    return total;
    }
}


// =========================
// INTERPOLATE
// =========================
function interpolate() {
    if (!csvLoaded) return;

    const kernel = document.getElementById("kernel").value;
    const epsilon = parseFloat(document.getElementById("epsilon").value);

    // -----------------------------
    // Determine cut boundaries from cutMask
    // -----------------------------
    let cutStartDate = null;
    let cutEndDate = null;

    for (let i = 0; i < cutMask.length; i++) {
        if (cutMask[i]) {
            if (cutStartDate === null) cutStartDate = rawDates[i];
            cutEndDate = rawDates[i];
        }
    }

    if (!cutStartDate || !cutEndDate) {
        console.log("No cut region defined.");
        return;
    }

    // -----------------------------
    // Extract REAL cut nodes
    // -----------------------------
    const cutNodes = rawTimes
        .map((t, i) => ({
            t,
            level: rawLevels[i],
            date: rawDates[i],
            index: i
        }))
        .filter(p => cutMask[p.index]);

    if (cutNodes.length < 3) {
        alert("Cut region too small");
        return;
    }

    // -----------------------------
    // Downsample REAL cut nodes
    // -----------------------------
    const stride = 5; // adjust as needed
    const downsampledCut = cutNodes.filter((_, i) => i % stride === 0);

    // -----------------------------
    // Find boundary endpoints
    // -----------------------------
    const leftBoundary = rawTimes
        .map((t, i) => ({ t, level: rawLevels[i], date: rawDates[i] }))
        .filter(p => p.date < cutStartDate)
        .slice(-1)[0];

    const rightBoundary = rawTimes
        .map((t, i) => ({ t, level: rawLevels[i], date: rawDates[i] }))
        .filter(p => p.date > cutEndDate)[0];

    if (!leftBoundary || !rightBoundary) {
        alert("Missing boundary points");
        return;
    }

    // -----------------------------
    // Build RBF training set
    // -----------------------------
    const trainTimes = [
        leftBoundary.t,
        ...downsampledCut.map(p => p.t),
        rightBoundary.t
    ];

    const trainLevels = [
        leftBoundary.level,
        ...downsampledCut.map(p => p.level),
        rightBoundary.level
    ];

    // -----------------------------
    // Train RBF
    // -----------------------------
    let rbf;
    try {
        rbf = new RBFInterpolator(trainTimes, trainLevels, epsilon, kernel);
    } catch (err) {
        alert("RBF failed: " + err.message);
        return;
    }

    // -----------------------------
    // Predict ONLY for cut nodes
    // -----------------------------
    const interpTimes = cutNodes.map(p => p.t);
    const interpLevels = cutNodes.map(p => rbf.predict(p.t));

    // -----------------------------
    // Plot
    // -----------------------------
    const keptNodes = rawTimes
        .map((t, i) => ({
            t,
            level: rawLevels[i],
            date: rawDates[i]
        }))
        .filter((_, i) => !cutMask[i]);

    const shapes = [
        {
            type: "line",
            x0: cutStartDate,
            x1: cutStartDate,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "red", width: 2, dash: "dot" }
        },
        {
            type: "line",
            x0: cutEndDate,
            x1: cutEndDate,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "red", width: 2, dash: "dot" }
        }
    ];

    Plotly.react("plot-area", [
        {
            x: keptNodes.map(p => p.date),
            y: keptNodes.map(p => p.level),
            mode: "lines+markers",
            name: "Kept Data",
            line: { color: "blue", width: 2 }
        },
        {
            x: interpTimes.map(t => new Date(firstTimestamp.getTime() + t * 60000)),
            y: interpLevels,
            mode: "lines",
            name: "Interpolation",
            line: { color: "red", dash: "dot", width: 3 }
        }
    ], {
        title: `Kernel: ${kernel} (ε = ${epsilon})`,
        xaxis: { title: "Date & Time" },
        yaxis: { title: "Water Level (m)" },
        height: 500,
        shapes: shapes
    });
}





document.getElementById("cut-time-btn").addEventListener("click", interpolate);
document.getElementById("epsilon").addEventListener("input", interpolate);
document.getElementById("kernel").addEventListener("change", interpolate);
document.getElementById("show-raw-btn").addEventListener("click", showRawData);

function showRawData() {
    if (!csvLoaded) return;

    // Reset cut mask
    cutMask = new Array(rawTimes.length).fill(false);

    // Replot original data
    plotRawData();
}


// =========================
// LOAD
// =========================
loadCSV();
