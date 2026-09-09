// Ctrl + f & .tofixed(10) to adjust error decimal place

// --- Kernels (correct ε scaling) ---
const Kernels = {
    GA: (r, epsilon) => Math.exp(-Math.pow(epsilon * r, 2)),
    MQ: (r, epsilon) => Math.sqrt(1 + Math.pow(epsilon * r, 2)),
    IMQ: (r, epsilon) => 1 / Math.sqrt(1 + Math.pow(epsilon * r, 2)),
    IQ: (r, epsilon) => 1 / (1 + Math.pow(epsilon * r, 2))
};

// --- Test Functions ---
const TestFunctions = {
    Runge: x => 1 / (1 + 16 * x * x),
    Sine: x => Math.sin(3 * x),
    Abs: x => Math.abs(x),
    Poly: x => 1.5*Math.pow(x,9) - 4*Math.pow(x,7) - Math.pow(x,3) - Math.pow(x,2) + 8*x
};

const TestFunctions2D = {
    Runge2D: (x, y) => 1 / (1 + 16 * (x*x + y*y))
};


// --- RBF Interpolator ---
class RBFInterpolator {
    constructor(xData, yData, epsilon, kernelName) {
        this.xData = xData;
        this.yData = yData;
        this.epsilon = epsilon;
        this.kernelName = kernelName;

        if (this.kernelName === "POLY") {
            this.weights = []; // No linear solver needed for Lagrange polynomial
        } else {
            this.kernel = Kernels[kernelName];
            this.weights = this.computeWeights();
        }
    }

    computeWeights() {
        const n = this.xData.length;
        let A = [];

        for (let i = 0; i < n; i++) {
            let row = [];
            for (let j = 0; j < n; j++) {
                const r = Math.abs(this.xData[i] - this.xData[j]);
                row.push(this.kernel(r, this.epsilon));
            }
            A.push(row);
        }

        const yMatrix = this.yData.map(v => [v]);
        const weightsMatrix = math.lusolve(A, yMatrix);

        return weightsMatrix.map(row => row[0]);
    }

    predict(xVal) {
        if (this.kernelName === "POLY") {
            let total = 0;
            const n = this.xData.length;

            for (let i = 0; i < n; i++) {
                let lag = 1;
                for (let j = 0; j < n; j++) {
                    if (i !== j) {
                        lag *= (xVal - this.xData[j]) / (this.xData[i] - this.xData[j]);
                    }
                }
                total += lag * this.yData[i];
            }
            return total;
        }

        let total = 0;
        for (let j = 0; j < this.xData.length; j++) {
            const r = Math.abs(xVal - this.xData[j]);
            total += this.weights[j] * this.kernel(r, this.epsilon);
        }
        return total;
    }
}


// --- RBF Interpolator2D ---
class RBFInterpolator2D {
    constructor(points, values, epsilon, kernelName) {
        this.points = points;   // [{x, y}, ...]
        this.values = values;   // [f(x,y), ...]
        this.epsilon = epsilon;
        this.kernel = Kernels[kernelName];
        this.weights = this.computeWeights();
    }

    computeWeights() {
        const n = this.points.length;
        let A = [];

        for (let i = 0; i < n; i++) {
            let row = [];
            for (let j = 0; j < n; j++) {
                const dx = this.points[i].x - this.points[j].x;
                const dy = this.points[i].y - this.points[j].y;
                const r = Math.sqrt(dx*dx + dy*dy);
                row.push(this.kernel(r, this.epsilon));
            }
            A.push(row);
        }

        const yMatrix = this.values.map(v => [v]);
        const weightsMatrix = math.lusolve(A, yMatrix);

        return weightsMatrix.map(row => row[0]);
    }

    predict(x, y) {
        let total = 0;
        for (let j = 0; j < this.points.length; j++) {
            const dx = x - this.points[j].x;
            const dy = y - this.points[j].y;
            const r = Math.sqrt(dx*dx + dy*dy);
            total += this.weights[j] * this.kernel(r, this.epsilon);
        }
        return total;
    }
}


