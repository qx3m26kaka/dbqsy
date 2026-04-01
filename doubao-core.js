(function() {
    'use strict';

    let cachedImages = new Set();
    let toastTimeout = null;
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    function replaceUrlsInData(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.image && obj.image.image_ori_raw && obj.image.image_ori_raw.url) {
            const rawUrl = obj.image.image_ori_raw.url;
            if (obj.image.image_ori) obj.image.image_ori.url = rawUrl;
            if (obj.image.image_preview) obj.image.image_preview.url = rawUrl;
            if (obj.image.image_thumb) obj.image.image_thumb.url = rawUrl;
            if (!cachedImages.has(rawUrl)) {
                cachedImages.add(rawUrl);
                scheduleToast();
            }
        }
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) replaceUrlsInData(obj[i]);
        } else {
            for (let key in obj) replaceUrlsInData(obj[key]);
        }
    }

    const originalParse = JSON.parse;
    win.JSON.parse = function(text, reviver) {
        let data = originalParse(text, reviver);
        try { replaceUrlsInData(data); } catch (e) {}
        return data; 
    };

    function scanInitialMemory() {
        const dataSources = [win._ROUTER_DATA, win._SSR_DATA, win.__NEXT_DATA__];
        dataSources.forEach(source => { if (source) replaceUrlsInData(source); });
    }

    let toastDebounceTimer = null;
    function scheduleToast() {
        clearTimeout(toastDebounceTimer);
        toastDebounceTimer = setTimeout(() => { showToast(cachedImages.size); }, 800); 
    }

    function injectToastStyles() {
        if (document.getElementById('hk-toast-style')) return;
        const style = document.createElement('style');
        style.id = 'hk-toast-style';
        style.innerText = `
            #hk-toast { position: fixed; top: 30px; right: -300px; z-index: 2147483647; background: rgba(255, 255, 255, 0.85); backdrop-filter: saturate(180%) blur(20px); border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-radius: 16px; padding: 16px 20px; display: flex; align-items: center; gap: 15px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; transition: right 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); color: #1d1d1f; font-size: 14px; font-weight: 500; }
            #hk-toast.show { right: 30px; }
            .hk-toast-btn { background: #0071e3; color: white; border: none; border-radius: 999px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
            .hk-toast-btn:hover { background: #0077ed; }
            .hk-toast-btn:disabled { background: #a1c6ea; cursor: not-allowed; }
            .hk-toast-text { display: flex; flex-direction: column; gap: 4px; }
            .hk-toast-title { font-size: 15px; font-weight: 600; }
            .hk-toast-sub { font-size: 12px; color: #86868b; }
        `;
        document.documentElement.appendChild(style);
    }

    function showToast(count) {
        if (count === 0) return;
        injectToastStyles();
        let toast = document.getElementById('hk-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'hk-toast';
            toast.innerHTML = `
                <div class="hk-toast-text">
                    <span class="hk-toast-title">✨ 拦截成功 (云端版)</span>
                    <span class="hk-toast-sub" id="hk-toast-count">内存共有 ${count} 张真原图</span>
                </div>
                <button class="hk-toast-btn" id="hk-toast-dl">一键打包</button>
            `;
            document.documentElement.appendChild(toast);
            document.getElementById('hk-toast-dl').addEventListener('click', executeZIPDownload);
        } else {
            document.getElementById('hk-toast-count').innerText = `内存共有 ${count} 张真原图`;
        }
        setTimeout(() => toast.classList.add('show'), 10);
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('show'), 8000);
    }

    // --- 这里由于不能再用油猴的内置请求，改用原生的 fetch 来获取图片 ---
    async function executeZIPDownload() {
        if (cachedImages.size === 0) return;
        const btn = document.getElementById('hk-toast-dl');
        btn.disabled = true;
        
        const zip = new JSZip(); // 需要确保油猴壳里注入了 JSZip
        const folder = zip.folder("Doubao_Images");
        const urls = Array.from(cachedImages);

        for (let i = 0; i < urls.length; i++) {
            btn.innerText = `处理中 ${i + 1}/${urls.length}`;
            try {
                // 替换掉原先的 GM_xmlhttpRequest，因为云端代码拿不到油猴的特权 API
                const response = await fetch(urls[i]);
                const blob = await response.blob();
                folder.file(`Doubao_Raw_${Date.now()}_${i}.png`, blob);
            } catch(e) { console.error("下载失败", e); }
        }
        btn.innerText = "压缩中...";
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `Doubao_Export_${new Date().getTime()}.zip`); // 需要确保壳里注入了 FileSaver
        
        btn.innerText = "完成";
        setTimeout(() => {
            btn.disabled = false; btn.innerText = "一键打包";
            document.getElementById('hk-toast').classList.remove('show');
        }, 3000);
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', scanInitialMemory); } 
    else { scanInitialMemory(); }

})();
