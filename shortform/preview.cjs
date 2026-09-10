// 미리보기: 지정 fps 로 프레임을 찍고 JS 에러를 잡는다
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const FPS = +(process.env.FPS || 2), DUR = +(process.env.DUR || 56), OUT = process.env.OUT || 'prev', START = +(process.env.START || 0);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = []; page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(process.env.HTML || 'scene.html')); await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(Array.from(document.images).map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))));
  const fontsOK = await page.evaluate(() => ['400 20px NotoKR','700 20px NotoKR','900 20px NotoKR','400 20px BlackHan'].map(f => f + '=' + document.fonts.check(f)));
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
  const cdp = await page.context().newCDPSession(page); const TIMES = process.env.TIMES ? process.env.TIMES.split(",").map(Number) : null; const N = TIMES ? TIMES.length : Math.round((DUR - START) * FPS);
  for (let i = 0; i < N; i++) { const t = TIMES ? TIMES[i] : START + i / FPS; try { await page.evaluate(t => window.seek(t), t); } catch (e) { errs.push(`seek(${t}): ${e.message}`); }
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, optimizeForSpeed: true }); fs.writeFileSync(path.join(OUT, `f_${String(i).padStart(4,'0')}.png`), Buffer.from(r.data, 'base64')); }
  console.log(JSON.stringify({ frames: N, fonts: fontsOK, errors: errs.slice(0, 10) })); await browser.close();
})();
