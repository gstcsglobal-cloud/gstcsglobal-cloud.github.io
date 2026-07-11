/* ============================================================
   GST Dashboard Core Engine v1.0
   모든 대시보드가 공유하는 로직 계층.
   여기를 고치면 전체 대시보드에 적용됩니다.
   구성: 날짜 · CSV · 집계 · 차트 팩토리 · 필터 · 셸 동기화
   ============================================================ */
(function(global){
'use strict';
const GST = {};

/* ---------- 1. 날짜 유틸 ---------- */
// 구글시트의 다양한 날짜 표현(시리얼 숫자, YYYY-MM-DD, Date 문자열)을 UTC Date로 통일
GST.toDate = function(v){
  if(!v || v==='') return null;
  const n = Number(v);
  if(!isNaN(n) && n>20000 && n<80000) return new Date(Date.UTC(1899,11,30) + n*86400000);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(m) return new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
};
GST.fmtDate = function(d){ return d ? d.toISOString().slice(0,10) : '—'; };
GST.fmtD    = function(d){ return d ? d.toISOString().slice(0,10) : ''; };

/* ---------- 2. CSV 로드 ---------- */
// PapaParse 필요. 캐시 무효화 포함. 반환: 헤더 포함 2차원 배열
GST.fetchCSV = async function(url){
  const res = await fetch(url + (url.includes('?')?'&':'?') + 't=' + Date.now());
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  return Papa.parse(text, {skipEmptyLines:true}).data;
};

/* ---------- 3. 값 접근 / 집계 ---------- */
GST.cv = function(r, C, k){
  const v = r[C[k]];
  return (v!==undefined && v!==null && v!=='') ? String(v).trim() : '';
};
GST.uniq = function(arr, key){
  return Array.from(new Set(arr.map(x=>x[key]).filter(Boolean))).sort();
};
GST.countBy = function(arr, key, top){
  const m={};
  arr.forEach(x=>{ const k=x[key]; if(k && k!=='N/A') m[k]=(m[k]||0)+1; });
  let e=Object.entries(m).sort((a,b)=>b[1]-a[1]);
  return top ? e.slice(0,top) : e;
};
GST.sumBy = function(arr, key, valKey, top){
  const m={};
  arr.forEach(x=>{ const k=x[key]; if(k && k!=='N/A') m[k]=(m[k]||0)+(x[valKey]||1); });
  let e=Object.entries(m).sort((a,b)=>b[1]-a[1]);
  return top ? e.slice(0,top) : e;
};

/* ---------- 4. 숫자 카운트업 애니메이션 ---------- */
GST.animVal = function(el, target, suffix){
  if(!el) return;
  const start = parseFloat(el.dataset.v||0);
  const t0 = performance.now();
  function step(t){
    const p = Math.min((t-t0)/500, 1);
    const cur = start + (target-start)*(1-Math.pow(1-p,3));
    el.textContent = Math.round(cur).toLocaleString() + (suffix||'');
    if(p<1) requestAnimationFrame(step); else el.dataset.v = target;
  }
  requestAnimationFrame(step);
};

/* ---------- 5. 슬라이서 헬퍼 ---------- */
GST.fillSelect = function(id, fkey, vals, F, allLabel){
  const s = document.getElementById(id);
  if(!s) return;
  const cur = F[fkey];
  s.innerHTML = '';
  const o0 = document.createElement('option');
  o0.value=''; o0.textContent = allLabel || '전체';
  s.appendChild(o0);
  vals.forEach(v=>{
    const o=document.createElement('option'); o.value=v; o.textContent=v; s.appendChild(o);
  });
  s.value = vals.includes(cur) ? cur : '';
  if(!vals.includes(cur)) F[fkey]='';
};

/* ---------- 6. 차트 팩토리 (Chart.js) ---------- */
// 막대 차트 + 선택적 파레토(누적%) 라인
// o = {labels, data, color, horizontal, pareto, txt, grid, onClick(label)}
GST.bar = function(store, id, o){
  const ctx = document.getElementById(id);
  if(!ctx) return;
  const txt = o.txt || '#94a3b8';
  const grid = o.grid || 'rgba(255,255,255,.05)';
  const total = o.data.reduce((a,b)=>a+b,0) || 1;
  const datasets = [{type:'bar', label:'건수', data:o.data, backgroundColor:o.color,
    borderRadius:5, order:2}];
  if(o.pareto){
    let cum=0;
    const cumPct = o.data.map(v=>{ cum+=v; return Math.round(cum/total*1000)/10; });
    const line = {type:'line', label:'누적%', data:cumPct, borderColor:'#fbbf24',
      backgroundColor:'#fbbf24', borderWidth:2, pointRadius:2.5,
      pointBackgroundColor:'#fbbf24', tension:.3, order:1};
    if(o.horizontal) line.xAxisID='xPct'; else line.yAxisID='yPct';
    datasets.push(line);
  }
  const scales = {
    x:{ticks:{color:txt,font:{size:10}},grid:{display:false}},
    y:{ticks:{color:txt,font:{size:10},precision:0},grid:{color:grid}}
  };
  if(o.pareto){
    const pctAxis = {min:0,max:100,ticks:{color:'#fbbf24',font:{size:9},callback:v=>v+'%'},grid:{display:false}};
    if(o.horizontal){ scales.xPct = Object.assign({position:'top'},pctAxis); }
    else{ scales.yPct = Object.assign({position:'right'},pctAxis); }
  }
  const cfg = {data:{labels:o.labels, datasets},
    options:{
      indexAxis:o.horizontal?'y':'x', responsive:true, maintainAspectRatio:false,
      onClick:(e,els,chart)=>{ if(els.length && o.onClick) o.onClick(chart.data.labels[els[0].index]); },
      plugins:{legend:{display:!!o.pareto, labels:{color:txt,font:{size:9},usePointStyle:true,pointStyle:'circle',boxWidth:6}}},
      scales
    }};
  if(store[id]) store[id].destroy();
  store[id] = new Chart(ctx, cfg);
};

// 도넛 차트  o = {labels, data, colors, txt, cutout, onClick(label)}
GST.donut = function(store, id, o){
  const ctx = document.getElementById(id);
  if(!ctx) return;
  const txt = o.txt || '#94a3b8';
  const cfg = {type:'doughnut',
    data:{labels:o.labels, datasets:[{data:o.data, backgroundColor:o.colors,
      borderWidth:0, hoverOffset:8}]},
    options:{
      responsive:true, maintainAspectRatio:false, cutout:o.cutout||'58%',
      onClick:(e,els,chart)=>{ if(els.length && o.onClick) o.onClick(chart.data.labels[els[0].index]); },
      plugins:{legend:{position:'right', labels:{color:txt,font:{size:10},padding:8,usePointStyle:true,pointStyle:'circle'}}},
      animation:{animateScale:true}
    }};
  if(store[id]) store[id].destroy();
  store[id] = new Chart(ctx, cfg);
};

/* ---------- 7. 활성 필터 칩 렌더 ---------- */
GST.renderChips = function(F, LABELS, onClearName){
  const box=document.getElementById('fchips'), list=document.getElementById('fchipList');
  if(!box || !list) return;
  const active = Object.entries(F).filter(([k,v])=>v);
  if(!active.length){ box.style.display='none'; return; }
  box.style.display='flex';
  list.innerHTML = active.map(([k,v])=>
    `<span class="fchip" onclick="${onClearName}('${k}')">${LABELS[k]||k}: <b>${v}</b> <span class="fx">✕</span></span>`
  ).join('');
};

/* ---------- 8. 통합 셸 동기화 ---------- */
// iframe 안: 개별 버튼 숨김 + 저장된 테마/언어 적용 + 셸 신호 수신
// 직접 접속: opts.loginRedirect=true면 미인증 시 셸로 이동
GST.initSync = function(opts){
  opts = opts || {};
  const inFrame = (window.self !== window.top);
  if(inFrame){
    const st=document.createElement('style');
    st.textContent='.header-right{display:none !important}';
    document.head.appendChild(st);
  }
  function applyStored(){
    let th=null, lg=null;
    try{ th=sessionStorage.getItem('gst_theme'); lg=sessionStorage.getItem('gst_lang'); }catch(e){}
    th = th || 'slate'; // 저장된 테마가 없으면 새 기본 디자인(Slate)
    document.body.className = th==='default' ? '' : 'theme-'+th;
    if(typeof global.changeDashboardTheme==='function'){
      try{ global.changeDashboardTheme(th, th); }catch(e){}
    }
    if(lg && typeof global.setLang==='function'){ try{ global.setLang(lg); }catch(e){} }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', applyStored);
  else applyStored();
  if(inFrame) setTimeout(applyStored, 1500);
  window.addEventListener('message', e=>{
    const d=e.data||{};
    if(d.type==='gst-theme'){
      document.body.className = d.theme==='default' ? '' : 'theme-'+d.theme;
      if(typeof global.changeDashboardTheme==='function'){
        try{ global.changeDashboardTheme(d.theme==='default'?'default':d.theme, d.theme); }catch(e){}
      }
    }
    if(d.type==='gst-lang' && typeof global.setLang==='function'){
      try{ global.setLang(d.lang); }catch(e){}
    }
  });
  if(!inFrame && opts.loginRedirect){
    let ok=false;
    try{ ok = sessionStorage.getItem('gst_auth')==='1'; }catch(e){}
    if(!ok) location.href='https://gstcsglobal-cloud.github.io/';
  }
};

// 셸에 탭 전환 요청 (홈 카드 등에서 사용)
GST.goTab = function(id){
  if(window.self !== window.top){
    window.parent.postMessage({type:'gst-goto', tab:id}, '*');
  }else{
    location.href='https://gstcsglobal-cloud.github.io/' + id + '/';
  }
};


/* ---------- 9. 데이터 신뢰성 (Stage 2) ---------- */
// 스키마 검증: 기대 {열인덱스:'헤더명'} 대비 실제 헤더 비교 → 불일치 목록 반환
GST.validateSchema = function(header, expect){
  const issues=[];
  Object.entries(expect).forEach(([idx,name])=>{
    const actual=(header[idx]||'').toString().trim();
    if(!actual.includes(name)) issues.push((Number(idx)+1)+'열: 기대 "'+name+'" ↔ 실제 "'+(actual||'(빈값)')+'"');
  });
  return issues;
};
// 구조 변경 경고 배너 (틀린 숫자를 조용히 보여주는 것 방지)
GST.schemaBanner = function(issues, sheetName){
  let el=document.getElementById('gstSchemaWarn');
  if(!issues.length){ if(el)el.remove(); return; }
  const msg='⚠️ '+(sheetName||'시트')+' 구조 변경 감지 — 아래 숫자가 틀릴 수 있습니다. 시트 열 순서를 확인하세요. ('+issues.slice(0,3).join(' · ')+(issues.length>3?' 외 '+(issues.length-3)+'건':'')+')';
  if(!el){
    el=document.createElement('div'); el.id='gstSchemaWarn';
    el.style.cssText='background:#7f1d1d;color:#fff;padding:11px 16px;border-radius:10px;margin:0 0 14px;font-size:12px;font-weight:600;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    const anchor=document.querySelector('.status')||document.body.firstElementChild;
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
  }
  el.textContent=msg;
};
// 오프라인 캐시: 마지막 정상 데이터를 localStorage에 보관
GST.cacheSave=function(key,rows){
  try{ localStorage.setItem('gstc_'+key, JSON.stringify({t:Date.now(),rows})); }catch(e){}
};
GST.cacheLoad=function(key){
  try{ return JSON.parse(localStorage.getItem('gstc_'+key)||'null'); }catch(e){ return null; }
};
// 캐시 폴백 로드: 성공 시 저장, 실패 시 캐시로 대체 (cached/ageMin 플래그 반환)
GST.fetchCSVCached = async function(url, key){
  try{
    const rows = await GST.fetchCSV(url);
    if(rows && rows.length>1) GST.cacheSave(key, rows);
    return {rows, cached:false, ageMin:0};
  }catch(e){
    const c = GST.cacheLoad(key);
    if(c && c.rows) return {rows:c.rows, cached:true, ageMin:Math.round((Date.now()-c.t)/60000)};
    throw e;
  }
};

/* ---------- 10. 스켈레톤 로딩 (Stage 3) ---------- */
GST.skeleton=function(on){
  document.querySelectorAll('.kpi,.card,.mcard,.tablecard,.alert').forEach(el=>el.classList.toggle('skeleton',!!on));
};

/* ---------- 11. 필터 상태 URL 공유 (Stage 4) ---------- */
GST.encodeState=function(F){
  const a={}; Object.entries(F).forEach(([k,v])=>{ if(v!==''&&v!=null&&v!=='ALL') a[k]=v; });
  if(!Object.keys(a).length) return '';
  return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(a)))));
};
GST.decodeState=function(s){
  try{ return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(s))))); }catch(e){ return null; }
};
// 필터 변경 시 호출: iframe이면 셸 URL 갱신 요청, 직접 접속이면 자기 주소 갱신
GST.pushState=function(F){
  const s=GST.encodeState(F);
  if(window.self!==window.top){ window.parent.postMessage({type:'gst-state',state:s},'*'); }
  else{
    try{ const u=new URL(location); if(s)u.searchParams.set('f',s); else u.searchParams.delete('f');
      history.replaceState(null,'',u); }catch(e){}
  }
};
// 시작 시 URL(?f=...)에서 필터 복원
GST.readState=function(){
  const s=new URLSearchParams(location.search).get('f');
  return s ? GST.decodeState(s) : null;
};

