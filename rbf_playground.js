// --- Kernels (correct ε scaling) ---
const Kernels = {
    GA: (r, epsilon) => Math.exp(-Math.pow(epsilon * r, 2)),
    MQ: (r, epsilon) => Math.sqrt(1 + Math.pow(epsilon * r, 2)),
    IMQ: (r, epsilon) => 1 / Math.sqrt(1 + Math.pow(epsilon * r, 2)),
    IQ: (r, epsilon) => 1 / (1 + Math.pow(epsilon * r, 2))
};

// --- Runge Function ---
function rungeFunction(x) {
    return 1 / (1 + 16 * x * x);
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

    for (let i = 0; i < numNodes; i++) {
        const x = -1 + (2 * i) / (numNodes - 1);
        xPoints.push(x);
        yPoints.push(rungeFunction(x));
    }

    return { xPoints, yPoints };
}

// --- Main Update Function ---
function updatePlot() {
    const kernel = document.getElementById("kernel").value;
    const epsilon = parseFloat(document.getElementById("epsilon").value);
    let nodesCount = parseInt(document.getElementById("nodes").value);

// Enforce minimum
if (nodesCount < 5) {
    nodesCount = 5;
    document.getElementById("nodes").value = 5;
}

    const { xPoints, yPoints } = generateNodes(nodesCount);

    try {
        const rbf = new RBFInterpolator(xPoints, yPoints, epsilon, kernel);

        // Dense evaluation grid
        let xDense = [];
        let yDense = [];
        for (let i = 0; i <= 400; i++) {
            const x = -1 + 2 * (i / 400);
            xDense.push(x);
            yDense.push(rbf.predict(x));
        }

        const yTrue = xDense.map(rungeFunction);

        // Clear previous plot
        Plotly.purge("plot-area");

        // Plot
        Plotly.newPlot("plot-area", [
            {
                x: xDense,
                y: yDense,
                mode: "lines",
                name: "RBF Interpolation",
                line: { color: "black", width: 3 }   // solid black
            },
            {
                x: xPoints,
                y: yPoints,
                mode: "markers",
                name: "Nodes",
                marker: {
                    color: "white",       // clear fill
                    size: 10,
                    line: {
                        color: "black",   // black outline
                        width: 2
                    }
                }
            },
            {
                x: xDense,
                y: yTrue,
                mode: "lines",
                name: "Runge Function",
                line: { color: "red", dash: "dot", width: 3 }   // dotted red
            }
        ], {
            title: `Kernel: ${kernel} | ε = ${epsilon}`,
            xaxis: { title: "x" },
            yaxis: { title: "y" },
            height: 500
        });

        } catch (err) {
        }
    }

// --- Live Event Listeners ---
document.getElementById("kernel").addEventListener("change", updatePlot);
document.getElementById("epsilon").addEventListener("input", updatePlot);
document.getElementById("nodes").addEventListener("change", updatePlot);

// --- Initial Plot ---
updatePlot();

// Help button placeholder
//document.getElementById("helpBtn")?.addEventListener("click", () => {
//    console.log("Help button clicked.");
//});