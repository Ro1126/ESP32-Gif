// ============================================
//  ESP32 OLED Video Converter — Main App Logic
// ============================================
(function () {
    'use strict';

    const upload = document.getElementById('upload');
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

    const offscreen = document.createElement('canvas');
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high';

    // Sharpen convolution canvas
    const sharpCanvas = document.createElement('canvas');
    const sharpCtx = sharpCanvas.getContext('2d', { willReadFrequently: true });

    const outputArray = document.getElementById('outputArray');
    const outputMain = document.getElementById('outputMain');
    const statusEl = document.getElementById('status');
    const convertBtn = document.getElementById('convertBtn');
    const frameCountSpan = document.getElementById('frameCount');
    const rotateBtn = document.getElementById('rotateBtn');

    const ditherModeInput = document.getElementById('ditherMode');
    const scaleModeInput = document.getElementById('scaleMode');
    const customControls = document.getElementById('customControls');
    const fpsInput = document.getElementById('fps');
    const thicknessInput = document.getElementById('thickness');
    const thickNumInput = document.getElementById('thickNum');
    const thresholdInput = document.getElementById('threshold');
    const contrastInput = document.getElementById('contrast');
    const brightnessInput = document.getElementById('brightness');
    const gammaInput = document.getElementById('gamma');
    const sharpenInput = document.getElementById('sharpen');
    const invertInput = document.getElementById('invert');
    const mirrorHInput = document.getElementById('mirrorH');
    const mirrorVInput = document.getElementById('mirrorV');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const useFrameRange = document.getElementById('useFrameRange');
    const customW = document.getElementById('customW');
    const customH = document.getElementById('customH');
    const customX = document.getElementById('customX');
    const customY = document.getElementById('customY');

    let isConverting = false, animationFrameId = null, rotationAngle = 0;

    // ── Dither Matrices ──
    const bayer2x2 = [[0,2],[3,1]];
    const bayer4x4 = [
        [0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]
    ];
    const bayer8x8 = [
        [0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],
        [12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],
        [3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],
        [15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]
    ];

    // ── UI Bindings ──
    const bind = (el, id, sfx = '') => el.addEventListener('input', () => document.getElementById(id).textContent = el.value + sfx);
    bind(fpsInput, 'fpsVal'); bind(thresholdInput, 'threshVal');
    bind(contrastInput, 'contrastVal', '%'); bind(brightnessInput, 'brightVal', '%');
    bind(gammaInput, 'gammaVal'); bind(sharpenInput, 'sharpenVal');
    bind(customW, 'cwVal'); bind(customH, 'chVal'); bind(customX, 'cxVal'); bind(customY, 'cyVal');

    thicknessInput.addEventListener('input', (e) => { thickNumInput.value = e.target.value; });
    thickNumInput.addEventListener('input', (e) => {
        let v = parseFloat(e.target.value); v = Math.max(-3, Math.min(3, v));
        thicknessInput.value = v;
    });

    // Frame range labels
    startTimeInput.addEventListener('input', () => {
        if (video.duration) {
            const t = (parseFloat(startTimeInput.value) / 100 * video.duration).toFixed(1);
            document.getElementById('startTimeVal').textContent = t + 's';
        }
    });
    endTimeInput.addEventListener('input', () => {
        if (video.duration) {
            const pct = parseFloat(endTimeInput.value);
            if (pct >= 99.9) document.getElementById('endTimeVal').textContent = 'end';
            else document.getElementById('endTimeVal').textContent = (pct / 100 * video.duration).toFixed(1) + 's';
        }
    });

    const updateCustomUI = () => {
        const m = scaleModeInput.value;
        if (m === 'custom') {
            customControls.style.display = 'block';
            document.getElementById('grpW').style.display = 'block';
            document.getElementById('grpH').style.display = 'block';
            document.getElementById('customTitle').textContent = 'CUSTOM CONTROLS (W, H, X, Y):';
        } else if (m === 'cover') {
            customControls.style.display = 'block';
            document.getElementById('grpW').style.display = 'none';
            document.getElementById('grpH').style.display = 'none';
            document.getElementById('customTitle').textContent = 'PAN CONTROLS (X & Y):';
        } else {
            customControls.style.display = 'none';
        }
    };

    // ── Settings Persistence ──
    const allInputs = [ditherModeInput, scaleModeInput, fpsInput, thicknessInput, thickNumInput,
        thresholdInput, contrastInput, brightnessInput, gammaInput, sharpenInput,
        invertInput, mirrorHInput, mirrorVInput, customW, customH, customX, customY];

    const saveSettings = () => {
        const s = {};
        allInputs.forEach(el => { s[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
        localStorage.setItem('oledVideoSettings2', JSON.stringify(s));
    };

    const loadSettings = () => {
        const raw = localStorage.getItem('oledVideoSettings2');
        if (!raw) return;
        const s = JSON.parse(raw);
        allInputs.forEach(el => {
            if (s[el.id] !== undefined) {
                if (el.type === 'checkbox') el.checked = s[el.id];
                else el.value = s[el.id];
            }
        });
        // Sync labels
        document.getElementById('fpsVal').textContent = fpsInput.value;
        document.getElementById('threshVal').textContent = thresholdInput.value;
        document.getElementById('contrastVal').textContent = contrastInput.value + '%';
        document.getElementById('brightVal').textContent = brightnessInput.value + '%';
        document.getElementById('gammaVal').textContent = gammaInput.value;
        document.getElementById('sharpenVal').textContent = sharpenInput.value;
        document.getElementById('cwVal').textContent = customW.value;
        document.getElementById('chVal').textContent = customH.value;
        document.getElementById('cxVal').textContent = customX.value;
        document.getElementById('cyVal').textContent = customY.value;
        updateCustomUI();
    };
    loadSettings();

    allInputs.forEach(el => el.addEventListener('input', () => { saveSettings(); if (video.paused && !isConverting) drawFrame(); }));

    // ── Resets ──
    const setupReset = (btnId, els, def, labelId, sfx = '') => {
        document.getElementById(btnId).addEventListener('click', () => {
            (Array.isArray(els) ? els : [els]).forEach(e => e.value = def);
            if (labelId) document.getElementById(labelId).textContent = def + sfx;
            saveSettings(); if (video.paused && !isConverting) drawFrame();
        });
    };
    setupReset('resetFps', fpsInput, 10, 'fpsVal');
    setupReset('resetThick', [thicknessInput, thickNumInput], 0, null);
    setupReset('resetThresh', thresholdInput, 128, 'threshVal');
    setupReset('resetContrast', contrastInput, 100, 'contrastVal', '%');
    setupReset('resetBrightness', brightnessInput, 100, 'brightVal', '%');
    setupReset('resetGamma', gammaInput, 1.0, 'gammaVal');
    setupReset('resetSharpen', sharpenInput, 0, 'sharpenVal');
    setupReset('resetX', customX, 0, 'cxVal');
    setupReset('resetY', customY, 0, 'cyVal');
    setupReset('resetStartTime', startTimeInput, 0, 'startTimeVal');
    document.getElementById('resetStartTime').addEventListener('click', () => { document.getElementById('startTimeVal').textContent = '0.0s'; });
    setupReset('resetEndTime', endTimeInput, 100, 'endTimeVal');
    document.getElementById('resetEndTime').addEventListener('click', () => { document.getElementById('endTimeVal').textContent = 'end'; });

    scaleModeInput.addEventListener('change', () => { updateCustomUI(); if (video.paused && !isConverting) drawFrame(); });
    rotateBtn.addEventListener('click', () => { rotationAngle = (rotationAngle + 90) % 360; if (video.paused && !isConverting) drawFrame(); });

    // ── Video Upload ──
    upload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        video.src = URL.createObjectURL(file);
        convertBtn.disabled = false; rotationAngle = 0;
        statusEl.textContent = 'Video loaded. Adjust settings, then click Extract.';
        statusEl.style.color = '#00e676';
        document.getElementById('uploadZone').style.borderColor = 'var(--success)';
        document.getElementById('uploadZone').style.background = 'rgba(0,230,118,0.05)';
    });

    video.addEventListener('loadedmetadata', () => {
        document.getElementById('infoRes').textContent = video.videoWidth + '×' + video.videoHeight;
        document.getElementById('infoDur').textContent = video.duration.toFixed(2) + 's';
        updateEstimates();
        // Init crop
        setTimeout(() => { CropModule.updateCropCanvas(); CropModule.syncRegionFromSliders(); }, 100);
    });

    function updateEstimates() {
        if (!video.duration) return;
        const fps = parseInt(fpsInput.value);
        let dur = video.duration;
        if (useFrameRange.checked) {
            const s = parseFloat(startTimeInput.value) / 100 * video.duration;
            const e = parseFloat(endTimeInput.value) / 100 * video.duration;
            dur = Math.max(0, e - s);
        }
        const frames = Math.floor(dur * fps);
        const mem = (frames * 1024 / 1024).toFixed(1);
        document.getElementById('infoFrames').textContent = frames;
        document.getElementById('infoMem').textContent = mem + ' KB (PROGMEM)';
    }
    fpsInput.addEventListener('input', updateEstimates);
    startTimeInput.addEventListener('input', updateEstimates);
    endTimeInput.addEventListener('input', updateEstimates);
    useFrameRange.addEventListener('input', updateEstimates);

    // ── Preview Loop ──
    function renderLoop() {
        if (!video.paused && !video.ended && !isConverting) drawFrame();
        animationFrameId = requestAnimationFrame(renderLoop);
    }
    video.addEventListener('play', () => { if (!animationFrameId) renderLoop(); });
    video.addEventListener('pause', () => {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        if (!isConverting) drawFrame();
    });
    video.addEventListener('timeupdate', () => { if (video.paused && !isConverting) drawFrame(); });

    // ── MAIN DRAW ──
    function drawFrame() {
        if (video.videoWidth === 0 || video.videoHeight === 0) return;

        let vW = video.videoWidth, vH = video.videoHeight;

        // Crop source region
        const crop = CropModule.getCrop();
        let srcX = 0, srcY = 0, srcW = vW, srcH = vH;
        if (crop) {
            srcX = Math.round(crop.x * vW);
            srcY = Math.round(crop.y * vH);
            srcW = Math.round(crop.w * vW);
            srcH = Math.round(crop.h * vH);
            if (srcW < 1) srcW = 1; if (srcH < 1) srcH = 1;
        }

        let isRotated = (rotationAngle % 180 !== 0);
        let effW = isRotated ? srcH : srcW;
        let effH = isRotated ? srcW : srcH;

        // 1. Offscreen pre-process
        if (offscreen.width !== effW || offscreen.height !== effH) {
            offscreen.width = effW; offscreen.height = effH;
        }

        const bright = brightnessInput.value;
        const cont = contrastInput.value;
        const inv = invertInput.checked ? 'invert(100%)' : 'invert(0%)';
        offCtx.filter = `brightness(${bright}%) contrast(${cont}%) ${inv}`;
        offCtx.save();
        offCtx.translate(effW / 2, effH / 2);
        offCtx.rotate(rotationAngle * Math.PI / 180);

        // Mirror
        let sx = mirrorHInput.checked ? -1 : 1;
        let sy = mirrorVInput.checked ? -1 : 1;
        offCtx.scale(sx, sy);

        let drawW = isRotated ? effH : effW;
        let drawH = isRotated ? effW : effH;
        offCtx.drawImage(video, srcX, srcY, srcW, srcH, -drawW / 2, -drawH / 2, drawW, drawH);
        offCtx.restore();
        offCtx.filter = 'none';

        // 2. Clear main
        ctx.filter = 'none'; ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 128, 64);
        let tX = 0, tY = 0, tW = 128, tH = 64;

        const sm = scaleModeInput.value;
        if (sm === 'stretch') { /* defaults */ }
        else if (sm === 'fit') {
            const s = Math.min(128 / effW, 64 / effH);
            tW = effW * s; tH = effH * s; tX = (128 - tW) / 2; tY = (64 - tH) / 2;
        } else if (sm === 'cover') {
            const s = Math.max(128 / effW, 64 / effH);
            tW = effW * s; tH = effH * s;
            tX = ((128 - tW) / 2) + parseInt(customX.value);
            tY = ((64 - tH) / 2) + parseInt(customY.value);
        } else if (sm === 'centercrop') {
            const s = Math.max(128 / effW, 64 / effH);
            tW = effW * s; tH = effH * s;
            tX = (128 - tW) / 2; tY = (64 - tH) / 2;
        } else if (sm === 'pixel') {
            tW = effW; tH = effH;
            tX = (128 - tW) / 2; tY = (64 - tH) / 2;
        } else if (sm === 'custom') {
            tW = parseInt(customW.value); tH = parseInt(customH.value);
            tX = parseInt(customX.value); tY = parseInt(customY.value);
        }

        // 3. Thickness shifting
        const t = parseFloat(thicknessInput.value);
        if (t < 0) ctx.globalCompositeOperation = 'darken';
        else if (t > 0) ctx.globalCompositeOperation = 'lighten';
        else ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(offscreen, tX, tY, tW, tH);
        if (t !== 0) {
            const o = Math.abs(t);
            ctx.drawImage(offscreen, tX - o, tY, tW, tH);
            ctx.drawImage(offscreen, tX + o, tY, tW, tH);
            ctx.drawImage(offscreen, tX, tY - o, tW, tH);
            ctx.drawImage(offscreen, tX, tY + o, tW, tH);
            ctx.drawImage(offscreen, tX - o * .7, tY - o * .7, tW, tH);
            ctx.drawImage(offscreen, tX + o * .7, tY - o * .7, tW, tH);
            ctx.drawImage(offscreen, tX - o * .7, tY + o * .7, tW, tH);
            ctx.drawImage(offscreen, tX + o * .7, tY + o * .7, tW, tH);
        }
        ctx.globalCompositeOperation = 'source-over';

        // 4. Luminance + Gamma
        const thresholdValue = parseInt(thresholdInput.value);
        const bias = thresholdValue - 128;
        const gam = parseFloat(gammaInput.value);
        const imageData = ctx.getImageData(0, 0, 128, 64);
        const data = imageData.data;
        let gray = new Int16Array(128 * 64);
        for (let i = 0; i < 128 * 64; i++) {
            let L = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
            if (gam !== 1.0) L = 255 * Math.pow(L / 255, 1 / gam);
            gray[i] = Math.max(0, Math.min(255, L - bias));
        }

        // 5. Edge enhance (simple unsharp)
        const sharpAmt = parseFloat(sharpenInput.value);
        if (sharpAmt > 0) {
            const tmp = new Int16Array(gray);
            for (let y = 1; y < 63; y++) {
                for (let x = 1; x < 127; x++) {
                    const i = y * 128 + x;
                    const lap = tmp[i] * 4 - tmp[i - 1] - tmp[i + 1] - tmp[i - 128] - tmp[i + 128];
                    gray[i] = Math.max(0, Math.min(255, tmp[i] + lap * sharpAmt * 0.25));
                }
            }
        }

        // 6. Dithering
        const dm = ditherModeInput.value;
        if (dm === 'threshold') {
            for (let i = 0; i < 8192; i++) {
                data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray[i] >= 128 ? 255 : 0;
            }
        } else if (dm === 'bayer2') {
            for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
                const i = y * 128 + x;
                const bv = (bayer2x2[y % 2][x % 2] / 4.0) * 255;
                data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray[i] >= bv ? 255 : 0;
            }
        } else if (dm === 'bayer4') {
            for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
                const i = y * 128 + x;
                const bv = (bayer4x4[y % 4][x % 4] / 16.0) * 255;
                data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray[i] >= bv ? 255 : 0;
            }
        } else if (dm === 'bayer') {
            for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
                const i = y * 128 + x;
                const bv = (bayer8x8[y % 8][x % 8] / 64.0) * 255;
                data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray[i] >= bv ? 255 : 0;
            }
        } else if (dm === 'random') {
            for (let i = 0; i < 8192; i++) {
                data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray[i] >= Math.random() * 255 ? 255 : 0;
            }
        } else {
            // Error diffusion: floyd, atkinson, sierra, stucki
            for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
                const i = y * 128 + x;
                const old = gray[i];
                const nw = old >= 128 ? 255 : 0;
                data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = nw;
                const err = old - nw;
                if (dm === 'floyd') {
                    if (x < 127) gray[i + 1] += (err * 7) >> 4;
                    if (x > 0 && y < 63) gray[i + 127] += (err * 3) >> 4;
                    if (y < 63) gray[i + 128] += (err * 5) >> 4;
                    if (x < 127 && y < 63) gray[i + 129] += (err * 1) >> 4;
                } else if (dm === 'atkinson') {
                    const e = err >> 3;
                    if (x + 1 < 128) gray[i + 1] += e;
                    if (x + 2 < 128) gray[i + 2] += e;
                    if (y + 1 < 64) {
                        if (x > 0) gray[i + 127] += e;
                        gray[i + 128] += e;
                        if (x < 127) gray[i + 129] += e;
                    }
                    if (y + 2 < 64) gray[i + 256] += e;
                } else if (dm === 'sierra') {
                    // Sierra Lite (2-row)
                    if (x + 1 < 128) gray[i + 1] += (err * 2) / 4;
                    if (y + 1 < 64) {
                        if (x > 0) gray[i + 127] += err / 4;
                        gray[i + 128] += err / 4;
                    }
                } else if (dm === 'stucki') {
                    const d42 = err / 42;
                    if (x + 1 < 128) gray[i + 1] += 8 * d42;
                    if (x + 2 < 128) gray[i + 2] += 4 * d42;
                    if (y + 1 < 64) {
                        if (x > 1) gray[i + 126] += 2 * d42;
                        if (x > 0) gray[i + 127] += 4 * d42;
                        gray[i + 128] += 8 * d42;
                        if (x < 127) gray[i + 129] += 4 * d42;
                        if (x < 126) gray[i + 130] += 2 * d42;
                    }
                    if (y + 2 < 64) {
                        if (x > 1) gray[i + 254] += 1 * d42;
                        if (x > 0) gray[i + 255] += 2 * d42;
                        gray[i + 256] += 4 * d42;
                        if (x < 127) gray[i + 257] += 2 * d42;
                        if (x < 126) gray[i + 258] += 1 * d42;
                    }
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    // ── Extraction ──
    convertBtn.addEventListener('click', async () => {
        if (isConverting) return;
        isConverting = true; convertBtn.disabled = true;
        outputArray.value = 'Processing… This may take a moment.';
        frameCountSpan.textContent = '0';
        video.pause();
        statusEl.textContent = 'Extracting frames…'; statusEl.style.color = '#ffc107';

        const progressWrap = document.getElementById('progressWrap');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        progressWrap.style.display = 'flex';
        progressFill.style.width = '0%'; progressText.textContent = '0%';

        const fps = parseInt(fpsInput.value);
        let startSec = 0, endSec = video.duration;
        if (useFrameRange.checked) {
            startSec = parseFloat(startTimeInput.value) / 100 * video.duration;
            endSec = parseFloat(endTimeInput.value) / 100 * video.duration;
            if (endSec <= startSec) endSec = video.duration;
        }
        const duration = endSec - startSec;
        const totalFrames = Math.floor(duration * fps);
        const interval = 1 / fps;
        let framesData = [];

        for (let i = 0; i < totalFrames; i++) {
            video.currentTime = startSec + i * interval;
            await new Promise(r => { video.onseeked = r; });
            drawFrame();

            const imageData = ctx.getImageData(0, 0, 128, 64);
            const d = imageData.data;
            let bytes = [];
            for (let y = 0; y < 64; y++) for (let xb = 0; xb < 16; xb++) {
                let b = 0;
                for (let bit = 0; bit < 8; bit++) {
                    if (d[((y * 128 + xb * 8 + bit) * 4)] === 255) b |= (1 << (7 - bit));
                }
                bytes.push('0x' + b.toString(16).padStart(2, '0'));
            }
            framesData.push(`  {\n    ${bytes.join(', ')}\n  }`);
            frameCountSpan.textContent = framesData.length;

            const pct = Math.round(((i + 1) / totalFrames) * 100);
            progressFill.style.width = pct + '%'; progressText.textContent = pct + '%';
        }

        outputArray.value =
`#include <Arduino.h>

const int TOTAL_FRAMES = ${framesData.length};
const int FRAME_DELAY = ${Math.floor(1000 / fps)}; // ms between frames

const unsigned char video_frames[][1024] PROGMEM = {
${framesData.join(',\n')}
};`;

        statusEl.textContent = '✅ Done! Copy the code below.';
        statusEl.style.color = '#00e676';
        isConverting = false; convertBtn.disabled = false;
        progressFill.style.width = '100%'; progressText.textContent = '100%';
    });

    // ── Copy ──
    const setupCopy = (btnId, el) => {
        document.getElementById(btnId).addEventListener('click', async () => {
            if (el.value.trim() === '') return;
            try { await navigator.clipboard.writeText(el.value); } catch { el.select(); document.execCommand('copy'); }
            const btn = document.getElementById(btnId);
            const orig = btn.innerHTML;
            btn.innerHTML = '✅ Copied!'; btn.style.borderColor = 'var(--success)'; btn.style.color = 'var(--success)';
            setTimeout(() => { btn.innerHTML = orig; btn.style.borderColor = ''; btn.style.color = ''; }, 2000);
        });
    };
    setupCopy('copyArrayBtn', outputArray);
    setupCopy('copyMainBtn', outputMain);

    // ── Init Crop Module ──
    CropModule.init(video);
    CropModule.observe();
})();
