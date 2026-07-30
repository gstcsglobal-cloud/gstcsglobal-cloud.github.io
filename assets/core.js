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

/* ---------- 1.5 Supabase 인증 ----------
   이메일 OTP 로그인이 유일한 인증 수단이다. 설정 절차는 SETUP-SUPABASE.md 참고. */
GST.SB_URL  = (typeof window!=='undefined' && window.GST_SB_URL)  || 'https://wldzkdoucqunqliwabuf.supabase.co';
GST.SB_ANON = (typeof window!=='undefined' && window.GST_SB_ANON) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZHprZG91Y3F1bnFsaXdhYnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTgzMDcsImV4cCI6MjEwMDgzNDMwN30.8YW4Y2TG93ldmhxwGX_O8C6avwP5GyknTLwbZ5Q8thY';   // anon public key (공개돼도 안전 — allowlist가 보호)
GST.authOn = function(){ return !!(GST.SB_URL && GST.SB_ANON); };
GST._sb=null; GST._sbLoad=null;
// 세션을 sessionStorage에만 저장 → 브라우저(탭) 닫으면 자동 로그아웃, 다음 접속 시 OTP 재인증 (공용 PC 보호)
GST._storage={
  getItem:function(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } },
  setItem:function(k,v){ try{ sessionStorage.setItem(k,v); localStorage.removeItem(k); }catch(e){} },
  removeItem:function(k){ try{ sessionStorage.removeItem(k); localStorage.removeItem(k); }catch(e){} }
};
GST.sb = async function(){
  if(GST._sb) return GST._sb;
  if(!global.supabase){
    if(!GST._sbLoad) GST._sbLoad=new Promise(function(res,rej){
      var s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload=res; s.onerror=function(){GST._sbLoad=null;rej(new Error('supabase-js CDN 로드 실패'));};
      document.head.appendChild(s); });
    await GST._sbLoad;
  }
  // 이전 버전이 localStorage에 남긴 세션 청소 (브라우저 종료 시 로그아웃 정책 전환)
  try{ Object.keys(localStorage).forEach(function(k){ if(/^sb-.+-auth-token/.test(k)) localStorage.removeItem(k); }); }catch(e){}
  GST._sb = global.supabase.createClient(GST.SB_URL, GST.SB_ANON,
    {auth:{storage:GST._storage, persistSession:true, autoRefreshToken:true}});
  return GST._sb;
};
GST.getSession = async function(){
  if(!GST.authOn()) return null;
  try{ var c=await GST.sb(); var r=await c.auth.getSession(); return (r.data&&r.data.session)||null; }
  catch(e){ return null; }
};
GST.token   = async function(){ var s=await GST.getSession(); return s?s.access_token:null; };
// shouldCreateUser:false — 관리자가 Supabase 콘솔(Authentication → Users → Invite user)로
// 미리 초대한 이메일만 인증코드를 받을 수 있다. 승인 안 된 이메일은 코드 발급 자체가 거부된다.
GST.sendOtp = async function(email){ var c=await GST.sb();
  var r=await c.auth.signInWithOtp({email:email,options:{shouldCreateUser:false}});
  if(!r.error)return null;
  var m=String(r.error.message||'');
  if(/signup|not allowed|not found|does not exist/i.test(m))
    return '등록되지 않은 이메일입니다. 관리자에게 이메일 등록을 요청하세요.';
  return m||'전송 실패';
};
GST.verifyOtp = async function(email,code){ var c=await GST.sb();
  var r=await c.auth.verifyOtp({email:email,token:code,type:'email'});
  return r.error?(r.error.message||'코드 확인 실패'):null; };
GST.signOut = async function(){ try{var c=await GST.sb(); await c.auth.signOut();}catch(e){}
  try{ sessionStorage.clear(); Object.keys(localStorage).forEach(function(k){ if(/^sb-/.test(k))localStorage.removeItem(k); }); }catch(e){}
  location.reload(); };
// 인증된 테이블 접근 (RLS가 권한 통제) — 미설정 시 null 반환하므로 호출부에서 폴백 처리
GST.db = async function(){ if(!GST.authOn())return null;
  var s=await GST.getSession(); if(!s)return null;
  return await GST.sb(); };
// 로그인 완료 신호 — fetchCSV가 이 Promise를 기다리므로 loadData()를 먼저 불러도 안전
GST._readyP=null; GST._readyRes=null;
GST.authReady=function(){ if(!GST._readyP)GST._readyP=new Promise(function(r){GST._readyRes=r;}); return GST._readyP; };
GST._authOk=function(){ GST.authReady(); GST._readyRes&&GST._readyRes(); };
// 로그인 게이트: #loginOverlay를 이메일 OTP UI로 교체(없으면 생성). 성공 시 resolve.
GST.authGate = async function(){
  var ov=document.getElementById('loginOverlay');
  if(!ov){ ov=document.createElement('div'); ov.id='loginOverlay'; ov.className='login-overlay';
    ov.style.cssText='position:fixed;inset:0;background:rgba(4,8,12,.92);z-index:9998;display:flex;align-items:center;justify-content:center';
    document.body.appendChild(ov); }
  // 인증이 설정되지 않았으면 통과시키지 않는다(fail-closed). 예전엔 공용 비밀번호로 우회됐다.
  if(!GST.authOn()){
    ov.classList.remove('hidden'); ov.style.display='flex';
    ov.innerHTML='<div style="max-width:340px;background:#0d141c;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:28px;text-align:center;font-family:\'Segoe UI\',\'Malgun Gothic\',sans-serif">'
      +'<div style="font-size:17px;font-weight:800;color:#ffb4b4;margin-bottom:8px">인증이 설정되지 않았습니다</div>'
      +'<div style="font-size:12px;color:#8a97a5">관리자에게 문의하세요</div></div>';
    return new Promise(function(){});   // 절대 resolve하지 않음 → 페이지가 열리지 않는다
  }
  var s=await GST.getSession();
  if(s){ ov.classList.add('hidden'); ov.style.display='none'; GST._authOk(); return true; }
  ov.classList.remove('hidden'); ov.style.display='flex';
  ov.innerHTML='<div class="login-card" style="max-width:340px;width:90%;background:#0d141c;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:28px;text-align:center;font-family:\'Segoe UI\',\'Malgun Gothic\',sans-serif">'
    +'<div style="font-size:20px;font-weight:800;color:#e6edf3;margin-bottom:6px">GST CS Dashboard</div>'
    +'<div style="font-size:12px;color:#8a97a5;margin-bottom:18px">등록된 이메일로 인증코드를 받아 로그인하세요</div>'
    +'<input id="sbEmail" type="email" placeholder="name@company.com" autocomplete="email" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#e6edf3;font-size:14px;margin-bottom:8px">'
    +'<button id="sbSend" style="width:100%;padding:10px;border-radius:10px;border:0;background:#2C5FAE;color:#fff;font-weight:700;font-size:14px;cursor:pointer">인증코드 받기</button>'
    +'<div id="sbStep2" style="display:none;margin-top:10px">'
      +'<input id="sbCode" inputmode="numeric" maxlength="8" placeholder="이메일로 받은 6자리 코드" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#e6edf3;font-size:14px;letter-spacing:3px;text-align:center;margin-bottom:8px">'
      +'<button id="sbVerify" style="width:100%;padding:10px;border-radius:10px;border:0;background:#34D399;color:#04211d;font-weight:800;font-size:14px;cursor:pointer">로그인</button></div>'
    +'<div id="sbErr" style="color:#ff8a8a;font-size:12px;margin-top:10px;min-height:16px"></div></div>';
  var $=function(id){return document.getElementById(id);};
  var err=function(m){ $('sbErr').textContent=m||''; };
  return new Promise(function(resolve){
    $('sbSend').onclick=async function(){
      var em=($('sbEmail').value||'').trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){err('이메일 형식을 확인하세요');return;}
      err(''); $('sbSend').disabled=true; $('sbSend').textContent='전송 중…';
      var e=await GST.sendOtp(em);
      $('sbSend').disabled=false; $('sbSend').textContent='인증코드 다시 받기';
      if(e){err(/^등록되지 않은/.test(e)?e:('전송 실패: '+e));return;}
      $('sbStep2').style.display='block'; $('sbCode').focus();
      err('메일이 안 보이면 스팸함을 확인하세요');
    };
    $('sbVerify').onclick=async function(){
      var em=($('sbEmail').value||'').trim().toLowerCase(), cd=($('sbCode').value||'').trim();
      if(!cd){err('코드를 입력하세요');return;}
      err(''); $('sbVerify').disabled=true;
      var e=await GST.verifyOtp(em,cd);
      $('sbVerify').disabled=false;
      if(e){err('로그인 실패: '+e);return;}
      ov.classList.add('hidden'); ov.style.display='none';
      GST._authOk(); resolve(true);
    };
    $('sbCode')&&$('sbCode').addEventListener('keydown',function(ev){if(ev.key==='Enter')$('sbVerify').click();});
    $('sbEmail').addEventListener('keydown',function(ev){if(ev.key==='Enter')$('sbSend').click();});
  });
};
// 미등록 이메일(403) 안내
GST.authDenied=function(code){
  var ov=document.getElementById('loginOverlay'); if(!ov)return;
  ov.classList.remove('hidden'); ov.style.display='flex';
  ov.innerHTML='<div class="login-card" style="max-width:360px;background:#0d141c;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:28px;text-align:center;font-family:\'Segoe UI\',\'Malgun Gothic\',sans-serif">'
    +'<div style="font-size:17px;font-weight:800;color:#ffb4b4;margin-bottom:8px">'+(code===403?'접근 권한이 없습니다':'로그인이 만료되었습니다')+'</div>'
    +'<div style="font-size:12px;color:#8a97a5;margin-bottom:16px">'+(code===403?'관리자에게 이메일 등록을 요청하세요':'다시 로그인해 주세요')+'</div>'
    +'<button onclick="GST.signOut()" style="padding:9px 22px;border-radius:10px;border:0;background:#2C5FAE;color:#fff;font-weight:700;cursor:pointer">다시 로그인</button></div>';
};

