(async function() {
    // iframe 內不處理
    if (window.top !== window) return;

    const host = location.hostname.replace(/^www\./, '');
    if (host !== 'apk.tw' && host !== 'bingfong.com') return;

    // 問 background：這個分頁是排程開的簽到分頁嗎？（手動瀏覽時不做任何事）
    let job;
    try {
        job = await chrome.runtime.sendMessage({ type: 'HELLO' });
    } catch (e) {
        return;
    }
    if (!job) return;

    const POLL_MS = 1000;
    const MAX_ATTEMPTS = 10; // 找按鈕最多等 10 秒
    const MAX_CLICKS = 3;

    function send(msg) {
        return chrome.runtime.sendMessage(msg).catch(() => {});
    }

    let finished = false;
    function finish(state, detail) {
        if (finished) return;
        finished = true;
        clearInterval(timer);
        send({ type: 'RESULT', state: state, detail: (detail || '').trim().slice(0, 80) });
    }

    // Cloudflare 驗證頁／Turnstile 元件
    function isChallenge() {
        if (/just a moment|請稍候|attention required/i.test(document.title)) return true;
        if (document.querySelector(
            '#challenge-form, #challenge-stage, #challenge-error-text, #challenge-success-text, #cf-challenge-running, ' +
            '#cf-wrapper, #cf-content, .cf-browser-verification, .cf-captcha-container, ' +
            'input[name="cf-turnstile-response"], script[src*="/chl_page/"]'
        )) return true;
        // 舊版驗證頁：「為什麼我要進行CAPTCHA驗證？」
        const body = document.body;
        if (body && body.innerHTML.length < 30000) {
            return /CAPTCHA\s*驗證|complete a CAPTCHA|進行人機驗證|Verify you are human|確認您是人類/i.test(body.textContent);
        }
        return false;
    }

    function isLoggedIn() {
        return !!document.querySelector('a[href*="action=logout"]');
    }

    function isLoggedOut() {
        return !!document.querySelector('#lsform, a[href*="mod=logging&action=login"], a[href*="member.php?mod=register"]');
    }

    // ---------- apk.tw（dsu_amupper）----------
    // 未簽到：#my_amupper；已簽到：#ppered。點擊後由 AJAX 就地換成 #ppered。
    let apkClickedAt = 0;
    function stepApk() {
        if (document.getElementById('ppered')) {
            finish(job.clicks > 0 || apkClickedAt ? 'success' : 'already');
            return true;
        }
        if (apkClickedAt) {
            // 已點擊，等 AJAX 完成；8 秒還沒變就重新整理再確認
            if (Date.now() - apkClickedAt > 8000) {
                clearInterval(timer);
                location.reload();
            }
            return true;
        }
        const btn = document.getElementById('my_amupper');
        if (btn) {
            if (job.clicks >= MAX_CLICKS) {
                finish('failed', '點擊簽到按鈕後沒有反應');
                return true;
            }
            document.cookie = 'adblock_forbit=1;path=/';
            btn.click();
            apkClickedAt = Date.now();
            send({ type: 'CLICKED' });
            return true;
        }
        return false;
    }

    // ---------- bingfong.com（check_in）----------
    // #pper_a 簽到前後都存在，無法用按鈕判斷；
    // 改為直接前往簽到連結，讀取結果頁的提示訊息。
    // （整頁前往而非彈窗 AJAX，Cloudflare 驗證才能正常顯示）
    function isBingfongResultPage() {
        return /[?&]id=check_in(&|$)/.test(location.search) && /ppersubmit/.test(location.search);
    }

    let bingfongNavigated = false;
    function stepBingfong() {
        if (bingfongNavigated) return true;

        if (isBingfongResultPage()) {
            const box = document.querySelector('#messagetext');
            if (!box) return false;
            const text = (box.querySelector('p') || box).textContent.trim();
            if (/已簽到|無需再次/.test(text)) {
                // 第一次前往就顯示已簽到 → 今天早就簽過；否則是前一次請求簽成功
                finish(job.clicks > 1 ? 'success' : 'already');
            } else if (box.classList.contains('alert_right') || /成功/.test(text)) {
                finish('success');
            } else if (/登錄|登入|login/i.test(text)) {
                finish('not_logged_in');
            } else {
                finish('failed', text);
            }
            return true;
        }

        const link = document.getElementById('pper_a');
        if (link && link.href) {
            if (job.clicks >= MAX_CLICKS) {
                finish('failed', '無法取得簽到結果');
                return true;
            }
            bingfongNavigated = true;
            send({ type: 'CLICKED' }).then(function() {
                location.href = link.href;
            });
            return true;
        }
        return false;
    }

    const step = host === 'apk.tw' ? stepApk : stepBingfong;

    let attempts = 0;
    let challengeReported = false;

    function tick() {
        if (finished) return;

        // 1. 被 Cloudflare 驗證擋住：回報一次，然後持續等待
        //    使用者通過驗證後頁面會重新載入，新的 content script 會接著簽到
        if (isChallenge()) {
            if (!challengeReported) {
                challengeReported = true;
                send({ type: 'CHALLENGE' });
            }
            return;
        }

        // 2. 各網站的簽到步驟
        if (step()) return;

        // 3. 找不到簽到元素
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
            if (isLoggedOut() && !isLoggedIn()) {
                finish('not_logged_in');
            } else {
                finish('failed', '找不到簽到按鈕');
            }
        }
    }

    const timer = setInterval(tick, POLL_MS);
    tick();
})();
