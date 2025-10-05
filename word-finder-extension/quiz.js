let words = [];
let currentWordIndex = 0;
let score = 0;

const questionEl = document.getElementById('question');
const optionsEl = document.getElementById('options');
const feedbackEl = document.getElementById('feedback');
const nextBtn = document.getElementById('nextBtn');

chrome.storage.sync.get('words', (data) => {
  words = data.words || [];
  if (words.length > 0) {
    loadQuiz();
  } else {
    questionEl.textContent = 'No words saved yet.';
    nextBtn.style.display = 'none';
  }
});

function loadQuiz() {
  if (currentWordIndex >= words.length) {
    questionEl.textContent = `Quiz finished! Your score: ${score}/${words.length}`;
    optionsEl.innerHTML = '';
    feedbackEl.innerHTML = '';
    nextBtn.style.display = 'none';
    return;
  }

  const currentWord = words[currentWordIndex];
  questionEl.textContent = `What is the meaning of "${currentWord.word}"?`;

  const options = generateOptions(currentWord);
  optionsEl.innerHTML = '';
  options.forEach(option => {
    const button = document.createElement('button');
    button.textContent = option;
    button.addEventListener('click', () => checkAnswer(option, currentWord.definition));
    optionsEl.appendChild(button);
  });

  feedbackEl.textContent = '';
  nextBtn.style.display = 'none';
}

function generateOptions(correctWord) {
  const options = [correctWord.definition];
  const wrongWords = words.filter(w => w.word !== correctWord.word);

  while (options.length < 4 && wrongWords.length > 0) {
    const randomIndex = Math.floor(Math.random() * wrongWords.length);
    options.push(wrongWords.splice(randomIndex, 1)[0].definition);
  }

  return options.sort(() => Math.random() - 0.5);
}

function checkAnswer(selectedOption, correctDefinition) {
  if (selectedOption === correctDefinition) {
    feedbackEl.textContent = 'Correct!';
    feedbackEl.style.color = 'green';
    score++;
  } else {
    feedbackEl.textContent = `Wrong! The correct answer was: ${correctDefinition}`;
    feedbackEl.style.color = 'red';
  }

  Array.from(optionsEl.children).forEach(button => {
    button.disabled = true;
  });

  nextBtn.style.display = 'block';
}

nextBtn.addEventListener('click', () => {
  currentWordIndex++;
  loadQuiz();
});