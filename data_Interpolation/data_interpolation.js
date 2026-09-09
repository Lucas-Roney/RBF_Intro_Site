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

        rawDates = zipped.map(z => z.d);
        rawLevels = zipped.map(z => z.level);


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
                line: { color: "black", width: 2, dash: "dashdot" }
            },
            {
                type: "line",
                x0: cutEndDate,
                x1: cutEndDate,
                y0: 0,
                y1: 1,
                yref: "paper",
                line: { color: "black", width: 2, dash: "dashdot" }
            }
        );
    }

    Plotly.newPlot("plot-area", [
        {
            x: rawDates,
            y: rawLevels,
            mode: "lines",
            name: "Kept Data",
            line: { color: "rgba(0,0,255,0.5)", width: 2 },
            connectgaps: false
        },
        {
            x: rawDates,
            y: rawLevels,
            mode: "markers",
            name: "Data Points",
            marker: {
                size: 5,
                color: "blue",
                opacity: 0.8
            }
        }

    ], {
        title: "Tidal Data (Downsampled)",
        xaxis: { title: "Date & Time" },
        yaxis: { title: "Water Level (m)" },
        autosize: false,
        width: 1058,
        height: 500,
        height: 500,
        shapes: shapes,
        showlegend: true
    });
}

async function findBestEpsilon() {
    if (!csvLoaded) return;

    // -----------------------------
    // Determine cut boundaries
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
        alert("No cut region defined.");
        return;
    }

    // -----------------------------
    // Abort if gap > 1 week
    // -----------------------------
    const gapMs = cutEndDate - cutStartDate;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    if (gapMs > oneWeekMs) {
        alert("Best epsilon search disabled for gaps larger than 1 week.");
        return;
    }

    // -----------------------------
    // Extract cut nodes
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

    // Downsample cut nodes
    const stride = 5;
    const downsampledCut = cutNodes.filter((_, i) => i % stride === 0);

    // -----------------------------
    // Boundary endpoints
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
    // Epsilon sweep
    // -----------------------------
    const epsilons = [];
    for (let e = 0.01; e <= 0.75; e += 0.01) epsilons.push(e);

    let bestE = null;
    let bestErr = Infinity;

    for (const e of epsilons) {
        try {
            const rbf = new RBFInterpolator(
                trainTimes,
                trainLevels,
                e,
                document.getElementById("kernel").value
            );

            // Compute error at raw cut nodes
            let err = 0;
            for (let i = 0; i < cutNodes.length; i++) {
                const real = cutNodes[i].level;
                const pred = rbf.predict(cutNodes[i].t);
                err += Math.abs(real - pred);
            }
            const avgErr = err / cutNodes.length;

            // Live updates
            document.getElementById("error-display").innerText = `${avgErr.toFixed(10)}`;
            document.getElementById("epsilon").value = e.toFixed(2);

            // Update plot
            await interpolate();

            // ⭐ Zoom into cut region during sweep
            Plotly.relayout("plot-area", {
                "xaxis.range": [
                    new Date(cutStartDate.getTime() - 6 * 60 * 60 * 1000), // 6h before
                    new Date(cutEndDate.getTime() + 6 * 60 * 60 * 1000)    // 6h after
                ]
            });

            if (avgErr < bestErr) {
                bestErr = avgErr;
                bestE = e;
            }

            await new Promise(r => setTimeout(r, 10));

        } catch {
            // Skip unstable epsilons
        }
    }

    // -----------------------------
    // Final best epsilon
    // -----------------------------
    document.getElementById("epsilon").value = bestE.toFixed(2);
    document.getElementById("error-display").innerText = `${bestErr.toFixed(10)}`;

    interpolate();

    // ⭐ Final zoom after best epsilon found
    Plotly.relayout("plot-area", {
        "xaxis.range": [
            new Date(cutStartDate.getTime() - 6 * 60 * 60 * 1000),
            new Date(cutEndDate.getTime() + 6 * 60 * 60 * 1000)
        ]
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

    // Read values directly from your HTML inputs
    const startStr = document.getElementById("cut-time-start").value;
    const endStr   = document.getElementById("cut-time-end").value;

    if (!startStr || !endStr) {
        alert("Enter both start and end times.");
        return;
    }

    const startDate = new Date(startStr.replace(" ", "T"));
    const endDate   = new Date(endStr.replace(" ", "T"));

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        alert("Invalid format: YYYY-MM-DD HH:MM");
        return;
    }

    if (endDate <= startDate) {
        alert("End time must be after start time.");
        return;
    }

    // Mark cutMask for exactly the chosen region
    cutMask = rawDates.map(d => (d >= startDate && d <= endDate));

    console.log("Cut region:", startDate, "to", endDate);
    console.log("Points cut:", cutMask.filter(x => x).length);

    plotRawData();
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
                row[i] += 1e-8;   // ★ tiny diagonal regularization
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
        // Dense grid for smooth plotting
    // -----------------------------
    const denseInterpTimes = [];
    const N = 500; // number of points for smooth curve

    const t0 = cutNodes[0].t;
    const t1 = cutNodes[cutNodes.length - 1].t;

    for (let i = 0; i < N; i++) {
        const alpha = i / (N - 1);
        denseInterpTimes.push(t0 + alpha * (t1 - t0));
    }

    const denseInterpLevels = denseInterpTimes.map(t => rbf.predict(t));

    // Also compute interpolation at raw cut nodes (for error)
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
            line: { color: "black", width: 2, dash: "dashdot" }
        },
        {
            type: "line",
            x0: cutEndDate,
            x1: cutEndDate,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "black", width: 2, dash: "dashdot" }
        }
    ];

    Plotly.react("plot-area", [
    // 1. Kept data (solid blue, gap created with nulls)
    {
        x: rawDates.map((d, i) => cutMask[i] ? null : d),
        y: rawLevels.map((lvl, i) => cutMask[i] ? null : lvl),
        mode: "lines",
        name: "Kept Data",
        autosize: false,
        width: 1058,
        height: 500,
        line: { color: "rgba(0,0,255,0.5)", width: 2 },
        connectgaps: false
    },

    {
        x: rawDates.map((d, i) => cutMask[i] ? null : d),
        y: rawLevels.map((lvl, i) => cutMask[i] ? null : lvl),
        mode: "markers",
        name: "Data Points",
        marker: {
            size: 5,
            color: "blue",
            opacity: 0.8
        }
    },


    // 2. Interpolation (dotted red)
    {
        x: denseInterpTimes.map(t => new Date(firstTimestamp.getTime() + t * 60000)),
        y: denseInterpLevels,
        autosize: false,
        width: 1058,
        height: 500,
        mode: "lines",
        name: "Interpolation",
        line: { color: "red", width: 2, dash: "dot" }
    },

    // Red markers only at actual cut data (downsampled)
    {
        x: downsampledCut.map(p => p.date),
        y: downsampledCut.map(p => p.level),
        mode: "markers",
        name: "Cut Sample Points",
        marker: {
            size: 5,
            color: "red"
        }
    },


    // 3. Real cut data (faded blue)
    {
        x: cutNodes.map(p => p.date),
        y: cutNodes.map(p => p.level),
        autosize: false,
        width: 1058,
        height: 500,
        mode: "lines",
        name: "Cut Data",
        line: { color: "rgba(0, 0, 255, 0.3)", width: 2 }
    }



], {
    title: `Kernel: ${kernel} (ε = ${epsilon})`,
    xaxis: { title: "Date & Time" },
    yaxis: { title: "Water Level (m)" },
    width: 1058,
    height: 500,
    shapes: shapes
});

