// Select the ? button
const helpBtn = document.getElementById('helpBtn');

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