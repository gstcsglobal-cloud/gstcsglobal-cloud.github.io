// 최종 후보: K 페이지 샤딩 + CDP PNG → 디스크. EXE·K·OUT 인자.
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const EXE = process.env.EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', K = +(process.env.K || 2), OUT = process.env.OUT || 'frames', FPS = +(process.env.FPS || 30), N = +(process.env.FRAMES || 90);
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const url = 'file://' + path.resolve(process.env.HTML || 'scene.html');
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
  const pages = [];
  for (let k = 0; k < K; k++) { const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }); await page.goto(url); await page.evaluate(() => document.fonts.ready);
    // 인물·로고 슬롯 이미지가 로드(또는 실패)될 때까지 기다린다 — 안 그러면 첫 프레임만 빈 칸이 된다
    await page.evaluate(() => Promise.all(Array.from(document.images).map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })))); pages.push({ page, cdp: await page.context().newCDPSession(page) }); }
  const t0 = Date.now();
  await Promise.all(pages.map(async ({ page, cdp }, k) => {
    for (let i = k; i < N; i += K) {
      await page.evaluate(t => window.seek(t), i / FPS);
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, optimizeForSpeed: true });
      fs.writeFileSync(path.join(OUT, `frame_${String(i).padStart(5, '0')}.png`), Buffer.from(r.data, 'base64'));
    }
  }));
  const ms = Date.now() - t0;
  console.log(JSON.stringify({ exe: path.basename(EXE), K, frames: N, total_ms: ms, per_frame_ms: +(ms / N).toFixed(1), est_60s_sec: +(ms / N * 1800 / 1000).toFixed(1) }));
  await browser.close();
})();