// --- Generate Nodes ---
function generateNodes(numNodes) {
    const funcName = document.getElementById("test-function").value;
    const f = TestFunctions[funcName];

    const left = -1;
    const right = 1;

    let xPoints = [];
    let yPoints = [];

    for (let i = 0; i < numNodes; i++) {
        const x = left + (right - left) * (i / (numNodes - 1));
        xPoints.push(x);
        yPoints.push(f(x));
    }

    return { xPoints, yPoints, left, right };
}


// --- Generate Nodes2D ---
function generateNodes2D(numNodes) {
    const f = TestFunctions2D["Runge2D"];

    // Use a square grid: numNodes ≈ gridN^2
    const gridN = Math.max(7, Math.floor(Math.sqrt(numNodes)));
    let pts = [];
    let vals = [];

    for (let i = 0; i < gridN; i++) {
        for (let j = 0; j < gridN; j++) {
            const x = -1 + 2 * (i / (gridN - 1));
            const y = -1 + 2 * (j / (gridN - 1));
            pts.push({ x, y });
            vals.push(f(x, y));
        }
    }

    return { pts, vals, gridN };
}

// --- Compute Infinity Norm Error ---
function computeInfinityNorm(yDense, yTrue) {
    let infError = 0;
    for (let i = 0; i < yDense.length; i++) {
        const err = Math.abs(yDense[i] - yTrue[i]);
        if (err > infError) infError = err;
    }
    return infError;
}

// --- Compute Infinity Norm Error 2D ---
function computeInfinityNorm2D(zInterp, zTrue) {
    let maxErr = 0;
    for (let i = 0; i < zInterp.length; i++) {
        for (let j = 0; j < zInterp[0].length; j++) {
            const err = Math.abs(zInterp[i][j] - zTrue[i][j]);
            if (err > maxErr) maxErr = err;
        }
    }
    return maxErr;
}


// --- Main Update Function ---
function updatePlot() {
    const kernel = document.getElementById("kernel").value;
    let epsilon = parseFloat(document.getElementById("epsilon").value);
    let nodesCount = parseInt(document.getElementById("nodes").value);

    if (nodesCount < 5) {
        nodesCount = 5;
        document.getElementById("nodes").value = 5;
    }
    if (nodesCount > 200) {
        nodesCount = 200;
        document.getElementById("nodes").value = 200;
    }

    const { xPoints, yPoints, left, right } = generateNodes(nodesCount);

    try {
        const rbf = new RBFInterpolator(xPoints, yPoints, epsilon, kernel);

        let xDense = [];
        let yDense = [];
        for (let i = 0; i <= 400; i++) {
            const x = left + (right - left) * (i / 400);
            xDense.push(x);
            yDense.push(rbf.predict(x));
        }

        const f = TestFunctions[document.getElementById("test-function").value];
        const yTrue = xDense.map(f);

        Plotly.purge("plot-area");

        Plotly.newPlot("plot-area", [
            {
                x: xDense,
                y: yDense,
                mode: "lines",
                name: "RBF Interpolation",
                line: { color: "black", width: 3 }
            },
            {
                x: xPoints,
                y: yPoints,
                mode: "markers",
                name: "Nodes",
                marker: {
                    color: "white",
                    size: 10,
                    line: { color: "black", width: 2 }
                }
            },
            {
                x: xDense,
                y: yTrue,
                mode: "lines",
                name: "Runge Function",
                line: { color: "red", dash: "dot", width: 3 }
            }
        ], {
            title: `Kernel: ${kernel} (ε = ${epsilon})`,
            xaxis: { title: "x" },
            yaxis: { title: "y" },
            height: 500
        });

        const infError = computeInfinityNorm(yDense, yTrue);
        document.getElementById("error-display").innerText =
            `${infError.toFixed(10)}`;

    } catch (err) {
        document.getElementById("error-display").innerText = "";
    }
}

