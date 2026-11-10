const DEFAULT_TIME = '00:01';
const ALARM_NAME = 'daily-checkin';
const TIMEOUT_ALARM = 'checkin-timeout';
const TIMEOUT_MINUTES = 3;

const SITES = {
    apk:      { url: 'https://apk.tw/forum.php' },
    bingfong: { url: 'https://bingfong.com/forum.php' }
};
const SITE_KEYS = Object.keys(SITES);
const DEFAULT_SETTINGS = { checkinTime: DEFAULT_TIME, apk: true, bingfong: true };

// 已完成（今天不需要再簽）的狀態
const DONE_STATES = ['success', 'already'];
// 需要使用者注意的狀態（圖示顯示「!」）
const ATTENTION_STATES = ['challenge', 'not_logged_in', 'failed'];

// ---------- 工具 ----------

function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

// 今天的排程時間（時間戳記）
function todayScheduledTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    return target.getTime();
}

function getNextAlarmTime(timeStr) {
    let t = todayScheduledTime(timeStr);
    if (t <= Date.now()) t += 24 * 60 * 60 * 1000;
    return t;
}

// 所有狀態讀寫都排隊執行，避免兩個分頁同時回報時互相覆蓋
let queue = Promise.resolve();
function serialized(fn) {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
}

async function getStatus() {
    const { status = {} } = await chrome.storage.local.get('status');
    return status;
}

async function setSiteStatus(site, state, detail) {
    const status = await getStatus();
    status[site] = { date: todayStr(), state, at: Date.now(), detail: detail || '' };
    await chrome.storage.local.set({ status });
    await updateBadge(status);
}

// pending: { [tabId]: { site, clicks } }，只存在這次瀏覽器工作階段
async function getPending() {
    const { pending = {} } = await chrome.storage.session.get('pending');
    return pending;
}

function setPending(pending) {
    return chrome.storage.session.set({ pending });
}

async function updateBadge(status) {
    const today = todayStr();
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const attention = SITE_KEYS.some(site =>
        settings[site] &&
        status[site] &&
        status[site].date === today &&
        ATTENTION_STATES.includes(status[site].state)
    );
    await chrome.action.setBadgeBackgroundColor({ color: '#ff3b30' });
    await chrome.action.setBadgeText({ text: attention ? '!' : '' });
}

async function tabExists(tabId) {
    try {
        await chrome.tabs.get(tabId);
        return true;
    } catch (e) {
        return false;
    }
}

// ---------- 排程 ----------

async function scheduleAlarm(timeStr) {
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.create(ALARM_NAME, {
        when: getNextAlarmTime(timeStr),
        periodInMinutes: 1440
    });
    console.log(`[自動簽到] 下次簽到時間已設定為 ${timeStr}`);
}

// 確保排程存在（瀏覽器更新等情況可能清掉 alarm）
async function ensureAlarm() {
    const alarm = await chrome.alarms.get(ALARM_NAME);
    if (!alarm) {
        const { checkinTime } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        await scheduleAlarm(checkinTime);
    }
}

// ---------- 簽到流程 ----------

// 開啟簽到分頁：有視窗開背景分頁，沒有視窗則建立最小化視窗
async function openCheckinTabs(sites) {
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const tabs = {};
    if (windows.length > 0) {
        for (const site of sites) {
            const tab = await chrome.tabs.create({ url: SITES[site].url, active: false });
            tabs[tab.id] = site;
        }
    } else {
        const win = await chrome.windows.create({ url: SITES[sites[0]].url, state: 'minimized' });
        tabs[win.tabs[0].id] = sites[0];
        for (const site of sites.slice(1)) {
            const tab = await chrome.tabs.create({ url: SITES[site].url, windowId: win.id, active: false });
            tabs[tab.id] = site;
        }
    }
    return tabs;
}

// force = true：手動「立即簽到」，即使今天已完成也重跑
function runCheckin(force) {
    return serialized(async () => {
        const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        const status = await getStatus();
        const pending = await getPending();
        const today = todayStr();

        // 清掉已不存在的分頁紀錄
        for (const tabId of Object.keys(pending)) {
            if (!(await tabExists(Number(tabId)))) delete pending[tabId];
        }
        const inProgress = Object.values(pending).map(p => p.site);

        const sites = SITE_KEYS.filter(site => {
            if (!settings[site]) return false;
            if (inProgress.includes(site)) return false;
            const s = status[site];
            const done = s && s.date === today && DONE_STATES.includes(s.state);
            return force || !done;
        });

        if (sites.length === 0) {
            await setPending(pending);
            return;
        }

        const tabs = await openCheckinTabs(sites);
        for (const [tabId, site] of Object.entries(tabs)) {
            pending[tabId] = { site, clicks: 0 };
            status[site] = { date: today, state: 'running', at: Date.now() };
        }
        await setPending(pending);
        await chrome.storage.local.set({ status });
        await updateBadge(status);
        await chrome.alarms.create(TIMEOUT_ALARM, { delayInMinutes: TIMEOUT_MINUTES });
        console.log('[自動簽到] 已開啟簽到頁面：', sites.join(', '));
    });
}

