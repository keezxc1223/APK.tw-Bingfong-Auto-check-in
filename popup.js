const SITE_KEYS = ['apk', 'bingfong'];

const timeInput = document.getElementById('checkinTime');
const saveBtn   = document.getElementById('saveBtn');
const runBtn    = document.getElementById('runBtn');
const statusEl  = document.getElementById('status');
const avatarEl  = document.getElementById('avatar');
const checks    = Object.fromEntries(SITE_KEYS.map(k => [k, document.getElementById(k)]));
const stateEls  = Object.fromEntries(SITE_KEYS.map(k => [k, document.getElementById(`${k}State`)]));

const STATE_TEXT = {
    running:       { text: '簽到中…',               cls: '' },
    success:       { text: '今日已簽到',            cls: 'ok' },
    already:       { text: '今日已簽到',            cls: 'ok' },
    challenge:     { text: '等待驗證 — 點此前往',   cls: 'warn', action: true },
    not_logged_in: { text: '尚未登入 — 點此前往',   cls: 'warn', action: true },
    failed:        { text: '簽到失敗，可按立即簽到重試', cls: 'err' }
};

let runRequested = false;

avatarEl.src = 'https://github.com/keezxc1223.png?size=40';

function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

function renderStatus(status) {
    const today = todayStr();
    for (const site of SITE_KEYS) {
        const el = stateEls[site];
        const s = status[site];
        const info = s && s.date === today ? STATE_TEXT[s.state] : null;
        let text = info ? info.text : '今日尚未簽到';
        if (info && s.state === 'failed' && s.detail) text = `簽到失敗：${s.detail}`;
        el.textContent = text;
        el.className = info ? info.cls : '';
        el.dataset.action = info && info.action ? '1' : '';
    }

    // 按了「立即簽到」後：所有啟用的網站都有結果時，更新下方訊息
    if (runRequested) {
        const states = SITE_KEYS
            .filter(site => checks[site].checked)
            .map(site => (status[site] && status[site].date === today ? status[site].state : null));
        if (states.every(st => st && st !== 'running')) {
            runRequested = false;
            runBtn.disabled = false;
            const ok = states.every(st => st === 'success' || st === 'already');
            setStatus(ok ? '簽到完成' : '有網站需要處理，請看上方狀態', ok ? 'success' : 'error');
        }
    }
}

for (const site of SITE_KEYS) {
    stateEls[site].addEventListener('click', () => {
        if (stateEls[site].dataset.action) {
            chrome.runtime.sendMessage({ type: 'FOCUS_TAB', site });
        }
    });
}

chrome.storage.sync.get({ checkinTime: '00:01', apk: true, bingfong: true }, (data) => {
    timeInput.value = data.checkinTime;
    for (const site of SITE_KEYS) checks[site].checked = data[site];
    showNextTime(data.checkinTime);
});

chrome.storage.local.get({ status: {} }, (data) => renderStatus(data.status));

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.status) {
        renderStatus(changes.status.newValue || {});
    }
});

saveBtn.addEventListener('click', () => {
    const time     = timeInput.value;
    const apk      = checks.apk.checked;
    const bingfong = checks.bingfong.checked;

    if (!apk && !bingfong) {
        setStatus('請至少勾選一個網站', 'error');
        return;
    }

    chrome.storage.sync.set({ checkinTime: time, apk, bingfong }, () => {
        chrome.runtime.sendMessage({ type: 'UPDATE_TIME', time });
        setStatus(`已儲存　下次簽到：${getNextTimeStr(time)}`, 'success');
    });
});

runBtn.addEventListener('click', () => {
    runRequested = true;
    runBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'RUN_NOW' });
    setStatus('簽到中…');
});

function getNextTimeStr(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const now = new Date();
    const t = new Date();
    t.setHours(h, m, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    const dd = String(t.getDate()).padStart(2, '0');
    return `${mm}/${dd} ${timeStr}`;
}

function showNextTime(timeStr) {
    statusEl.textContent = `下次簽到：${getNextTimeStr(timeStr)}`;
    statusEl.className = 'status';
}

function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
}