// --- Main Update Function 2D ---
function updatePlot2D(forceEpsilon = null) {
    const kernel = document.getElementById("kernel").value;
    let epsilon = forceEpsilon ?? parseFloat(document.getElementById("epsilon").value);
    let nodesCount = parseInt(document.getElementById("nodes").value);

    if (nodesCount < 9) {
        nodesCount = 9;
        document.getElementById("nodes").value = 9;
    }

    const { pts, vals } = generateNodes2D(nodesCount);
    const f2d = TestFunctions2D["Runge2D"];

    try {
        const rbf2d = new RBFInterpolator2D(pts, vals, epsilon, kernel);

        const N = 50;
        let xGrid = [];
        let yGrid = [];
        let zTrue = [];
        let zInterp = [];

        for (let i = 0; i < N; i++) {
            const x = -1 + 2 * (i / (N - 1));
            xGrid.push(x);

            let trueRow = [];
            let interpRow = [];

            for (let j = 0; j < N; j++) {
                const y = -1 + 2 * (j / (N - 1));
                if (i === 0) yGrid.push(y);

                trueRow.push(f2d(x, y));
                interpRow.push(rbf2d.predict(x, y));
            }

            zTrue.push(trueRow);
            zInterp.push(interpRow);
        }

        Plotly.purge("plot-area");

        // Build error surface
        let errSurface = [];
        for (let i = 0; i < N; i++) {
            let row = [];
            for (let j = 0; j < N; j++) {
                row.push(zInterp[i][j] - zTrue[i][j]);  // signed error
            }
            errSurface.push(row);
        }

        Plotly.purge("plot-area");

        Plotly.newPlot("plot-area", [{
            x: xGrid,
            y: yGrid,
            z: zInterp,
            surfacecolor: errSurface, 
            type: "surface",
            colorscale: "RdBu",
            showscale: true,
            name: "Interpolant (Error‑Coded)"
        }], {
            title: `Interpolant Colored by Signed Error | Kernel: ${kernel} (ε = ${epsilon.toFixed(2)})`,
            height: 500,
            scene: {
                xaxis: { title: "x" },
                yaxis: { title: "y" },
                zaxis: { title: "Interpolant" }
            }
        });



        const infError2D = computeInfinityNorm2D(zInterp, zTrue);
        document.getElementById("error-display").innerText = infError2D.toFixed(10);

    } catch (err) {
        document.getElementById("error-display").innerText = "";
        Plotly.purge("plot-area");
        document.getElementById("plot-area").innerHTML =
            "<div style='font-size:1.1rem; color:#b00;'>2D interpolation failed (likely singular matrix). Try a different ε or fewer nodes.</div>";
    }
}



