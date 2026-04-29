// ============================================
//  Crop Module — Interactive Video Crop/Resize
// ============================================
window.CropModule = (function () {
    'use strict';

    const cropCanvas = document.getElementById('cropCanvas');
    const cropCtx = cropCanvas.getContext('2d');
    const viewport = document.getElementById('cropViewport');
    const region = document.getElementById('cropRegion');
    const cropInfo = document.getElementById('cropInfo');

    const cropXInput = document.getElementById('cropX');
    const cropYInput = document.getElementById('cropY');
    const cropWInput = document.getElementById('cropW');
    const cropHInput = document.getElementById('cropH');
    const cropAspect = document.getElementById('cropAspect');
    const cropEnabled = document.getElementById('cropEnabled');

    let videoEl = null;
    let vpW = 0, vpH = 0;
    let dragging = null; // null | 'move' | 'nw' | 'ne' | 'sw' | 'se'
    let dragStart = { x: 0, y: 0 };
    let regionStart = { x: 0, y: 0, w: 0, h: 0 };

    function init(video) {
        videoEl = video;
        videoEl.addEventListener('loadeddata', () => { updateCropCanvas(); resetCropRegion(); });
        videoEl.addEventListener('seeked', updateCropCanvas);
        videoEl.addEventListener('play', startPreviewLoop);
        videoEl.addEventListener('pause', stopPreviewLoop);

        // Slider listeners
        [cropXInput, cropYInput, cropWInput, cropHInput].forEach(el => {
            el.addEventListener('input', () => {
                syncRegionFromSliders();
                document.getElementById('cropXVal').textContent = cropXInput.value;
                document.getElementById('cropYVal').textContent = cropYInput.value;
                document.getElementById('cropWVal').textContent = cropWInput.value;
                document.getElementById('cropHVal').textContent = cropHInput.value;
            });
        });

        cropAspect.addEventListener('change', () => {
            syncRegionFromSliders();
        });

        document.getElementById('resetCropX').addEventListener('click', () => { cropXInput.value = 0; document.getElementById('cropXVal').textContent = '0'; syncRegionFromSliders(); });
        document.getElementById('resetCropY').addEventListener('click', () => { cropYInput.value = 0; document.getElementById('cropYVal').textContent = '0'; syncRegionFromSliders(); });
        document.getElementById('resetCropW').addEventListener('click', () => { cropWInput.value = 100; document.getElementById('cropWVal').textContent = '100'; syncRegionFromSliders(); });
        document.getElementById('resetCropH').addEventListener('click', () => { cropHInput.value = 100; document.getElementById('cropHVal').textContent = '100'; syncRegionFromSliders(); });
        document.getElementById('resetCropAll').addEventListener('click', resetCropRegion);

        // Drag handlers on region
        region.addEventListener('mousedown', (e) => { if (e.target === region) startDrag(e, 'move'); });
        document.querySelectorAll('.crop-handle').forEach(h => {
            h.addEventListener('mousedown', (e) => { e.stopPropagation(); startDrag(e, h.dataset.handle); });
        });
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', stopDrag);

        // Touch support
        region.addEventListener('touchstart', (e) => { if (e.target === region) startDrag(e.touches[0], 'move'); e.preventDefault(); }, { passive: false });
        document.querySelectorAll('.crop-handle').forEach(h => {
            h.addEventListener('touchstart', (e) => { e.stopPropagation(); startDrag(e.touches[0], h.dataset.handle); e.preventDefault(); }, { passive: false });
        });
        window.addEventListener('touchmove', (e) => { if (dragging) { onDrag(e.touches[0]); e.preventDefault(); } }, { passive: false });
        window.addEventListener('touchend', stopDrag);
    }

    function updateCropCanvas() {
        if (!videoEl || videoEl.videoWidth === 0) return;
        const rect = viewport.getBoundingClientRect();
        vpW = rect.width;
        vpH = rect.height;
        cropCanvas.width = vpW;
        cropCanvas.height = vpH;

        // Draw video scaled to viewport
        const vr = videoEl.videoWidth / videoEl.videoHeight;
        const cr = vpW / vpH;
        let dw, dh, dx, dy;
        if (vr > cr) { dw = vpW; dh = vpW / vr; dx = 0; dy = (vpH - dh) / 2; }
        else { dh = vpH; dw = vpH * vr; dy = 0; dx = (vpW - dw) / 2; }

        cropCtx.fillStyle = '#000';
        cropCtx.fillRect(0, 0, vpW, vpH);
        cropCtx.drawImage(videoEl, dx, dy, dw, dh);
    }

    let previewLoop = null;
    function startPreviewLoop() { previewLoop = setInterval(updateCropCanvas, 66); }
    function stopPreviewLoop() { clearInterval(previewLoop); updateCropCanvas(); }

    function resetCropRegion() {
        cropXInput.value = 0; cropYInput.value = 0;
        cropWInput.value = 100; cropHInput.value = 100;
        document.getElementById('cropXVal').textContent = '0';
        document.getElementById('cropYVal').textContent = '0';
        document.getElementById('cropWVal').textContent = '100';
        document.getElementById('cropHVal').textContent = '100';
        syncRegionFromSliders();
    }

    function getVideoRect() {
        if (!videoEl || videoEl.videoWidth === 0) return { x: 0, y: 0, w: vpW, h: vpH };
        const vr = videoEl.videoWidth / videoEl.videoHeight;
        const cr = vpW / vpH;
        let dw, dh, dx, dy;
        if (vr > cr) { dw = vpW; dh = vpW / vr; dx = 0; dy = (vpH - dh) / 2; }
        else { dh = vpH; dw = vpH * vr; dy = 0; dx = (vpW - dw) / 2; }
        return { x: dx, y: dy, w: dw, h: dh };
    }

    function syncRegionFromSliders() {
        const vr = getVideoRect();
        const cx = parseFloat(cropXInput.value) / 100;
        const cy = parseFloat(cropYInput.value) / 100;
        let cw = parseFloat(cropWInput.value) / 100;
        let ch = parseFloat(cropHInput.value) / 100;

        // Aspect ratio enforcement
        const asp = cropAspect.value;
        if (asp !== 'free') {
            const [aw, ah] = asp.split(':').map(Number);
            const ratio = aw / ah;
            // Adjust height to match aspect
            const newH = cw * (vr.w / vr.h) / ratio;
            if (newH <= 1) { ch = newH; } else { cw = ch * (vr.h / vr.w) * ratio; }
            cropHInput.value = Math.round(ch * 100);
            cropWInput.value = Math.round(cw * 100);
            document.getElementById('cropWVal').textContent = cropWInput.value;
            document.getElementById('cropHVal').textContent = cropHInput.value;
        }

        const left = vr.x + cx * vr.w;
        const top = vr.y + cy * vr.h;
        const w = cw * vr.w;
        const h = ch * vr.h;

        region.style.left = left + 'px';
        region.style.top = top + 'px';
        region.style.width = w + 'px';
        region.style.height = h + 'px';

        // Update info
        if (videoEl && videoEl.videoWidth) {
            const pw = Math.round(cw * videoEl.videoWidth);
            const ph = Math.round(ch * videoEl.videoHeight);
            cropInfo.textContent = pw + '×' + ph;
        }
    }

    function startDrag(e, type) {
        dragging = type;
        const rect = viewport.getBoundingClientRect();
        dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        regionStart = {
            x: region.offsetLeft, y: region.offsetTop,
            w: region.offsetWidth, h: region.offsetHeight
        };
    }

    function onDrag(e) {
        if (!dragging) return;
        const rect = viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const dx = mx - dragStart.x;
        const dy = my - dragStart.y;
        const vr = getVideoRect();

        let nx = regionStart.x, ny = regionStart.y, nw = regionStart.w, nh = regionStart.h;

        if (dragging === 'move') {
            nx = Math.max(vr.x, Math.min(vr.x + vr.w - nw, regionStart.x + dx));
            ny = Math.max(vr.y, Math.min(vr.y + vr.h - nh, regionStart.y + dy));
        } else {
            if (dragging.includes('w')) { nx = regionStart.x + dx; nw = regionStart.w - dx; }
            if (dragging.includes('e')) { nw = regionStart.w + dx; }
            if (dragging.includes('n')) { ny = regionStart.y + dy; nh = regionStart.h - dy; }
            if (dragging.includes('s')) { nh = regionStart.h + dy; }

            // Min size
            if (nw < 20) { nw = 20; if (dragging.includes('w')) nx = regionStart.x + regionStart.w - 20; }
            if (nh < 10) { nh = 10; if (dragging.includes('n')) ny = regionStart.y + regionStart.h - 10; }

            // Clamp to video area
            nx = Math.max(vr.x, nx);
            ny = Math.max(vr.y, ny);
            if (nx + nw > vr.x + vr.w) nw = vr.x + vr.w - nx;
            if (ny + nh > vr.y + vr.h) nh = vr.y + vr.h - ny;
        }

        region.style.left = nx + 'px';
        region.style.top = ny + 'px';
        region.style.width = nw + 'px';
        region.style.height = nh + 'px';

        // Sync sliders from region
        const cx = Math.round(((nx - vr.x) / vr.w) * 100);
        const cy = Math.round(((ny - vr.y) / vr.h) * 100);
        const cw = Math.round((nw / vr.w) * 100);
        const ch = Math.round((nh / vr.h) * 100);
        cropXInput.value = cx; cropYInput.value = cy;
        cropWInput.value = cw; cropHInput.value = ch;
        document.getElementById('cropXVal').textContent = cx;
        document.getElementById('cropYVal').textContent = cy;
        document.getElementById('cropWVal').textContent = cw;
        document.getElementById('cropHVal').textContent = ch;

        if (videoEl && videoEl.videoWidth) {
            cropInfo.textContent = Math.round(cw / 100 * videoEl.videoWidth) + '×' + Math.round(ch / 100 * videoEl.videoHeight);
        }
    }

    function stopDrag() { dragging = null; }

    // Resize observer
    const ro = new ResizeObserver(() => {
        const rect = viewport.getBoundingClientRect();
        vpW = rect.width; vpH = rect.height;
        updateCropCanvas();
        syncRegionFromSliders();
    });

    function observe() { ro.observe(viewport); }

    /** Returns crop params as fractions {x, y, w, h} or null if disabled */
    function getCrop() {
        if (!cropEnabled.checked) return null;
        return {
            x: parseFloat(cropXInput.value) / 100,
            y: parseFloat(cropYInput.value) / 100,
            w: parseFloat(cropWInput.value) / 100,
            h: parseFloat(cropHInput.value) / 100
        };
    }

    return { init, observe, getCrop, updateCropCanvas, syncRegionFromSliders };
})();
