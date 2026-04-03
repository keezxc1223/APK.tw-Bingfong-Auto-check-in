(function() {
    const host = location.hostname.replace('www.', '');
    const isAutoCheckin = location.hash === '#auto-checkin';

    const sites = {
        'apk.tw': {
            checkin: function() {
                var btn = document.getElementById('my_amupper');
                if (btn) {
                    document.cookie = 'adblock_forbit=1;path=/';
                    btn.click();
                    return true;
                }
                return false;
            }
        },
        'bingfong.com': {
            checkin: function() {
                var btn = document.getElementById('pper_a');
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            }
        }
    };

    const site = sites[host];
    if (!site) return;

    var attempts = 0;
    var timer = setInterval(function() {
        attempts++;
        if (site.checkin()) {
            clearInterval(timer);
            if (isAutoCheckin) {
                console.log('[自動簽到] 排程簽到成功！5 秒後重新整理');
                setTimeout(function() { location.reload(); }, 5000);
            } else {
                console.log('[自動簽到] 簽到成功！');
            }
        } else if (attempts >= 10) {
            clearInterval(timer);
            console.log('[自動簽到] 找不到簽到按鈕，可能已簽到或尚未登入');
        }
    }, 1000);
})();
