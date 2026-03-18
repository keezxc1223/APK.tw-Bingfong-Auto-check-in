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

// 時間到，開啟兩個網站的簽到頁面
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return;

    chrome.storage.sync.get({ apk: true, bingfong: true }, (settings) => {
        if (settings.apk) {
            chrome.tabs.create({ url: 'https://apk.tw/forum.php', active: false });
        }
        if (settings.bingfong) {
            chrome.tabs.create({ url: 'https://bingfong.com/forum.php', active: false });
        }
        console.log('[自動簽到] 已開啟簽到頁面');
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
