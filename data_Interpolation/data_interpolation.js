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
    const tEnd = document.getElementById("cut-time-end").value;

    if (!tStart || !tEnd) {
        alert("Enter both times");
        return;
    }

    let startDate = new Date(tStart.replace(" ", "T"));
    let endDate = new Date(tEnd.replace(" ", "T"));

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        alert("Invalid format: YYYY-MM-DD HH:MM");
        return;
    }

    const startMinutes = (startDate - firstTimestamp) / 60000;
    const endMinutes = (endDate - firstTimestamp) / 60000;

    let cutCount = 0;
    for (let i = 0; i < rawTimes.length; i++) {
        if (rawTimes[i] >= startMinutes && rawTimes[i] <= endMinutes) {
            cutMask[i] = true;
            cutCount++;
        }
    }

    console.log(`Cut ${cutCount} points`);
    plotRawData();
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
    // User selects ONLY a start date
    // -----------------------------
    const tStart = document.getElementById("cut-time-start").value;
    if (!tStart) {
        alert("Enter a start date");
        return;
    }

    const startDate = new Date(tStart.replace(" ", "T"));
    if (isNaN(startDate.getTime())) {
        alert("Invalid format: YYYY-MM-DD HH:MM");
        return;
    }

    // -----------------------------
    // Define 1-week cut region
    // -----------------------------
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const cutStartDate = startDate;
    const cutEndDate = new Date(startDate.getTime() + oneWeekMs);

    // -----------------------------
    // Mark cutMask for exactly 1 week
    // -----------------------------
    cutMask = rawDates.map(d => (d >= cutStartDate && d <= cutEndDate));

    // -----------------------------
    // Define interpolation window:
    // 1 week before + 1 week after
    // -----------------------------
    const leftWindowStart = new Date(cutStartDate.getTime() - oneWeekMs);
    const leftWindowEnd   = cutStartDate;

    const rightWindowStart = cutEndDate;
    const rightWindowEnd   = new Date(cutEndDate.getTime() + oneWeekMs);

    // -----------------------------
    // Build full kept data (for plotting)
    // -----------------------------
    const fullKept = rawTimes
        .map((t, i) => ({
            t,
            level: rawLevels[i],
            date: rawDates[i],
            cut: cutMask[i]
        }))
        .filter(p => !p.cut)   // keep everything except the cut
        .sort((a, b) => a.t - b.t);

    // -----------------------------
    // Build LOCAL kept data (for RBF only)
    // -----------------------------
    const localKept = fullKept.filter(p => {
        const d = p.date;
        return (
            (d >= leftWindowStart && d <= leftWindowEnd) ||
            (d >= rightWindowStart && d <= rightWindowEnd)
        );
    });

    if (localKept.length < 2) {
        alert("Not enough local data for interpolation.");
        return;
    }

    // -----------------------------
    // Build guide points from actual cut timestamps
    // -----------------------------
    const guidePoints = [];

    const leftBoundary = fullKept.find(p => p.date < cutStartDate);
    const rightBoundary = fullKept.find(p => p.date > cutEndDate);

    if (leftBoundary && rightBoundary) {
        const leftLevel = leftBoundary.level;
        const rightLevel = rightBoundary.level;

        // Collect actual cut timestamps
        const cutPoints = rawTimes
            .map((t, i) => ({
                t,
                date: rawDates[i],
                cut: cutMask[i]
            }))
            .filter(p => p.cut);

        // Assign placeholder levels using linear interpolation
        for (let i = 0; i < cutPoints.length; i++) {
            const p = cutPoints[i];

            const alpha = (p.date - cutStartDate) / (cutEndDate - cutStartDate);

            const guideLevel = leftLevel * (1 - alpha) + rightLevel * alpha;

            guidePoints.push({
                t: p.t,
                level: guideLevel,
                date: p.date,
                cut: true
            });
        }
    }

    // Full kept data for plotting (full timeline)
    const keptTimesFull = fullKept.map(p => p.t);
    const keptLevelsFull = fullKept.map(p => p.level);


    // Combine local kept data + actual cut timestamps (with placeholder levels)
    const localPlusGuides = localKept.concat(guidePoints);

    // Downsample for stability
    const keptTimes = localPlusGuides.map(p => p.t).filter((_, i) => i % 5 === 0);
    const keptLevels = localPlusGuides.map(p => p.level).filter((_, i) => i % 5 === 0);


    // -----------------------------
    // Build RBF interpolator
    // -----------------------------
    try {
        const rbf = new RBFInterpolator(keptTimes, keptLevels, epsilon, kernel);

        let interpTimes = [];
        let interpLevels = [];

        for (let i = 0; i < rawTimes.length; i++) {
            if (cutMask[i]) {
                const t = rawTimes[i];
                interpTimes.push(t);
                interpLevels.push(rbf.predict(t));
            }
        }

        // -----------------------------
        // Red cut lines (shapes)
        // -----------------------------
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

        // -----------------------------
        // Plot FULL timeline + interpolation
        // -----------------------------
        Plotly.react("plot-area", [
            {
                x: keptTimesFull.map(t => new Date(firstTimestamp.getTime() + t * 60000)),
                y: keptLevelsFull,
                mode: "lines+markers",
                name: "Kept Data (Full Timeline)",
                line: { color: "blue", width: 2 }
            },
            {
                x: interpTimes.map(t => new Date(firstTimestamp.getTime() + t * 60000)),
                y: interpLevels,
                mode: "lines",
                name: "Interpolation",
                line: { color: "red", dash: "dot", width: 3 },
            }

        ], {
            title: `Kernel: ${kernel} (ε = ${epsilon})`,
            xaxis: { title: "Date & Time" },
            yaxis: { title: "Water Level (m)" },
            height: 500,
            shapes: shapes
        });

    } catch (error) {
        console.error("Interpolation failed:", error);
        alert(`Interpolation failed: ${error.message}`);
    }
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
