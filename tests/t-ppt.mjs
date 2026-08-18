/* t-ppt — PPT 내보내기가 «주간현황 양식» 한 벌로 나오는지, 그리고 법인 상자가
 * 운영단위를 따라가는지.
 *
 * 왜 이 파일이 있나. 두 가지가 실제로 화면에서 거짓말을 하고 있었다.
 *  ① 양식 파일(qbr-template.pptx)에 'GST TAIWAN' 이 세 장 모두 «박제»돼 있었다.
 *     운영단위로 다른 법인을 골라도 PPT 는 언제나 대만이라고 말했다. 숫자는 필터를
 *     따라 바뀌는데 머리만 안 바뀌므로, 받아 본 사람은 대만 실적으로 읽는다.
 *  ② 나머지 6개 페이지(설치·PM·고장·자재·CIP·TCO)는 공용 pptAuto 를 썼는데 그것이
 *     «어두운 바탕에 차트 한 장씩»이라 같은 대시보드인데 장표 얼굴이 둘로 갈렸다.
 *
 * 실데이터를 쓰지 않는다(공개 저장소) — 전부 지어낸 값이다.
 *   실행: node t-ppt.mjs
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.log('  ❌ '+m);} };

/* ── core.js 를 노드에서 돌리기 위한 최소 DOM (t-region 과 같은 방식) ── */
const el = () => ({ style:{}, appendChild(){}, insertBefore(){}, remove(){}, removeAttribute(){},
  setAttribute(){}, addEventListener(){}, classList:{add(){},remove(){},toggle(){}},
  querySelector:()=>null, querySelectorAll:()=>[], insertAdjacentHTML(){}, insertAdjacentElement(){},
  parentNode:{insertBefore(){}}, firstElementChild:null, textContent:'', innerHTML:'' });
global.document = { createElement:el, getElementById:()=>null, querySelector:()=>null,
  querySelectorAll:()=>[], body:el(), documentElement:el(), addEventListener(){},
  head:el(), readyState:'complete' };
global.window = { addEventListener(){}, location:{href:'',search:''}, self:{}, top:{},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, matchMedia:()=>({matches:false,addEventListener(){}}) };
global.window.self = global.window.top = global.window;
global.localStorage = global.window.localStorage;
global.location = global.window.location;
try { new Function(fs.readFileSync(ROOT+'/assets/core.js','utf8'))(); } catch(e){ console.log('core.js 로드 경고:', e.message); }
const GST = global.window.GST || global.GST;

/* ══════════════════════════════════════════════════════════════
   [1] GST.corpLabel — 운영단위가 최우선, 꼬리 담당구분만 뗀다
   ══════════════════════════════════════════════════════════════ */
console.log('[1] 법인 표기가 운영단위를 따라가는지');
const F = GST.filters.F;
const reset = () => { F.region=''; F.op=''; F.div=''; F.customer=''; F.campus.clear(); F.line=''; F.team=''; F.country=''; };

reset(); F.op='GST TAIWAN SCRUBBER';
ok(GST.corpLabel()==='GST TAIWAN', "운영단위 'GST TAIWAN SCRUBBER' → 'GST TAIWAN' 이어야 (실제=" + GST.corpLabel() + ')');

/* 괄호가 든 법인. 여기서 정규식이 욕심을 부리면 'GST CHINA' 로 잘려 세 중국 법인이 한 덩어리가 된다. */
reset(); F.op='GST CHINA(WUHAN) SCRUBBER';
ok(GST.corpLabel()==='GST CHINA(WUHAN)', "'GST CHINA(WUHAN) SCRUBBER' → 'GST CHINA(WUHAN)' (실제=" + GST.corpLabel() + ')');

reset(); F.op='SEC Scrubber';
ok(GST.corpLabel()==='SEC', "소문자 'Scrubber' 꼬리도 떼야 (실제=" + GST.corpLabel() + ')');

reset(); F.op='SK Scrubber';
ok(GST.corpLabel()==='SK', "'SK Scrubber' → 'SK' (실제=" + GST.corpLabel() + ')');

