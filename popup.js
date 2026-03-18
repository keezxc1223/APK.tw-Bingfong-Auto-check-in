const timeInput     = document.getElementById('checkinTime');
const apkCheck      = document.getElementById('apk');
const bingfongCheck = document.getElementById('bingfong');
const saveBtn       = document.getElementById('saveBtn');
const statusEl      = document.getElementById('status');
const avatarEl      = document.getElementById('avatar');

avatarEl.src = 'https://github.com/keezxc1223.png?size=40';

chrome.storage.sync.get({ checkinTime: '00:01', apk: true, bingfong: true }, (data) => {
    timeInput.value       = data.checkinTime;
    apkCheck.checked      = data.apk;
    bingfongCheck.checked = data.bingfong;
    showNextTime(data.checkinTime);
});

saveBtn.addEventListener('click', () => {
    const time     = timeInput.value;
    const apk      = apkCheck.checked;
    const bingfong = bingfongCheck.checked;

    if (!apk && !bingfong) {
        setStatus('請至少勾選一個網站', 'error');
        return;
    }

    chrome.storage.sync.set({ checkinTime: time, apk, bingfong }, () => {
        chrome.runtime.sendMessage({ type: 'UPDATE_TIME', time });
        setStatus(`已儲存　下次簽到：${getNextTimeStr(time)}`, 'success');
    });
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
