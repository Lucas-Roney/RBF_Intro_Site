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

// --- RBF Interpolator ---
class RBFInterpolator {
    constructor(xData, yData, epsilon, kernelName) {
        this.xData = xData;
        this.yData = yData;
        this.epsilon = epsilon;
        this.kernel = Kernels[kernelName];
        this.weights = this.computeWeights();
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
        let total = 0;
        for (let j = 0; j < this.xData.length; j++) {
            const r = Math.abs(xVal - this.xData[j]);
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



// --- Compute Infinity Norm Error ---
function computeInfinityNorm(yDense, yTrue) {
    let infError = 0;
    for (let i = 0; i < yDense.length; i++) {
        const err = Math.abs(yDense[i] - yTrue[i]);
        if (err > infError) infError = err;
    }
    return infError;
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
            title: `Kernel: ${kernel} | ε = ${epsilon}`,
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
                title: `Kernel: ${kernel} | ε = ${epsilon.toFixed(2)}`,
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
        title: `Kernel: ${kernelFinal} | ideal ε = ${bestEpsilon.toFixed(2)}`,
        xaxis: { title: "x" },
        yaxis: { title: "y" },
        height: 500
    });
        document.getElementById("plot-area").style.opacity = 1;
    }, 150);

}

// --- Live Event Listeners ---
document.getElementById("test-function").addEventListener("change", updatePlot);
document.getElementById("kernel").addEventListener("change", updatePlot);
document.getElementById("epsilon").addEventListener("input", updatePlot);
document.getElementById("nodes").addEventListener("change", updatePlot);
document.getElementById("best-epsilon-btn").addEventListener("click", findBestEpsilon);

document.getElementById("dimension-toggle").addEventListener("change", () => {
    const is2D = document.getElementById("dimension-toggle").checked;

    if (!is2D) {
        // Re-enable 1D controls
        document.getElementById("kernel").disabled = false;
        document.getElementById("epsilon").disabled = false;
        document.getElementById("nodes").disabled = false;
        document.getElementById("test-function").disabled = false;
        document.getElementById("best-epsilon-btn").disabled = false;

        updatePlot();
        return;
    }
    // Disable 1D controls
    document.getElementById("kernel").disabled = true;
    document.getElementById("epsilon").disabled = true;
    document.getElementById("nodes").disabled = true;
    document.getElementById("test-function").disabled = true;
    document.getElementById("best-epsilon-btn").disabled = true;

    // Replace plot with placeholder
    Plotly.purge("plot-area");
    document.getElementById("plot-area").innerHTML =
        "<div style='font-size:1.4rem; color:#444;'>2D interpolation coming soon...</div>";

    // Clear error display
    document.getElementById("error-display").innerText = "";
});


// --- Initial Plot ---
updatePlot();