/* ---------- 12. 인증 (SHA-256, 평문 비밀번호 제거) ---------- */
GST.PW_HASH='1bd5c3fd55d0fc00720d7b6d891f7f7e722f43ba9db6dd35fd88aa1c02c00b1b';
GST.sha256=async function(str){
  const b=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
};
GST.checkPw=async function(v){ return (await GST.sha256(v))===GST.PW_HASH; };

/* ---------- 13. 인사이트 엔진 (최종) ---------- */
// 증감률 (%). prev가 0/없음이면 null
GST.pctDelta=function(cur,prev){
  if(prev==null||prev===0||!isFinite(prev)) return null;
  return Math.round((cur-prev)/prev*100);
};
// ▲/▼ 증감 배지 HTML. goodWhenDown=true면 감소가 초록(고장·교체 등)
GST.deltaBadge=function(cur,prev,goodWhenDown){
  const p=GST.pctDelta(cur,prev);
  if(p===null) return '';
  if(p===0) return '<span style="font-size:10px;font-weight:800;color:var(--txt-muted)">— 0%</span>';
  const up=p>0;
  const good = goodWhenDown ? !up : up;
  const color = good ? 'var(--ok,#4ade80)' : 'var(--bad,#fb7185)';
  return '<span style="font-size:10px;font-weight:800;color:'+color+'">'+(up?'▲':'▼')+' '+Math.abs(p)+'%</span>';
};
// 이상 탐지: 평균+k·표준편차 초과 항목 (entries=[[라벨,건수],...])
GST.outliers=function(entries,k){
  k=k||3;
  const vals=entries.map(e=>e[1]);
  if(vals.length<4) return new Set();
  const sorted=[...vals].sort((a,b)=>a-b);
  const med=sorted[Math.floor(sorted.length/2)];
  const devs=vals.map(v=>Math.abs(v-med)).sort((a,b)=>a-b);
  const mad=Math.max(devs[Math.floor(devs.length/2)], 0.5);
  const th=med + k*1.4826*mad;
  return new Set(entries.filter(e=>e[1]>th).map(e=>e[0]));
};
// 특정 연/월 건수 (dateKey는 Date 필드명)
GST.monthCount=function(arr,dateKey,y,m){
  return arr.filter(x=>{const d=x[dateKey];return d&&d.getUTCFullYear()===y&&d.getUTCMonth()===m;}).length;
};