/* 이름을 «지어내지» 않는다 — 앞부분은 시트 값 그대로다(v98 규약). */
reset(); F.op='GST HEFEI SCRUBBER';
ok(GST.corpLabel()==='GST HEFEI', '앞부분을 손대면 안 된다 (실제=' + GST.corpLabel() + ')');

/* 꼬리를 떼면 빈 문자열이 되는 극단 — 빈 상자를 내느니 원문을 그대로 낸다. */
reset(); F.op='SCRUBBER';
ok(GST.corpLabel()==='SCRUBBER', '꼬리만 있는 값에서 빈 문자열이 되면 안 된다 (실제=' + GST.corpLabel() + ')');

/* 운영단위가 없을 때의 폴백 사슬 */
reset(); F.country='TAIWAN';
ok(GST.corpLabel()==='GST Taiwan', "국가 폴백 (실제=" + GST.corpLabel() + ')');
reset(); F.region=GST.ORG.REGION_KR;
ok(GST.corpLabel()==='GST Korea', '구분 국내 폴백 (실제=' + GST.corpLabel() + ')');
reset(); F.region=GST.ORG.REGION_OS;
ok(GST.corpLabel()==='GST Overseas', '구분 해외 폴백 (실제=' + GST.corpLabel() + ')');
reset();
ok(GST.corpLabel()==='GST Global', '아무것도 안 골랐으면 GST Global (실제=' + GST.corpLabel() + ')');

/* 운영단위가 국가·구분을 «이긴다». 이 순서가 뒤집히면 법인을 골라도 'GST Korea' 가 뜬다. */
reset(); F.op='SDC Scrubber'; F.region=GST.ORG.REGION_KR; F.country='KOREA';
ok(GST.corpLabel()==='SDC', '운영단위가 국가·구분보다 우선이어야 (실제=' + GST.corpLabel() + ')');

/* 페이지가 자기 F 를 넘겨도 같은 규칙 */
ok(GST.corpLabel({op:'GST TAIWAN SCRUBBER'})==='GST TAIWAN', '인자로 준 F 도 같은 규칙이어야');
reset();

/* ══════════════════════════════════════════════════════════════
   [2] 양식(.pptx) 법인 상자 — 실제 파일로, 세 장 모두
   ══════════════════════════════════════════════════════════════ */
console.log('[2] 양식 파일의 법인 상자가 실제로 바뀌는지');
const tplPath = ROOT+'/report/qbr-template.pptx';
ok(fs.existsSync(tplPath), '양식 파일이 있어야 한다');

const QBR = (new Function(fs.readFileSync(ROOT+'/assets/qbr-ppt.js','utf8')+';return (typeof window!=="undefined"&&window.QBRPPT)||globalThis.QBRPPT;'))();

/* qbr-ppt.js 의 build 는 «브라우저면 Blob, 노드면 Buffer»를 낸다. 이 검사는 core.js 를
   돌리려고 가짜 window 를 세워 뒀으므로, build 를 부르는 동안만 치워 노드 경로로 태운다. */
const asNode = async (fn) => { const w=global.window; delete global.window;
  try{ return await fn(); } finally { global.window=w; } };

const slidesOf = async (buf) => {
  const z = await JSZip.loadAsync(buf);
  const out = {};
  for(const n of Object.keys(z.files)) if(/^ppt\/slides\/slide\d+\.xml$/.test(n)) out[n] = await z.file(n).async('string');
  return out;
};
const tplBuf = fs.readFileSync(tplPath);
const before = await slidesOf(tplBuf);
const nTaiwan = Object.values(before).filter(x=>x.includes('<a:t>GST TAIWAN</a:t>')).length;
ok(nTaiwan===3, '양식 세 장 모두에 GST TAIWAN 이 박혀 있어야 한다(전제) — 실제 '+nTaiwan+'장');

/* corp 를 주면 세 장 모두 바뀐다 */
const out1 = await asNode(()=>QBR.build(JSZip, tplBuf, {corp:'GST CHINA(WUHAN)'}));
const after1 = await slidesOf(out1);
const stillTaiwan = Object.entries(after1).filter(([,x])=>x.includes('<a:t>GST TAIWAN</a:t>')).map(([n])=>n);
ok(stillTaiwan.length===0, '법인을 바꿨는데 GST TAIWAN 이 남은 장이 있다: '+stillTaiwan.join(','));
const gotWuhan = Object.values(after1).filter(x=>x.includes('GST CHINA(WUHAN)')).length;
ok(gotWuhan===3, '세 장 모두 새 법인이 들어가야 한다 — 실제 '+gotWuhan+'장');