/* ---------- 2. CSV 로드 ---------- */
// 프록시 함수 슬러그 자동 탐색 — Supabase는 함수 이름을 바꿔도 주소(슬러그)가 고정이라
// 콘솔에서 기본 이름(quick-responder)으로 만든 뒤 이름만 바꾼 경우도 그대로 동작시킨다.
GST.FN_SLUGS = (typeof window!=='undefined' && window.GST_FN_SLUGS) || ['sheet-proxy','quick-responder'];
GST._fnSlug = null;
GST.proxyFetch = async function(gid, tok){
  var slugs = GST._fnSlug ? [GST._fnSlug] : GST.FN_SLUGS;
  var last = null;
  for(var i=0;i<slugs.length;i++){
    var res;
    try{ res = await fetch(GST.SB_URL+'/functions/v1/'+slugs[i]+'?gid='+gid+'&t='+Date.now(),
      {headers:{Authorization:'Bearer '+tok}}); }
    catch(e){ last=e; continue; }               // CORS·네트워크 실패 → 다음 후보
    if(res.status===404){ last=new Error('HTTP 404 ('+slugs[i]+')'); continue; }
    GST._fnSlug = slugs[i];                     // 성공한 슬러그 기억 (이후 1회 호출)
    return res;
  }
  throw last || new Error('프록시 함수를 찾을 수 없습니다');
};

/* ---------- 2.5 시트 쓰기 (sheet-write Edge Function) ----------
   읽기는 sheet-proxy(웹게시 CSV), 쓰기는 sheet-write(서비스계정 + Sheets API).
   클라이언트는 gid와 논리 필드명만 알고, 시트 ID·행 번호·컬럼 위치는 서버가 정한다. */
GST.FN_WRITE = (typeof window!=='undefined' && window.GST_FN_WRITE) || 'sheet-write';
// op: perm(편집권한 확인) · row(폼 프리필+지문) · update(저장) · fresh(라이브 재조회)
// body가 있으면 POST, 없으면 GET. 실패 시 err.status / err.data를 붙여 던진다.
GST.sheetWrite = async function(op, gid, body, params){
  var tok = await GST.token();
  if(!tok){ await GST.authReady(); tok = await GST.token(); }
  if(!tok){ var e0=new Error('unauthorized'); e0.status=401; throw e0; }
  var qs = '?op='+encodeURIComponent(op)+'&gid='+encodeURIComponent(gid)+'&t='+Date.now();
  if(params) Object.keys(params).forEach(function(k){ qs += '&'+k+'='+encodeURIComponent(params[k]); });
  var h = {Authorization:'Bearer '+tok};
  if(body) h['Content-Type']='application/json';
  var res = await fetch(GST.SB_URL+'/functions/v1/'+GST.FN_WRITE+qs,
    {method: body?'POST':'GET', headers:h, body: body?JSON.stringify(body):undefined});
  var txt = await res.text(), data=null;
  try{ data = JSON.parse(txt); }catch(e){}
  if(res.ok) return data;
  var err = new Error((data&&data.error)||('HTTP '+res.status));
  err.status = res.status; err.data = data;
  // 로그인 만료(401)와 미등록(forbidden)만 전면 차단 UI를 띄운다.
  // read_only는 "조회는 되지만 편집 권한이 없다"는 뜻이라 화면을 잠그면 안 된다.
  if(res.status===401 || (data&&data.error==='forbidden')) GST.authDenied(res.status);
  throw err;
};
// 저장 직후 최신 데이터. 웹게시 CSV는 수 분 지연되므로 라이브 시트를 직접 읽는다.
// 쿼터가 서비스계정 1개에 공유되므로 초기 로드·자동 새로고침에는 쓰지 말 것.
GST.fetchCSVFresh = async function(gid){
  var tok = await GST.token();
  if(!tok){ await GST.authReady(); tok = await GST.token(); }
  var res = await fetch(GST.SB_URL+'/functions/v1/'+GST.FN_WRITE+
    '?op=fresh&gid='+encodeURIComponent(gid)+'&t='+Date.now(), {headers:{Authorization:'Bearer '+tok}});
  if(res.status===401){ GST.authDenied(401); throw new Error('AUTH 401'); }
  if(!res.ok) throw new Error('HTTP '+res.status);
  return Papa.parse(await res.text(), {skipEmptyLines:true}).data;
};