/* ---------- 14. 필터 사이드바 ---------- */
// 페이지의 기존 필터 UI(기간 패널·슬라이서 등)를 왼쪽 사이드바 서랍으로 이동합니다.
// DOM 노드를 "이동"만 하므로 ID와 이벤트 핸들러가 그대로 유지되어 페이지 로직 수정이 필요 없습니다.
// opts = {
//   title:    사이드바 제목 (기본 '필터 · Filters')
//   sections: ['.selector', ...] 또는 [{selector:'.selector', label:'섹션 라벨'}, ...]
//   onReset:  '초기화' 버튼 클릭 시 실행할 콜백 (생략 시 버튼 없음)
// }
GST.initSidebar = function(opts){
  opts = opts || {};
  if(document.getElementById('gstSidebar')) return;

  // 서랍 본체
  const sb = document.createElement('aside');
  sb.id='gstSidebar'; sb.className='gst-sidebar'; sb.setAttribute('aria-label','filter sidebar');
  const head = document.createElement('div'); head.className='gst-sb-head';
  const title = document.createElement('span'); title.className='gst-sb-title';
  title.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></svg> ' + (opts.title || '필터 · Filters');
  const closeBtn = document.createElement('button');
  closeBtn.className='gst-sb-close'; closeBtn.type='button'; closeBtn.textContent='✕';
  closeBtn.setAttribute('aria-label','close sidebar');
  head.appendChild(title); head.appendChild(closeBtn);
  const body = document.createElement('div'); body.className='gst-sb-body';
  sb.appendChild(head); sb.appendChild(body);

  // 기존 필터 블록을 사이드바로 이동 (핸들러 유지)
  (opts.sections||[]).forEach(s=>{
    const sel = (typeof s==='string') ? s : s.selector;
    document.querySelectorAll(sel).forEach(el=>{
      const sec=document.createElement('div'); sec.className='gst-sb-sec';
      if(typeof s!=='string' && s.label){
        const h=document.createElement('div'); h.className='gst-sb-lbl'; h.textContent=s.label;
        sec.appendChild(h);
      }
      sec.appendChild(el); body.appendChild(sec);
    });
  });

  // 기간 프리셋 주입: 사이드바 안에 #dtFrom/#dtTo가 있고 자체 프리셋(.pchip)이 없는 페이지
  // (고장·자재) 에 빠른선택 칩을 추가한다. 값 설정 후 change 이벤트를 쏘면 페이지의
  // onSlicer()가 그대로 반응하므로 페이지 수정이 필요 없다.
  (function(){
    const df=body.querySelector('#dtFrom'), dt=body.querySelector('#dtTo');
    if(!df || !dt || body.querySelector('.pchip')) return;
    const row=document.createElement('div'); row.className='gst-preset-row';
    [['1m','1개월'],['3m','3개월'],['6m','6개월'],['1y','1년'],['all','전체']].forEach(function(p){
      const b=document.createElement('button'); b.type='button'; b.className='gst-preset'; b.textContent=p[1];
      b.onclick=function(){
        const now=new Date(); let from=null;
        if(p[0]!=='all'){
          from=new Date();
          if(p[0]==='1m')from.setMonth(now.getMonth()-1);
          else if(p[0]==='3m')from.setMonth(now.getMonth()-3);
          else if(p[0]==='6m')from.setMonth(now.getMonth()-6);
          else if(p[0]==='1y')from.setFullYear(now.getFullYear()-1);
        }
        df.value = from ? from.toISOString().slice(0,10) : '';
        dt.value = from ? now.toISOString().slice(0,10) : '';
        [df,dt].forEach(function(el){
          el.dispatchEvent(new Event('input',{bubbles:true}));
          el.dispatchEvent(new Event('change',{bubbles:true}));
          if(typeof el.onchange==='function'){ try{ el.onchange(); }catch(e){} }
        });
        row.querySelectorAll('.gst-preset').forEach(function(x){ x.classList.toggle('active',x===b); });
      };
      row.appendChild(b);
    });
    const host=df.closest('.slicer');
    if(host && host.parentElement) host.parentElement.insertBefore(row, host.nextSibling);
    else body.appendChild(row);
  })();

  // 푸터: 초기화 · CSV 내보내기 · 자동 새로고침 토글
  const foot=document.createElement('div'); foot.className='gst-sb-foot';
  if(typeof opts.onReset==='function'){
    const rb=document.createElement('button'); rb.className='gst-sb-reset'; rb.type='button';
    rb.textContent='↺ 초기화 · Reset all';
    rb.onclick=function(){ try{ opts.onReset(); }catch(e){} };
    foot.appendChild(rb);
  }
  const tools=document.createElement('div'); tools.className='gst-sb-tools';
  if(document.querySelector('.tablecard table, table')){
    const cb=document.createElement('button'); cb.className='gst-sb-tool'; cb.type='button';
    cb.innerHTML='⬇ CSV';
    cb.title='현재 필터가 적용된 테이블을 CSV로 다운로드';
    cb.onclick=function(){ GST.exportTableCSV(); };
    tools.appendChild(cb);
  }
  if(typeof window.loadData==='function' || typeof window.loadAll==='function'){
    const ab=document.createElement('button'); ab.className='gst-sb-tool'; ab.type='button';
    ab.title='10분마다 데이터만 다시 불러옵니다. 필터는 유지됩니다.';
    function arOn(){ try{ return localStorage.getItem('gst_auto_refresh')!=='0'; }catch(e){ return true; } }
    function syncAr(){ ab.textContent='⟳ 자동 10분 · '+(arOn()?'ON':'OFF'); ab.classList.toggle('on',arOn()); }
    ab.onclick=function(){ try{ localStorage.setItem('gst_auto_refresh', arOn()?'0':'1'); }catch(e){} syncAr(); };
    syncAr();
    tools.appendChild(ab);
  }
  if(tools.children.length) foot.appendChild(tools);
  if(foot.children.length) sb.appendChild(foot);

  // 모바일 오버레이 배경 + 토글 핸들
  const bd=document.createElement('div'); bd.className='gst-backdrop';
  const tg=document.createElement('button'); tg.className='gst-sb-toggle'; tg.type='button';
  tg.title='필터 · Filters'; tg.setAttribute('aria-label','toggle filter sidebar');
  tg.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></svg><span class="gst-sb-tglbl">FILTER</span>';
  document.body.appendChild(sb);
  document.body.appendChild(bd);
  document.body.appendChild(tg);

  function isMobile(){ return window.matchMedia('(max-width:900px)').matches; }
  let isOpen=false;
  function setOpen(o,save){
    isOpen=!!o;
    document.body.classList.toggle('gst-sb-open', isOpen);
    if(save!==false){ try{ localStorage.setItem('gst_sb_open', o?'1':'0'); }catch(e){} }
    // 레이아웃 변경 후 Chart.js 등 리사이즈 유도
    setTimeout(function(){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} }, 320);
  }
  let open;
  try{ const s=localStorage.getItem('gst_sb_open'); open = (s==null) ? true : s==='1'; }catch(e){ open=true; }
  if(isMobile()) open=false; // 모바일은 항상 닫힌 채로 시작
  setOpen(open,false);
  // 테마 변경 등에서 body.className을 통째로 바꾸는 코드가 열림 상태 클래스를
  // 지워버릴 수 있으므로, 지워지면 다시 붙인다.
  try{
    new MutationObserver(function(){
      if(isOpen && !document.body.classList.contains('gst-sb-open'))
        document.body.classList.add('gst-sb-open');
    }).observe(document.body,{attributes:true,attributeFilter:['class']});
  }catch(e){}

  tg.onclick=function(){ setOpen(!document.body.classList.contains('gst-sb-open')); };
  closeBtn.onclick=function(){ setOpen(false); };
  bd.onclick=function(){ setOpen(false); };
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && isMobile()) setOpen(false);
  });
};