/* XML 이스케이프 — 법인명에 &·< 가 들어와도 파일이 깨지면 안 된다 */
const out2 = await asNode(()=>QBR.build(JSZip, tplBuf, {corp:'A&B <TEST>'}));
const after2 = await slidesOf(out2);
ok(Object.values(after2).every(x=>x.includes('A&amp;B &lt;TEST&gt;')), '법인명의 &·< 가 XML 로 이스케이프돼야 한다');
ok(Object.values(after2).every(x=>!x.includes('A&B <TEST>')), '이스케이프 안 된 원문이 남으면 안 된다(파일이 깨진다)');

/* corp 를 «안 주면» 양식 그대로 — 이 파일만 먼저 배포됐을 때 빈 상자가 되지 않게 */
const out3 = await asNode(()=>QBR.build(JSZip, tplBuf, {}));
const after3 = await slidesOf(out3);
ok(Object.values(after3).filter(x=>x.includes('<a:t>GST TAIWAN</a:t>')).length===3,
   'data.corp 가 없으면 양식 원문을 그대로 둬야 한다');

/* 호출부가 실제로 corp 를 넘기는지 — 넘기지 않으면 위 기능이 죽은 코드가 된다 */
const RPT = fs.readFileSync(ROOT+'/report/index.html','utf8');
ok(/data\.corp\s*=\s*corpLabel\(\)/.test(RPT), 'report 가 data.corp 를 넘겨야 한다(안 넘기면 양식은 영원히 TAIWAN)');
ok(/function corpLabel\(\)\{\s*return GST\.corpLabel\(F\);\s*\}/.test(RPT),
   'report 의 corpLabel 은 core 의 것을 그대로 써야 한다(두 벌이면 갈라진다 — 제2원칙)');

/* ── [2-2] 양식 표에 «대만 표본 숫자»가 남지 않는지 ──
   예전에는 양식 행 라벨(Micron F16·Tong luo·PSMC…)과 대시보드 행 라벨(법인/고객사)을
   대만 전용 정규식으로 맞췄다. 어느 모드에서도 안 맞아 **못 맞춘 행에 양식의 대만 표본
   숫자가 그대로 남았고**, 법인 상자에는 'SEC' 가 찍혔다 — 받아 본 사람은 삼성 실적이
   961대라고 읽는다. TOTAL 만 갱신되니 합계와 위 행의 합도 안 맞았다. */
console.log('[2-2] 국내 법인으로 뽑아도 양식의 대만 숫자가 남지 않는지');
{
  const KR = [
    ['SEC Scrubber','120','60','60','240','120','120','5','9','3','40','12'],
    ['SDC Scrubber','80','40','40','160','80','80','2','4','1','25','7'],
    ['TOTAL','200','100','100','400','200','200','7','13','4','65','19'],
  ];
  const notes=[];
  const out = await asNode(()=>QBR.build(JSZip, tplBuf, {corp:'SEC', opRows:KR, notes:notes}));
  const after = await slidesOf(out);
  const s2 = after['ppt/slides/slide2.xml']||'';
  const txt = [...s2.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m=>m[1]);
  ok(txt.includes('SEC Scrubber') && txt.includes('SDC Scrubber'),
     '대시보드 행 이름이 양식 표에 들어가야 한다 (실제 앞부분: '+txt.slice(0,14).join('|')+')');
  for(const stale of ['Micron F16','Tong luo','Winbond','961','1,878']){
    ok(!txt.includes(stale), '양식의 대만 표본 「'+stale+'」이 남으면 안 된다');
  }
  ok(txt.includes('200') && txt.includes('400'), 'TOTAL 행이 대시보드 합계로 바뀌어야 한다');
  ok(notes.length===0, '3행이면 양식 슬롯에 다 들어가므로 경고가 없어야 한다 (실제 '+JSON.stringify(notes)+')');

  const many=[]; for(let i=0;i<12;i++) many.push(['법인'+i,'1','1','1','1','1','1','1','1','1','1','1']);
  many.push(['TOTAL','12','12','12','12','12','12','12','12','12','12','12']);
  const n2=[]; await asNode(()=>QBR.build(JSZip, tplBuf, {opRows:many, notes:n2}));
  ok(n2.length===1 && /빠졌습니다/.test(n2[0]), '슬롯을 넘치면 몇 행이 빠졌는지 알려야 한다 (실제 '+JSON.stringify(n2)+')');
}