// 排程時間已過但今天還沒簽到 → 補簽（瀏覽器在排程時間沒開的情況）
async function catchUp() {
    const { checkinTime } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    if (Date.now() >= todayScheduledTime(checkinTime)) {
        await runCheckin(false);
    }
}

// 逾時：還停在「簽到中」的分頁視為失敗並關閉；等待驗證的分頁保留給使用者處理
function handleTimeout() {
    return serialized(async () => {
        const pending = await getPending();
        const status = await getStatus();
        for (const [tabId, info] of Object.entries(pending)) {
            const s = status[info.site];
            if (s && s.state === 'running') {
                delete pending[tabId];
                await setSiteStatus(info.site, 'failed', '逾時沒有回應');
                chrome.tabs.remove(Number(tabId)).catch(() => {});
            }
        }
        await setPending(pending);
    });
}

// 遇到 Cloudflare 驗證：把分頁切到前景（背景分頁會被節流，驗證可能跑不完）
async function surfaceTab(tabId, focusWindow) {
    try {
        const tab = await chrome.tabs.update(tabId, { active: true });
        const win = await chrome.windows.get(tab.windowId);
        if (focusWindow) {
            await chrome.windows.update(win.id, { focused: true, state: win.state === 'minimized' ? 'normal' : win.state });
        } else if (win.state === 'minimized') {
            await chrome.windows.update(win.id, { state: 'normal', focused: false });
        }
    } catch (e) {
        // 分頁已被關閉
    }
}

// ---------- 事件 ----------

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) runCheckin(false);
    if (alarm.name === TIMEOUT_ALARM) handleTimeout();
});

chrome.runtime.onInstalled.addListener(async () => {
    const { checkinTime } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    await scheduleAlarm(checkinTime);
    await catchUp();
});

chrome.runtime.onStartup.addListener(async () => {
    const { checkinTime } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    await scheduleAlarm(checkinTime);
    await catchUp();
});

ensureAlarm();

// 簽到分頁在完成前被關掉
chrome.tabs.onRemoved.addListener((tabId) => {
    serialized(async () => {
        const pending = await getPending();
        const info = pending[tabId];
        if (!info) return;
        delete pending[tabId];
        await setPending(pending);
        await setSiteStatus(info.site, 'failed', '簽到分頁被關閉');
    });
});

async function handleMessage(msg, sender) {
    const tabId = sender.tab && sender.tab.id;

    switch (msg.type) {
        // content script 載入時詢問：這個分頁是簽到分頁嗎？
        case 'HELLO': {
            const pending = await getPending();
            return pending[tabId] || null;
        }

        // 已點擊簽到按鈕（接著會重新整理確認結果）
        case 'CLICKED': {
            const pending = await getPending();
            if (!pending[tabId]) return;
            pending[tabId].clicks++;
            await setPending(pending);
            await setSiteStatus(pending[tabId].site, 'running');
            return;
        }

        // 遇到 Cloudflare 驗證
        case 'CHALLENGE': {
            const pending = await getPending();
            if (!pending[tabId]) return;
            await setSiteStatus(pending[tabId].site, 'challenge');
            await surfaceTab(tabId, false);
            return;
        }

        // 最終結果：success / already / not_logged_in / failed
        case 'RESULT': {
            const pending = await getPending();
            const info = pending[tabId];
            if (!info) return;
            delete pending[tabId];
            await setPending(pending);
            await setSiteStatus(info.site, msg.state, msg.detail);
            if (msg.state === 'not_logged_in') {
                // 留著分頁讓使用者登入
                await surfaceTab(tabId, false);
            } else {
                chrome.tabs.remove(tabId).catch(() => {});
            }
            console.log(`[自動簽到] ${info.site}: ${msg.state}`);
            return;
        }

        // popup：切到等待處理的分頁
        case 'FOCUS_TAB': {
            const pending = await getPending();
            const entry = Object.entries(pending).find(([, info]) => info.site === msg.site);
            if (entry) {
                await surfaceTab(Number(entry[0]), true);
            } else if (SITES[msg.site]) {
                // 分頁已不在追蹤中（例如未登入）→ 直接開啟網站
                await chrome.tabs.create({ url: SITES[msg.site].url, active: true });
            }
            return;
        }
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'UPDATE_TIME') {
        scheduleAlarm(msg.time).then(() => getStatus()).then(updateBadge);
        return;
    }
    if (msg.type === 'RUN_NOW') {
        runCheckin(true);
        return;
    }
    serialized(() => handleMessage(msg, sender)).then(sendResponse, () => sendResponse(null));
    return true; // 非同步回應
});
