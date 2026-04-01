// 豆包生图 - 云端核心逻辑 (终极直连版)
(function(Hk_GM, JSZip_Core) {
    'use strict';

    let cachedImages = new Set();
    let toastTimeout = null;
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // 1. 核心克隆与篡改逻辑
    function replaceUrlsInData(obj) {
        if (!obj || typeof obj !== 'object') return;
        
        if (obj.image && obj.image.image_ori_raw && obj.image.image_ori_raw.url) {
            const rawUrl = obj.image.image_ori_raw.url;
            // 强行修改克隆对象的所有尺寸链接为原图
            ['image_ori', 'image_preview', 'image_thumb'].forEach(size => {
                if (obj.image[size]) obj.image[size].url = rawUrl;
            });

            if (!cachedImages.has(rawUrl)) {
                cachedImages.add(rawUrl);
                scheduleToast();
            }
        }
        // 递归处理
        for (let key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                replaceUrlsInData(obj[key]);
            }
        }
    }

    // 2. 拦截 JSON 解析 (偷梁换柱)
    const originalParse = JSON.parse;
    win.JSON.parse = function(text, reviver) {
        const data = originalParse(text, reviver);
        try {
            // 深拷贝一份数据，彻底突破只读限制
            const editableData = JSON.parse(JSON.stringify(data));
            replaceUrlsInData(editableData);
            return editableData;
        } catch (e) {
            return data;
        }
    };

    // 3. 初始内存数据扫描 (针对已经加载的数据)
    function scanInitialMemory() {
        try {
            const dataSources = [win._ROUTER_DATA, win._SSR_DATA, win.__NEXT_DATA__];
            dataSources.forEach(source => { if (source) replaceUrlsInData(source); });
        } catch(e) {}
    }

    // 4. UI 弹窗逻辑
    function scheduleToast() {
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => showToast(cachedImages.size), 800);
    }

    function showToast(count) {
        if (count === 0) return;
        if (!document.getElementById('hk-toast-style')) {
            const style = document.createElement('style');
            style.id = 'hk-toast-style';
            style.innerText = `
                #hk-toast { position: fixed; top: 30px; right: 30px; z-index: 2147483647; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.15); border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; gap: 15px; font-family: system-ui, sans-serif; transition: all 0.3s ease; }
                .hk-btn { background: #0071e3; color: white; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-weight: 600; font-size: 13px; transition: 0.2s; }
                .hk-btn:hover { background: #0077ed; }
                .hk-btn:disabled { background: #a1c6ea; cursor: not-allowed; }
            `;
            document.head.appendChild(style);
        }

        let toast = document.getElementById('hk-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'hk-toast';
            toast.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span style="font-weight:600; font-size:15px; color:#1d1d1f;">✨ 拦截成功</span>
                    <span style="font-size:12px; color:#86868b;" id="hk-toast-text">已捕获 ${count} 张真原图</span>
                </div>
                <button class="hk-btn" id="hk-dl-btn">一键打包</button>
            `;
            document.body.appendChild(toast);
            document.getElementById('hk-dl-btn').addEventListener('click', executeDownload);
        } else {
            document.getElementById('hk-toast-text').innerText = `已捕获 ${count} 张真原图`;
        }
    }

    // 5. 终极打包下载逻辑 (调用油猴上帝权限)
    async function executeDownload() {
        if (cachedImages.size === 0) return;
        const btn = document.getElementById('hk-dl-btn');
        btn.disabled = true;
        
        // 使用从外壳传进来的 JSZip
        const zip = new JSZip_Core();
        const urls = Array.from(cachedImages);
        const folder = zip.folder("Doubao_HD_Images");
        
        for (let i = 0; i < urls.length; i++) {
            try {
                btn.innerText = `下载中 ${i+1}/${urls.length}`;
                // 使用从外壳传进来的 GM_xmlhttpRequest 强行跨域下载
                const blob = await new Promise((resolve, reject) => {
                    Hk_GM({
                        method: 'GET',
                        url: urls[i],
                        responseType: 'blob',
                        onload: (res) => { if(res.status === 200) resolve(res.response); else reject(res.status); },
                        onerror: reject
                    });
                });
                folder.file(`Doubao_RAW_${Date.now()}_${i}.png`, blob);
            } catch (e) {
                console.error("单张图片下载失败:", e);
            }
        }

        btn.innerText = '压缩中...';
        try {
            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `Doubao_Export_${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error("压缩失败:", err);
            alert("压缩打包失败，请查看控制台！");
        }
        
        btn.innerText = '打包完成';
        setTimeout(() => { btn.disabled = false; btn.innerText = '一键打包'; }, 3000);
    }

    // 初始化启动
    scanInitialMemory();

})(arguments[0], arguments[1]);