/* ── [2-3] 교육 표 머리글이 «잡힌 인원»을 따라가는지 ── */
console.log('[2-3] 교육 표 머리글이 국내에서 Lv.2/Lv.3 로 바뀌는지');
{
  const ed = { h:['Scrubber Lv.2','Scrubber Lv.3'],
               b:{no:3,ing:0,done:7,rate:'70%'}, v:{no:1,ing:0,done:9,rate:'90%'} };
  const out = await asNode(()=>QBR.build(JSZip, tplBuf, {eduTable:ed}));
  const s1 = (await slidesOf(out))['ppt/slides/slide1.xml']||'';
  const txt = [...s1.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m=>m[1]);
  ok(txt.includes('Scrubber Lv.2') && txt.includes('Scrubber Lv.3'),
     '머리글이 잡힌 인원을 따라가야 한다 (실제 후보: '+txt.filter(x=>/Lv|Basic|Veteran/.test(x)).join('|')+')');
  ok(!txt.some(x=>/^Basic/.test(x)), '「Basic」이 남으면 국내에 법인 과정이 있는 줄 안다');
  const out2 = await asNode(()=>QBR.build(JSZip, tplBuf, {eduTable:{b:ed.b,v:ed.v}}));
  const t2 = [...((await slidesOf(out2))['ppt/slides/slide1.xml']||'').matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m=>m[1]);
  ok(t2.some(x=>/Basic/.test(x)), '머리글을 안 주면 양식 원문을 그대로 둬야 한다');
}

/* ══════════════════════════════════════════════════════════════
   [3] pptAuto — 양식 얼굴 · 한 장에 최대 6개
   가짜 DOM·가짜 PptxGenJS 로 «무엇을 그렸는지» 그대로 받아 본다.
   ══════════════════════════════════════════════════════════════ */
console.log('[3] 공용 PPT 가 양식 얼굴로, 한 장에 6개씩 나오는지');

function mkEnv(nCharts, insights){
  const canvases = [];
  for(let i=0;i<nCharts;i++){
    const card = { querySelector:()=> ({ innerText:'차트 '+(i+1) }) };
    canvases.push({ id:'c'+i, clientWidth:400, clientHeight:300, closest:()=>card });
  }
  const chart = () => ({ options:{ devicePixelRatio:1, scales:{x:{},y:{}}, plugins:{legend:{}} },
                         resize(){}, render(){} });
  const charts = {}; canvases.forEach(c=>charts[c.id]=chart());
  global.window.CHARTS = charts;
  global.window.Chart = { getChart:cv=>charts[cv.id], defaults:{color:'#fff'} };
  global.Chart = global.window.Chart;          // 브라우저에서는 window.Chart 가 곧 전역 Chart 다
  global.document.getElementById = id => canvases.find(c=>c.id===id) || null;
  global.document.createElement = tag => tag==='canvas'
    ? { width:0, height:0, getContext:()=>({fillStyle:'',fillRect(){},drawImage(){}}), toDataURL:()=>'data:image/png;base64,AA' }
    : el();
  global.document.querySelector = sel => sel==='.header h1' ? {textContent:'설치 현황'} : null;
  global.document.querySelectorAll = sel => {
    if(/canvas/.test(sel)) return canvases;   // 선택자가 넓어져도(.card/.mcard) 같은 목록을 준다
    if(sel==='#gstInsights .gst-ins') return (insights||[]).map(t=>({innerText:t}));
    return [];
  };

  const slides = [];
  global.window.PptxGenJS = function(){
    this.ShapeType = {rect:'rect', line:'line'};
    this.addSlide = () => { const s={texts:[],shapes:[],images:[],background:null,
      addText:(t,o)=>s.texts.push({t,o}), addShape:(k,o)=>s.shapes.push({k,o}),
      addImage:o=>s.images.push(o)}; slides.push(s); return s; };
    this.writeFile = async()=>{};
  };
  global.PptxGenJS = global.window.PptxGenJS;   // 위와 같은 이유
  return slides;
}