let err = 0;
for (let i = 0; i < cutNodes.length; i++) {
    const real = cutNodes[i].level;
    const pred = interpLevels[i];
    err += Math.abs(real - pred);
}
const avgErr = err / cutNodes.length;

try {
    document.getElementById("error-display").innerText = `${avgErr.toFixed(10)}`;
} catch (err) {
    document.getElementById("error-display").innerText = "";
}

}



// =========================
// LISTENERS
// =========================

document.getElementById("epsilon").addEventListener("input", () => {
    interpolate();

    // Determine cut boundaries
    let cutStartDate = null;
    let cutEndDate = null;

    for (let i = 0; i < cutMask.length; i++) {
        if (cutMask[i]) {
            if (cutStartDate === null) cutStartDate = rawDates[i];
            cutEndDate = rawDates[i];
        }
    }

    // If no cut region, do nothing
    if (!cutStartDate || !cutEndDate) return;

    // Zoom into cut region with a 6-hour buffer
    Plotly.relayout("plot-area", {
        "xaxis.range": [
            new Date(cutStartDate.getTime() - 6 * 60 * 60 * 1000),
            new Date(cutEndDate.getTime() + 6 * 60 * 60 * 1000)
        ]
    });
});

document.getElementById("kernel").addEventListener("change", interpolate);
document.getElementById("show-raw-btn").addEventListener("click", showRawData);
document.getElementById("best-epsilon-btn").addEventListener("click", findBestEpsilon);

// Show raw data functionality
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
