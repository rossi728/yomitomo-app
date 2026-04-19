// ========================================
// iap.js - アプリ内課金（StoreKit / Apple In-App Purchase）
// ========================================
// 使用プラグイン: cordova-plugin-purchase v13 (CdvPurchase 名前空間)
// 製品ID: yomitomo.monthly（自動更新サブスクリプション・¥480/月）

const PRODUCT_ID = 'yomitomo.monthly';

// ----------------------------------------
// ストア初期化
// ----------------------------------------
function initializeStore() {
  // ブラウザ環境ではプラグインが存在しないのでスキップ
  if (!window.CdvPurchase) {
    console.log('⚠️ CdvPurchase not available (browser mode)');
    return;
  }

  const { store, ProductType, Platform } = CdvPurchase;

  // 商品を登録（App Store Connectで設定済みの製品ID）
  store.register([{
    id: PRODUCT_ID,
    type: ProductType.PAID_SUBSCRIPTION,
    platform: Platform.APPLE_APPSTORE
  }]);

  // イベントハンドラ登録
  store.when()
    // 商品情報がストアから取得できた時（価格・タイトル等）
    .productUpdated((product) => {
      console.log('📦 Product updated:', product.id, product.pricing && product.pricing.price);
      updateSubscriptionUI(product);
    })
    // 購入が承認された（Appleから決済OK）
    .approved((transaction) => {
      console.log('✅ Purchase approved:', transaction.transactionId);
      transaction.verify();
    })
    // レシート検証が完了
    .verified((receipt) => {
      console.log('✅ Purchase verified');
      receipt.finish();
      unlockPremium();
    })
    // トランザクション完了
    .finished((transaction) => {
      console.log('✅ Transaction finished:', transaction.transactionId);
    })
    // レシートが更新された（復元時など）
    .receiptUpdated(() => {
      checkSubscriptionStatus();
    });

  // ストア初期化（Apple App Storeのみ）
  store.initialize([Platform.APPLE_APPSTORE])
    .then(() => {
      console.log('✅ Store initialized');
    })
    .catch((err) => {
      console.error('❌ Store init error:', err);
    });
}

// ----------------------------------------
// 価格表示の動的更新
// StoreKitから取得した実際の価格でUIを上書き
// ----------------------------------------
function updateSubscriptionUI(product) {
  const priceEl = document.getElementById('subscription-price');
  if (priceEl && product.pricing && product.pricing.price) {
    priceEl.textContent = product.pricing.price;
  }
}

// ----------------------------------------
// 購入処理（HTMLの「プレミアムになる」ボタンから呼ばれる）
// ----------------------------------------
function handleSubscribe() {
  if (!window.CdvPurchase) {
    alert('この環境ではサブスクリプションを購入できません。');
    return;
  }

  const { store } = CdvPurchase;
  const product = store.get(PRODUCT_ID);

  if (!product) {
    alert('商品情報を取得できませんでした。ネットワーク接続を確認してください。');
    return;
  }

  const offer = product.getOffer();
  if (!offer) {
    alert('購入オプションが見つかりませんでした。');
    return;
  }

  store.order(offer)
    .then((error) => {
      if (!error) return;
      // ユーザーが自分でキャンセルした場合は通知不要
      if (error.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED) {
        console.log('User cancelled purchase');
        return;
      }
      console.error('❌ Purchase error:', error);
      alert('購入処理中にエラーが発生しました。もう一度お試しください。');
    });
}

// ----------------------------------------
// 購入復元（HTMLの「購入を復元」ボタンから呼ばれる）
// ----------------------------------------
function restorePurchase() {
  if (!window.CdvPurchase) {
    alert('この環境では購入の復元はできません。');
    return;
  }

  const { store } = CdvPurchase;

  store.restorePurchases()
    .then(() => {
      // 復元処理はAppleとの通信に時間がかかるため、少し待ってからチェック
      setTimeout(() => {
        checkSubscriptionStatus();
        if (typeof isPremium !== 'undefined' && isPremium) {
          alert('購入が復元されました！');
        } else {
          alert('復元できるサブスクリプションが見つかりませんでした。');
        }
      }, 2000);
    })
    .catch((err) => {
      console.error('❌ Restore error:', err);
      alert('復元処理中にエラーが発生しました。');
    });
}

// ----------------------------------------
// サブスクリプション状態の確認
// ----------------------------------------
function checkSubscriptionStatus() {
  if (!window.CdvPurchase) {
    return;
  }

  const { store } = CdvPurchase;
  const product = store.get(PRODUCT_ID);

  if (product && product.owned) {
    unlockPremium();
  }
}

// ----------------------------------------
// プレミアム機能アンロック
// 既存の freemium.js の isPremium / updateBookshelfUI を利用
// ----------------------------------------
function unlockPremium() {
  // freemium.js のグローバル変数を更新
  if (typeof window.isPremium !== 'undefined' || typeof isPremium !== 'undefined') {
    isPremium = true;
  }
  localStorage.setItem('isPremium', 'true');

  // 本棚UIを更新（freemium.jsに定義されている関数）
  if (typeof updateBookshelfUI === 'function') {
    updateBookshelfUI();
  }

  // サブスク画面が開いていれば閉じる
  if (typeof closeSubscribeScreen === 'function') {
    closeSubscribeScreen();
  }

  console.log('🎉 Premium unlocked!');
}

// ----------------------------------------
// 起動時の状態復元（前回購入済みなら自動的にプレミアム化）
// ----------------------------------------
function restorePremiumFromStorage() {
  if (localStorage.getItem('isPremium') === 'true') {
    if (typeof isPremium !== 'undefined') {
      isPremium = true;
    }
    if (typeof updateBookshelfUI === 'function') {
      updateBookshelfUI();
    }
    console.log('🔓 Premium state restored from storage');
  }
}

// ----------------------------------------
// 初期化トリガ
// ----------------------------------------
// Capacitor / Cordova のネイティブ環境では deviceready で初期化
document.addEventListener('deviceready', () => {
  console.log('📱 deviceready - initializing IAP');
  restorePremiumFromStorage();
  initializeStore();
}, false);

// ブラウザ環境（テスト用）では DOMContentLoaded で簡易初期化のみ
if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 Running in browser mode - IAP disabled');
    restorePremiumFromStorage();
  });
}