// 7개 차트 → 2장 (6 + 1)
{
  const slides = mkEnv(7, []);
  F.op = 'GST TAIWAN SCRUBBER';
  await GST.pptAuto({asOf:'2026-08-18'});
  ok(slides.length===2, '차트 7개면 슬라이드 2장이어야 (실제 '+slides.length+')');
  const imgs = slides.map(s=>s.images.length);
  ok(imgs[0]===6 && imgs[1]===1, '한 장에 최대 6개여야 (실제 '+imgs.join('+')+')');
  ok(slides.every(s=>s.background && s.background.color==='FFFFFF'), '양식은 흰 바탕이어야 한다');
  const t0 = slides[0].texts.map(x=>String(x.t));
  ok(t0.some(x=>x==='GST TAIWAN'), '법인 상자가 운영단위를 따라야 한다 — 실제: '+t0.slice(0,3).join(' | '));
  ok(t0.some(x=>/설치 현황\s+\(1\/2\)/.test(x)), '여러 장이면 제목에 (1/2) 가 붙어야 한다');
  ok(t0.some(x=>/2026-08-18 기준/.test(x)), '기준일이 머리에 있어야 한다');
  ok(t0.some(x=>/운영단위 GST TAIWAN SCRUBBER/.test(x)), '어떤 필터로 뽑은 장표인지 머리에 남아야 한다');
  ok(t0.filter(x=>/^차트 \d+$/.test(x)).length===6, '칸 머리띠에 차트 제목이 들어가야 한다');
  ok(slides[0].shapes.some(s=>s.k==='line' && s.o.line && s.o.line.width===2.25), '머리 아래 굵은 검정 줄(양식 특징)');
  reset();
}

// 정확히 6개 → 1장, 빈 칸 없음
{
  const slides = mkEnv(6, []);
  await GST.pptAuto({asOf:'2026-08-18'});
  ok(slides.length===1, '차트 6개면 한 장 (실제 '+slides.length+')');
  ok(!slides[0].texts.some(x=>String(x.t)==='INSIGHT'), '빈 칸이 없으면 INSIGHT 칸도 없어야 한다');
  reset();
}

// 빈 칸이 남으면 인사이트를 거기 담는다 (버리지도, 새 장을 만들지도 않는다)
{
  const slides = mkEnv(4, ['재고 부족 3건','BM 급증 라인 F16']);
  await GST.pptAuto({asOf:'2026-08-18'});
  ok(slides.length===1, '차트 4개 + 인사이트는 한 장이어야 (실제 '+slides.length+')');
  const t = slides[0].texts.map(x=>String(x.t));
  ok(t.some(x=>x==='INSIGHT'), '남은 칸에 INSIGHT 머리띠가 있어야 한다');
  ok(t.some(x=>/재고 부족 3건/.test(x) && /BM 급증 라인 F16/.test(x)), '인사이트 문구가 담겨야 한다(버리지 않는다)');
  reset();
}

// 차트가 하나도 없으면 파일을 만들지 않는다
{
  const slides = mkEnv(0, []);
  let alerted=''; global.alert = m => { alerted=m; };
  await GST.pptAuto({asOf:'2026-08-18'});
  ok(slides.length===0 && /차트가 없/.test(alerted), '차트가 없으면 빈 파일 대신 안내여야 한다');
  reset();
}

/* 차트 색을 «흰 종이용»으로 바꿨다가 반드시 되돌리는지 —
   안 되돌리면 내보낸 뒤 화면 차트의 글자색이 검정으로 굳는다(어두운 테마에서 안 보인다). */
{
  mkEnv(1, []);
  const ch = global.window.CHARTS.c0;
  ch.options.scales.x.ticks = {color:'#E6EDF3'};
  ch.options.plugins.legend.labels = {color:'#E6EDF3'};
  await GST.pptAuto({asOf:'2026-08-18'});
  ok(ch.options.scales.x.ticks.color==='#E6EDF3', '캡처 뒤 축 글자색을 되돌려야 한다 (실제 '+ch.options.scales.x.ticks.color+')');
  ok(ch.options.plugins.legend.labels.color==='#E6EDF3', '캡처 뒤 범례 색을 되돌려야 한다');
  ok(ch.options.devicePixelRatio===1, '캡처 뒤 devicePixelRatio 를 되돌려야 한다');
  reset();
}