/* ---------- 15. CSV 내보내기 ---------- */
// 화면에 렌더된 메인 테이블(=현재 필터가 적용된 상태)을 CSV로 저장.
// BOM(﻿)을 붙여 엑셀에서 한글이 깨지지 않게 한다.
GST.exportTableCSV = function(){
  const tbl=document.querySelector('.tablecard table')||document.querySelector('table');
  if(!tbl) return;
  const rows=[].slice.call(tbl.querySelectorAll('tr')).map(function(tr){
    return [].slice.call(tr.querySelectorAll('th,td')).map(function(c){
      const v=(c.innerText||'').replace(/\s+/g,' ').trim();
      return '"'+v.replace(/"/g,'""')+'"';
    }).join(',');
  });
  const blob=new Blob(['﻿'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(document.title||'export').replace(/[\\/:*?"<>|\s]+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); },2000);
};

/* ---------- 16. 자동 새로고침 (필터 보존) ---------- */
// 10분마다 페이지의 loadData()/loadAll()로 데이터만 다시 불러온다.
// 페이지의 로드 함수가 필터를 리셋하는 경우가 있으므로(설치·인원),
// 갱신 전에 사이드바의 필터 상태를 스냅샷으로 저장했다가 갱신 후 복원한다.
// 복원은 실제 컨트롤 값을 되돌리고 이벤트를 발생시키는 방식이라 페이지 로직이 그대로 반응한다.
GST._snapFilters = function(){
  const sb=document.getElementById('gstSidebar');
  if(!sb) return null;
  const snap={sel:{},inp:{},chips:[],pchips:[]};
  sb.querySelectorAll('select').forEach(function(s){ if(s.id) snap.sel[s.id]=s.value; });
  sb.querySelectorAll('input').forEach(function(i){ if(i.id) snap.inp[i.id]=i.value; });
  sb.querySelectorAll('.chips').forEach(function(box){
    snap.chips.push([].slice.call(box.children)
      .filter(function(c){ return c.classList.contains('active'); })
      .map(function(c){ return c.textContent; }));
  });
  sb.querySelectorAll('.pchip.active').forEach(function(c){
    if(c.dataset.g) snap.pchips.push('g:'+c.dataset.g);
    else if(c.dataset.q) snap.pchips.push('q:'+c.dataset.q);
  });
  return snap;
};
GST._restoreFilters = function(snap){
  if(!snap) return;
  const sb=document.getElementById('gstSidebar');
  if(!sb) return;
  function fire(el){
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    if(typeof el.onchange==='function'){ try{ el.onchange(); }catch(e){} }
  }
  Object.keys(snap.sel).forEach(function(id){
    const el=document.getElementById(id);
    if(el && el.value!==snap.sel[id]){ el.value=snap.sel[id]; fire(el); }
  });
  Object.keys(snap.inp).forEach(function(id){
    const el=document.getElementById(id);
    if(el && el.value!==snap.inp[id]){ el.value=snap.inp[id]; fire(el); }
  });
  sb.querySelectorAll('.chips').forEach(function(box,i){
    const want=snap.chips[i]||[];
    [].slice.call(box.children).forEach(function(c){
      if(want.indexOf(c.textContent)>-1 && !c.classList.contains('active')) c.click();
    });
  });
  snap.pchips.forEach(function(k){
    const kv=k.split(':');
    const el=sb.querySelector('.pchip[data-'+kv[0]+'="'+kv[1]+'"]');
    if(el && !el.classList.contains('active')) el.click();
  });
  // 날짜 입력을 복원한 뒤 적용 버튼이 있으면 마지막에 눌러 기간을 재적용 (설치 현황)
  const ap=sb.querySelector('.apply-btn'); if(ap) ap.click();
};
GST.startAutoRefresh = function(min){
  if(GST._arTimer) return;
  const fn = window.loadData || window.loadAll;
  if(typeof fn!=='function') return;
  GST._arTimer = setInterval(async function(){
    let on=true; try{ on = localStorage.getItem('gst_auto_refresh')!=='0'; }catch(e){}
    if(!on || document.hidden) return;   // 꺼짐/백그라운드 탭이면 건너뜀
    const snap = GST._snapFilters();
    try{ await fn(); }catch(e){ return; } // 로드 실패 시 상태 유지
    setTimeout(function(){ try{ GST._restoreFilters(snap); }catch(e){} }, 300);
  }, (min||10)*60000);
};

// 자동 초기화: 페이지가 initSidebar를 직접 호출하지 않아도,
// 알려진 필터 블록(.date-panel / .slicers / .filters)이 있으면 사이드바를 만든다.
// (DOMContentLoaded는 페이지 하단 스크립트 실행 이후에 발생하므로,
//  페이지가 직접 호출한 경우 그 설정이 우선되고 여기서는 no-op)
GST.autoSidebar = function(){
  if(document.getElementById('gstSidebar')) return;
  const sections=[];
  if(document.querySelector('.date-panel')) sections.push({selector:'.date-panel', label:'기간 · Date Range'});
  if(document.querySelector('.slicers'))    sections.push({selector:'.slicers',    label:'필터 · Filters'});
  if(document.querySelector('.filters'))    sections.push({selector:'.filters',    label:'필터 · Filters'});
  if(!sections.length) return;
  GST.initSidebar({
    sections,
    onReset:function(){
      // 페이지가 전체 해제 함수를 제공하면 그것을 사용
      if(typeof global.clearAllFilters==='function'){ try{ global.clearAllFilters(); return; }catch(e){} }
      const sb=document.getElementById('gstSidebar');
      if(!sb) return;
      // select/입력값 초기화 후 이벤트 발생 → 페이지 필터 로직이 반응
      sb.querySelectorAll('select').forEach(function(s){
        s.value = s.options.length ? s.options[0].value : '';
        s.dispatchEvent(new Event('input',{bubbles:true}));
        s.dispatchEvent(new Event('change',{bubbles:true}));
      });
      sb.querySelectorAll('input').forEach(function(i){
        i.value='';
        i.dispatchEvent(new Event('input',{bubbles:true}));
        i.dispatchEvent(new Event('change',{bubbles:true}));
      });
      // 칩 슬라이서는 첫 번째 칩(ALL/전체) 클릭
      sb.querySelectorAll('.chips').forEach(function(box){
        if(box.firstElementChild) box.firstElementChild.click();
      });
      // 기간 리셋 버튼은 마지막에 클릭 (예: 설치현황의 resetDateRange가 기본 기간 복원)
      const rst=sb.querySelector('.reset-btn'); if(rst) rst.click();
    }
  });
};
function gstAutoStart(){
  try{ GST.autoSidebar(); }catch(e){}
  try{ GST.startAutoRefresh(10); }catch(e){}
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', gstAutoStart);
}else{
  setTimeout(gstAutoStart, 0);
}

global.GST = GST;
})(window);
