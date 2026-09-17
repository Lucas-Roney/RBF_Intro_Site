// =========================
// GLOBALS
// =========================
let rawTimes = [];
let rawLevels = [];
let rawDates = [];
let cutMask = [];
let firstTimestamp = null;
let csvLoaded = false;
let currentStride = 5; // Global downsampling stride for cut sections


// =========================
// LOAD & DOWNSAMPLE CSV
// =========================
async function loadCSV(filename) {
    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();

        // Reset globals
        rawTimes = [];
        rawLevels = [];
        rawDates = [];
        cutMask = [];
        firstTimestamp = null;

        // Parse CSV
        const lines = text.trim().split("\n");
        for (let i = 1; i < lines.length; i++) {
            const [dateStr, levelStr] = lines[i].split(",");

            const date = new Date(dateStr);
            const level = parseFloat(levelStr);

            if (!firstTimestamp) firstTimestamp = date;

            rawDates.push(date);
            rawLevels.push(level);

            // Convert to minutes since first timestamp
            const t = (date - firstTimestamp) / 60000;
            rawTimes.push(t);
        }

        cutMask = new Array(rawTimes.length).fill(false);
        csvLoaded = true;

        autoSetCutInputs();
        plotRawData();

    } catch (error) {
        alert(`Error loading CSV: ${error.message}`);
        console.error(error);
    }
}

