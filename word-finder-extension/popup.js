document.getElementById('quizBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'quiz.html' });
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  chrome.storage.sync.get('words', (data) => {
    const words = data.words || [];
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Word,Definition\n";
    words.forEach(item => {
      csvContent += `${item.word},"${item.definition}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "my_words.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
});