// PapaParse 필요. 캐시 무효화 포함. 반환: 헤더 포함 2차원 배열
// Supabase 인증 활성 시: 시트 직접 URL → 프록시(Edge Function)로 자동 치환 + JWT 첨부
GST.fetchCSV = async function(url){
  if(GST.authOn() && /docs\.google\.com/.test(url)){
    var gm=url.match(/[?&]gid=(\d+)/); var gid=gm?gm[1]:'0';
    var tok=await GST.token();
    if(!tok){ await GST.authReady(); tok=await GST.token(); }
    var pres=await GST.proxyFetch(gid, tok);
    if(pres.status===401||pres.status===403){ GST.authDenied(pres.status); throw new Error('AUTH '+pres.status); }
    if(!pres.ok) throw new Error('HTTP '+pres.status+' — '+(await pres.text()).slice(0,120));
    var txt=await pres.text();
    // 프록시 대신 기본 샘플 함수 코드가 배포된 경우: JSON이 돌아와 CSV처럼 파싱되는 사고 방지
    if(/^\s*\{/.test(txt)&&!/[\r\n]/.test(txt.slice(0,200)))
      throw new Error('프록시 함수 코드가 아닙니다 — Edge Function의 Code 탭에 sheet-proxy 코드를 붙여넣고 다시 Deploy 하세요');
    return Papa.parse(txt, {skipEmptyLines:true}).data;
  }
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

/* ---------- 5b. 차트 팔레트 · 테마 잉크 ---------- */
// 범주(시리즈) 팔레트 — 색각이상 시뮬레이션 검증 통과 조합, 고정 순서로만 사용
GST.PAL  = ['#3987e5','#199e70','#c98500','#9085e9','#e66767'];
GST.PAL8 = GST.PAL.concat(['#008300','#d55181','#d95926']);

// 팔레트 프리셋 — 3종 모두 인접쌍 CVD 검증 통과 배열(같은 8색의 순서만 다름).
// 전환은 배열을 "제자리에서" 교체(splice)하므로 페이지가 const PAL=GST.PAL8로
// 잡아둔 참조도 함께 갱신된다.
GST.PALETTES = {
  ocean:  {label:'Ocean',  colors:['#3987e5','#199e70','#c98500','#9085e9','#e66767','#008300','#d55181','#d95926']},
  forest: {label:'Forest', colors:['#199e70','#9085e9','#c98500','#3987e5','#e66767','#008300','#d55181','#d95926']},
  sunset: {label:'Sunset', colors:['#e66767','#3987e5','#c98500','#199e70','#9085e9','#008300','#d55181','#d95926']}
};
GST._palKey='ocean';
GST.setPalette = function(key, silent){
  const p = GST.PALETTES[key];
  if(!p) return;
  GST._palKey = key;
  GST.PAL.splice.apply(GST.PAL,  [0, GST.PAL.length].concat(p.colors.slice(0,5)));
  GST.PAL8.splice.apply(GST.PAL8,[0, GST.PAL8.length].concat(p.colors));
  try{ localStorage.setItem('gst_pal', key); }catch(e){}
  if(silent) return;
  // 현재 테마 키를 넘겨 페이지의 재렌더 훅 호출 (material은 (theme,label) 시그니처)
  const b=document.body?document.body.className:'';
  const cur = b.indexOf('theme-slate')>-1?'slate' : b.indexOf('theme-light')>-1?'light'
            : b.indexOf('theme-burgundy')>-1?'burgundy' : 'default';
  if(typeof global.changeDashboardTheme==='function'){ try{ global.changeDashboardTheme(cur,cur); }catch(e){} }
};
try{ const k=localStorage.getItem('gst_pal'); if(k&&GST.PALETTES[k]) GST.setPalette(k,true); }catch(e){}
// 현재 테마에 맞는 차트 잉크/팔레트/상태색. 차트 생성 시점에 호출해야 함.
// 상태색은 의미(정상/경고/위험) 전용 — 범주 시리즈로 재사용하지 않는다.
GST.chartTheme = function(){
  const b = document.body.className || '';
  let key='default', txt='#94a3b8', grid='rgba(255,255,255,.05)';
  if(b.indexOf('theme-slate')>-1){ key='slate'; txt='#8B98A9'; grid='rgba(151,170,196,.08)'; }
  else if(b.indexOf('theme-light')>-1){ key='light'; txt='#64748b'; grid='rgba(15,23,42,.06)'; }
  else if(b.indexOf('theme-burgundy')>-1){ key='burgundy'; txt='#b49aa9'; grid='rgba(255,240,245,.06)'; }
  const slate = key==='slate';
  return { key, txt, grid, pal:GST.PAL, pal8:GST.PAL8,
    status:{ bad: slate?'#e66767':'#fb7185', warn: slate?'#fab219':'#fbbf24',
             ok: slate?'#3fbf3f':'#34d399', na:'#64748b' } };
};
// 테마 전환 시 차트 전체 파기 — update()로는 축/범례 잉크가 갱신되지 않으므로
// 파기 후 페이지 render()가 새 잉크로 다시 그리게 한다.
GST.reskinCharts = function(store){
  if(!store) return;
  Object.keys(store).forEach(function(k){
    try{ store[k].destroy(); }catch(e){}
    delete store[k];
  });
};

/* ---------- 6. 차트 팩토리 (Chart.js) ---------- */
// 단일 축 막대 차트. o = {labels, data, color, horizontal, share, txt, grid, onClick(label)}
// share:true → 툴팁에 전체 대비 비중(%) 표기 (이중 축 대신 툴팁 사용 원칙)
GST.bar = function(store, id, o){
  const ctx = document.getElementById(id);
  if(!ctx) return;
  const TH = GST.chartTheme();
  const txt = o.txt || TH.txt;
  const grid = o.grid || TH.grid;
  const total = o.data.reduce((a,b)=>a+b,0) || 1;
  const datasets = [{type:'bar', label:'건수', data:o.data, backgroundColor:o.color, borderRadius:5}];
  const plugins = {legend:{display:false}};
  if(o.share){
    plugins.tooltip = {callbacks:{label:function(c){
      const v = o.horizontal ? c.parsed.x : c.parsed.y;
      return ' '+v.toLocaleString()+' ('+Math.round(v/total*100)+'%)';
    }}};
  }
  const cfg = {data:{labels:o.labels, datasets},
    options:{
      indexAxis:o.horizontal?'y':'x', responsive:true, maintainAspectRatio:false,
      onClick:(e,els,chart)=>{ if(els.length && o.onClick) o.onClick(chart.data.labels[els[0].index]); },
      plugins,
      scales:{
        x:{ticks:{color:txt,font:{size:10}},grid:o.horizontal?{color:grid}:{display:false}},
        y:{ticks:{color:txt,font:{size:10},precision:0},grid:o.horizontal?{display:false}:{color:grid}}
      }
    }};
  if(store[id]) store[id].destroy();
  store[id] = new Chart(ctx, cfg);
};

// 도넛 차트  o = {labels, data, colors, txt, cutout, onClick(label)}
GST.donut = function(store, id, o){
  const ctx = document.getElementById(id);
  if(!ctx) return;
  const txt = o.txt || GST.chartTheme().txt;
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
  try{ GST.ctxSave(F); }catch(e){}   // 사이트·공정은 다른 탭으로 승계
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
    // 셸(탭) 안에서는 페이지 대문 타이틀이 중복이므로 숨김 (인쇄 시에는 theme.css가 복원)
    // 테마 전환 등이 body.className을 통째로 바꿔도 클래스가 유지되도록 감시
    function markInFrame(){ if(document.body && !document.body.classList.contains('gst-inframe')) document.body.classList.add('gst-inframe'); }
    if(document.body) markInFrame(); else document.addEventListener('DOMContentLoaded', markInFrame);
    try{
      new MutationObserver(markInFrame).observe(document.body||document.documentElement,{attributes:true,attributeFilter:['class']});
    }catch(e){}
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
    // 세션이 있으면 그대로 두고, 없을 때만 셸(로그인 화면)로 이동
    GST.getSession().then(function(s){ if(!s) location.href='https://gstcsglobal-cloud.github.io/'; });
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
  try{ GST.ctxSave(F); }catch(e){}   // 사이트·공정은 다른 탭으로 승계
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

// 페이지 인사이트 스트립: .kpis 카드 위에 자동 삽입.
// items = [{sev:'bad'|'warn'|'ok'|'info', text:'번역 완료된 문자열'}]
// 빈 배열/미전달이면 스트립을 제거한다. 각 페이지 render() 끝에서
// "필터가 적용된 데이터" 기준으로 계산해 호출할 것.
GST.insights = function(items){
  let box=document.getElementById('gstInsights');
  if(!items || !items.length){ if(box) box.remove(); return; }
  if(!box){
    const anchor=document.querySelector('.kpis');
    if(!anchor || !anchor.parentNode) return;
    box=document.createElement('div');
    box.id='gstInsights'; box.className='gst-insights';
    anchor.parentNode.insertBefore(box, anchor);
  }
  box.innerHTML = '<span class="gst-ins-head">INSIGHT</span>' +
    items.slice(0,4).map(function(it){
      return '<span class="gst-ins '+(it.sev||'info')+'"><span class="gst-ins-dot"></span>'+it.text+'</span>';
    }).join('');
};

// 페이지 내 소분류 탭 (섹션 내비게이션).
// 페이지에 <div data-sec="id"> 컨테이너들이 있어야 하며, defs=[{id,label}] 순서대로 탭 생성.
// 선택 상태는 sessionStorage에 페이지별로 기억. 라벨 갱신(언어 전환)을 위해 재호출 가능.
GST.sectionNav = function(defs){
  if(!defs || !defs.length) return;
  const storeKey = 'gst_sec_' + location.pathname.replace(/[^a-z0-9]/gi,'');
  let nav = document.getElementById('gstSecNav');
  if(!nav){
    nav = document.createElement('nav');
    nav.id='gstSecNav'; nav.className='gst-secnav';
    const anchor = document.getElementById('gstInsights') || document.querySelector('.kpis') || document.querySelector('[data-sec]');
    if(!anchor || !anchor.parentNode) return;
    anchor.parentNode.insertBefore(nav, anchor);
  }
  let cur = null;
  try{ cur = sessionStorage.getItem(storeKey); }catch(e){}
  if(!defs.some(function(d){ return d.id===cur; })) cur = defs[0].id;

  function show(id){
    cur = id;
    try{ sessionStorage.setItem(storeKey, id); }catch(e){}
    document.querySelectorAll('[data-sec]').forEach(function(el){
      el.style.display = (el.dataset.sec===id) ? '' : 'none';
    });
    nav.querySelectorAll('.gst-sec-tab').forEach(function(b){
      b.classList.toggle('active', b.dataset.id===id);
    });
    // 숨김 상태로 생성된 차트가 표시될 때 크기를 다시 잡도록
    setTimeout(function(){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} }, 60);
  }

  nav.innerHTML='';
  defs.forEach(function(d){
    const b=document.createElement('button');
    b.type='button'; b.className='gst-sec-tab'; b.dataset.id=d.id; b.textContent=d.label;
    b.onclick=function(){ show(d.id); };
    nav.appendChild(b);
  });
  show(cur);
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
  // 차트 색상 전환 버튼은 셸 상단 공통바(🎨)로 일원화 — 사이드바에서는 제거
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
/* ---------- 고급 분석 헬퍼 (B1~B4 플랫폼) ---------- */
// 최소제곱 선형회귀로 향후 n개 값 예측 (음수는 0, 소수1자리). 데이터 3개 미만이면 [].
GST.linForecast = function(ys, n){
  var pts=[]; (ys||[]).forEach(function(y,i){ if(y!=null&&isFinite(y)) pts.push([i,+y]); });
  if(pts.length<3) return [];
  var N=pts.length, sx=0,sy=0,sxy=0,sxx=0;
  pts.forEach(function(p){ sx+=p[0]; sy+=p[1]; sxy+=p[0]*p[1]; sxx+=p[0]*p[0]; });
  var den=(N*sxx-sx*sx)||1, b=(N*sxy-sx*sy)/den, a=(sy-b*sx)/N;
  var last=pts[pts.length-1][0], out=[];
  for(var i=1;i<=n;i++){ out.push(Math.max(0, Math.round((a+b*(last+i))*10)/10)); }
  return out;
};
// MAD(중앙절대편차) 기반 이상치 인덱스 집합 (기본 임계 z=3)
GST.anomalyIdx = function(ys, z){
  z=z||3; var v=(ys||[]).filter(function(y){return y!=null&&isFinite(y);});
  if(v.length<4) return new Set();
  var s=v.slice().sort(function(a,b){return a-b;}), med=s[Math.floor(s.length/2)];
  var dev=v.map(function(y){return Math.abs(y-med);}).sort(function(a,b){return a-b;});
  var mad=dev[Math.floor(dev.length/2)]||0; var set=new Set();
  if(mad<=0) return set;
  (ys||[]).forEach(function(y,i){ if(y!=null&&isFinite(y)&&Math.abs(y-med)/(1.4826*mad)>=z) set.add(i); });
  return set;
};
// 추세 주석 Chart.js 플러그인 — 이상치 링 표시(차트영역 내 안전). 예측선은 데이터셋 추가 방식 권장.
// options.plugins.trendAnno = { anomaly:true, color:'#fb7185', dsIndex:0 }
GST.trendAnnoPlugin = {
  id:'trendAnno',
  afterDatasetsDraw:function(chart, args, o){
    if(!o||!o.anomaly) return;
    var di=o.dsIndex||0, ds=chart.data.datasets[di], meta=chart.getDatasetMeta(di);
    if(!ds||!meta||!meta.data) return;
    var arr = o.realLen ? ds.data.slice(0, o.realLen) : ds.data;
    var set=GST.anomalyIdx(arr), col=o.color||'#fb7185', ctx=chart.ctx;
    if(!set.size) return;
    ctx.save();
    set.forEach(function(i){ var el=meta.data[i]; if(!el) return;
      ctx.beginPath(); ctx.arc(el.x, el.y, 5.5, 0, 6.2832); ctx.strokeStyle=col; ctx.lineWidth=2; ctx.stroke(); });
    ctx.restore();
  }
};
// RAG(신호등) 색 — v와 임계치 비교. higherBetter=true면 클수록 좋음.
GST.ragColor = function(v, good, warn, higherBetter){
  if(v==null||!isFinite(v)) return '';
  if(higherBetter) return v>=good ? 'var(--good,#34d399)' : (v>=warn ? 'var(--warn,#fbbf24)' : 'var(--bad,#fb7185)');
  return v<=good ? 'var(--good,#34d399)' : (v<=warn ? 'var(--warn,#fbbf24)' : 'var(--bad,#fb7185)');
};
// 예측 데이터셋 헬퍼 — 실제 마지막점부터 이어지는 점선 라인 데이터 배열 생성
// 반환 {labels:[...+예측라벨], line:[null...,실측마지막,예측...]} — 페이지가 labels 교체 + 라인 데이터셋 추가
GST.forecastSeries = function(labels, data, n, fcLabel){
  var fc=GST.linForecast(data, n); if(!fc.length) return null;
  var L=labels.slice(), line=data.map(function(){return null;});
  line[data.length-1]=data[data.length-1];
  for(var i=0;i<fc.length;i++){ L.push((fcLabel||'+')+ (i+1)); line.push(fc[i]); }
  return {labels:L, line:line, fc:fc};
};

/* ============================================================
   16. 기준값 — 대시보드 공통 상수 (한 곳에서만 고친다)
   페이지에 흩어져 있던 나눗셈 분모·목표치·신호등 임계값을 모았다.
   GST.conf(key, fallback) — 값이 없으면 fallback을 그대로 반환하므로
   호출부에 기존 하드코딩 값을 폴백으로 남겨두면 회귀가 없다.
   ============================================================ */
GST.CONF = {
  to_divisor:   30,          // TO = 반입 챔버 ÷ 30
  staff_divisor:40,          // 관리 인원 산정 ÷ 40
  edu_goal:     90,          // 교육 완료율 목표 %
  warn_ratio:   0.2,         // 경고 임계 비율
  rag_pm:   [90,80],         // PM 달성률 [양호, 주의] %
  rag_ftfr: [90,80],         // FTFR [양호, 주의] %
  rag_frate:[3,6],           // 고장률 [양호, 주의] % (낮을수록 좋음)
  sites: ['F16','F11','F16N','PSMC','TASC','WINBOND']
};
GST.conf = function(k, fb){ return (k in GST.CONF) ? GST.CONF[k] : fb; };

/* ============================================================
   17. 차트 디자인(스타일) — 전 페이지 공통 1개 키
   기존 report(gst_rpt_style)·hr(gst_hr_style)·사이드바 팔레트(gst_pal)가
   따로 놀던 것을 gst_chart_style 하나로 합쳤다. 최초 1회 자동 이관.
   ============================================================ */
GST.STY = {
  vivid:   {lbl:'Vivid',    bar:'#2C5FAE', last:'#5EC2FF', bar2:'#7C6FE0', line:'#5EC2FF', lnG:'#34D399', lnV:'#A78BFA',
            site:['#2C5FAE','#38BDF8','#5EC2FF','#7C6FE0','#34D399','#F59E0B'],
            pal8:['#3987e5','#199e70','#c98500','#9085e9','#e66767','#008300','#d55181','#d95926']},
  graphite:{lbl:'Graphite', bar:'#8A8A8A', last:'#B4B4B4', bar2:'#C7C7C7', line:'#E03131', lnG:'#E03131', lnV:'#9A9A9A',
            site:['#5A5A5A','#7A7A7A','#9A9A9A','#B4B4B4','#8A8A8A','#C7C7C7'],
            pal8:['#5A5A5A','#E03131','#9A9A9A','#7A7A7A','#C7C7C7','#B4B4B4','#8A8A8A','#6E6E6E']},
  ocean:   {lbl:'Ocean',    bar:'#0E7490', last:'#22D3EE', bar2:'#2DD4BF', line:'#F472B6', lnG:'#34D399', lnV:'#38BDF8',
            site:['#0E7490','#0891B2','#22D3EE','#2DD4BF','#5EEAD4','#A5F3FC'],
            pal8:['#3987e5','#199e70','#c98500','#9085e9','#e66767','#008300','#d55181','#d95926']},
  sunset:  {lbl:'Sunset',   bar:'#EA580C', last:'#FBBF24', bar2:'#FB7185', line:'#6366F1', lnG:'#F59E0B', lnV:'#EC4899',
            site:['#EA580C','#F97316','#FB923C','#FBBF24','#FB7185','#F43F5E'],
            pal8:['#e66767','#3987e5','#c98500','#199e70','#9085e9','#008300','#d55181','#d95926']},
  forest:  {lbl:'Forest',   bar:'#15803D', last:'#4ADE80', bar2:'#A3E635', line:'#DC2626', lnG:'#22C55E', lnV:'#84CC16',
            site:['#15803D','#16A34A','#22C55E','#4ADE80','#84CC16','#A3E635'],
            pal8:['#199e70','#9085e9','#c98500','#3987e5','#e66767','#008300','#d55181','#d95926']},
  cb:      {lbl:'Safe',     bar:'#0072B2', last:'#56B4E9', bar2:'#CC79A7', line:'#D55E00', lnG:'#009E73', lnV:'#E69F00',
            site:['#0072B2','#E69F00','#009E73','#CC79A7','#56B4E9','#D55E00'],
            pal8:['#0072B2','#E69F00','#009E73','#CC79A7','#56B4E9','#D55E00','#F0E442','#666666']}
};
GST.STY_ORDER = ['vivid','graphite','ocean','sunset','forest','cb'];
GST._styKey = 'vivid';
GST.style = function(){ return GST._styKey; };
GST.sty    = function(){ return GST.STY[GST._styKey] || GST.STY.vivid; };
// 스타일 적용 — 팔레트 배열을 제자리 교체하므로 GST.PAL을 잡아둔 페이지도 함께 갱신된다
GST.setStyle = function(key, silent, fromShell){
  const s = GST.STY[key]; if(!s) return;
  GST._styKey = key; GST._palKey = key;
  GST.PAL.splice.apply(GST.PAL,  [0, GST.PAL.length ].concat(s.pal8.slice(0,5)));
  GST.PAL8.splice.apply(GST.PAL8,[0, GST.PAL8.length].concat(s.pal8));
  try{ localStorage.setItem('gst_chart_style', key); }catch(e){}
  if(silent) return;
  // 이미 열려 있는 다른 탭도 같이 바뀌도록 셸을 통해 전파 (테마·언어와 같은 경로)
  if(!fromShell && window.self!==window.top){
    try{ window.parent.postMessage({type:'gst-style', style:key}, '*'); }catch(e){}
  }
  // 차트 색은 생성 시점에 굳으므로 파기 후 재렌더가 필요하다 (테마 전환과 같은 경로)
  const b = document.body ? document.body.className : '';
  const cur = b.indexOf('theme-slate')>-1?'slate' : b.indexOf('theme-light')>-1?'light'
            : b.indexOf('theme-burgundy')>-1?'burgundy' : 'default';
  if(typeof global.changeDashboardTheme==='function'){ try{ global.changeDashboardTheme(cur,cur); }catch(e){} }
  else if(typeof global.render==='function'){ try{ global.render(); }catch(e){} }
  GST.barSync();
};
GST.nextStyle = function(){
  const o=GST.STY_ORDER;
  GST.setStyle(o[(o.indexOf(GST._styKey)+1)%o.length]);
};
// 구 API 호환 — 사이드바/외부 호출이 팔레트 키를 넘겨도 스타일로 흡수
GST.setPalette = function(key, silent){ if(GST.STY[key]) GST.setStyle(key, silent); };
(function(){   // 저장값 로드 + 구 키 자동 이관 (gst_chart_style → gst_rpt_style → gst_hr_style → gst_pal)
  let k=null;
  try{
    k = localStorage.getItem('gst_chart_style');
    if(!k || !GST.STY[k]) k = localStorage.getItem('gst_rpt_style') || localStorage.getItem('gst_hr_style') || localStorage.getItem('gst_pal');
  }catch(e){}
  GST.setStyle((k && GST.STY[k]) ? k : 'vivid', true);
})();

/* ============================================================
   18. 공통 상단바 — 셸 탭바 우측(#gbar) ↔ 현재 페이지
   페이지는 "내가 지원하는 컨트롤 + 현재값"만 등록하고, 실제 동작은
   페이지 자신의 함수가 한다. 셸이 없으면(직접 접속) 같은 바를
   페이지 상단에 직접 그려서 기능이 동일하게 유지된다.
   ============================================================ */
GST.BAR_T = {
  ko:{w:'주별',m:'월별',note:'최근 12개 구간',cut:'마감',mon:'Month',wk:'Week',clr:'마감 해제',sty:'차트 디자인',ppt:'PPT 저장',latest:'— 최신 —'},
  en:{w:'Weekly',m:'Monthly',note:'Last 12',cut:'Cut-off',mon:'Month',wk:'Week',clr:'Clear cut-off',sty:'Chart style',ppt:'Export PPT',latest:'— Latest —'},
  zh:{w:'周',m:'月',note:'最近12期',cut:'截止',mon:'月',wk:'周',clr:'清除截止',sty:'图表配色',ppt:'导出PPT',latest:'— 最新 —'},
  ja:{w:'週別',m:'月別',note:'直近12区間',cut:'締め',mon:'Month',wk:'Week',clr:'締め解除',sty:'チャート配色',ppt:'PPT出力',latest:'— 最新 —'}
};
// reg = {caps:{period,cutoff:'wm'|'m'|false,style,ppt}, state:{period,endM,endW,style}, weeks:[{v,t}]}
GST.barHTML = function(reg, lang){
  const T = GST.BAR_T[lang] || GST.BAR_T.ko;
  const c = (reg && reg.caps) || {}, s = (reg && reg.state) || {};
  let h='';
  if(c.period){
    h+='<span class="gb-seg">'
      +'<button type="button" class="gb-b'+(s.period==='w'?' on':'')+'" data-gb="period" data-v="w">'+T.w+'</button>'
      +'<button type="button" class="gb-b'+(s.period==='m'?' on':'')+'" data-gb="period" data-v="m">'+T.m+'</button>'
      +'</span><span class="gb-note">'+T.note+'</span>';
  }
  if(c.cutoff){
    h+='<span class="gb-note gb-cut">'+T.cut+'</span>'
      +'<input type="month" class="gb-inp" data-gb="endM" title="'+T.mon+'" value="'+(s.endM||'')+'">';
    if(c.cutoff==='wm'){
      const ws=(reg&&reg.weeks)||[];
      h+='<select class="gb-inp" data-gb="endW" title="'+T.wk+'"><option value="">'+T.latest+'</option>'
        + ws.map(function(w){ return '<option value="'+w.v+'"'+(s.endW===w.v?' selected':'')+'>'+w.t+'</option>'; }).join('')
        +'</select>';
    }
    h+='<button type="button" class="gb-b" data-gb="clear" title="'+T.clr+'">↺</button>';
  }
  if(c.style){
    const st=GST.STY[s.style]||GST.sty();
    h+='<button type="button" class="gb-b" data-gb="style" title="'+T.sty+'">🎨 <span class="gb-sty">'+st.lbl+'</span></button>';
  }
  if(c.ppt) h+='<button type="button" class="gb-b" data-gb="ppt" title="'+T.ppt+'">📊 PPT</button>';
  return h;
};
// 바 안의 컨트롤을 send(key,val)로 연결. 셸/페이지 양쪽이 같은 함수를 쓴다.
GST.barBind = function(root, send){
  root.addEventListener('click', function(e){
    const b=e.target.closest('[data-gb]'); if(!b||b.tagName==='INPUT'||b.tagName==='SELECT')return;
    const k=b.dataset.gb;
    send(k, k==='period' ? b.dataset.v : null);
  });
  root.addEventListener('change', function(e){
    const el=e.target.closest('[data-gb]'); if(!el)return;
    if(el.tagName==='INPUT'||el.tagName==='SELECT') send(el.dataset.gb, el.value);
  });
};

GST._bar = null;
// 페이지가 호출: 지원 컨트롤과 실제 동작을 등록한다.
// render()를 한 번 감싸 두면 페이지가 다시 그릴 때마다 바 상태가 자동으로 최신이 된다.
GST.pageBar = function(spec){
  GST._bar = spec||null;
  function wrap(){
    const r=global.render;
    if(typeof r!=='function' || r.__gstBar) return typeof r==='function';
    const w=function(){ const out=r.apply(this,arguments); try{ GST.barSync(); }catch(e){} return out; };
    w.__gstBar=true; global.render=w; return true;
  }
  if(!wrap()) document.addEventListener('DOMContentLoaded', wrap);
  GST.barSync();
};
// 페이지가 render() 말미에 호출: 현재 상태를 바에 되쏜다
GST.barSync = function(){
  const s=GST._bar; if(!s) return;
  const reg={type:'gst-bar-reg', caps:s.caps||{},
             state:(typeof s.state==='function')?s.state():{},
             weeks:(typeof s.weeks==='function')?s.weeks():null};
  if(window.self!==window.top){ try{ window.parent.postMessage(reg,'*'); }catch(e){} }
  else GST._localBar(reg);
};
GST._barDo = function(key, val){
  const s=GST._bar; if(!s) return;
  const on=s.on||{};
  if(key==='style'){ if(on.style) on.style(); else GST.nextStyle(); return; }
  if(key==='ppt'){  if(on.ppt) on.ppt(); else GST.pptAuto(); return; }
  if(typeof on[key]==='function'){ try{ on[key](val); }catch(e){} }
};
// 직접 접속(셸 밖)일 때 페이지 안에 같은 바를 렌더
GST._localBar = function(reg){
  if(!document.body) return;
  let el=document.getElementById('gstLocalBar');
  if(!el){
    const st=document.createElement('style');
    st.textContent='#gstLocalBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px}'
      +'#gstLocalBar .gb-seg{display:inline-flex;border:1px solid var(--glass-border);border-radius:8px;overflow:hidden}'
      +'#gstLocalBar .gb-b{font-family:inherit;background:var(--glass);border:1px solid var(--glass-border);border-radius:8px;'
      +'padding:0 12px;height:28px;color:var(--txt-muted);font-size:11.5px;font-weight:700;cursor:pointer}'
      +'#gstLocalBar .gb-seg .gb-b{border:none;border-radius:0}'
      +'#gstLocalBar .gb-b.on{background:var(--accent-1);color:#04211d}'
      +'#gstLocalBar .gb-inp{font-family:inherit;background:var(--glass);border:1px solid var(--glass-border);border-radius:8px;'
      +'padding:0 8px;height:28px;color:var(--txt-main);font-size:11px;outline:none}'
      +'#gstLocalBar .gb-note{font-size:11px;color:var(--txt-muted);font-weight:700}'
      +'#gstLocalBar .gb-cut{margin-left:10px}'
      +'@media print{#gstLocalBar{display:none !important}}';
    document.head.appendChild(st);
    el=document.createElement('div'); el.id='gstLocalBar';
    const anchor=document.querySelector('.status')||document.querySelector('.header');
    if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
    else document.body.insertBefore(el, document.body.firstChild);
    GST.barBind(el, GST._barDo);
  }
  let lg='ko'; try{ lg=sessionStorage.getItem('gst_lang')||'ko'; }catch(e){}
  el.innerHTML=GST.barHTML(reg, lg);
};
// 셸에서 온 지시 수신 (테마·언어는 initSync가 처리)
window.addEventListener('message', function(e){
  const d=e.data||{};
  if(d.type==='gst-bar-set'){ GST._barDo(d.key, d.val); return; }
  if(d.type==='gst-bar-ask'){ GST.barSync(); return; }
  if(d.type==='gst-style'){ if(d.style && d.style!==GST._styKey) GST.setStyle(d.style, false, true); return; }
  if(d.type==='gst-filter'){
    const o = d.f ? GST.decodeState(d.f) : null;
    if(o){ let n=0; const tick=setInterval(function(){       // 데이터 로딩 중이면 될 때까지 재시도
      if(GST.applyState(o)||++n>40) clearInterval(tick); },250); }
  }
});

/* ============================================================
   19. 범용 PPT 내보내기 — 현재 화면의 차트를 슬라이드로
   주간현황은 자체 QBR 양식(downloadPPT)을 쓰고, 나머지 페이지가 이걸 쓴다.
   ============================================================ */
GST._pptP = null;
GST.pptLoad = function(){
  if(window.PptxGenJS) return Promise.resolve();
  if(GST._pptP) return GST._pptP;
  GST._pptP = new Promise(function(res,rej){
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
    s.onload=res; s.onerror=function(){ GST._pptP=null; rej(new Error('PptxGenJS CDN 로드 실패')); };
    document.head.appendChild(s);
  });
  return GST._pptP;
};
// 차트를 고배율로 다시 그려 배경 채운 캔버스 반환 (PPT 확대에도 선명)
GST.chartHiRes = function(id, scale){
  const cv=document.getElementById(id); if(!cv) return null;
  let ch=null;
  try{ ch = (window.Chart&&Chart.getChart) ? Chart.getChart(cv) : null; }catch(e){}
  if(!ch && window.CHARTS) ch=window.CHARTS[id];
  if(!ch) return null;
  const w=cv.clientWidth||400, h=cv.clientHeight||300;
  if(!scale) scale=Math.min(6,Math.max(3,Math.round(2400/w)));
  const prev=ch.options.devicePixelRatio;
  ch.options.devicePixelRatio=scale; ch.resize(); ch.render();
  const oc=document.createElement('canvas'); oc.width=Math.round(w*scale); oc.height=Math.round(h*scale);
  const g=oc.getContext('2d');
  g.fillStyle=getComputedStyle(document.body).backgroundColor||'#0B0F14';
  g.fillRect(0,0,oc.width,oc.height);
  g.drawImage(cv,0,0,oc.width,oc.height);
  ch.options.devicePixelRatio=prev; ch.resize(); ch.render();
  return oc;
};
GST.pptAuto = async function(opt){
  opt=opt||{};
  try{ await GST.pptLoad(); }catch(e){ alert('PPT 라이브러리를 불러오지 못했습니다. 네트워크를 확인하세요.'); return; }
  // 숨겨진 섹션의 차트도 담기 위해 잠시 전부 보이게 한다
  const secs=[].slice.call(document.querySelectorAll('[data-sec]'));
  const hid=secs.filter(function(s){ return s.style.display==='none'; });
  hid.forEach(function(s){ s.style.display=''; });
  if(hid.length){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} await new Promise(function(r){ setTimeout(r,350); }); }

  const dark = (getComputedStyle(document.body).backgroundColor||'').indexOf('255, 255, 255')<0;
  const BG = dark ? '0B0F14' : 'FFFFFF', FG = dark ? 'E6EDF3' : '1A2230', MUT = dark ? '8B98A9' : '64748B';
  const p=new PptxGenJS(); p.layout='LAYOUT_16x9';
  const title = opt.title || (document.querySelector('.header h1')||{}).textContent || document.title || 'Dashboard';
  const stamp = new Date().toLocaleString('ko-KR');
  const chips = ([].slice.call(document.querySelectorAll('#fchips .fchip, #fchipList .fchip'))
                  .map(function(c){ return (c.innerText||'').replace(/\s*✕\s*$/,'').trim(); })
                  .filter(Boolean).join('  ·  ')) || '전체';
  const ins = [].slice.call(document.querySelectorAll('#gstInsights .gst-ins'))
                .map(function(x){ return (x.innerText||'').trim(); }).filter(Boolean);

  const cover=p.addSlide(); cover.background={color:BG};
  cover.addText(title.trim(), {x:0.6,y:1.5,w:12,h:0.9,fontSize:34,bold:true,color:FG});
  cover.addText(stamp+'   |   필터: '+chips, {x:0.6,y:2.5,w:12,h:0.4,fontSize:12,color:MUT});
  if(ins.length) cover.addText(ins.map(function(s){ return {text:'• '+s, options:{breakLine:true}}; }),
                               {x:0.6,y:3.1,w:12,h:2.4,fontSize:12,color:FG});

  const cvs=[].slice.call(document.querySelectorAll('.cw canvas'))
              .filter(function(c){ return c.id && c.clientWidth>0; });
  let n=0;
  for(const cv of cvs){
    const oc=GST.chartHiRes(cv.id); if(!oc) continue;
    const card=cv.closest('.card')||cv.closest('.mcard');
    const h3=card?card.querySelector('h3'):null;
    const cap=h3?(h3.innerText||'').trim():cv.id;
    const sl=p.addSlide(); sl.background={color:BG};
    sl.addText(cap, {x:0.5,y:0.3,w:12.3,h:0.5,fontSize:18,bold:true,color:FG});
    // 16:9 슬라이드(13.33×7.5in) 안에 비율 유지로 배치
    const availW=12.3, availH=5.9, r=oc.width/oc.height;
    let w=availW, h=w/r; if(h>availH){ h=availH; w=h*r; }
    sl.addImage({data:oc.toDataURL('image/png'), x:(13.33-w)/2, y:1.0+(availH-h)/2, w:w, h:h});
    n++;
  }
  hid.forEach(function(s){ s.style.display='none'; });
  if(hid.length){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} }
  if(!n){ alert('내보낼 차트가 없습니다.'); return; }
  const fn=title.trim().replace(/[\\/:*?"<>|]/g,'').slice(0,40)+'_'+new Date().toISOString().slice(0,10)+'.pptx';
  await p.writeFile({fileName:fn});
};

/* ============================================================
   20. 페이지 간 연동 — 설비(S/N) 드릴다운 + 사이트·공정 컨텍스트 승계
   ============================================================ */
// GST.goTab('pm', {sn:'GBWS-1234'}) — 탭 전환과 동시에 그 설비로 필터
GST.goTab = function(id, state){
  const f = state ? GST.encodeState(state) : '';
  if(window.self !== window.top){
    window.parent.postMessage({type:'gst-goto', tab:id, f:f}, '*');
  }else{
    location.href='https://gstcsglobal-cloud.github.io/'+id+'/'+(f?('?f='+f):'');
  }
};

// ── 컨텍스트(사이트·공정) 승계 ──
// 필터를 바꾸면 pushState 경유로 저장되고, 다른 탭이 셀렉트를 채울 때 한 번 적용된다.
GST._CTX_MAP={site:'site',country:'site',customer:'site',line:'site',wp:'site',
              group:'group',group1:'group',process:'group',proc:'group'};
GST._ctxKind=function(k){ return GST._CTX_MAP[k]||''; };
GST.ctxSave = function(F){
  if(!F) return;
  try{
    const cur=JSON.parse(sessionStorage.getItem('gst_ctx')||'{}');
    let touched=false;
    Object.keys(F).forEach(function(k){
      const kind=GST._ctxKind(k); if(!kind) return;
      const v=F[k];
      if(typeof v!=='string'||v==='ALL'||!v) return;
      cur[kind]=v; touched=true;
    });
    if(touched){ cur.t=Date.now(); sessionStorage.setItem('gst_ctx', JSON.stringify(cur)); }
  }catch(e){}
};
GST.ctxLoad = function(){
  try{
    const c=JSON.parse(sessionStorage.getItem('gst_ctx')||'{}');
    if(c.t && Date.now()-c.t > 30*60*1000) return {};   // 30분 지나면 승계하지 않음
    return c;
  }catch(e){ return {}; }
};
GST._ctxPend = GST.ctxLoad();
// 이어온 컨텍스트를 이 페이지의 필터 위젯(셀렉트·칩)에 한 번 적용한다.
// 사용자가 이미 고른 값이 있으면 건드리지 않고, 값이 목록에 없으면 조용히 넘어간다.
GST._CTX_IDS={site:['sl-site','sl-country','sl-customer','sl-line','sl-wp','sl-cust'],
              group:['sl-group','sl-proc','sl-process','sl-group1']};
GST.ctxApply=function(){
  const c=GST._ctxPend||{};
  if(!c.site && !c.group) return true;
  let done=false, waiting=false;
  Object.keys(GST._CTX_IDS).forEach(function(kind){
    const want=c[kind]; if(!want) return;
    for(let i=0;i<GST._CTX_IDS[kind].length;i++){
      const el=document.getElementById(GST._CTX_IDS[kind][i]); if(!el) continue;
      if(el.tagName==='SELECT'){
        if(el.options.length<=1){ waiting=true; continue; }     // 아직 '전체'뿐 = 데이터 로딩 중
        if(el.value) return;                                   // 이미 선택돼 있으면 존중
        const hit=[].slice.call(el.options).some(function(o){ return o.value===want; });
        if(!hit) continue;
        el.value=want; el.dispatchEvent(new Event('change',{bubbles:true})); done=true; return;
      }
      const chips=[].slice.call(el.querySelectorAll('.chip,.pchip,button'));
      if(chips.length<=1){ waiting=true; continue; }
      const act=chips.filter(function(x){ return x.classList.contains('active'); })[0];
      if(act && !/전체|^all$/i.test((act.textContent||'').trim())) return;
      const hit=chips.filter(function(x){ return (x.textContent||'').trim()===want; })[0];
      if(hit){ hit.click(); done=true; return; }
    }
  });
  return done || !waiting;
};

// ── 설비(S/N) 드릴다운 ──
// 표의 S/N 열을 클릭하면 같은 설비를 다른 페이지에서 열 수 있는 메뉴가 뜬다.
// 표 마크업을 바꾸지 않는다 — 헤더 텍스트로 S/N 열을 알아낸다.
// 설비 단위 필터를 가진 페이지만 대상 (자재 실적은 사용자 요청으로 제외, TCO는 설비 검색이 없어 제외)
GST.SN_PAGES=[{id:'scrubber',ko:'설치 현황',en:'Installation'},{id:'pm',ko:'PM 점검',en:'PM'},
              {id:'fault',ko:'고장 분석',en:'Fault'},{id:'cip',ko:'CIP 현황',en:'CIP'}];
GST._snHdr=/(^|[^a-z])s\/?n([^a-z]|$)|serial|설비\s*번호|설비코드/i;
GST._snOf=function(td){
  if(!td||!td.parentNode||td.tagName!=='TD') return '';
  const tbl=td.closest('table'); if(!tbl) return '';
  const idx=[].indexOf.call(td.parentNode.children, td);
  const hr=tbl.querySelector('thead tr')||tbl.rows[0]; if(!hr) return '';
  const h=(hr.children[idx]||{}).textContent||'';
  if(!GST._snHdr.test(h)) return '';
  const v=(td.textContent||'').trim();
  return (v.length>=3 && v!=='-' && v!=='—') ? v : '';
};
GST.snMenu=function(sn, x, y){
  const old=document.getElementById('gstSnMenu'); if(old)old.remove();
  const here=(location.pathname.match(/\/([a-z]+)\/?$/)||[])[1]||'';
  const lang=(function(){ try{ return sessionStorage.getItem('gst_lang')||'ko'; }catch(e){ return 'ko'; } })();
  const m=document.createElement('div'); m.id='gstSnMenu';
  m.style.cssText='position:fixed;z-index:9999;min-width:180px;background:var(--glass,#111823);'
    +'border:1px solid var(--glass-border,rgba(151,170,196,.2));border-radius:10px;padding:8px;'
    +'box-shadow:0 10px 30px rgba(0,0,0,.45);font-size:12px;color:var(--txt-main,#E6EDF3);backdrop-filter:blur(10px)';
  let h='<div style="font-size:10px;font-weight:800;letter-spacing:1px;opacity:.7;margin:2px 4px 7px">'
       +sn.replace(/</g,'&lt;')+'</div>';
  GST.SN_PAGES.filter(p=>p.id!==here).forEach(function(p){
    h+='<button type="button" data-go="'+p.id+'" style="display:block;width:100%;text-align:left;'
      +'background:transparent;border:none;color:inherit;font:inherit;padding:6px 8px;border-radius:7px;cursor:pointer">'
      +'→ '+(lang==='ko'?p.ko:p.en)+'</button>';
  });
  m.innerHTML=h;
  document.body.appendChild(m);
  const w=m.offsetWidth, hh=m.offsetHeight;
  m.style.left=Math.max(6,Math.min(x, innerWidth-w-8))+'px';
  m.style.top =Math.max(6,Math.min(y, innerHeight-hh-8))+'px';
  m.addEventListener('mouseover',e=>{const b=e.target.closest('button'); if(b)b.style.background='var(--glass-hover,#16202C)';});
  m.addEventListener('mouseout', e=>{const b=e.target.closest('button'); if(b)b.style.background='transparent';});
  m.addEventListener('click',function(e){
    const b=e.target.closest('[data-go]'); if(!b)return;
    m.remove(); GST.goTab(b.dataset.go,{sn:sn});
  });
  setTimeout(function(){
    document.addEventListener('click',function close(){ const el=document.getElementById('gstSnMenu'); if(el)el.remove();
      document.removeEventListener('click',close); },{once:true});
  },0);
};
// 다른 탭에서 넘어온 설비 필터 적용 — 페이지가 window.applyState를 정의했으면 그쪽이 우선
GST.applyState=function(o){
  if(!o) return false;
  if(typeof global.applyState==='function'){ try{ return global.applyState(o)!==false; }catch(e){} }
  if(!o.sn) return false;
  const sels=['#sl-sn','#sl-eq','#sl-q','#search','#q','#sl-search','.search-sl input','input[placeholder*="S/N"]'];
  for(let i=0;i<sels.length;i++){
    const el=document.querySelector(sels[i]); if(!el) continue;
    if(el.tagName==='SELECT'){
      const hit=[].slice.call(el.options).some(function(op){ return op.value===o.sn; });
      if(!hit) continue;
    }
    el.value=o.sn;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  return false;
};
function gstSnStart(){
  // S/N 열 위에서만 커서·밑줄로 클릭 가능함을 알린다 (표가 다시 그려져도 유효)
  document.addEventListener('mouseover',function(e){
    const td=e.target&&e.target.closest?e.target.closest('td'):null; if(!td||td.dataset.gstSn)return;
    if(!GST._snOf(td))return;
    td.dataset.gstSn='1'; td.style.cursor='pointer';
    td.style.textDecoration='underline dotted'; td.style.textUnderlineOffset='3px';
    td.title='다른 페이지에서 이 설비 보기';
  },true);
  document.addEventListener('click',function(e){
    const td=e.target&&e.target.closest?e.target.closest('td'):null; if(!td)return;
    const sn=GST._snOf(td); if(!sn)return;
    e.preventDefault(); e.stopPropagation();
    GST.snMenu(sn, e.clientX, e.clientY);
  },true);
  // 시작 시 ?f= 로 들어온 설비 필터 적용 (셸이 새 탭을 열 때 경로)
  const st=GST.readState();
  if(st&&st.sn){ let n=0; const tick=setInterval(function(){
    if(GST.applyState(st)||++n>40) clearInterval(tick); },300); return; }
  // 드릴다운이 아니면 다른 탭에서 보던 사이트·공정을 이어받는다
  let m=0; const t2=setInterval(function(){ if(GST.ctxApply()||++m>25) clearInterval(t2); },400);
}

function gstAutoStart(){
  try{ GST.autoSidebar(); }catch(e){}
  try{ GST.startAutoRefresh(10); }catch(e){}
  try{ gstSnStart(); }catch(e){}
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', gstAutoStart);
}else{
  setTimeout(gstAutoStart, 0);
}

global.GST = GST;
})(window);