/* ── [3-2] 흰 종이에서 «글자가 사라지지» 않는지 ──
   막대 위 값·도넛 가운데 TOTAL 은 자체 플러그인이 캔버스에 직접 찍고, 색을 자기 옵션에
   들고 있다. 어두운 테마 기본값이 밝은 색이라 그대로 흰 종이에 찍으면 통째로 안 보인다 —
   렌더는 성공하므로 에러도 경고도 없고, 「숫자 없는 막대」를 받은 사람은 값을 못 읽는다. */
console.log('[3-2] 흰 종이용으로 바꿀 때 밝은 글자색이 따라오는지');
{
  /* ⚠ render 는 두 번 불린다 — 캡처용(어둡게 바꾼 뒤)과 되돌린 뒤. 마지막 것만 보면
     «안 바뀌었다»로 잘못 읽는다. 그래서 매 렌더의 색을 순서대로 기록해 [0]=캡처 시점을 본다. */
  const shots = [];
  mkEnv(1, []);
  const ch = global.window.CHARTS.c0;
  ch.options.plugins.valLabel = { mode:'peaks', color:'#E6EDF3' };   // 어두운 테마 기본
  ch.options.plugins.dCenter  = { on:true, color:'#E6EDF3', mut:'#8B98A9' };
  ch.options.plugins.pieText  = { mode:'pie' };                      // 색을 «안» 넘긴 경우
  ch.options.plugins.trendAnno= { anomaly:true, color:'#fb7185' };   // 의미 있는 색
  ch.render = function(){ const p=ch.options.plugins;
    shots.push({ val:p.valLabel.color, dc:p.dCenter.color, mut:p.dCenter.mut,
                 pie:p.pieText.color, anno:p.trendAnno.color }); };
  await GST.pptAuto({asOf:'2026-08-18'});
  const cap = shots[0] || {}, back = shots[shots.length-1] || {};
  ok(cap.val && !GST._tooLight(cap.val), '막대 값 라벨이 어두워져야 한다 (캡처 중 '+cap.val+')');
  ok(cap.dc && !GST._tooLight(cap.dc), '도넛 가운데 숫자가 어두워져야 한다 (캡처 중 '+cap.dc+')');
  ok(cap.pie && !GST._tooLight(cap.pie), '색을 «안 넘긴» 차트도 어두워져야 한다 (캡처 중 '+cap.pie+')');
  /* 의미 있는 색까지 뭉개면 안 된다 — 빨강 이상치 표식은 흰 종이에서도 잘 보인다. */
  ok(cap.anno==='#fb7185', '흰 종이에서도 보이는 «의미 있는 색»은 건드리면 안 된다 (실제 '+cap.anno+')');
  ok(cap.mut==='#8B98A9', '읽히는 회색 보조글자는 그대로 둔다 (실제 '+cap.mut+')');
  ok(back.val==='#E6EDF3', '캡처가 끝나면 화면 색을 되돌려야 한다 (실제 '+back.val+')');
  ok(ch.options.plugins.valLabel.color==='#E6EDF3', '끝난 뒤 옵션이 원래대로여야 한다');
  ok(!('color' in ch.options.plugins.pieText), '안 넘겼던 키는 다시 없는 상태로 돌아가야 한다');
  reset();
}

/* ── [3-3] «눌러도 아무 반응이 없다»가 안 나오는지 ──
   실제로 그 증상으로 돌아왔다. 원인이 둘이었고 둘 다 조용하다:
   ① CDN 로드에 시간 제한이 없어, 사내망이 «거부»가 아니라 «묵살»하면 await 가 영영 멈춘다.
   ② 버튼은 셸에 있고 클릭만 iframe 으로 오므로, 몇 초 동안 아무 표시가 없다. */