async function loadNOAA(stationId = "9411340") {
    try {
        const today = new Date();
        const pastDate = new Date(today);
        pastDate.setDate(pastDate.getDate() - 14);

        const formatDate = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}${m}${d}`;
        };

        const begin = formatDate(pastDate);
        const end = formatDate(today);

        const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=${stationId}&product=water_level&datum=MLLW&units=metric&time_zone=lst_ldt&format=json&begin_date=${begin}&end_date=${end}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const json = await response.json();

        if (json.error) {
            throw new Error(json.error.message || "NOAA API returned an error");
        }

        if (!json.data || json.data.length === 0) {
            throw new Error("NOAA returned no data");
        }

        // Reset globals
        rawTimes = [];
        rawLevels = [];
        rawDates = [];
        cutMask = [];
        firstTimestamp = null;

        json.data.forEach(entry => {
            const isoStr = entry.t.includes("T") ? entry.t : entry.t.replace(" ", "T");
            const date = new Date(isoStr);
            const level = parseFloat(entry.v);

            if (isNaN(date.getTime()) || isNaN(level)) return;

            if (!firstTimestamp) firstTimestamp = date;

            rawDates.push(date);
            rawLevels.push(level);

            const t = (date - firstTimestamp) / 60000;
            rawTimes.push(t);
        });

        cutMask = new Array(rawTimes.length).fill(false);
        csvLoaded = true;

        autoSetCutInputs();
        plotRawData();

    } catch (err) {
        alert(`NOAA fetch failed: ${err.message}. Falling back to local dataset.`);
        console.error(err);

        const select = document.getElementById("csv-select");
        select.value = "Wilmington_tidal.csv";
        loadCSV("Wilmington_tidal.csv");
    }
}

function autoSetCutInputs() {
    if (rawDates.length === 0) return;

    const choice = document.getElementById("csv-select").value.toLowerCase();

    // Dataset-specific hardcoded ranges
    if (choice.includes("wilmington")) {
        document.getElementById("cut-time-start").value = "2026-03-25 12:00";
        document.getElementById("cut-time-end").value = "2026-03-27 12:00";
        return;
    }

    if (choice.includes("rhode") || choice.includes("rhoade")) {
        document.getElementById("cut-time-start").value = "2026-03-15 12:00";
        document.getElementById("cut-time-end").value = "2026-03-16 12:00";
        return;
    }

    // Dynamic fallback for other datasets / NOAA
    const pad = (n) => String(n).padStart(2, '0');
    const formatInputDate = (d) => 
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const midIndex = Math.floor(rawDates.length / 2);
    const startDate = rawDates[midIndex];
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

    document.getElementById("cut-time-start").value = formatInputDate(startDate);
    document.getElementById("cut-time-end").value = formatInputDate(endDate);
}


// =========================
// PLOT RAW DATA
// =========================
function plotRawData() {
    if (!csvLoaded) return;

    const keptDates = rawDates.filter((_, i) => !cutMask[i]);
    if (keptDates.length === 0) {
        alert("No data to display.");
        return;
    }

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
        title: "<b>Tidal Data</b>",
        xaxis: { title: "Date & Time" },
        yaxis: { title: "Water Level (m)" },
        autosize: false,
        width: 1080,
        height: 490,
        shapes: shapes,
        showlegend: true
    });
}


// =========================
// INTERPOLATORS & FACTORY
// =========================
const Kernels = {
    RBF: (r, e) => Math.sqrt(1 + (e * r) ** 2),
};

class RBFInterpolator {
    constructor(x, y, epsilon, kernelName) {
        this.x = x;
        this.y = y;
        this.epsilon = epsilon;
        this.kernel = Kernels[kernelName] || Kernels.RBF;
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
                row[i] += 1e-8;   // tiny diagonal regularization
                A.push(row);
            }

            const yMatrix = this.y.map(v => [v]);
            const w = math.lusolve(A, yMatrix);
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

class LagrangeInterpolator {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    predict(xVal) {
        let total = 0;
        const n = this.x.length;
        for (let i = 0; i < n; i++) {
            let lagrangeTerm = 1;
            for (let j = 0; j < n; j++) {
                if (i !== j) {
                    lagrangeTerm *= (xVal - this.x[j]) / (this.x[i] - this.x[j]);
                }
            }
            total += lagrangeTerm * this.y[i];
        }
        if (!isFinite(total)) throw new Error("Polynomial prediction returned non-finite value");
        return total;
    }
}

function createInterpolator(x, y, epsilon, kernelName, method) {
    if (method === "Poly") {
        return new LagrangeInterpolator(x, y);
    }
    return new RBFInterpolator(x, y, epsilon, kernelName);
}


// =========================
// METHOD & UI TOGGLE HANDLER
// =========================
function handleMethodChange() {
    const method = document.getElementById("Method").value;
    const isPoly = (method === "Poly");

    const epsilonInput = document.getElementById("epsilon");
    const kernelSelect = document.getElementById("kernel");
    const actionBtn = document.getElementById("best-epsilon-btn");

    if (epsilonInput) epsilonInput.disabled = isPoly;
    if (kernelSelect) kernelSelect.disabled = isPoly;

    if (actionBtn) {
        actionBtn.disabled = false;
        actionBtn.innerText = isPoly ? "Find Best Nodes" : "Find Best ε";
    }

    // Reset default stride when switching back from Poly to RBF
    if (!isPoly) {
        currentStride = 5;
    }

    try {
        interpolate(true);
    } catch {
        // Suppress initial mode change errors if epsilon is uncalibrated
    }
}


// =========================
// CUT SECTION BY TIME
// =========================
document.getElementById("cut-time-btn").addEventListener("click", () => {
    if (!csvLoaded) {
        alert("Data not loaded.");
        return;
    }

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

    cutMask = rawDates.map(d => (d >= startDate && d <= endDate));

    plotRawData();
    interpolate();
});


// =========================
// INTERPOLATE
// =========================
function interpolate(quiet = false) {
    if (!csvLoaded) return;

    const method = document.getElementById("Method").value;
    const kernelElem = document.getElementById("kernel");
    const kernel = kernelElem ? kernelElem.value : "RBF";
    const epsilonElem = document.getElementById("epsilon");
    const epsilon = epsilonElem ? parseFloat(epsilonElem.value) : 1.0;

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

    const cutNodes = rawTimes
        .map((t, i) => ({
            t,
            level: rawLevels[i],
            date: rawDates[i],
            index: i
        }))
        .filter(p => cutMask[p.index]);

    if (cutNodes.length < 3) {
        if (!quiet) alert("Cut region too small");
        return;
    }

    const leftBoundary = rawTimes
        .map((t, i) => ({ t, level: rawLevels[i], date: rawDates[i] }))
        .filter(p => p.date < cutStartDate)
        .slice(-1)[0];

    const rightBoundary = rawTimes
        .map((t, i) => ({ t, level: rawLevels[i], date: rawDates[i] }))
        .filter(p => p.date > cutEndDate)[0];

    if (!leftBoundary || !rightBoundary) {
        if (!quiet) alert("Missing boundary points");
        return;
    }

    // Filter interior downsampled nodes strictly within boundary timestamps
    const downsampledCut = cutNodes
        .filter((_, i) => i % currentStride === 0)
        .filter(p => p.t > leftBoundary.t && p.t < rightBoundary.t);

    const trainTimes = [
        leftBoundary.t,
        ...downsampledCut.map(p => p.t),
        rightBoundary.t
    ];

    const trainDates = [
        leftBoundary.date,
        ...downsampledCut.map(p => p.date),
        rightBoundary.date
    ];

    const trainLevels = [
        leftBoundary.level,
        ...downsampledCut.map(p => p.level),
        rightBoundary.level
    ];

    let interpolator;
    try {
        interpolator = createInterpolator(trainTimes, trainLevels, epsilon, kernel, method);
    } catch (err) {
        if (!quiet) alert("Interpolation failed: " + err.message);
        throw err;
    }

    const denseInterpTimes = [];
    const N = 500;

    const t0 = cutNodes[0].t;
    const t1 = cutNodes[cutNodes.length - 1].t;

    for (let i = 0; i < N; i++) {
        const alpha = i / (N - 1);
        denseInterpTimes.push(t0 + alpha * (t1 - t0));
    }

    const denseInterpLevels = denseInterpTimes.map(t => interpolator.predict(t));
    const interpLevels = cutNodes.map(p => interpolator.predict(p.t));

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

    const totalNodes = trainTimes.length;
    const chartTitle = (method === "Poly") 
        ? `<b>Method: Lagrange Polynomial (${totalNodes} nodes)</b>` 
        : `<b>RBF  (MQ ,  ε = ${epsilon.toFixed(3)})</b>`;

    Plotly.react("plot-area", [
        {
            x: rawDates.map((d, i) => cutMask[i] ? null : d),
            y: rawLevels.map((lvl, i) => cutMask[i] ? null : lvl),
            mode: "lines",
            name: "Kept Data",
            line: { color: "rgba(0,0,255,0.5)", width: 2 },
            connectgaps: false
        },
        {
            x: rawDates.map((d, i) => cutMask[i] ? null : d),
            y: rawLevels.map((lvl, i) => cutMask[i] ? null : lvl),
            mode: "markers",
            name: "Data Points",
            marker: { size: 5, color: "blue", opacity: 0.8 }
        },
        {
            x: denseInterpTimes.map(t => new Date(firstTimestamp.getTime() + t * 60000)),
            y: denseInterpLevels,
            mode: "lines",
            name: "Interpolation",
            line: { color: "red", width: 2, dash: "dot" }
        },
        {
            x: trainDates,
            y: trainLevels,
            mode: "markers",
            name: "Active Nodes",
            marker: { size: 6, color: "red" }
        },
        {
            x: cutNodes.map(p => p.date),
            y: cutNodes.map(p => p.level),
            mode: "lines",
            name: "Cut Data",
            line: { color: "rgba(0, 0, 255, 0.3)", width: 2 }
        }
    ], {
        title: chartTitle,
        xaxis: { title: "Date & Time" },
        yaxis: { title: "Water Level (m)" },
        width: 1080,
        height: 490,
        shapes: shapes
    });

    // Infinity Norm Error (Maximum Absolute Error)
    let maxErr = 0;
    for (let i = 0; i < cutNodes.length; i++) {
        const pointErr = Math.abs(cutNodes[i].level - interpLevels[i]);
        if (pointErr > maxErr) maxErr = pointErr;
    }

    try {
        document.getElementById("error-display").innerText = `${maxErr.toFixed(6)}`;
    } catch {
        document.getElementById("error-display").innerText = "";
    }
}


// =========================
// OPTIMIZATION SEARCH ROUTED BY METHOD
// =========================
async function handleOptimizationClick() {
    const method = document.getElementById("Method").value;
    if (method === "Poly") {
        await findBestNodes();
    } else {
        await findBestEpsilon();
    }
}

async function findBestNodes() {
    if (!csvLoaded) return;

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

    const minTargetNodes = 5;
    const maxStride = Math.floor(cutNodes.length / minTargetNodes);
    let bestStride = currentStride;
    let bestErr = Infinity;

    for (let s = 2; s <= maxStride; s++) {
        try {
            // Strictly enforce boundary bounds (leftBoundary.t < t < rightBoundary.t)
            const downsampledCut = cutNodes
                .filter((_, i) => i % s === 0)
                .filter(p => p.t > leftBoundary.t && p.t < rightBoundary.t);

            if (downsampledCut.length < 2) break;

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

            const interp = new LagrangeInterpolator(trainTimes, trainLevels);

            // Calculate Infinity Norm Error (maximum point error)
            let maxErr = 0;
            for (let i = 0; i < cutNodes.length; i++) {
                const real = cutNodes[i].level;
                const pred = interp.predict(cutNodes[i].t);
                const pointErr = Math.abs(real - pred);
                
                if (pointErr > maxErr) {
                    maxErr = pointErr;
                }
            }

            currentStride = s;
            await interpolate(true);

            Plotly.relayout("plot-area", {
                "xaxis.range": [
                    new Date(cutStartDate.getTime() - 6 * 60 * 60 * 1000),
                    new Date(cutEndDate.getTime() + 6 * 60 * 60 * 1000)
                ]
            });

            if (maxErr < bestErr) {
                bestErr = maxErr;
                bestStride = s;
            }

            await new Promise(r => setTimeout(r, 75));

        } catch {
            // Skip ill-conditioned node sets
        }
    }

    currentStride = bestStride;
    await interpolate();

    Plotly.relayout("plot-area", {
        "xaxis.range": [
            new Date(cutStartDate.getTime() - 6 * 60 * 60 * 1000),
            new Date(cutEndDate.getTime() + 6 * 60 * 60 * 1000)
        ]
    });
}

async function findBestEpsilon() {
    if (!csvLoaded) return;

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

    const gapMs = cutEndDate - cutStartDate;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    if (gapMs > oneWeekMs) {
        alert("Best ε search disabled for gaps larger than 1 week.");
        return;
    }

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

    // Determine search boundaries and step size based on chosen dataset
    const choice = document.getElementById("csv-select").value.toLowerCase();

    let startE, maxE, stepE;

    if (choice.includes("wilmington")) {
        startE = 0.01;
        maxE = 0.1;
        stepE = 0.005;
    } else if (choice.includes("rhode")) {
        startE = 0.05;
        maxE = 0.195;
        stepE = 0.001;
    } else { // Handles live / NOAA / default
        startE = 0.1;
        maxE = 5.0;
        stepE = 0.1;
    }

    const epsilons = [];
    for (let e = startE; e <= maxE + 1e-9; e += stepE) {
        epsilons.push(e);
    }

    let bestE = null;
    let bestErr = Infinity;

    for (const e of epsilons) {
        try {
            document.getElementById("epsilon").value = e.toFixed(3);
            
            // Run quiet interpolation to catch matrix failures gracefully
            await interpolate(true);

            const errStr = document.getElementById("error-display").innerText;
            const avgErr = parseFloat(errStr);

            if (!isNaN(avgErr) && avgErr < bestErr) {
                bestErr = avgErr;
                bestE = e;
            }

            Plotly.relayout("plot-area", {
                "xaxis.range": [
                    new Date(cutStartDate.getTime() - 6 * 60 * 60 * 1000),
                    new Date(cutEndDate.getTime() + 6 * 60 * 60 * 1000)
                ]
            });

            await new Promise(r => setTimeout(r, 10));

        } catch {
            // Silently skip unstable or singular epsilons
        }
    }

    if (bestE !== null) {
        document.getElementById("epsilon").value = bestE.toFixed(3);
        interpolate();

        Plotly.relayout("plot-area", {
            "xaxis.range": [
                new Date(cutStartDate.getTime() - 6 * 60 * 60 * 1000),
                new Date(cutEndDate.getTime() + 6 * 60 * 60 * 1000)
            ]
        });
    } else {
        alert("No stable ε found for this dataset density.");
    }
}


// =========================
// LISTENERS & INITIALIZATION
// =========================
document.getElementById("Method").addEventListener("change", handleMethodChange);

document.getElementById("epsilon").addEventListener("input", () => {
    interpolate();

    let cutStartDate = null;
    let cutEndDate = null;

    for (let i = 0; i < cutMask.length; i++) {
        if (cutMask[i]) {
            if (cutStartDate === null) cutStartDate = rawDates[i];
            cutEndDate = rawDates[i];
        }
    }

    if (!cutStartDate || !cutEndDate) return;

    Plotly.relayout("plot-area", {
        "xaxis.range": [
            new Date(cutStartDate.getTime() - 6 * 60 * 60 * 1000),
            new Date(cutEndDate.getTime() + 6 * 60 * 60 * 1000)
        ]
    });
});

if (document.getElementById("kernel")) {
    document.getElementById("kernel").addEventListener("change", () => interpolate());
}

document.getElementById("show-raw-btn").addEventListener("click", () => {
    if (!csvLoaded) return;
    cutMask = new Array(rawTimes.length).fill(false);
    plotRawData();
});

document.getElementById("best-epsilon-btn").addEventListener("click", handleOptimizationClick);

document.getElementById("csv-select").addEventListener("change", () => {
    const choice = document.getElementById("csv-select").value;

    if (choice === "noaa-live") {
        loadNOAA();
    } else {
        loadCSV(choice);
    }
});

// Initial Setup
const actionBtn = document.getElementById("best-epsilon-btn");
if (actionBtn) {
    actionBtn.innerText = "Find Best ε";
}

loadCSV(document.getElementById("csv-select").value);