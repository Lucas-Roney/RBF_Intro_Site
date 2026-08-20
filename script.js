// Placeholder buttons for future pages
document.getElementById("opt2").addEventListener("click", () => {
    console.log("Kernel Intuition clicked — no page yet.");
});

document.getElementById("opt3").addEventListener("click", () => {
    console.log("Interpolation Demo clicked — no page yet.");
});

document.getElementById("opt4").addEventListener("click", () => {
    console.log("Error Behavior clicked — no page yet.");
});

// Select the ? button
const helpBtn = document.querySelector('.header-side.right .header-btn');

// Popup + overlay
const helpPopup = document.getElementById('help-popup');
const helpOverlay = document.getElementById('help-overlay');
const helpClose = document.getElementById('help-close-btn');

// Show popup
helpBtn.addEventListener('click', () => {
    helpOverlay.style.display = "block";
    helpPopup.style.display = "block";
});

// Hide popup
helpClose.addEventListener('click', () => {
    helpOverlay.style.display = "none";
    helpPopup.style.display = "none";
});

// Clicking outside closes it too
helpOverlay.addEventListener('click', () => {
    helpOverlay.style.display = "none";
    helpPopup.style.display = "none";
});