console.log('[3-3] 라이브러리를 못 받아도 «멈춰 있지» 않는지');
{
  mkEnv(1, []);
  delete global.window.PptxGenJS; delete global.PptxGenJS; GST._pptP = null;
  GST.PPT_CDN_MS = 120;                      // 검사에서는 짧게
  /* 스크립트 태그가 «영영 응답하지 않는» 상황을 만든다 — onload/onerror 둘 다 안 온다. */
  const prevCreate = global.document.createElement;
  global.document.createElement = tag => tag==='script'
    ? { set src(v){}, get src(){return '';}, onload:null, onerror:null }
    : prevCreate(tag);
  global.document.head = { appendChild(){}, };
  let said='';
  global.window.capToast = m => { said = m; };
  let busy=[];
  GST._barBusy = (k,on)=>busy.push(on);
  /* ⚠ 그냥 await 하면 «시간 제한이 없을 때» 검사 자체가 멈춰 버려 실패로 안 잡힌다.
     경주(race)를 붙여 «끝났는가»를 값으로 확인한다 — 멈춤도 실패로 드러난다. */
  let finished = false;
  const t0 = Date.now();
  await Promise.race([
    GST.pptAuto({asOf:'2026-08-18'}).then(()=>{ finished = true; }),
    new Promise(r => setTimeout(r, 3000))
  ]);
  const ms = Date.now() - t0;
  global.document.createElement = prevCreate;
  ok(finished, '응답 없는 CDN 에서 «영영 대기»하면 안 된다 — 3초 안에 끝나야 한다 (실제 '+ms+'ms)');
  ok(/15초|cdn\.jsdelivr\.net|막고/.test(said), '무엇이 막혔고 무엇을 하면 되는지 알려야 한다 (실제: '+said.slice(0,60)+'…)');
  ok(/복사/.test(said), '대안(차트별 복사)을 알려야 한다 — 막다른 길로 두지 않는다');
  GST.PPT_CDN_MS = 15000; GST._pptP = null; delete global.window.capToast;
  reset();
}

/* 버튼 잠금 — 페이지가 셸에 알려야 한다(버튼이 iframe 밖에 있다) */
console.log('[3-4] 만드는 동안 버튼이 잠기는지');
{
  const slides = mkEnv(2, []);
  const seq=[]; GST._barBusy = (k,on)=>seq.push(k+':'+on);
  /* _barDo 는 GST._bar(등록된 spec)에서 on 을 꺼낸다 — pageBar 를 흉내내 등록해 둔다. */
  let ran=0;
  GST._bar = { caps:{ppt:'auto'}, on:{ ppt: ()=>{ ran++; return Promise.resolve(); } }, state:()=>({}) };
  await new Promise(r=>{ GST._barDo('ppt', null); setTimeout(r, 30); });
  ok(ran===1, '페이지의 ppt 핸들러가 한 번 불려야 한다 (실제 '+ran+')');
  ok(seq[0]==='ppt:true' && seq[seq.length-1]==='ppt:false',
     '시작에 잠그고 끝나면 풀어야 한다 (실제 '+seq.join(' → ')+')');
  reset();
}

/* ══════════════════════════════════════════════════════════════
   [4] 규율 — 페이지가 자기 PPT 를 새로 만들지 않는지
   ══════════════════════════════════════════════════════════════ */
