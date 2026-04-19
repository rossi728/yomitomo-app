// ========================================
// フリーミアム設定
// ========================================
const FREE_BOOKS = ['hikari_no_tane', 'mayoimichi_compass'];
let isPremium = false;

function isBookFree(bookId) {
  return FREE_BOOKS.includes(bookId);
}

function canAccessBook(bookId) {
  return isBookFree(bookId) || isPremium;
}

// ========================================
// ペアレンタルゲート
// ========================================
let pendingBookId = null;

function generateMathQuestion() {
  const a = Math.floor(Math.random() * 20) + 10;
  const b = Math.floor(Math.random() * 15) + 5;
  const correct = a + b;
  const options = [correct, correct + 3, correct - 2, correct + 7]
    .sort(() => Math.random() - 0.5);
  return { a, b, correct, options };
}

function showParentalGate(bookId) {
  pendingBookId = bookId;
  const question = generateMathQuestion();

  const overlay = document.getElementById('parental-gate-overlay');
  document.getElementById('gate-question').textContent = question.a + ' + ' + question.b + ' = ?';

  const optionsContainer = document.getElementById('gate-options');
  optionsContainer.innerHTML = '';

  question.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'gate-option-btn';
    btn.textContent = opt;
    btn.onclick = () => checkGateAnswer(opt, question.correct);
    optionsContainer.appendChild(btn);
  });

  overlay.classList.add('active');
}

function checkGateAnswer(selected, correct) {
  if (selected === correct) {
    closeParentalGate();
    showSubscribeScreen();
  } else {
    const question = generateMathQuestion();
    document.getElementById('gate-question').textContent = question.a + ' + ' + question.b + ' = ?';

    const optionsContainer = document.getElementById('gate-options');
    optionsContainer.innerHTML = '';

    question.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'gate-option-btn';
      btn.textContent = opt;
      btn.onclick = () => checkGateAnswer(opt, question.correct);
      optionsContainer.appendChild(btn);
    });
  }
}

function closeParentalGate() {
  document.getElementById('parental-gate-overlay').classList.remove('active');
  pendingBookId = null;
}

// ========================================
// サブスク画面
// ========================================
function showSubscribeScreen() {
  document.getElementById('subscribe-overlay').classList.add('active');
}

function closeSubscribeScreen() {
  document.getElementById('subscribe-overlay').classList.remove('active');
}

// 注: handleSubscribe() / restorePurchase() は iap.js で定義（StoreKit本実装）

// ========================================
// 本棚UI更新
// ========================================
function updateBookshelfUI() {
  document.querySelectorAll('.book-item').forEach(item => {
    const bookId = item.getAttribute('data-book-id');
    const lockIcon = item.querySelector('.lock-icon');

    if (lockIcon) {
      if (canAccessBook(bookId)) {
        lockIcon.style.display = 'none';
      } else {
        lockIcon.style.display = 'block';
      }
    }
  });
}
