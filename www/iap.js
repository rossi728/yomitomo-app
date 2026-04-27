// iap.js - In-App Purchase implementation for yomitomo
// Build 7: localStorage を StoreKit のキャッシュとして扱う設計に変更

const PREMIUM_KEY = 'yomitomo_premium_v2';  // ネームスペース化
const OLD_PREMIUM_KEY = 'isPremium';        // 過去残留クリア用
const SUBSCRIPTION_PRODUCT_ID = 'yomitomo.monthly';

// 起動時に必ず古いキーを削除(過去のテスト残留対策)
try {
    if (localStorage.getItem(OLD_PREMIUM_KEY) !== null) {
        console.log('[IAP] Removing legacy isPremium key from localStorage');
        localStorage.removeItem(OLD_PREMIUM_KEY);
    }
} catch (e) {
    console.warn('[IAP] localStorage cleanup failed:', e);
}

document.addEventListener('deviceready', initializeStore, false);

function initializeStore() {
    if (typeof CdvPurchase === 'undefined') {
        console.warn('[IAP] CdvPurchase plugin not available');
        // プラグインが無い環境(ブラウザ等)では isPremium=false のまま
        applyPremiumState(false);
        return;
    }

    const { store, ProductType, Platform } = CdvPurchase;

    store.register([{
        id: SUBSCRIPTION_PRODUCT_ID,
        type: ProductType.PAID_SUBSCRIPTION,
        platform: Platform.APPLE_APPSTORE
    }]);

    // 商品が承認されたら検証へ
    store.when()
        .approved(transaction => {
            console.log('[IAP] Transaction approved:', transaction);
            transaction.verify();
        })
        .verified(receipt => {
            console.log('[IAP] Receipt verified:', receipt);
            receipt.finish();
            // verified の段階で再評価
            evaluatePremiumFromStore();
        })
        .receiptUpdated(receipt => {
            console.log('[IAP] Receipt updated');
            evaluatePremiumFromStore();
        })
        .productUpdated(product => {
            console.log('[IAP] Product updated:', product.id, 'owned:', product.owned);
            evaluatePremiumFromStore();
        });

    store.error(err => {
        console.error('[IAP] Store error:', err);
    });

    // ストア初期化
    store.initialize([Platform.APPLE_APPSTORE])
        .then(() => {
            console.log('[IAP] Store initialized');
            // 起動時にキャッシュから即座に初期表示(UX向上)
            // ただし StoreKit の検証で上書きされる前提
            applyPremiumFromCache();
            // StoreKit と同期
            return store.update();
        })
        .then(() => {
            console.log('[IAP] Store updated, evaluating premium state');
            evaluatePremiumFromStore();
        })
        .catch(err => {
            console.error('[IAP] Initialize failed:', err);
        });
}

/**
 * StoreKit の状態から isPremium を評価する(source of truth)
 * これが呼ばれると localStorage キャッシュも更新される
 */
function evaluatePremiumFromStore() {
    if (typeof CdvPurchase === 'undefined') return;

    const product = CdvPurchase.store.get(SUBSCRIPTION_PRODUCT_ID);
    const owned = product && product.owned === true;

    console.log('[IAP] evaluatePremiumFromStore: owned =', owned);

    if (owned) {
        applyPremiumState(true);
    } else {
        // StoreKit が「未所有」と言っている = サブスク失効 or 未購入
        applyPremiumState(false);
    }
}

/**
 * キャッシュから即時的に状態を適用(初回起動時の UX 向上用)
 * StoreKit 検証で必ず上書きされる前提のため、信頼度は低い
 */
function applyPremiumFromCache() {
    try {
        const cached = localStorage.getItem(PREMIUM_KEY) === 'true';
        console.log('[IAP] applyPremiumFromCache: cached =', cached);
        // キャッシュは表示の即時性のためだけに使う(true の時だけ反映)
        if (cached) {
            window.isPremium = true;
            if (typeof updateBookshelfUI === 'function') {
                updateBookshelfUI();
            }
        }
    } catch (e) {
        console.warn('[IAP] applyPremiumFromCache failed:', e);
    }
}

/**
 * isPremium 状態を確定的に適用する
 * - グローバル window.isPremium を更新
 * - localStorage キャッシュを更新
 * - 本棚UIを再描画
 */
function applyPremiumState(isPremiumNow) {
    console.log('[IAP] applyPremiumState:', isPremiumNow);

    window.isPremium = isPremiumNow;

    try {
        if (isPremiumNow) {
            localStorage.setItem(PREMIUM_KEY, 'true');
        } else {
            localStorage.removeItem(PREMIUM_KEY);
        }
    } catch (e) {
        console.warn('[IAP] localStorage write failed:', e);
    }

    if (typeof updateBookshelfUI === 'function') {
        updateBookshelfUI();
    }
}

/**
 * サブスク購入処理(購入ボタンから呼ばれる)
 */
function purchaseSubscription() {
    if (typeof CdvPurchase === 'undefined') {
        alert('購入機能が利用できません。');
        return;
    }

    const product = CdvPurchase.store.get(SUBSCRIPTION_PRODUCT_ID);
    if (!product) {
        alert('商品情報が取得できませんでした。');
        return;
    }

    const offer = product.getOffer();
    if (!offer) {
        alert('購入オファーが取得できませんでした。');
        return;
    }

    offer.order()
        .then(() => {
            console.log('[IAP] Order placed');
        })
        .catch(err => {
            console.error('[IAP] Order failed:', err);
            alert('購入に失敗しました: ' + (err.message || err));
        });
}

/**
 * 購入復元処理(復元ボタンから呼ばれる)
 */
function restorePurchases() {
    if (typeof CdvPurchase === 'undefined') {
        alert('復元機能が利用できません。');
        return;
    }

    CdvPurchase.store.restorePurchases()
        .then(() => {
            console.log('[IAP] Restore completed');
            // restorePurchases の結果は productUpdated / receiptUpdated 経由で反映
        })
        .catch(err => {
            console.error('[IAP] Restore failed:', err);
            alert('復元に失敗しました: ' + (err.message || err));
        });
}

// グローバル公開(index.html の onclick 等から呼ばれるため)
window.purchaseSubscription = purchaseSubscription;
window.restorePurchases = restorePurchases;
window.evaluatePremiumFromStore = evaluatePremiumFromStore;