console.log('[4] 여섯 페이지가 공용 한 벌을 그대로 쓰는지');
const SHARED = ['scrubber','pm','fault','material','cip','tco'];
for(const pg of SHARED){
  const src = fs.readFileSync(ROOT+'/'+pg+'/index.html','utf8');
  const bar = (src.match(/GST\.pageBar\(\{[\s\S]*?\n\}\);/)||[''])[0];
  ok(/ppt:\s*'auto'/.test(bar), pg+': caps.ppt 가 auto 여야 공용 양식을 쓴다');
  ok(!/ppt:\s*\(\)\s*=>/.test(bar), pg+': 자기 PPT 핸들러를 만들면 장표 얼굴이 또 갈라진다(제2원칙)');
  ok(!/new PptxGenJS\(/.test(src), pg+': 페이지가 직접 PPT 를 조립하고 있다 — 공용 pptAuto 로 모아야 한다');
}
const CORE = fs.readFileSync(ROOT+'/assets/core.js','utf8');
ok(/GST\.PPT_MAX_PER_SLIDE\s*=\s*6/.test(CORE), '한 장 최대 개수가 상수로 있어야 한다(숫자를 코드에 흩지 않는다)');
/* `.cw canvas` 만 보면 추이(.trend-wrap)·크로스(.cross-wrap) 카드의 차트가 통째로 빠진다
   (실측: 설치현황 14개 중 5개 · 고장분석 32개 중 7개). 가짜 DOM 으로는 못 잡히므로 소스로 본다. */
ok(/querySelectorAll\('\.card canvas, \.mcard canvas'\)/.test(CORE),
   '카드 «안의 모든» 캔버스를 봐야 한다 — .cw 만 보면 추이·크로스 차트가 빠진다');
ok(/GST\.PPT_CDN_MS/.test(CORE) && /setTimeout\(function\(\)\{ fin\(false, new Error\('TIMEOUT'\)\); \}/.test(CORE),
   'CDN 로드에 시간 제한이 있어야 한다 — 없으면 「눌러도 반응 없음」이 된다');
ok(/GST\.corpLabel\s*=\s*function/.test(CORE), 'corpLabel 정본이 core.js 에 있어야 한다');
/* 음성 대조: 다른 페이지에 corpLabel 이 «다시» 정의되면 두 벌이 된다 */
for(const pg of SHARED.concat(['hr'])){
  const src = fs.readFileSync(ROOT+'/'+pg+'/index.html','utf8');
  ok(!/function corpLabel\(\)\s*\{[^}]*REGION_KR/.test(src), pg+': corpLabel 을 다시 구현했다(제2원칙)');
}

/* ══════════════════════════════════════════════════════════════
   [5] 셸 툴바의 업로드 버튼
   업로드는 탭이 아니다(관리용 화면을 매일 보는 탭 줄에 섞지 않는다). 그래서 링크가
   어디에도 없으면 사람이 못 찾는다 — 툴바에 «있는지»를 여기서 못 박는다.
   ══════════════════════════════════════════════════════════════ */
console.log('[5] 셸 툴바에 업로드 버튼이 있는지');
const SHELL = fs.readFileSync(ROOT+'/index.html','utf8');
const bar = (SHELL.match(/<div class="topbar-right">[\s\S]*?<\/div>/)||[''])[0];
ok(/id="uploadBtn"/.test(bar), '툴바에 업로드 버튼이 있어야 한다');
ok(bar.indexOf('id="refreshBtn"') < bar.indexOf('id="uploadBtn"')
   && bar.indexOf('id="uploadBtn"') < bar.indexOf('id="shareBtn"'),
   '업로드 버튼은 새로고침 «바로 옆»이어야 한다');
ok(/function openUpload\(\)\s*\{[^}]*window\.open\('\/upload\/'/.test(SHELL),
   'openUpload 가 /upload/ 를 새 창으로 열어야 한다');
/* iframe 에 띄우면 탭 줄에서 아무 탭도 활성이 아니게 되고, 업로드 중에 탭을 누르면
   진행 중이던 적재 화면이 날아간다. 그래서 «새 창»이 규약이다. */
ok(!/openUpload[\s\S]{0,120}frames\[|openUpload[\s\S]{0,120}iframe/.test(SHELL),
   '업로드를 탭 iframe 에 띄우면 안 된다(적재 도중 화면이 날아간다)');
for(const [lang,word] of [['ko','업로드'],['en','Upload'],['zh','上传'],['ja','アップロード']]){
  ok(new RegExp("\\b"+lang+":\\{[^}]*upload:'"+word+"'").test(SHELL), '셸 i18n '+lang+' 에 업로드 문구가 있어야 한다');
}
ok(/getElementById\('uploadLabel'\)\.textContent=lt\('upload'\)/.test(SHELL),
   '언어를 바꾸면 업로드 라벨도 따라가야 한다(applyLang 에 배선)');

console.log('\n'+(fail? '❌ 실패 '+fail+' / ':'✅ ')+'통과 '+pass+'/'+(pass+fail));
process.exit(fail?1:0);
