let tooltip;

document.addEventListener('mouseup', (event) => {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 0) {
    chrome.runtime.sendMessage({ word: selectedText }, (response) => {
      if (response && response.definition) {
        showTooltip(event.pageX, event.pageY, response.definition);
      }
    });
  }
});

document.addEventListener('mousedown', () => {
  if (tooltip) {
    tooltip.style.display = 'none';
  }
});

function showTooltip(x, y, text) {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'word-finder-tooltip';
    document.body.appendChild(tooltip);
  }
  tooltip.innerHTML = text;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y + 20}px`; // Increased offset for better spacing
  tooltip.style.display = 'block';
}