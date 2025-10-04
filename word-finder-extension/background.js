chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ words: [] });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.word) {
    const naverApiUrl = `https://m.search.naver.com/search.naver?sm=mtp_hty.top&where=m&query=영한사전+${request.word}`;

    fetch(naverApiUrl)
      .then(response => response.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const definitionElement = doc.querySelector('.mean_tray .cont');
        let definition = 'Meaning not found.';

        if (definitionElement) {
          // Extract only the first meaning, which is usually the most common one.
          const firstMeaning = definitionElement.querySelector('li .txt');
          if (firstMeaning) {
            definition = firstMeaning.innerText.trim();
          } else {
            definition = definitionElement.innerText.trim(); // Fallback
          }
        }

        // Only save the word if a valid definition was found.
        if (definition !== 'Meaning not found.') {
            chrome.storage.sync.get('words', (data) => {
                const words = data.words || [];
                // Check for duplicates before adding.
                if (!words.some(item => item.word === request.word)) {
                    words.push({ word: request.word, definition: definition });
                    chrome.storage.sync.set({ words: words });
                }
            });
        }

        sendResponse({ definition });
      })
      .catch(error => {
        console.error('Error fetching definition:', error);
        sendResponse({ definition: 'Error fetching definition.' });
      });

    return true;
  }
});