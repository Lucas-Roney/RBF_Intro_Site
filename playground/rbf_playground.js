// Ctrl + f & .tofixed(10) to adjust error decimal place

// --- Kernels ---
const Kernels = {
    GA: (r, epsilon) => Math.exp(-Math.pow(epsilon * r, 2)),
    MQ: (r, epsilon) => Math.sqrt(1 + Math.pow(epsilon * r, 2)),
    IMQ: (r, epsilon) => 1 / Math.sqrt(1 + Math.pow(epsilon * r, 2)),
    IQ: (r, epsilon) => 1 / (1 + Math.pow(epsilon * r, 2))
};

// --- Test Functions ---
const TestFunctions = {
    Runge: {
        f: x => 1 / (1 + 16 * x * x),
        label: "1/(1 + 16x^2)"
    },
    Sine: {
        f: x => Math.sin(3 * x),
        label: "sin(3x)"
    },
    Abs: {
        f: x => Math.abs(x),
        label: "|x|"
    },
    Poly: {
        f: x => x**3 - x,
        label: "x³ − x"
    }
};

function getSelectedFunction() {
    const key = document.getElementById("TF").value;
    return TestFunctions[key] || TestFunctions.Runge;
}

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
    let xPoints = [];
    let yPoints = [];

    const { f } = getSelectedFunction();

    for (let i = 0; i < numNodes; i++) {
        const x = -1 + (2 * i) / (numNodes - 1);
        xPoints.push(x);
        yPoints.push(f(x));
    }

    return { xPoints, yPoints };
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
    const { f, label } = getSelectedFunction();
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

    const { xPoints, yPoints } = generateNodes(nodesCount);

    try {
        const rbf = new RBFInterpolator(xPoints, yPoints, epsilon, kernel);

        let xDense = [];
        let yDense = [];
        for (let i = 0; i <= 400; i++) {
            const x = -1 + 2 * (i / 400);
            xDense.push(x);
            yDense.push(rbf.predict(x));
        }

        const yTrue = xDense.map(f);
        const infError = computeInfinityNorm(yDense, yTrue);

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
                name: label,
                line: { color: "red", dash: "dot", width: 3 }
            }
        ], {
            title: `Kernel: ${kernel} | ε = ${epsilon}`,
            xaxis: { title: "x" },
            yaxis: { title: "y" },
            height: 500
        });

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

    const { xPoints, yPoints } = generateNodes(nodesCount);

    let bestEpsilon = 0.2;
    let bestError = Infinity;

    const delay = 8;
    const step = 0.1;

    const { f, label } = getSelectedFunction();

    for (let epsilon = 0.2; epsilon <= 30; epsilon += step) {

        try {
            const rbf = new RBFInterpolator(xPoints, yPoints, epsilon, kernel);

            let xDense = [];
            let yDense = [];
            for (let i = 0; i <= 200; i++) {
                const x = -1 + 2 * (i / 200);
                xDense.push(x);
                yDense.push(rbf.predict(x));
            }

            const yTrue = xDense.map(f);
            const infError = computeInfinityNorm(yDense, yTrue);

            document.getElementById("error-display").innerText =
                `${infError.toFixed(10)}`;

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
                    name: label,
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
        const { xPoints: xFinal, yPoints: yFinal } =
            generateNodes(parseInt(document.getElementById("nodes").value));

        const rbfFinal = new RBFInterpolator(xFinal, yFinal, bestEpsilon, kernelFinal);

        let xDenseFinal = [];
        let yDenseFinal = [];
        for (let i = 0; i <= 400; i++) {
            const x = -1 + 2 * (i / 400);
            xDenseFinal.push(x);
            yDenseFinal.push(rbfFinal.predict(x));
        }

        const { f: fFinal, label: labelFinal } = getSelectedFunction();
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
                name: labelFinal,
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
document.getElementById("TF").addEventListener("change", updatePlot);
document.getElementById("kernel").addEventListener("change", updatePlot);
document.getElementById("epsilon").addEventListener("input", updatePlot);
document.getElementById("nodes").addEventListener("change", updatePlot);
document.getElementById("best-epsilon-btn").addEventListener("click", findBestEpsilon);

// --- Initial Plot ---
updatePlot();