// --- Best Epsilon Animation ---
async function findBestEpsilon() {
    const kernel = document.getElementById("kernel").value;
    let nodesCount = parseInt(document.getElementById("nodes").value);

    const { xPoints, yPoints, left, right } = generateNodes(nodesCount);

    let bestEpsilon = 0.2;
    let bestError = Infinity;

    const delay = 8;   // fast animation
    const step = 0.1;  // finer epsilon resolution

    for (let epsilon = 0.2; epsilon <= 30; epsilon += step) {

        try {
            const rbf = new RBFInterpolator(xPoints, yPoints, epsilon, kernel);

            let xDense = [];
            let yDense = [];
            for (let i = 0; i <= 200; i++) {
                const x = left + (right - left) * (i / 200);
                xDense.push(x);
                yDense.push(rbf.predict(x));
            }

            const f = TestFunctions[document.getElementById("test-function").value];
            const yTrue = xDense.map(f);
            const infError = computeInfinityNorm(yDense, yTrue);

            //  LIVE ERROR UPDATE DURING ANIMATION
            document.getElementById("error-display").innerText =
                `${infError.toFixed(10)}`;

            // Update slider visually during animation
            document.getElementById("epsilon").value = epsilon.toFixed(2);

            Plotly.react("plot-area", [
                {
                    x: xDense,
                    y: yDense,
                    mode: "lines",
                    name: "RBF Interpolation",
                    line: { color: "black", width: 3 }
                },
                {
                    x: xPoints,
                    y: yPoints,
                    mode: "markers",
                    name: "Nodes",
                    marker: {
                        color: "white",
                        size: 10,
                        line: { color: "black", width: 2 }
                    }
                },
                {
                    x: xDense,
                    y: yTrue,
                    mode: "lines",
                    name: "Runge Function",
                    line: { color: "red", dash: "dot", width: 3 }
                }
            ], {
                title: `Kernel: ${kernel}  (ε = ${epsilon.toFixed(2)})`,
                xaxis: { title: "x" },
                yaxis: { title: "y" },
                height: 500
            });

            if (infError < bestError) {
                bestError = infError;
                bestEpsilon = epsilon;
            }

        } catch (err) {
            continue;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
    }

    document.getElementById("epsilon").value = bestEpsilon.toFixed(2);

    // Final plot with "ideal ε"
    document.getElementById("plot-area").style.opacity = 0;
    setTimeout(() => {
    const kernelFinal = document.getElementById("kernel").value;
    const { xPoints: xFinal, yPoints: yFinal, left, right } =
        generateNodes(parseInt(document.getElementById("nodes").value));

    const rbfFinal = new RBFInterpolator(xFinal, yFinal, bestEpsilon, kernelFinal);

    // Dense grid
    let xDenseFinal = [];
    let yDenseFinal = [];
    for (let i = 0; i <= 400; i++) {
        const x = left + (right - left) * (i / 400);
        xDenseFinal.push(x);
        yDenseFinal.push(rbfFinal.predict(x));
    }

    const fFinal = TestFunctions[document.getElementById("test-function").value];
    const yTrueFinal = xDenseFinal.map(fFinal);

    const infErrorFinal = computeInfinityNorm(yDenseFinal, yTrueFinal);

    document.getElementById("error-display").innerText =
        `${infErrorFinal.toFixed(10)}`;

    Plotly.newPlot("plot-area", [
        {
            x: xDenseFinal,
            y: yDenseFinal,
            mode: "lines",
            name: "RBF Interpolation",
            line: { color: "black", width: 3 }
        },
        {
            x: xFinal,
            y: yFinal,
            mode: "markers",
            name: "Nodes",
            marker: {
                color: "white",
                size: 10,
                line: { color: "black", width: 2 }
            }
        },
        {
            x: xDenseFinal,
            y: yTrueFinal,
            mode: "lines",
            name: "Runge Function",
            line: { color: "red", dash: "dot", width: 3 }
        }
    ], {
        title: `Kernel: ${kernelFinal} (ideal ε = ${bestEpsilon.toFixed(2)})`,
        xaxis: { title: "x" },
        yaxis: { title: "y" },
        height: 500
    });
        document.getElementById("plot-area").style.opacity = 1;
    }, 150);

}

// --- Best Nodes Animation (Polynomial Only) ---
async function findBestNodesPoly() {
    const funcName = document.getElementById("test-function").value;
    const f = TestFunctions[funcName];

    let bestNodes = 5;
    let bestError = Infinity;
    const delay = 80; // Animation frame delay in ms

    for (let nodes = 5; nodes <= 30; nodes++) {
        const { xPoints, yPoints, left, right } = generateNodes(nodes);
        const poly = new RBFInterpolator(xPoints, yPoints, 0, "POLY");

        let xDense = [];
        let yDense = [];
        for (let i = 0; i <= 400; i++) {
            const x = left + (right - left) * (i / 400);
            xDense.push(x);
            yDense.push(poly.predict(x));
        }

        const yTrue = xDense.map(f);
        const infError = computeInfinityNorm(yDense, yTrue);

        // Update UI during sweep
        document.getElementById("nodes").value = nodes;
        document.getElementById("error-display").innerText = infError.toFixed(10);

        Plotly.react("plot-area", [
            {
                x: xDense,
                y: yDense,
                mode: "lines",
                name: "Polynomial Interpolation",
                line: { color: "black", width: 3 }
            },
            {
                x: xPoints,
                y: yPoints,
                mode: "markers",
                name: "Nodes",
                marker: {
                    color: "white",
                    size: 10,
                    line: { color: "black", width: 2 }
                }
            },
            {
                x: xDense,
                y: yTrue,
                mode: "lines",
                name: "True Function",
                line: { color: "red", dash: "dot", width: 3 }
            }
        ], {
            title: `Polynomial Interpolation (Lagrange) | Nodes: ${nodes}`,
            xaxis: { title: "x" },
            yaxis: { title: "y" },
            height: 500
        });

        // Track best nodes
        if (infError < bestError) {
            bestError = infError;
            bestNodes = nodes;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Set input UI to optimal value
    document.getElementById("nodes").value = bestNodes;

    // Smooth opacity transition to the final plot
    document.getElementById("plot-area").style.opacity = 0;

    setTimeout(() => {
        const { xPoints: xFinal, yPoints: yFinal, left, right } = generateNodes(bestNodes);
        const polyFinal = new RBFInterpolator(xFinal, yFinal, 0, "POLY");

        let xDenseFinal = [];
        let yDenseFinal = [];
        for (let i = 0; i <= 400; i++) {
            const x = left + (right - left) * (i / 400);
            xDenseFinal.push(x);
            yDenseFinal.push(polyFinal.predict(x));
        }

        const yTrueFinal = xDenseFinal.map(f);
        const infErrorFinal = computeInfinityNorm(yDenseFinal, yTrueFinal);

        document.getElementById("error-display").innerText = infErrorFinal.toFixed(10);

        Plotly.newPlot("plot-area", [
            {
                x: xDenseFinal,
                y: yDenseFinal,
                mode: "lines",
                name: "Polynomial Interpolation",
                line: { color: "black", width: 3 }
            },
            {
                x: xFinal,
                y: yFinal,
                mode: "markers",
                name: "Nodes",
                marker: {
                    color: "white",
                    size: 10,
                    line: { color: "black", width: 2 }
                }
            },
            {
                x: xDenseFinal,
                y: yTrueFinal,
                mode: "lines",
                name: "True Function",
                line: { color: "red", dash: "dot", width: 3 }
            }
        ], {
            title: `Polynomial Interpolation (Lagrange) | Ideal Nodes: ${bestNodes}`,
            xaxis: { title: "x" },
            yaxis: { title: "y" },
            height: 500
        });

        document.getElementById("plot-area").style.opacity = 1;
    }, 150);
}

// --- Best Epsilon Animation 2D ---
async function findBestEpsilon2D() {
    const kernel = document.getElementById("kernel").value;
    let nodesCount = parseInt(document.getElementById("nodes").value);

    let bestEpsilon = 0.1;
    let bestError = Infinity;

    const { pts, vals } = generateNodes2D(nodesCount);
    const f2d = TestFunctions2D["Runge2D"];

    const delay = 10;
    const step = 0.05;

    // Dense grid for error evaluation
    const N = 40;
    let xGrid = [];
    let yGrid = [];
    let zTrue = [];

    for (let i = 0; i < N; i++) {
        const x = -1 + 2 * (i / (N - 1));
        xGrid.push(x);

        let row = [];
        for (let j = 0; j < N; j++) {
            const y = -1 + 2 * (j / (N - 1));
            if (i === 0) yGrid.push(y);
            row.push(f2d(x, y));
        }
        zTrue.push(row);
    }

    // Sweep epsilon
    for (let epsilon = 0.1; epsilon <= 10; epsilon += step) {
        try {
            const rbf2d = new RBFInterpolator2D(pts, vals, epsilon, kernel);

            let zInterp = [];
            for (let i = 0; i < N; i++) {
                let row = [];
                for (let j = 0; j < N; j++) {
                    row.push(rbf2d.predict(xGrid[i], yGrid[j]));
                }
                zInterp.push(row);
            }

            // Compute error surface
            let errSurface = [];
            for (let i = 0; i < N; i++) {
                let row = [];
                for (let j = 0; j < N; j++) {
                    row.push(zInterp[i][j] - zTrue[i][j]); // signed error
                }
                errSurface.push(row);
            }

            const infError = computeInfinityNorm2D(zInterp, zTrue);

            // Live error update
            document.getElementById("error-display").innerText =
                infError.toFixed(10);

            // Update slider visually
            document.getElementById("epsilon").value = epsilon.toFixed(2);

            // Live plot update (interpolant height, error color)
            Plotly.react("plot-area", [{
                x: xGrid,
                y: yGrid,
                z: zInterp,                // height = interpolant
                surfacecolor: errSurface,  // color = signed error
                type: "surface",
                colorscale: "RdBu",        // red = positive, blue = negative
                showscale: false
            }], {
                title: `2D RBF | Kernel: ${kernel} (ε = ${epsilon.toFixed(2)})`,
                height: 500,
                scene: {
                    xaxis: { title: "x" },
                    yaxis: { title: "y" },
                    zaxis: { title: "z" }
                }
            });

            if (infError < bestError) {
                bestError = infError;
                bestEpsilon = epsilon;
            }

        } catch (err) {
            // Skip singular matrices
        }

        await new Promise(r => setTimeout(r, delay));
    }

    // Set slider to best ε
    document.getElementById("epsilon").value = bestEpsilon.toFixed(2);

    // Final plot using your normal 2D renderer
    updatePlot2D(bestEpsilon);
}



// --- Live Event Listeners ---
function handleUpdate() {
    const is2D = document.getElementById("dimension-toggle").checked;
    if (is2D) {
        updatePlot2D();
    } else {
        updatePlot();
    }
}

document.getElementById("kernel").addEventListener("change", handleUpdate);
document.getElementById("epsilon").addEventListener("input", handleUpdate);
document.getElementById("nodes").addEventListener("change", handleUpdate);
document.getElementById("test-function").addEventListener("change", handleUpdate);

const functionSelect = document.getElementById("test-function");

document.getElementById("dimension-toggle").addEventListener("change", () => {
    const is2D = document.getElementById("dimension-toggle").checked;

    if (!is2D) {
        // Back to 1D mode
        document.getElementById("kernel").disabled = false;
        document.getElementById("epsilon").disabled = false;
        document.getElementById("nodes").disabled = false;
        document.getElementById("test-function").disabled = false;
        document.getElementById("best-epsilon-btn").disabled = false;

        functionSelect.disabled = false;
        functionSelect.innerHTML = `
            <option value="Runge">Runge (1/(1+16x²))</option>
            <option value="Sine">sin(3x)</option>
            <option value="Abs">|x|</option>
            <option value="Poly">1.5x⁹ − 4x⁷ − x³ − x² + 8x</option>
        `;

        updatePlot();
        return;
    }

    // Switch to 2D mode
    document.getElementById("kernel").disabled = false;
    document.getElementById("epsilon").disabled = false;
    document.getElementById("nodes").disabled = false;
    document.getElementById("test-function").disabled = true;
    document.getElementById("best-epsilon-btn").disabled = false;   // <-- FIXED

    functionSelect.disabled = true;
    functionSelect.innerHTML = `
        <option value="Runge2D">Runge 2D (1/(1+16(x²+y²)))</option>
    `;

    updatePlot2D();
});

const actionBtn = document.getElementById("best-epsilon-btn");

function updateUIState() {
    const is2D = document.getElementById("dimension-toggle").checked;
    const kernel = document.getElementById("kernel").value;
    const isPoly = (kernel === "POLY");

    // Disable Epsilon slider for Polynomial mode
    document.getElementById("epsilon").disabled = isPoly;

    // Dynamically re-label button based on selected kernel
    if (isPoly) {
        actionBtn.innerText = "Find Best Nodes";
    } else {
        actionBtn.innerText = "Find Best ε";
    }
}

// Attach UI handler to kernel selector
document.getElementById("kernel").addEventListener("change", () => {
    updateUIState();
    handleUpdate();
});

// Route click action based on active kernel
actionBtn.addEventListener("click", () => {
    const is2D = document.getElementById("dimension-toggle").checked;
    const kernel = document.getElementById("kernel").value;

    if (kernel === "POLY") {
        findBestNodesPoly();
    } else if (is2D) {
        findBestEpsilon2D();
    } else {
        findBestEpsilon();
    }
});


// --- Initial Plot ---
updatePlot();