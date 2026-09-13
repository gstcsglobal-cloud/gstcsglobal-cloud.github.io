// 3D 프레임 캡처 — SwiftShader(소프트웨어 래스터라이저). file:// 은 ES 모듈이 막혀 HTTP 로 띄운다
const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const OUT=process.env.OUT||'f3d', FPS=+(process.env.FPS||30), TIMES=process.env.TIMES?process.env.TIMES.split(',').map(Number):null;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('c:'+m.text());});
  await p.goto('http://127.0.0.1:8742/3d/scene3d.html');
  try{ await p.waitForFunction(()=>window.__ready===true,null,{timeout:60000}); }
  catch(e){ console.error('NOT READY', errs); process.exit(2); }
  const DUR=await p.evaluate(()=>window.DUR3D);
  fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
  const cdp=await p.context().newCDPSession(p);
  const N=TIMES?TIMES.length:Math.round(DUR*FPS);
  const t0=Date.now();
  for(let i=0;i<N;i++){ const t=TIMES?TIMES[i]:i/FPS;
    await p.evaluate(t=>window.seek(t),t);
    const r=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,optimizeForSpeed:true});
    fs.writeFileSync(path.join(OUT,`f_${String(i).padStart(4,'0')}.png`),Buffer.from(r.data,'base64')); }
  console.log(JSON.stringify({frames:N,DUR,ms_per_frame:+((Date.now()-t0)/N).toFixed(0),errors:errs.slice(0,5)}));
  await b.close();
})();
