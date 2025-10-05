# Word Finder: Chrome Extension & Mobile Web Quiz

This project consists of two parts: a Chrome extension for finding and saving word definitions, and a mobile-friendly web app for taking quizzes on your saved words.

## 1. Word Finder Chrome Extension

The extension allows you to select any word on a webpage to see its English-to-Korean definition from Naver Dictionary. Words you look up are automatically saved to a list.

### Setup Instructions

1.  Open Google Chrome and navigate to `chrome://extensions`.
2.  Enable "Developer mode" using the toggle in the top-right corner.
3.  Click the "Load unpacked" button.
4.  Select the `word-finder-extension` folder from this project.
5.  The "Word Finder" extension icon should now appear in your browser's toolbar.

### How to Use

1.  **Find a Definition**: On any webpage, highlight an English word with your mouse. A tooltip will appear with its Korean definition.
2.  **Save Words**: Every word you look up is automatically saved.
3.  **Access Your Words**: Click the "Word Finder" icon in your toolbar to open the popup.
    *   **Start Quiz**: This will open a new tab with the word quiz.
    *   **Download Words**: This will download a `my_words.csv` file containing all the words and definitions you have saved.

## 2. Word Finder Mobile Web App

The web app provides a simple interface to quiz yourself on the words you saved using the Chrome extension.

### Setup Instructions

1.  First, download your word list by clicking "Download Words" from the Chrome extension popup.
2.  Open the `word-finder-web/index.html` file in a web browser on your computer or mobile device.

### How to Use

1.  Click the "Upload Word List (.csv)" button.
2.  Select the `my_words.csv` file you downloaded from the extension.
3.  The quiz will automatically start with the words from your list.
4.  Answer the questions and see your score at the end!