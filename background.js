const DEFAULT_TIME = '00:01';
const ALARM_NAME = 'daily-checkin';

// 計算下一次簽到的時間戳記
function getNextAlarmTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (target <= now) {
        target.setDate(target.getDate() + 1);
    }
    return target.getTime();
}

// 設定每日排程
function scheduleAlarm(timeStr) {
    chrome.alarms.clear(ALARM_NAME, () => {
        chrome.alarms.create(ALARM_NAME, {
            when: getNextAlarmTime(timeStr),
            periodInMinutes: 1440
        });
        console.log(`[自動簽到] 下次簽到時間已設定為 ${timeStr}`);
    });
}

// 在現有視窗建立分頁，若無視窗則建立最小化視窗
function openCheckinPages(urls) {
    chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
        if (windows.length > 0) {
            // 有現有視窗，直接開背景分頁
            urls.forEach(url => {
                chrome.tabs.create({ url, active: false });
            });
        } else {
            // 沒有視窗，建立最小化視窗開啟第一個網址
            chrome.windows.create({ url: urls[0], state: 'minimized' }, (win) => {
                // 其餘網址在同一視窗開新分頁
                for (let i = 1; i < urls.length; i++) {
                    chrome.tabs.create({ url: urls[i], windowId: win.id, active: false });
                }
            });
        }
        console.log('[自動簽到] 已開啟簽到頁面');
    });
}

// 時間到，開啟兩個網站的簽到頁面
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return;

    chrome.storage.sync.get({ apk: true, bingfong: true }, (settings) => {
        const urls = [];
        if (settings.apk) {
            urls.push('https://apk.tw/forum.php#auto-checkin');
        }
        if (settings.bingfong) {
            urls.push('https://bingfong.com/forum.php#auto-checkin');
        }
        if (urls.length > 0) {
            openCheckinPages(urls);
        }
    });
});

// 擴充功能安裝或瀏覽器啟動時，重新設定排程
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get({ checkinTime: DEFAULT_TIME }, (data) => {
        scheduleAlarm(data.checkinTime);
    });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.sync.get({ checkinTime: DEFAULT_TIME }, (data) => {
        scheduleAlarm(data.checkinTime);
    });
});

// 接收 popup 的訊息（使用者更新時間時）
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'UPDATE_TIME') {
        scheduleAlarm(msg.time);
    }
});
