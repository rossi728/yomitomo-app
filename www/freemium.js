// freemium.js - Freemium logic for yomitomo
// Build 7:
//   - 無料作品は hikari_no_tane のみ
//   - isPremium を window グローバルで共有（iap.js と整合）
//   - 本棚UIのセレクタは実HTML構造（.book-item + data-book-id 属性）に合わせる
//   - ペアレンタルゲート / サブスク画面表示ロジックは従来通り保持（index.html から呼ばれるため）

// ========================================
// フリーミアム設定
// ========================================
const FREE_BOOKS = ['hikari_no_tane'];  // 1作品のみ無料

// グローバル状態(iap.js と共有)
window.isPremium = false;

function isBookFree(bookId) {
    return FREE_BOOKS.indexOf(bookId) !== -1;
}

/**
 * 指定された本にアクセスできるかを判定
 */
function canAccessBook(bookId) {
    if (window.isPremium === true) return true;
    return isBookFree(bookId);
}

// ========================================
// 本棚UI更新
// ========================================
/**
 * 本棚UIを更新する
 * - 無料 or 購入済 → lock-icon を非表示
 * - それ以外       → lock-icon を表示
 */
function updateBookshelfUI() {
    const items = document.querySelectorAll('.book-item');
    items.forEach(item => {
        const bookId = item.getAttribute('data-book-id');
        if (!bookId) return;

        const lockIcon = item.querySelector('.lock-icon');
        if (!lockIcon) return;

        if (canAccessBook(bookId)) {
            lockIcon.style.display = 'none';
        } else {
            lockIcon.style.display = 'block';
        }
    });
    console.log('[Freemium] Bookshelf UI updated. isPremium:', window.isPremium);
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

// グローバル公開(index.html の onclick 等から呼ばれるため)
window.canAccessBook = canAccessBook;
window.updateBookshelfUI = updateBookshelfUI;
window.showParentalGate = showParentalGate;
window.closeParentalGate = closeParentalGate;
window.checkGateAnswer = checkGateAnswer;
window.showSubscribeScreen = showSubscribeScreen;
window.closeSubscribeScreen = closeSubscribeScreen;

// DOMContentLoaded 時に初期描画(iap.js より前に走る可能性があるため)
document.addEventListener('DOMContentLoaded', () => {
    updateBookshelfUI();
});
