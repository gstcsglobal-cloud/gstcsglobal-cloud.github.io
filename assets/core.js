/* ============================================================
   GST Dashboard Core Engine v1.0
   모든 대시보드가 공유하는 로직 계층.
   여기를 고치면 전체 대시보드에 적용됩니다.
   구성: 날짜 · CSV · 집계 · 차트 팩토리 · 필터 · 셸 동기화
   ============================================================ */
(function(global){
'use strict';
const GST = {};

/* ---------- 0. 폰트 단일 출처 ----------
   DOM은 theme.css가, 캔버스(ctx.font·Chart.defaults)는 이 상수가 담당한다.
   두 곳이 어긋나면 차트 안 글자만 다른 폰트가 되므로 반드시 여기서만 바꾼다. */
GST.FONT_STACK = '"Pretendard Variable",Pretendard,"Segoe UI","Malgun Gothic",sans-serif';
GST.font = function(px, weight){ return (weight||400)+' '+px+'px '+GST.FONT_STACK; };
// 웹폰트는 첫 렌더보다 늦게 도착할 수 있다 — 캔버스는 스스로 다시 그리지 않으므로
// 폰트 준비가 끝나면 한 번 재렌더해서 폴백 메트릭으로 그려진 차트를 교정한다.
if (typeof document!=='undefined' && document.fonts && document.fonts.ready){
  document.fonts.ready.then(function(){
    try{ if(typeof window!=='undefined' && typeof window.render==='function') window.render(); }catch(e){}
  });
}

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
    ov.innerHTML='<div style="max-width:340px;background:#0d141c;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:28px;text-align:center;font-family:\'Pretendard Variable\',Pretendard,\'Segoe UI\',\'Malgun Gothic\',sans-serif">'
      +'<div style="font-size:17px;font-weight:800;color:#ffb4b4;margin-bottom:8px">인증이 설정되지 않았습니다</div>'
      +'<div style="font-size:12px;color:#8a97a5">관리자에게 문의하세요</div></div>';
    return new Promise(function(){});   // 절대 resolve하지 않음 → 페이지가 열리지 않는다
  }
  var s=await GST.getSession();
  if(s){ ov.classList.add('hidden'); ov.style.display='none'; GST._authOk(); return true; }
  ov.classList.remove('hidden'); ov.style.display='flex';
  ov.innerHTML='<div class="login-card" style="max-width:340px;width:90%;background:#0d141c;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:28px;text-align:center;font-family:\'Pretendard Variable\',Pretendard,\'Segoe UI\',\'Malgun Gothic\',sans-serif">'
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
  ov.innerHTML='<div class="login-card" style="max-width:360px;background:#0d141c;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:28px;text-align:center;font-family:\'Pretendard Variable\',Pretendard,\'Segoe UI\',\'Malgun Gothic\',sans-serif">'
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
  ocean:  {label:'Ocean',  colors:['#5B9BD8','#D9A441','#3FAE8A','#9B8FE8','#D08A5E','#7CA982','#C97FB0','#E07A85']},
  forest: {label:'Forest', colors:['#3FAE8A','#9B8FE8','#D9A441','#5B9BD8','#E07A85','#7CA982','#C97FB0','#D08A5E']},
  sunset: {label:'Sunset', colors:['#E07A85','#5B9BD8','#D9A441','#3FAE8A','#9B8FE8','#7CA982','#C97FB0','#D08A5E']}
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
/* 차트 전역 규격 — 8개 페이지가 각자 설정하던 것을 한 곳으로.
   페이지는 로드 시와 테마 전환 시 GST.chartDefaults()만 부른다.
   개별 차트가 명시한 옵션은 여전히 이긴다(Chart.js 옵션 우선순위). */
GST.chartDefaults = function(){
  if(typeof Chart==='undefined') return;
  const TH=GST.chartTheme();
  Chart.defaults.color = TH.txt;
  Chart.defaults.font.family = GST.FONT_STACK;
  Chart.defaults.font.size = 11;
  Chart.defaults.borderColor = TH.grid;
  // 범례: 점 스타일 — 사각 스와치보다 정돈된 인상
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 6;
  Chart.defaults.plugins.legend.labels.boxHeight = 6;
  Chart.defaults.plugins.legend.labels.padding = 14;
  // 툴팁: 다크 글래스 — 테마와 무관하게 일관(라이트에서도 다크 툴팁이 가독 우수)
  const tt=Chart.defaults.plugins.tooltip;
  tt.backgroundColor='rgba(13,20,28,.92)'; tt.borderColor='rgba(151,170,196,.25)'; tt.borderWidth=1;
  tt.cornerRadius=8; tt.padding=10; tt.titleColor='#E6EDF3'; tt.bodyColor='#B7C3D3';
  tt.titleFont={family:GST.FONT_STACK,size:11.5,weight:'700'};
  tt.bodyFont={family:GST.FONT_STACK,size:11};
  tt.boxPadding=4; tt.usePointStyle=true;
  // 막대 기하 — 페이지마다 2~6으로 흩어져 있던 radius를 한 값으로, 두께 상한으로 과비만 방지
  Chart.defaults.elements.bar.borderRadius = 4;
  Chart.defaults.datasets.bar.maxBarThickness = 34;
};
try{ GST.chartDefaults(); }catch(e){}

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
  const datasets = [{type:'bar', label:'건수', data:o.data, backgroundColor:o.color}];
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
/* ---------- 9-b. 시트 열 자동 매핑 (헤더 이름 → 열 번호) ----------
   열 번호를 코드에 박아두면 시트에 열이 하나만 끼어들어도 전 지표가 조용히 틀어진다.
   (교육현황에 Scrubber Lv.2/Lv.3 두 열이 들어왔을 때 실제로 그렇게 깨졌다.)
   여기서는 헤더 '이름'으로 위치를 찾는다. 규칙은 셋뿐:
     · 정규화 후 정확일치 — 부분일치는 쓰지 않는다
       ('입사일'이 '재입사일'을, 'no'가 'note'를 잡는 사고를 막는다)
     · 이름이 바뀔 수 있으면 별칭 배열로 나열한다 — 앞에서부터 먼저 맞는 것을 쓴다
     · 못 찾으면 조용히 넘어가지 않는다 — miss에 남기고 진단 패널·배너로 띄운다
   열이 중간에 끼어들거나 순서가 바뀌는 것은 이제 코드 수정 없이 따라간다. */
GST.SM = {};
// 줄바꿈·공백·마침표·중점·괄호·슬래시·밑줄·하이픈을 지우고 전각→반각 후 소문자.
// 'Scrubber⏎Lv.2' · 'scrubber lv2' · 'SCRUBBER_LV-2' 를 모두 같은 것으로 본다.
GST.SM.norm = function(s){
  const t = GST.nfw ? GST.nfw(String(s==null?'':s)) : String(s==null?'':s);
  return t.replace(/[\s.·()[\]{}/\\_-]/g,'').toLowerCase();
};
/* 힌트로 준 이름이 '모두' 들어 있는 첫 행을 헤더로 본다. 못 찾으면 -1.
   힌트 하나가 이름이 바뀌었다고 시트 전체가 죽지 않도록, 각 힌트는 배열(별칭)도 받는다.
   ['실적코드', ['자재명','부품명']] → 앞은 정확일치, 뒤는 둘 중 하나만 있으면 통과. */
GST.SM.headerRow = function(rows, hints, scan){
  const want=(hints||[]).map(h=>[].concat(h).map(GST.SM.norm)), n=Math.min((rows||[]).length, scan||12);
  for(let i=0;i<n;i++){
    const h=(rows[i]||[]).map(GST.SM.norm);
    if(want.every(alts=>alts.some(w=>h.indexOf(w)>=0))) return i;
  }
  return -1;
};
/* spec = {name, gid, hints:[], scan, opt:[], fields:{논리명:'헤더명' | ['별칭1','별칭2']}}
   반환 = {ok, hi, C:{논리명:열번호(-1=못찾음)}, miss:[], dup:[]}
   C는 기존 하드코딩 상수와 같은 모양이라 하위 코드(r[C.alarm] 등)는 손대지 않아도 된다. */
GST.SM.map = function(rows, spec){
  const hi=GST.SM.headerRow(rows, spec.hints, spec.scan);
  const out={sheet:spec.name||'', hi:hi, C:{}, miss:[], dup:[], ok:false};
  const opt=spec.opt||[];
  if(hi<0){
    Object.keys(spec.fields).forEach(k=>{ out.C[k]=-1; });
    out.miss.push('헤더 행 자체를 찾지 못함 (힌트: '+(spec.hints||[]).join(' + ')+')');
    GST.SM._log(out); return out;
  }
  const H=(rows[hi]||[]).map(GST.SM.norm), at={};
  H.forEach((h,i)=>{ if(h) (at[h]=at[h]||[]).push(i); });
  Object.keys(spec.fields).forEach(function(k){
    const names=[].concat(spec.fields[k]);
    let idx=-1;
    for(let i=0;i<names.length;i++){
      const hit=at[GST.SM.norm(names[i])];
      if(hit&&hit.length){
        idx=hit[0];
        // 같은 이름 열이 둘 이상이면 첫 번째를 쓰되, 사람이 볼 수 있게 남긴다
        if(hit.length>1) out.dup.push(k+' "'+names[i]+'" → '+hit.map(c=>c+1).join('·')+'열 (첫 번째 사용)');
        break;
      }
    }
    out.C[k]=idx;
    if(idx<0 && opt.indexOf(k)<0) out.miss.push(k+' ['+names.join(' / ')+']');
  });
  out.ok=!out.miss.length;
  GST.SM._log(out); return out;
};
// 값 꺼내기 — 못 찾은 열(-1)은 r[-1]=undefined가 되므로 반드시 이걸 거친다
GST.SM.val = function(row, C, k){
  const i=C[k]; return (i>=0 && row && row[i]!=null) ? String(row[i]).trim() : '';
};
/* ---- 시트 정의 (실제 시트 헤더 기준) ----
   여러 페이지가 같은 시트를 각자 파싱하다 갈라지는 것을 막으려고 여기 한 곳에만 둔다.
   시트에서 열 이름이 바뀌면 별칭 배열에 새 이름을 한 줄 추가하면 전 페이지가 같이 따라온다. */
GST.SM.SPEC = {
  // 수선실적 gid 646668307 — 헤더 67개, 정규화 후 중복 없음
  wk: { name:'수선실적', gid:'646668307', hints:['실적코드','작업단계'],
    // 알람유형·현상·원인·조치는 현재 입력률이 낮다(BM 기준 4~10%).
    // 열 자체는 있으므로 매핑해 두고, 데이터가 차면 관련 차트가 자동으로 살아난다.
    opt:['alarm','phenom','cause','actionDetail','reqType','chamber'],
    fields:{
      pg:'제품군', op:'운영단위', customer:'고객사', campus:'단지', line:'라인', bay:'BAY',
      proc:'공정', subproc:'세부공정', model:'MODEL(자사)', rsCode:'실적코드', status:'상태',
      reqType:'의뢰유형', stage:'작업단계', chamber:'챔버', wrs:'WRS NO', mainEq:'메인설비호기',
      prodCode:'제품코드', eqNo:'설비호기', chpos:'채널위치', snIn:'S/N(IN)', snOut:'S/N(OUT)',
      pf:'유/무상', alarm:'알람유형', phenom:'현상', cause:'원인', action:'조치',
      actionDetail:'세부조치내용', dStart:'작업시작일', dEnd:'작업종료일',
      tStart:'작업시작시간', tEnd:'작업종료시간', regDate:'실적등록일', shipDate:'출하일자',
      moveMin:'총 이동시간(분)', workMin:'작업시간(분)', manMin:'작업공수',
      workers:'작업자', workerCnt:'작업자수'
    }},
  // 자재실적 gid 31302669 — 헤더 41개, 중복 없음
  mat: { name:'자재실적', gid:'31302669', hints:['수선실적번호',['자재코드','자재명']],
    // UNIT·ASSEMBLY·PART는 현재 전부 공란이라 자재명으로 대체해 쓴다. 채워지면 자동 반영.
    opt:['unit','assembly','part','custMatCode','warrantyTerm','kitSn','snIn','snOut'],
    fields:{
      op:'운영단위', customer:'고객사', rsCode:'수선실적번호', campus:'단지', line:'라인',
      bay:'BAY', proc:'공정', detail:'세부공정', mainEq:'메인설비호기', eq:'설비호기',
      chamber:'챔버', sn:'S/N', wo:'W/O번호', model:'모델명', matCode:'자재코드',
      custMatCode:'고객사자재코드', eqPos:'설비위치', unit:'UNIT', assembly:'ASSEMBLY',
      part:'PART', matPos:'자재위치', qty:'사용수량', matName:'자재명', spec:'규격',
      reason:'교체사유', prevPaidDate:'전유상교체일', prevDate:'전교체일',
      workDate:'자재실적일자', daysPaid:'사용일(유상기준)', daysPrev:'사용일(전교체일기준)',
      pf:'유/무상', freeReason:'무상사유', warrantyTerm:'자재보증기간', price:'단가',
      kitSn:'KIT S/N', snIn:'IN SN', snOut:'OUT SN', stockChk:'재고체크여부', store:'자재창고'
    }},
  // 설치현황 gid 891608329 — 128열. 'Type'은 44·79·96열에 중복이라 절대 쓰지 않고,
  // 챔버 판정에는 'Scrubber type'(75열)만 쓴다. 'Main Tool ID'도 17·30 중복(첫 번째 사용).
  inst: { name:'설치현황', gid:'891608329', hints:['Scrubber CODE','FAB'],
    opt:['toolId','pmCycle','warrantyDate','start','group2','detail2'],
    fields:{
      pjt:'PJT.', country:'Country', customer:'Customer', location:'Location',
      code:'Scrubber CODE', sn:'Scrubber S/N', model:'Scrubber Model', burner:'Burner Type',
      fab:'FAB', floor:'Floor', bay:'Bay', group1:'Group_1', group2:'Group_2',
      detail1:'Detail_1', detail2:'Detail_2', toolId:'Main Tool ID',
      toolMaker:'Main Tool Maker', toolModel:'Main Tool Model',
      fabIn:'FAB In', start:'Start', turnOn:'Turn On',
      warrantyDate:'Warranty date', warranty:'Warranty In/Out',
      pmCycle:'Target PM Cycle', type:'Scrubber type'
    }}
};
// 매핑 결과 누적 — 진단 패널이 읽는다
GST.SM._reg = [];
GST.SM._log = function(res){
  GST.SM._reg = GST.SM._reg.filter(r=>r.sheet!==res.sheet).concat([res]);
  const bad=GST.SM._reg.filter(r=>r.miss.length);
  if(bad.length) GST.SM.banner(bad);
};
// 못 찾은 열이 있으면 배너로 알린다 — 조용히 틀린 숫자를 보여주지 않는 것이 핵심
GST.SM.banner = function(bad){
  let el=document.getElementById('gstColWarn');
  if(!bad||!bad.length){ if(el)el.remove(); return; }
  const lines=bad.map(r=>r.sheet+': '+r.miss.slice(0,3).join(' · ')+(r.miss.length>3?' 외 '+(r.miss.length-3)+'건':''));
  if(!el){
    el=document.createElement('div'); el.id='gstColWarn';
    el.style.cssText='background:#7f1d1d;color:#fff;padding:11px 16px;border-radius:10px;margin:0 0 14px;font-size:12px;font-weight:600;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:pointer';
    el.title='클릭하면 열 인식 상태를 자세히 봅니다';
    el.onclick=GST.SM.panel;
    const anchor=document.querySelector('.status')||document.body.firstElementChild;
    if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
    else document.body.insertAdjacentElement('afterbegin', el);
  }
  el.textContent='⚠️ 시트에서 찾지 못한 열이 있습니다 — 해당 항목은 비어 보입니다. ('+lines.join(' | ')+') 클릭하면 상세';
};
/* 열 인식 상태 진단 — 어떤 항목이 몇 번 열로 잡혔는지, 못 찾은 건 무엇인지 한눈에.
   시트를 바꾼 뒤 여기만 보면 30초 안에 확인이 끝난다. 콘솔에서 GST.SM.panel()로도 연다. */
GST.SM.panel = function(){
  const old=document.getElementById('gstColPanel'); if(old){ old.remove(); return; }
  const wrap=document.createElement('div'); wrap.id='gstColPanel';
  wrap.style.cssText='position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px';
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  let html='<div style="background:var(--card,#161b22);color:var(--fg,#e6edf3);max-width:900px;width:100%;max-height:84vh;overflow:auto;border-radius:14px;padding:20px 22px;box-shadow:0 18px 50px rgba(0,0,0,.5)">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
    +'<b style="font-size:15px">시트 열 인식 상태</b>'
    +'<span style="opacity:.6;font-size:12px">닫기 ✕</span></div>'
    +'<div style="opacity:.65;font-size:11.5px;margin-bottom:14px">헤더 이름으로 찾은 결과입니다. 열이 끼어들거나 순서가 바뀌어도 따라가지만, <b>이름이 바뀌면</b> 여기 "못 찾음"으로 뜹니다.</div>';
  if(!GST.SM._reg.length) html+='<div style="opacity:.6">아직 매핑된 시트가 없습니다.</div>';
  GST.SM._reg.forEach(function(r){
    const found=Object.keys(r.C).filter(k=>r.C[k]>=0);
    html+='<div style="margin:0 0 16px"><div style="font-weight:700;margin-bottom:5px">'+esc(r.sheet)
      +' <span style="font-weight:400;opacity:.6;font-size:11.5px">헤더 '+(r.hi>=0?(r.hi+1)+'행':'못 찾음')
      +' · 인식 '+found.length+'/'+Object.keys(r.C).length+'</span></div>';
    if(r.miss.length) html+='<div style="background:#7f1d1d;padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:6px"><b>못 찾음</b> — '+esc(r.miss.join(' · '))+'</div>';
    if(r.dup.length)  html+='<div style="background:#78350f;padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:6px"><b>이름 중복</b> — '+esc(r.dup.join(' · '))+'</div>';
    html+='<div style="display:flex;flex-wrap:wrap;gap:4px 8px;font-size:11.5px;opacity:.85">'
      +found.map(k=>esc(k)+'<span style="opacity:.5">→'+(r.C[k]+1)+'</span>').join(' · ')+'</div></div>';
  });
  html+='</div>';
  wrap.innerHTML=html;
  wrap.onclick=function(e){ if(e.target===wrap||e.target.textContent==='닫기 ✕') wrap.remove(); };
  document.body.appendChild(wrap);
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
      // 값이 0/빈 구간에는 링을 찍지 않는다. 막대 차트에서 0은 요소 높이가 0이라
      // 링이 x축 선 위에 그려져 "정체불명의 빨간 동그라미"로 보인다.
      var v=arr[i]; if(v==null||!isFinite(v)||v===0) return;
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

// 전각(ＦＵＬＬＷＩＤＴＨ) 영숫자·기호를 반각으로 정규화한다.
// 대만/중국 쪽 입력기로 친 시트 값에 ＰＳＭＣ·Ｆ１６ 같은 전각 문자열이 섞여 들어오는데,
// 그대로 두면 PSMC와 ＰＳＭＣ가 서로 다른 라인으로 집계된다(실측 722건).
// 한글·한자·가나는 건드리지 않는다 — 대상은 U+FF01~U+FF5E(전각 ASCII)와 전각 공백뿐이다.
GST.nfw = function(s){
  s = (s==null) ? '' : String(s);
  if(!/[！-～　]/.test(s)) return s;   // 대부분의 값은 여기서 즉시 반환(비용 0)
  return s.replace(/[！-～]/g, function(c){ return String.fromCharCode(c.charCodeAt(0)-0xFEE0); })
          .replace(/　/g, ' ');
};
// 그룹 키 비교용 대문자화 — 전각 정규화까지 한 번에
GST.upk = function(s){ return GST.nfw(s).toUpperCase(); };

/* ============================================================
   17. 차트 디자인(스타일) — 전 페이지 공통 1개 키
   기존 report(gst_rpt_style)·hr(gst_hr_style)·사이드바 팔레트(gst_pal)가
   따로 놀던 것을 gst_chart_style 하나로 합쳤다. 최초 1회 자동 이관.
   ============================================================ */
/* 차트 디자인 3종 — "많은 선택지"보다 "전부 고급"이 낫다 (사용자 확정).
   ocean/sunset/forest는 제거 — 저장값이 그 키였던 사용자는 로더의 폴백으로 Aurora가 된다.
   키 'vivid'/'cb'는 localStorage 하위호환을 위해 유지하고 라벨만 바꾼다. */
GST.STY = {
  vivid:   {lbl:'Aurora',   bar:'#2C5FAE', last:'#5EC2FF', bar2:'#7C6FE0', line:'#5EC2FF', lnG:'#34D399', lnV:'#A78BFA',
            site:['#2C5FAE','#38BDF8','#5EC2FF','#7C6FE0','#34D399','#D9A441'],
            pal8:['#5B9BD8','#3FAE8A','#D9A441','#9B8FE8','#E07A85','#7CA982','#C97FB0','#D08A5E']},
  /* QBR 보고서와 동일 룩 — 회색 막대(보조=진회색) + 빨간 점선 + 원형 마커 + 회색조 라인 팔레트 */
  graphite:{lbl:'Global CS', bar:'#A6A6A6', last:'#A6A6A6', bar2:'#404040', line:'#FF0000', lnG:'#0D0DF7', lnV:'#7F7F7F',
            lnH:'#0D0DF7', lnP:'#FF0000', qbr:true,
            site:['#404040','#595959','#7F7F7F','#A6A6A6','#BFBFBF','#D9D9D9'],
            pal8:['#A6A6A6','#404040','#7F7F7F','#FF0000','#595959','#BFBFBF','#D9D9D9','#0D0DF7']},
  cb:      {lbl:'Safe',     bar:'#0072B2', last:'#56B4E9', bar2:'#CC79A7', line:'#D55E00', lnG:'#009E73', lnV:'#E69F00',
            site:['#0072B2','#E69F00','#009E73','#CC79A7','#56B4E9','#D55E00'],
            pal8:['#0072B2','#E69F00','#009E73','#CC79A7','#56B4E9','#D55E00','#F0E442','#666666']}
};
GST.STY_ORDER = ['vivid','graphite','cb'];
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
  ko:{w:'주별',m:'월별',note:'최근 12개 구간',note1:'마감 월만',cut:'마감',mon:'Month',wk:'Week',clr:'마감 해제',sty:'차트 디자인',ppt:'PPT 저장',latest:'— 최신 —',na:'이 페이지에서는 사용되지 않습니다',brf:'브리핑',piv:'피벗',
      spanOnT:'최근 12개 구간을 봅니다 — 누르면 마감 월만',spanOffT:'마감으로 지정한 달만 봅니다 — 누르면 최근 12개 구간'},
  en:{w:'Weekly',m:'Monthly',note:'Last 12',note1:'Cut-off month',cut:'Cut-off',mon:'Month',wk:'Week',clr:'Clear cut-off',sty:'Chart style',ppt:'Export PPT',latest:'— Latest —',na:'Not used on this page',brf:'Briefing',piv:'Pivot',
      spanOnT:'Showing last 12 periods — click for cut-off month only',spanOffT:'Showing the cut-off month only — click for last 12 periods'},
  zh:{w:'周',m:'月',note:'最近12期',note1:'仅截止月',cut:'截止',mon:'月',wk:'周',clr:'清除截止',sty:'图表配色',ppt:'导出PPT',latest:'— 最新 —',na:'此页面不适用',brf:'简报',piv:'透视',
      spanOnT:'显示最近12期 — 点击切换为仅截止月',spanOffT:'仅显示截止月 — 点击切换为最近12期'},
  ja:{w:'週別',m:'月別',note:'直近12区間',note1:'締め月のみ',cut:'締め',mon:'Month',wk:'Week',clr:'締め解除',sty:'チャート配色',ppt:'PPT出力',latest:'— 最新 —',na:'このページでは使用されません',brf:'ブリーフ',piv:'ピボット',
      spanOnT:'直近12区間を表示 — クリックで締め月のみ',spanOffT:'締め月のみ表示 — クリックで直近12区間'}
};
// reg = {caps:{period,cutoff:'wm'|'m'|false,style,ppt}, state:{period,endM,endW,style}, weeks:[{v,t}]}
// 전 페이지 **동일 세트**를 항상 렌더한다 — 지원하지 않는 컨트롤은 비활성(.off)으로
// 자리만 유지해 페이지를 옮겨도 바의 구성·폭이 변하지 않는다.
GST.barHTML = function(reg, lang){
  const T = GST.BAR_T[lang] || GST.BAR_T.ko;
  const c = (reg && reg.caps) || {}, s = (reg && reg.state) || {};
  const off = function(on){ return on ? '' : ' off" title="'+T.na; };   // 비활성엔 이유 툴팁
  const dis = function(on){ return on ? '' : ' disabled'; };
  let h='';
  // 주/월 토글 (추이 차트가 있는 페이지만 활성)
  h+='<span class="gb-seg'+off(c.period)+'">'
    +'<button type="button" class="gb-b'+(c.period&&s.period==='w'?' on':'')+'" data-gb="period" data-v="w"'+dis(c.period)+'>'+T.w+'</button>'
    +'<button type="button" class="gb-b'+(c.period&&s.period==='m'?' on':'')+'" data-gb="period" data-v="m"'+dis(c.period)+'>'+T.m+'</button>'
    +'</span>'
  // 구간 범위 토글 — 켜면 최근 12구간, 끄면 마감 월만 (전 페이지 공통)
  // 전역 상태(localStorage)를 직접 읽는다 — 페이지가 보고한 값은 탭 전환 시 낡을 수 있다
    +(function(){ const sp=GST.span12();
      return '<button type="button" class="gb-b'+(sp?' on':'')+off(c.period)+'" data-gb="span" title="'
        + (sp?T.spanOnT:T.spanOffT) +'"'+dis(c.period)+'>'+(sp?T.note:T.note1)+'</button>'; })();
  // 마감 — Month는 전 페이지, Week는 주간 마감을 갖는 페이지(report·cip)만 활성
  const hasCut = !!c.cutoff, hasWk = c.cutoff==='wm';
  h+='<span class="gb-note gb-cut'+off(hasCut)+'">'+T.cut+'</span>'
    +'<input type="month" class="gb-inp'+off(hasCut)+'" data-gb="endM" title="'+T.mon+'" value="'+(hasCut?(s.endM||''):'')+'"'+dis(hasCut)+'>';
  const ws=(hasWk&&reg&&reg.weeks)||[];
  h+='<select class="gb-inp'+off(hasWk)+'" data-gb="endW" title="'+T.wk+'"'+dis(hasWk)+'><option value="">'+T.latest+'</option>'
    + ws.map(function(w){ return '<option value="'+w.v+'"'+(s.endW===w.v?' selected':'')+'>'+w.t+'</option>'; }).join('')
    +'</select>'
    +'<button type="button" class="gb-b'+off(hasCut)+'" data-gb="clear" title="'+T.clr+'"'+dis(hasCut)+'>↺</button>';
  // 차트 디자인·PPT — 전 페이지 공통
  const st=GST.STY[s.style]||GST.sty();
  h+='<button type="button" class="gb-b'+off(c.style!==false)+'" data-gb="style" title="'+T.sty+'">🎨 <span class="gb-sty">'+st.lbl+'</span></button>'
    +'<button type="button" class="gb-b'+off(!!c.ppt)+'" data-gb="ppt" title="'+T.ppt+'"'+dis(!!c.ppt)+'>📊 PPT</button>';
  // 브리핑·피벗 — 페이지가 GST.watch()/GST.pivotReg()로 데이터를 등록하면 자동 활성
  // 배지는 건수가 0이어도 자리를 비워 둔다 — 있고 없고에 따라 바 폭이 달라지면
  // 페이지를 옮길 때마다 툴바가 흔들리고 탭이 밀린다(전 페이지 동일 폭 원칙).
  h+='<button type="button" class="gb-b'+off(!!c.brief)+'" data-gb="brief" title="'+T.brf+'"'+dis(!!c.brief)+'>🔔 '+T.brf
    + '<span class="gb-badge"'+(s.briefN?'':' style="visibility:hidden"')+'>'+(s.briefN||0)+'</span></button>'
    +'<button type="button" class="gb-b'+off(!!c.pivot)+'" data-gb="pivot" title="'+T.piv+'"'+dis(!!c.pivot)+'>🧊 '+T.piv+'</button>';
  return h;
};
// 바 안의 컨트롤을 send(key,val)로 연결. 셸/페이지 양쪽이 같은 함수를 쓴다.
GST.barBind = function(root, send){
  root.addEventListener('click', function(e){
    const b=e.target.closest('[data-gb]'); if(!b||b.tagName==='INPUT'||b.tagName==='SELECT')return;
    const k=b.dataset.gb;
    // span은 "뒤집어라"가 아니라 **새 값**을 보낸다 — 여러 프레임에 뿌려도 결과가 같아야 한다
    send(k, k==='period' ? b.dataset.v : k==='span' ? !GST.span12() : null);
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
    const w=function(){
      const out=r.apply(this,arguments);
      try{ GST.barSync(); }catch(e){}
      // 렌더 직후 ⚙ 버튼 부착 + 저장된 축 경계 적용 (capbtns가 렌더 뒤에 생기는 페이지 대비 1틱 지연)
      try{ setTimeout(function(){ GST.axBtns(); GST.axbApply(); },0); }catch(e){}
      return out;
    };
    w.__gstBar=true; global.render=w; return true;
  }
  if(!wrap()) document.addEventListener('DOMContentLoaded', wrap);
  GST.barSync();
};
// 페이지가 render() 말미에 호출: 현재 상태를 바에 되쏜다
GST.barSync = function(){
  const s=GST._bar; if(!s) return;
  // 브리핑·피벗은 페이지가 데이터를 등록했는지로 자동 판단 — caps에 따로 적지 않아도 된다
  const caps=Object.assign({}, s.caps||{});
  const st=(typeof s.state==='function')?(s.state()||{}):{};
  st.span12=GST.span12();     // 구간 범위 토글은 전 페이지 공통 상태 — 페이지가 보고하지 않아도 된다
  if((GST._watch||[]).length){ caps.brief=true; try{ st.briefN=GST.briefFind().filter(function(f){return f.sev==='bad'||f.sev==='warn';}).length; }catch(e){} }
  if(GST._pivot) caps.pivot=true;
  const reg={type:'gst-bar-reg', caps:caps, state:st,
             weeks:(typeof s.weeks==='function')?s.weeks():null};
  if(window.self!==window.top){ try{ window.parent.postMessage(reg,'*'); }catch(e){} }
  else GST._localBar(reg);
};
GST._barDo = function(key, val){
  if(key==='brief'){ GST.briefOpen(); return; }
  if(key==='pivot'){ GST.pivotOpen(); return; }
  const s=GST._bar; if(!s) return;
  const on=s.on||{};
  // 구간 범위 토글 — core가 상태를 뒤집고, 페이지는 on.span이 있으면 그걸로(마감 시작일 재적용 등) 없으면 재렌더
  if(key==='span'){
    // val이 오면 그 값으로 확정(브로드캐스트 안전), 없으면 뒤집기
    GST.setSpan12(val===null||val===undefined ? !GST.span12() : (val===true||val==='true'));
    if(typeof on.span==='function'){ try{ on.span(GST.span12()); }catch(e){} }
    else if(typeof global.render==='function'){ try{ global.render(); }catch(e){} }
    else GST.barSync();
    return;
  }
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
    // 셸 #gbar와 동일 규격(높이 27px·Month 118px·Week 104px) — 직접 접속에서도 같은 모양
    st.textContent='#gstLocalBar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:0 0 14px}'
      +'#gstLocalBar .gb-seg{display:inline-flex;border:1px solid var(--glass-border);border-radius:8px;overflow:hidden;flex:none}'
      +'#gstLocalBar .gb-b{font-family:inherit;background:var(--glass);border:1px solid var(--glass-border);border-radius:8px;'
      +'padding:0 12px;height:27px;color:var(--txt-muted);font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;flex:none}'
      +'#gstLocalBar .gb-seg .gb-b{border:none;border-radius:0}'
      +'#gstLocalBar .gb-b.on{background:var(--accent-1);color:#04211d}'
      +'#gstLocalBar .gb-inp{font-family:inherit;background:var(--glass);border:1px solid var(--glass-border);border-radius:8px;'
      +'padding:0 7px;height:27px;color:var(--txt-main);font-size:11px;outline:none;flex:none}'
      +'#gstLocalBar .gb-inp[type=month]{width:118px}'
      +'#gstLocalBar select.gb-inp{width:104px}'
      +'#gstLocalBar .gb-note{font-size:11px;color:var(--txt-muted);font-weight:700;white-space:nowrap;flex:none}'
      +'#gstLocalBar .gb-cut{margin-left:8px}'
      +'#gstLocalBar .off{opacity:.32}'
      +'#gstLocalBar .gb-badge{display:inline-block;margin-left:5px;min-width:15px;padding:0 4px;border-radius:8px;'
      +'background:var(--bad,#fb7185);color:#1a0508;font-size:9.5px;font-weight:800;line-height:15px;text-align:center}'
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
/* ============================================================
   18.5 대시보드 챗봇 — 페이지 사실(fact) 수집
   페이지를 고치지 않아도 '지금 화면의 숫자'를 모은다:
     ① KPI 카드(.kpi) ② watch 시계열 ③ 피벗 원본의 차원별 집계 ④ 활성 필터
   숫자는 화면과 같은 계산 결과라, 답변이 대시보드와 어긋날 수 없다.
   ============================================================ */
GST.factPack = function(opt){
  const O=opt||{}, TOPN=O.top||10, SER=O.series||12;
  const P={tab:(location.pathname.replace(/\/index\.html$/,'').split('/').filter(Boolean).pop()||'main'),
           title:(document.title||'').trim(), kpi:[], series:[], groups:[], filters:[]};
  try{ const st=document.getElementById('status'); if(st)P.status=st.textContent.trim().slice(0,220); }catch(e){}
  // ① KPI 카드 — 화면에 뜬 값 그대로
  try{ document.querySelectorAll('.kpi').forEach(function(k){
    const v=k.querySelector('.val'), c=k.querySelector('.cap'), f=k.querySelector('.kf');
    if(v&&c)P.kpi.push({name:c.textContent.trim(), value:v.textContent.trim(), sub:f?f.textContent.trim():''});
  }); }catch(e){}
  // ② 시계열(브리핑용 watch 등록분)
  try{ (GST._watch||[]).forEach(function(w){
    P.series.push({name:String(w.label||w.k||''), unit:w.unit||'',
      labels:(w.labels||[]).slice(-SER), data:(w.data||[]).slice(-SER)});
  }); }catch(e){}
  // ③ 피벗 원본 → 차원별 상위 집계 (사이트별·라인별·원인별… 자동 생성)
  try{ const pv=GST._pivot;
    if(pv&&pv.sets)pv.sets.slice(0,4).forEach(function(s){
      let rows=[]; try{ rows=(typeof s.rows==='function'?s.rows():s.rows)||[]; }catch(e){}
      if(!rows.length)return;
      const meas=(s.measures||[]).slice(0,2);
      (s.dims||[]).slice(0,5).forEach(function(dm){
        const m={}; let n=0;
        for(let i=0;i<rows.length&&i<40000;i++){
          const key=String(GST._pivGet(rows[i],dm.k)==null?'':GST._pivGet(rows[i],dm.k)).trim()||'(미기재)';
          const e2=m[key]||(m[key]={c:0,v:{}}); e2.c++; n++;
          meas.forEach(function(ms){ if(ms.agg==='sum'||ms.agg==='avg'){
            const val=+GST._pivGet(rows[i],ms.f||ms.k)||0; e2.v[ms.t]=(e2.v[ms.t]||0)+val; } });
        }
        const ent=Object.keys(m).map(function(k){
          const o={name:k,count:m[k].c}; Object.keys(m[k].v).forEach(function(t){o[t]=Math.round(m[k].v[t]*10)/10;}); return o;})
          .sort(function(a,b){return b.count-a.count;});
        if(ent.length>1)P.groups.push({set:s.t||s.k, by:dm.t||String(dm.k), total:n, top:ent.slice(0,TOPN)});
      });
    });
  }catch(e){}
  try{ const fb=document.getElementById('filtBadge')||document.querySelector('.fbar');
    if(fb&&fb.offsetParent)P.filters.push(fb.textContent.replace(/\s+/g,' ').trim().slice(0,160)); }catch(e){}
  return P;
};

window.addEventListener('message', function(e){
  const d=e.data||{};
  if(d.type==='gst-ask'){                       // 셸 챗봇의 사실 수집 요청
    try{ (e.source||window.parent).postMessage({type:'gst-facts', id:d.id, pack:GST.factPack(d.opt)}, '*'); }catch(x){}
    return; }
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
   19b. 기간 버킷 — 주(엑셀 WEEKNUM·일~토)/월 12구간
   주간현황의 isoW/periods와 동일 규칙을 전 페이지가 쓸 수 있게 승격.
   반환: [{key,label,st,end}] — st/end는 UTC 자정 Date, end는 anchor를 넘지 않음.
   ============================================================ */
GST.isoW = function(d){
  const MS=86400000;
  const sun=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  sun.setUTCDate(sun.getUTCDate()-sun.getUTCDay());
  const jan1=new Date(Date.UTC(sun.getUTCFullYear(),0,1));
  const w=Math.ceil((((sun-jan1)/MS)+jan1.getUTCDay()+1)/7);
  return sun.getUTCFullYear()+'-W'+String(w).padStart(2,'0');
};
/* 구간 범위 토글 — 전 페이지 공유(gst_rpt_span12).
   ON(기본)  = 최근 12개 구간 (주간현황 형식, 기존 동작)
   OFF       = 마감으로 지정한 그 달만. 월별이면 1구간, 주별이면 그 달에 걸친 주차들. */
GST.span12 = function(){ try{ return localStorage.getItem('gst_rpt_span12')!=='0'; }catch(e){ return true; } };
GST.setSpan12 = function(b){ try{ localStorage.setItem('gst_rpt_span12', b?'1':'0'); }catch(e){} };
// 마감 월 하나만 덮는 구간 배열 — anchor가 속한 달을 기준으로 만든다
GST._monthSpan = function(anchor, unit, monU){
  const MS=86400000, out=[];
  const a=anchor?new Date(anchor.getTime()):new Date(); a.setUTCHours(0,0,0,0);
  const now=new Date(); now.setUTCHours(0,0,0,0);
  const y=a.getUTCFullYear(), m=a.getUTCMonth();
  const m0=new Date(Date.UTC(y,m,1)), m1=new Date(Date.UTC(y,m+1,0));
  const cap=function(d){ return d>now?now:d; };          // 미래 구간은 오늘까지만
  if(unit==='w'){
    // 그 달에 걸치는 주(일~토)를 모두 — 주의 시작이 달을 벗어나도 겹치면 포함
    let s=new Date(m0); s.setUTCDate(s.getUTCDate()-s.getUTCDay());
    for(let g=0; g<6 && s<=m1; g++){
      const en=new Date(s.getTime()+6*MS), k=GST.isoW(s);
      out.push({key:k,label:'W'+k.slice(-2),st:new Date(s),end:cap(en)});
      s=new Date(s.getTime()+7*MS);
    }
  }else{
    out.push({key:y+'-'+String(m+1).padStart(2,'0'),label:(m+1)+(monU!=null?monU:'월'),
              st:m0,end:cap(m1)});
  }
  return out;
};
GST.periods = function(n, anchor, unit, monU){
  const MS=86400000, U=unit||'m', out=[];
  if(!GST.span12()) return GST._monthSpan(anchor, U, monU);
  const today=anchor?new Date(anchor.getTime()):new Date(); today.setUTCHours(0,0,0,0);
  if(U==='w'){
    const sun=new Date(today); sun.setUTCDate(sun.getUTCDate()-sun.getUTCDay());
    for(let i=n-1;i>=0;i--){
      const st=new Date(sun.getTime()-i*7*MS), en=new Date(st.getTime()+6*MS);
      const k=GST.isoW(st);
      out.push({key:k,label:'W'+k.slice(-2),st,end:en>today?today:en});
    }
  }else{
    for(let i=n-1;i>=0;i--){
      let y=today.getUTCFullYear(), m=today.getUTCMonth()-i; while(m<0){m+=12;y--;}
      const en=new Date(Date.UTC(y,m+1,0));
      out.push({key:y+'-'+String(m+1).padStart(2,'0'),label:(m+1)+(monU!=null?monU:'월'),
                st:new Date(Date.UTC(y,m,1)),end:en>today?today:en});
    }
  }
  return out;
};
// 페이지 공통 PERIOD 상태 — gst_rpt_period 키를 전 페이지가 공유(주간현황과 연동)
GST.period = function(){ try{ const p=localStorage.getItem('gst_rpt_period'); return p==='w'?'w':'m'; }catch(e){ return 'm'; } };
GST.setPeriod = function(p){ try{ localStorage.setItem('gst_rpt_period', p==='w'?'w':'m'); }catch(e){} };

/* ============================================================
   19c. 차트 축 경계 편집(⚙) — 전 페이지 공통
   주간현황·CIP는 자체 구현(공유 키 gst_rpt_axb)을 그대로 쓰고,
   나머지 페이지는 core가 같은 UX(⚙ → min/max 팝오버)를 제공한다.
   저장 키는 페이지별(gst_axb_<page>)이라 차트 id가 겹쳐도 안전.
   ============================================================ */
GST.AX_T={ko:{t:'축 범위 (min / max)',apply:'적용',reset:'초기화'},
          en:{t:'Axis range (min / max)',apply:'Apply',reset:'Reset'},
          zh:{t:'轴范围 (min / max)',apply:'应用',reset:'重置'},
          ja:{t:'軸範囲 (min / max)',apply:'適用',reset:'リセット'}};
GST.axbKey = function(){
  const p=(location.pathname.match(/\/([a-z]+)\/?(?:index\.html)?$/)||[])[1]||'root';
  return (p==='report'||p==='cip') ? 'gst_rpt_axb' : 'gst_axb_'+p;
};
GST.axbLoad = function(){ try{ return JSON.parse(localStorage.getItem(GST.axbKey())||'{}')||{}; }catch(e){ return {}; } };
GST.axbSave = function(o){ try{ localStorage.setItem(GST.axbKey(), JSON.stringify(o)); }catch(e){} };
// 차트의 "값 축"을 알아낸다 — 가로 막대(indexAxis:'y')는 x가 값 축이다.
// 도넛처럼 스케일이 없는 차트는 편집 대상이 아니다.
GST._axInfo = function(ch){
  const sc=ch&&ch.options&&ch.options.scales;
  if(!sc||(!sc.x&&!sc.y)) return null;
  const horiz=(ch.options.indexAxis==='y');
  const val=horiz?'x':'y';
  if(!sc[val]) return null;
  return {val:val, hasY2:!horiz&&!!sc.y2};
};
// 렌더 후 저장된 경계를 주입 — 차트 생성 사이클 안에서는 스케일이 무시하므로 update로 덮는다
GST.axbApply = function(){
  if(!window.Chart||!Chart.getChart) return;
  const A=GST.axbLoad();
  Object.keys(A).forEach(function(id){
    const cv=document.getElementById(id); const ch=cv&&Chart.getChart(cv); const b=A[id];
    if(!ch||!b) return;
    const info=GST._axInfo(ch); if(!info) return;
    let dirty=false;
    Object.keys(b).forEach(function(k){
      if(k!==info.val&&k!=='y2') return;      // 카테고리 축은 절대 건드리지 않는다
      const s=ch.options.scales&&ch.options.scales[k], v=b[k]; if(!s||!v)return;
      if(v.min!=null&&v.min!==''){s.min=+v.min;dirty=true;}
      if(v.max!=null&&v.max!==''){s.max=+v.max;dirty=true;}
    });
    if(dirty) ch.update('none');
  });
};
GST._axCSS=false;
GST._axCss=function(){
  if(GST._axCSS) return; GST._axCSS=true;
  const st=document.createElement('style');
  st.textContent='.gaxpop{position:absolute;top:42px;right:12px;z-index:60;background:var(--glass,#101720);'
    +'border:1px solid var(--glass-border,rgba(151,170,196,.2));border-radius:12px;padding:12px 14px;'
    +'box-shadow:0 8px 24px rgba(0,0,0,.45);min-width:200px;backdrop-filter:blur(10px)}'
    +'.gaxpop .gx-t{font-size:11px;font-weight:800;color:var(--txt-main,#E6EDF3);margin-bottom:8px}'
    +'.gaxpop .gx-r{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11px;color:var(--txt-muted,#8B98A9)}'
    +'.gaxpop .gx-r b{width:20px;color:var(--txt-main,#E6EDF3)}'
    +'.gaxpop input{width:64px;background:var(--glass,rgba(255,255,255,.06));border:1px solid var(--glass-border,rgba(151,170,196,.2));'
    +'border-radius:6px;color:var(--txt-main,#E6EDF3);font-size:11px;padding:4px 6px}'
    +'.gaxpop .gx-btns{display:flex;gap:6px;margin-top:8px}'
    +'.gaxpop .gx-btns button{flex:1;background:var(--glass,rgba(255,255,255,.06));border:1px solid var(--glass-border,rgba(151,170,196,.2));'
    +'border-radius:8px;color:var(--txt-main,#E6EDF3);font-size:11px;font-weight:700;padding:5px 0;cursor:pointer}'
    +'.gaxpop .gx-btns button:hover{border-color:var(--accent-1,#2DD4BF)}';
  document.head.appendChild(st);
};
GST.axOpen = function(id){
  GST._axCss();
  const cv=document.getElementById(id); const ch=cv&&Chart.getChart(cv); if(!ch) return;
  const info=GST._axInfo(ch); if(!info) return;
  const card=cv.closest('.card,.mcard,.trend-card,.cross-card'); if(!card) return;
  const old=card.querySelector('.gaxpop');
  document.querySelectorAll('.gaxpop').forEach(function(p){ p.remove(); });
  if(old) return;   // 같은 카드에서 다시 누르면 토글 닫기
  let lg='ko'; try{ lg=sessionStorage.getItem('gst_lang')||'ko'; }catch(e){}
  const T=GST.AX_T[lg]||GST.AX_T.ko;
  const A=GST.axbLoad(), b=A[id]||{};
  const VAL=info.val, hasY2=info.hasY2;   // 값 축 — 가로 막대는 x가 값 축이다
  const pop=document.createElement('div'); pop.className='gaxpop';
  const row=function(axis,lbl,v){ return '<div class="gx-r"><b>'+lbl+'</b>'
    +'<input class="gx-'+axis+'min" placeholder="auto" value="'+((v&&v.min!=null)?v.min:'')+'">'
    +'<span>~</span><input class="gx-'+axis+'max" placeholder="auto" value="'+((v&&v.max!=null)?v.max:'')+'"></div>'; };
  pop.innerHTML='<div class="gx-t">⚙ '+T.t+'</div>'+row('v','Y',b[VAL])+(hasY2?row('y2','%',b.y2):'')
    +'<div class="gx-btns"><button data-ax="apply">'+T.apply+'</button><button data-ax="reset">'+T.reset+'</button></div>';
  card.appendChild(pop);
  pop.addEventListener('click',function(e){
    const btn=e.target.closest('[data-ax]'); if(!btn)return;
    const A2=GST.axbLoad();
    if(btn.dataset.ax==='reset'){
      delete A2[id]; GST.axbSave(A2);
      // update-재사용 차트는 render가 스케일을 새로 만들지 않으므로 지금 직접 푼다
      ['x','y','y2'].forEach(function(k){ const s=ch.options.scales&&ch.options.scales[k];
        if(s){ delete s.min; delete s.max; } });
      try{ ch.update('none'); }catch(err){}
    }else{
      const g=function(c){ const el=pop.querySelector('.'+c); const n=el?el.value.trim():''; return n===''?'':+n; };
      const nb={}; nb[VAL]={min:g('gx-vmin'),max:g('gx-vmax')};
      if(hasY2) nb.y2={min:g('gx-y2min'),max:g('gx-y2max')};
      const bad=Object.keys(nb).some(function(k){ const v=nb[k]; return v&&v.min!==''&&v.max!==''&&+v.min>=+v.max; });
      if(bad) return;
      A2[id]=nb; GST.axbSave(A2);
    }
    pop.remove();
    if(typeof window.render==='function'){ try{ window.render(); }catch(err){} }
    GST.axbApply();
  });
};
// 각 차트 카드에 ⚙ 버튼 추가 — 페이지 자체 구현(report/cip의 axOpen)이 있으면 건너뛴다.
// 스케일 없는 차트(도넛)는 편집이 무의미하므로 붙이지 않는다.
GST.axBtns = function(){
  if(!window.Chart||!Chart.getChart) return;
  document.querySelectorAll('.card canvas,.mcard canvas,.trend-card canvas,.cross-card canvas').forEach(function(cv){
    const id=cv.id, card=cv.closest('.card,.mcard,.trend-card,.cross-card');
    if(!id||!card) return;
    if(card.querySelector('[data-gax]')||card.querySelector('.capbtn[onclick^="axOpen"]')) return;
    const ch=Chart.getChart(cv); if(!ch||!GST._axInfo(ch)) return;
    const box=card.querySelector('.capbtns');
    if(!box) return;   // 복사/저장 버튼 박스가 아직 없으면 다음 렌더에서
    const b=document.createElement('button'); b.className='capbtn'; b.type='button';
    b.dataset.gax=id; b.title='축 범위 설정 (min/max)'; b.textContent='⚙';
    b.onclick=function(){ GST.axOpen(id); };
    box.appendChild(b);
  });
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
  // 페이지 자체 항목 — 현재 페이지가 이 설비로 할 수 있는 일을 메뉴 맨 위에 끼워 넣는다.
  // (예: 고장현황의 '설비 일대기'.) S/N 셀 클릭은 이 메뉴가 캡처 단계에서 선점하므로,
  // 페이지가 따로 클릭 핸들러를 달아도 절대 실행되지 않는다 — 반드시 이 훅을 쓴다.
  (GST.snMenuExtra||[]).forEach(function(x,i){
    h+='<button type="button" data-extra="'+i+'" style="display:block;width:100%;text-align:left;'
      +'background:transparent;border:none;color:inherit;font:inherit;padding:6px 8px;border-radius:7px;cursor:pointer;font-weight:700">'
      +x.label+'</button>';
  });
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
    const xb=e.target.closest('[data-extra]');
    if(xb){ const it=(GST.snMenuExtra||[])[+xb.dataset.extra]; m.remove(); if(it&&it.fn)it.fn(sn); return; }
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

/* ============================================================
   21. 고장 원인 요약(그룹핑) — 자유 서술·중문 원인을 핵심 키로 묶는다
   1차: 다국어 키워드 사전(카테고리) — 순서가 우선순위다(위가 먼저 매칭).
   2차: 사전에 없으면 말뭉치에서 자주 나오는 핵심 토큰(영문 단어·한글 어절·
        한자 2자 조각)으로 묶는다(2건 이상 반복될 때만).
   3차: 그래도 없으면 원문 그대로 — 짧은 코드성 표기는 기존과 동일하게 동작.
   ============================================================ */
GST.CAUSE_CATS=[
  {k:'human',   re:/HUMAN|휴먼|오조작|誤操作|误操作|人為|人为/i},
  {k:'powder',  re:/POWDER|파우더|막힘|CLOG|堵|粉末/i},
  {k:'mfc',     re:/MFC/i},
  {k:'sensor',  re:/SENSOR|센서|感測|感应|感應|传感|傳感/i},
  {k:'level',   re:/LEVEL|레벨|液位/i},
  {k:'flow',    re:/FLOW|유량|流量/i},
  {k:'temp',    re:/TEMP|온도|温度|溫度|HEATER|히터|加热|加熱|과열|OVERHEAT/i},
  {k:'leak',    re:/LEAK|누수|누설|漏/i},
  {k:'pump',    re:/PUMP|펌프|泵/i},
  {k:'valve',   re:/VALVE|밸브|阀|閥/i},
  {k:'pipe',    re:/PIPING|PIPE|배관|配管|管路/i},
  {k:'motor',   re:/MOTOR|모터|馬達|马达|\bFAN\b|팬|風機|风机|블로워|BLOWER/i},
  {k:'elec',    re:/전장|전기|ELECTRIC|PCB|CONVERTER|INVERTER|电气|電氣|電裝|电装|누전|합선|SMPS|POWER SUPPLY|FUSE|퓨즈/i},
  {k:'sw',      re:/PROGRAM|프로그램|SOFTWARE|\bSW\b|\bPLC\b|\bCTC\b|제어|控制|程序|程式|통신|\bCOMM\b|通信/i},
  {k:'seal',    re:/O-?RING|씰|실링|\bSEAL\b|密封|GASKET|가스켓/i},
  {k:'customer',re:/고객|客户|客戶|顧客|CUSTOMER/i},
  {k:'parts',   re:/PART/i}
];
GST.CAUSE_LBL={
  human:{ko:'휴먼 에러',en:'Human error',zh:'人为失误',ja:'ヒューマンエラー'},
  powder:{ko:'파우더·막힘',en:'Powder/Clog',zh:'粉末·堵塞',ja:'パウダー·詰まり'},
  mfc:{ko:'MFC',en:'MFC',zh:'MFC',ja:'MFC'},
  sensor:{ko:'센서',en:'Sensor',zh:'传感器',ja:'センサー'},
  level:{ko:'레벨',en:'Level',zh:'液位',ja:'レベル'},
  flow:{ko:'유량(Flow)',en:'Flow',zh:'流量',ja:'流量'},
  temp:{ko:'온도·히터',en:'Temp/Heater',zh:'温度·加热',ja:'温度·ヒーター'},
  leak:{ko:'누수·누출',en:'Leak',zh:'泄漏',ja:'漏れ'},
  pump:{ko:'펌프',en:'Pump',zh:'泵',ja:'ポンプ'},
  valve:{ko:'밸브',en:'Valve',zh:'阀',ja:'バルブ'},
  pipe:{ko:'배관',en:'Piping',zh:'管路',ja:'配管'},
  motor:{ko:'모터·팬',en:'Motor/Fan',zh:'马达·风机',ja:'モーター·ファン'},
  elec:{ko:'전장·전기',en:'Electrical',zh:'电气',ja:'電装·電気'},
  sw:{ko:'프로그램·제어',en:'SW/Control',zh:'程序·控制',ja:'プログラム·制御'},
  seal:{ko:'O-RING·씰',en:'O-ring/Seal',zh:'O环·密封',ja:'Oリング·シール'},
  customer:{ko:'고객사 관련',en:'Customer-related',zh:'客户相关',ja:'顧客関連'},
  parts:{ko:'부품 불량(기타)',en:'Part fail (etc.)',zh:'零件不良(其他)',ja:'部品不良(その他)'}
};
GST.causeCat=function(s){
  if(!s) return null; const u=String(s);
  for(let i=0;i<GST.CAUSE_CATS.length;i++){ if(GST.CAUSE_CATS[i].re.test(u)) return GST.CAUSE_CATS[i]; }
  return null;
};
GST._CAUSE_STOP=new Set(['FAIL','FAILURE','ERROR','ISSUE','PROBLEM','CHECK','HIGH','LOW','MAIN','THE','AND','FOR','NOT','AFTER',
  '고장','불량','이상','발생','작업','확인','교체','조치','요청','관련','문제','설비','원인','미상','기타',
  '故障','异常','異常','问题','問題','发生','發生','更换','更換','确认','確認','原因','处理','處理','导致','導致','进行','進行','设备','設備']);
// texts: 원인 문자열 배열(전체 말뭉치) → Map(원문 → {key,label})
GST.causeMap=function(texts, lang){
  lang=lang||'ko';
  const uniq=Array.from(new Set((texts||[]).filter(Boolean).map(function(s){ return String(s).trim(); }).filter(Boolean)));
  const tokensOf=function(s){
    const out=[];
    (s.toUpperCase().match(/[A-Z0-9][A-Z0-9\-]{1,}|[가-힣]{2,}|[一-鿿]{2,}/g)||[]).forEach(function(tk){
      if(/^[一-鿿]+$/.test(tk)){
        // 중문은 띄어쓰기가 없어 긴 덩어리가 됨 — 2자 조각(bigram)으로 쪼개 반복 조각을 찾는다
        for(let i=0;i+2<=tk.length;i++){ const bg=tk.slice(i,i+2); if(!GST._CAUSE_STOP.has(bg)) out.push(bg); }
      }else if(!GST._CAUSE_STOP.has(tk)) out.push(tk);
    });
    return out;
  };
  // 1패스: 카테고리 미매칭 텍스트들의 토큰 말뭉치 빈도
  const freq={};
  const unmatched=uniq.filter(function(s){ return !GST.causeCat(s); });
  unmatched.forEach(function(s){ Array.from(new Set(tokensOf(s))).forEach(function(tk){ freq[tk]=(freq[tk]||0)+1; }); });
  // 2패스: 원문 → 그룹 키
  const map=new Map();
  uniq.forEach(function(s){
    const cat=GST.causeCat(s);
    if(cat){ const L=GST.CAUSE_LBL[cat.k]||{}; map.set(s,{key:'§'+cat.k,label:L[lang]||L.ko||cat.k}); return; }
    let best=null;
    tokensOf(s).forEach(function(tk){
      if((freq[tk]||0)>=2 && (!best || freq[tk]>freq[best] || (freq[tk]===freq[best]&&tk.length>best.length))) best=tk;
    });
    if(best){ map.set(s,{key:'~'+best,label:best}); return; }
    map.set(s,{key:s,label:s});
  });
  return map;
};

/* ============================================================
   22. 자동 브리핑 — 이상 탐지 · 추세 · 예측 · 원인 귀속
   페이지가 render() 안에서 GST.watch([...])로 "지금 화면에 그린 시계열"을
   등록하면, 상단바 🔔 버튼이 자동으로 켜지고 배지에 주의 건수가 뜬다.
   계산은 전부 이미 있는 헬퍼(anomalyIdx·linForecast·pctDelta)를 재사용하므로
   지표 계산식은 건드리지 않는다 — 읽기 전용 분석 계층이다.

   등록 형식:
     GST.watch([{ k:'man', label:'인당 공수', labels:['W17',…], data:[…],
                  unit:'h', goodWhenDown:false,
                  parts:function(i){ return [{name:'F16',v:12},…]; } }])
   parts(i)를 주면 "왜 변했는지"를 구성요소 기여도로 분해해 문장으로 만든다.
   ============================================================ */
GST.BRF_T={
  ko:{t:'자동 브리핑',sub:'최근 구간 변화·이상·예측',none:'주의할 변화가 없습니다.',anom:'이상치',
      why:'주요 요인',fc:'다음 구간 예상',cfg:'민감도',warn:'변화 임계(%)',z:'이상치 z',save:'저장',
      copy:'복사',copied:'복사됨',close:'닫기',up:'증가',dn:'감소',all:'전체 지표',rise:'상승 추세',fall:'하락 추세'},
  en:{t:'Auto Briefing',sub:'Recent change · anomaly · forecast',none:'No notable changes.',anom:'anomaly',
      why:'Drivers',fc:'Next period',cfg:'Sensitivity',warn:'Change threshold (%)',z:'Anomaly z',save:'Save',
      copy:'Copy',copied:'Copied',close:'Close',up:'up',dn:'down',all:'All metrics',rise:'rising',fall:'falling'},
  zh:{t:'自动简报',sub:'近期变化·异常·预测',none:'无明显变化。',anom:'异常',
      why:'主要因素',fc:'下期预测',cfg:'灵敏度',warn:'变化阈值(%)',z:'异常 z',save:'保存',
      copy:'复制',copied:'已复制',close:'关闭',up:'上升',dn:'下降',all:'全部指标',rise:'上升趋势',fall:'下降趋势'},
  ja:{t:'自動ブリーフィング',sub:'直近の変化・異常・予測',none:'注意すべき変化はありません。',anom:'異常値',
      why:'主要因',fc:'次区間の予想',cfg:'感度',warn:'変化しきい値(%)',z:'異常値 z',save:'保存',
      copy:'コピー',copied:'コピー済',close:'閉じる',up:'増加',dn:'減少',all:'全指標',rise:'上昇傾向',fall:'下降傾向'}
};
GST._watch=[];
// 페이지가 render()마다 호출 — 이전 등록을 대체한다(필터가 바뀌면 값도 바뀌므로)
GST.watch=function(defs){
  GST._watch=(defs||[]).filter(function(d){ return d && d.data && d.data.length>=2; });
};
// 구성요소 기여도 분해 — 두 시점의 [{name,v,inv}] 배열을 받아 기여도 큰 순으로 정렬.
//   d   = 지표에 대한 기여도 (inv:true면 부호를 뒤집는다 — 휴가처럼 빼는 항목)
//   own = 그 구성요소 자체의 변화량 (사람이 읽는 값: "휴가 −9.2일")
// 예) 출근 = 재적 − 휴가 → 휴가를 {v:lv, inv:true}로 주면
//     휴가가 9.2 줄었을 때 own=−9.2(표시) · d=+9.2(출근을 끌어올린 기여)로 갈라진다.
GST.attribute=function(prevParts, curParts){
  const m=new Map();
  const put=function(p, side){
    if(!p||p.name==null) return;
    const k=String(p.name), e=m.get(k)||{name:k,prev:0,cur:0,inv:false};
    e[side]=+p.v||0; if(p.inv) e.inv=true; m.set(k,e);
  };
  (prevParts||[]).forEach(function(p){ put(p,'prev'); });
  (curParts ||[]).forEach(function(p){ put(p,'cur');  });
  const out=[]; m.forEach(function(e){
    const own=e.cur-e.prev;
    out.push({name:e.name,prev:e.prev,cur:e.cur,own:own,d:e.inv?-own:own});
  });
  out.sort(function(a,b){ return Math.abs(b.d)-Math.abs(a.d); });
  return out;
};
GST.BRF_KEY='gst_brief_cfg';
GST.briefCfg=function(){
  let o={}; try{ o=JSON.parse(localStorage.getItem(GST.BRF_KEY)||'{}')||{}; }catch(e){}
  const warn=+o.warn, z=+o.z;
  return {warn:(isFinite(warn)&&warn>0)?warn:15, z:(isFinite(z)&&z>=1)?z:3};
};
GST.briefCfgSave=function(o){ try{ localStorage.setItem(GST.BRF_KEY, JSON.stringify(o)); }catch(e){} };
// 등록된 시계열을 분석해 발견 목록을 만든다. 심각도·변화폭 순 정렬.
GST.briefFind=function(){
  const cfg=GST.briefCfg(), out=[];
  (GST._watch||[]).forEach(function(d){
    const data=(d.data||[]).map(function(v){ return (v==null||v===''||!isFinite(v))?null:+v; });
    const idx=[]; data.forEach(function(v,i){ if(v!=null) idx.push(i); });
    if(idx.length<2) return;
    const iC=idx[idx.length-1], iP=idx[idx.length-2];
    const cur=data[iC], prev=data[iP];
    const pct=GST.pctDelta(cur,prev);
    const anom=GST.anomalyIdx(data,cfg.z).has(iC);
    const up=cur>prev, flat=cur===prev;
    // goodWhenDown이면 감소가 좋은 지표(고장·교체 등)
    const good = flat ? true : (d.goodWhenDown ? !up : up);
    const big = (pct!=null) && Math.abs(pct)>=cfg.warn;
    if(!anom && !big) return;                      // 임계 미만 + 이상치 아님 → 보고하지 않는다
    const sev = good ? 'ok' : (anom ? 'bad' : 'warn');
    const fc=GST.linForecast(data.filter(function(v){return v!=null;}),1);
    const labels=d.labels||[];
    const f={k:d.k, label:d.label||d.k, unit:d.unit||'', sev:sev, anom:anom,
             cur:cur, prev:prev, pct:pct, up:up,
             curL:labels[iC]!=null?String(labels[iC]):'', prevL:labels[iP]!=null?String(labels[iP]):'',
             data:data, fc:fc.length?fc[0]:null,
             score:(Math.abs(pct==null?0:pct)+(anom?40:0))*(good?0.35:1)};
    // 원인 귀속 — 페이지가 parts(i)를 준 경우에만
    if(typeof d.parts==='function' && !flat){
      try{
        const A=GST.attribute(d.parts(iP), d.parts(iC));
        const sign=up?1:-1;
        f.why=A.filter(function(a){ return a.d!==0 && (a.d>0?1:-1)===sign; }).slice(0,3);
      }catch(e){}
    }
    out.push(f);
  });
  out.sort(function(a,b){ return b.score-a.score; });
  return out;
};
// 인라인 스파크라인 (의존성 없음)
GST._spark=function(data,w,h,col){
  const pts=[], v=[];
  (data||[]).forEach(function(y){ if(y!=null&&isFinite(y)) v.push(y); });
  if(v.length<2) return '';
  const mn=Math.min.apply(null,v), mx=Math.max.apply(null,v), rg=(mx-mn)||1, n=data.length;
  data.forEach(function(y,i){ if(y==null||!isFinite(y))return;
    pts.push([(n>1?(i/(n-1)):0)*(w-3)+1.5, h-2-((y-mn)/rg)*(h-4)]); });
  if(pts.length<2) return '';
  const dd=pts.map(function(p,i){ return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1); }).join(' ');
  const last=pts[pts.length-1];
  return '<svg class="gbf-sp" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true">'
    +'<path d="'+dd+'" fill="none" stroke="'+col+'" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'
    +'<circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="2.3" fill="'+col+'"/></svg>';
};
GST._ovCSS=false;
GST._ovCss=function(){
  if(GST._ovCSS) return; GST._ovCSS=true;
  const st=document.createElement('style');
  st.textContent=
  // 테마 대응 — 페이지마다 --card 같은 변수가 없어서 밝은 테마에서 글씨가 묻혔다.
  // 오버레이가 쓰는 색은 여기서 자급자족하고, body의 테마 클래스로만 갈아끼운다.
   '.gov{--gov-bg:#101720;--gov-fg:#E6EDF3;--gov-mut:#8B98A9;--gov-line:rgba(151,170,196,.22);'
  +'--gov-soft:rgba(151,170,196,.09);--gov-heat:45,212,191}'
  +'body.theme-slate .gov{--gov-bg:#0C1219;--gov-fg:#e2e8f0;--gov-mut:#94a3b8;--gov-line:rgba(151,170,196,.18);--gov-soft:rgba(151,170,196,.08)}'
  +'body.theme-burgundy .gov{--gov-bg:#1f0822;--gov-fg:#fbeaf4;--gov-mut:#b49aa9;--gov-line:rgba(255,240,245,.18);'
  +'--gov-soft:rgba(255,240,245,.08);--gov-heat:244,114,182}'
  +'body.theme-light .gov{--gov-bg:#ffffff;--gov-fg:#0f172a;--gov-mut:#64748b;--gov-line:rgba(15,23,42,.14);'
  +'--gov-soft:rgba(15,23,42,.05);--gov-heat:37,99,235}'
  +'.gov{position:fixed;inset:0;z-index:9000;background:rgba(3,7,18,.72);display:flex;align-items:flex-start;'
  +'justify-content:center;padding:34px 14px;overflow:auto;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}'
  +'.gov-w{position:relative;width:min(780px,100%);background:var(--gov-bg);color:var(--gov-fg);'
  +'border:1px solid var(--gov-line);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.5);overflow:hidden}'
  +'.gov-w.wide{width:min(1180px,100%)}'
  +'.gov *{color:inherit}'
  +'.gov-h{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--gov-line)}'
  +'.gov-h h4{margin:0;font-size:14px;font-weight:800}'
  +'.gov-h .gov-sub{font-size:11px;color:var(--gov-mut) !important;font-weight:600}'
  +'.gov-h .gov-sp{flex:1}'
  +'.gov-b{background:var(--gov-soft);border:1px solid var(--gov-line);border-radius:8px;color:var(--gov-fg);'
  +'font-family:inherit;font-size:11px;font-weight:700;padding:5px 10px;cursor:pointer;white-space:nowrap}'
  +'.gov-b:hover{border-color:var(--accent-1,#2DD4BF)}'
  +'.gov-b.on{border-color:var(--accent-1,#2DD4BF)}'
  +'.gov-body{padding:8px 18px 16px;max-height:calc(100vh - 150px);overflow:auto}'
  +'.gov-f{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 18px;border-top:1px solid var(--gov-line);'
  +'font-size:11px;color:var(--gov-mut)}'
  +'.gov-f input{width:56px;background:var(--gov-soft);border:1px solid var(--gov-line);'
  +'border-radius:6px;color:var(--gov-fg);font-family:inherit;font-size:11px;padding:4px 6px}'
  // 브리핑 항목
  +'.gbf-i{display:flex;gap:11px;align-items:flex-start;padding:11px 2px;border-bottom:1px solid var(--gov-line)}'
  +'.gbf-i:last-child{border-bottom:none}'
  +'.gbf-dot{width:7px;height:7px;border-radius:50%;margin-top:5px;flex:none;background:var(--gov-mut)}'
  +'.gbf-i.bad .gbf-dot{background:#fb7185}.gbf-i.warn .gbf-dot{background:#fbbf24}'
  +'.gbf-i.ok .gbf-dot{background:#4ade80}'
  +'.gbf-m{flex:1;min-width:0}'
  +'.gbf-t{font-size:12px;font-weight:800;margin-bottom:2px}'
  +'.gbf-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:6px;background:rgba(251,113,133,.18);'
  +'color:#fb7185 !important;font-size:9.5px;font-weight:800;vertical-align:1px}'
  +'.gbf-v{font-size:11.5px;font-weight:600}'
  +'.gbf-v .gbf-mut{color:var(--gov-mut) !important;font-weight:600}'
  +'.gbf-w,.gbf-fc{font-size:10.5px;color:var(--gov-mut) !important;margin-top:3px}'
  +'.gbf-sp{flex:none;margin-top:3px;opacity:.85}'
  +'.gbf-none{padding:26px 4px;text-align:center;font-size:12px;color:var(--gov-mut) !important}'
  +'.gbf-src{font-size:9.5px;color:var(--gov-mut) !important;margin-left:6px;font-weight:600}'
  // 피벗 컨트롤
  +'.gpv-c{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid var(--gov-line);position:relative}'
  +'.gpv-c label{font-size:10.5px;color:var(--gov-mut) !important;font-weight:700}'
  +'.gpv-c select,.gpv-c input{background:var(--gov-soft);border:1px solid var(--gov-line);'
  +'border-radius:7px;color:var(--gov-fg);font-family:inherit;font-size:11px;padding:4px 6px;max-width:170px}'
  +'.gpv-c input[type=date]{width:130px}'
  +'.gpv-badge{display:inline-block;margin-left:4px;padding:0 4px;border-radius:6px;background:var(--accent-1,#2DD4BF);'
  +'color:#04211d !important;font-size:9px;font-weight:800}'
  // 값 필터 팝오버
  +'.gpv-pop{position:absolute;z-index:40;top:44px;background:var(--gov-bg);border:1px solid var(--gov-line);'
  +'border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.45);padding:9px;width:236px}'
  +'.gpv-pop input[type=search]{width:100%;margin-bottom:6px;background:var(--gov-soft);border:1px solid var(--gov-line);'
  +'border-radius:6px;color:var(--gov-fg);font-family:inherit;font-size:11px;padding:4px 7px}'
  +'.gpv-list{max-height:210px;overflow:auto;margin-bottom:7px}'
  +'.gpv-list label{display:flex;align-items:center;gap:6px;padding:3px 2px;font-size:11px;cursor:pointer;'
  +'color:var(--gov-fg) !important;font-weight:600;white-space:nowrap}'
  +'.gpv-list label:hover{background:var(--gov-soft)}'
  +'.gpv-list .n{margin-left:auto;color:var(--gov-mut) !important;font-size:10px;font-weight:700}'
  +'.gpv-pop .gpv-pb{display:flex;gap:6px}'
  +'.gpv-pop .gpv-pb .gov-b{flex:1;text-align:center}'
  // 피벗 표
  +'.gpv-sc{overflow:auto;max-height:calc(100vh - 280px)}'
  +'.gpv-t{border-collapse:separate;border-spacing:0;width:100%;font-size:11px}'
  +'.gov .gpv-t th,.gov .gpv-t td{padding:5px 8px;text-align:right;white-space:nowrap;'
  +'border-bottom:1px solid var(--gov-line);text-transform:none;letter-spacing:0;cursor:default}'
  +'.gov .gpv-t th{position:sticky;top:0;z-index:2;background:var(--gov-bg) !important;'
  +'color:var(--gov-mut) !important;font-size:10px;font-weight:800}'
  +'.gov .gpv-t th:first-child,.gov .gpv-t td:first-child{text-align:left;position:sticky;left:0;z-index:1;'
  +'background:var(--gov-bg) !important;font-weight:700;color:var(--gov-fg) !important}'
  +'.gov .gpv-t th:first-child{z-index:3;color:var(--gov-mut) !important}'
  +'.gov .gpv-t th.gpv-sort{cursor:pointer;user-select:none}'+'.gov .gpv-t th.gpv-sort:hover{color:var(--gov-fg) !important}'+'.gov .gpv-t td.gpv-cell{cursor:pointer;font-weight:700}'
  +'.gov .gpv-t td.gpv-cell:hover{outline:1px solid var(--accent-1,#2DD4BF);outline-offset:-1px}'
  +'.gov .gpv-t tr.gpv-tot td,.gov .gpv-t td.gpv-tot{font-weight:800;background:var(--gov-soft) !important}'
  +'.gpv-d{border-top:1px solid var(--gov-line);padding:8px 18px 10px;font-size:10.5px;color:var(--gov-mut)}'
  +'.gov .gpv-d table{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:5px}'
  +'.gov .gpv-d td,.gov .gpv-d th{padding:3px 6px;border-bottom:1px solid var(--gov-line);text-align:left;'
  +'white-space:nowrap;position:static;text-transform:none;letter-spacing:0}'
  +'.gov .gpv-d th{color:var(--gov-mut) !important;font-weight:800;background:transparent !important}'
  +'.gov .gpv-d td{color:var(--gov-fg) !important;background:transparent !important}'
  +'@media print{.gov{display:none !important}}';
  document.head.appendChild(st);
};
GST._lang=function(){ let l='ko'; try{ l=sessionStorage.getItem('gst_lang')||'ko'; }catch(e){} return l; };
GST._esc=function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
GST._ovClose=function(){ document.querySelectorAll('.gov').forEach(function(o){ o.remove(); }); };
GST._ovOpen=function(inner, wide){
  GST._ovCss(); GST._ovClose();
  const ov=document.createElement('div'); ov.className='gov';
  ov.innerHTML='<div class="gov-w'+(wide?' wide':'')+'">'+inner+'</div>';
  ov.addEventListener('click',function(e){ if(e.target===ov) GST._ovClose(); });
  document.addEventListener('keydown', function esc(e){
    if(e.key==='Escape'){ GST._ovClose(); document.removeEventListener('keydown',esc); } });
  document.body.appendChild(ov);
  return ov;
};
GST._num=function(v){
  if(v==null||!isFinite(v)) return '—';
  return (Math.round(v*10)/10).toLocaleString(undefined,{maximumFractionDigits:1});
};
GST.briefText=function(){
  const T=GST.BRF_T[GST._lang()]||GST.BRF_T.ko, F=GST.briefFind();
  const head=(document.title||'')+' — '+T.t;
  if(!F.length) return head+'\n'+T.none;
  return head+'\n'+F.map(function(f){
    let s='• '+f.label+': '+(f.prevL?f.prevL+' ':'')+GST._num(f.prev)+' → '+(f.curL?f.curL+' ':'')+GST._num(f.cur)+(f.unit||'')
        +(f.pct!=null?' ('+(f.pct>0?'+':'')+f.pct+'%)':'')+(f.anom?' ['+T.anom+']':'');
    if(f.why&&f.why.length) s+='\n  '+T.why+': '+f.why.map(function(w){
      return w.name+' '+(w.own>0?'+':'')+GST._num(w.own); }).join(', ');
    if(f.fc!=null) s+='\n  '+T.fc+': '+GST._num(f.fc)+(f.unit||'');
    return s;
  }).join('\n');
};
GST.briefOpen=function(){
  const T=GST.BRF_T[GST._lang()]||GST.BRF_T.ko, cfg=GST.briefCfg(), F=GST.briefFind();
  const sty=GST.sty();
  let body='';
  if(!F.length) body='<div class="gbf-none">✅ '+T.none+'</div>';
  else body=F.map(function(f){
    const col=f.sev==='bad'?'#fb7185':(f.sev==='warn'?'#fbbf24':(f.sev==='ok'?'#4ade80':sty.line));
    const arrow=f.pct==null?'':(f.pct>0?'▲':(f.pct<0?'▼':'—'));
    let h='<div class="gbf-i '+f.sev+'"><span class="gbf-dot"></span><div class="gbf-m">'
      +'<div class="gbf-t">'+GST._esc(f.label)+(f.anom?'<span class="gbf-tag">'+T.anom+'</span>':'')+'</div>'
      +'<div class="gbf-v"><span class="gbf-mut">'+GST._esc(f.prevL)+'</span> '+GST._num(f.prev)
      +' <span class="gbf-mut">→</span> <span class="gbf-mut">'+GST._esc(f.curL)+'</span> '+GST._num(f.cur)
      +'<span class="gbf-mut">'+GST._esc(f.unit)+'</span>'
      +(f.pct!=null?' <span style="color:'+col+';font-weight:800">'+arrow+' '+Math.abs(f.pct)+'%</span>':'')+'</div>';
    if(f.why&&f.why.length) h+='<div class="gbf-w">↳ '+T.why+': '+f.why.map(function(w){
      return GST._esc(w.name)+' <b style="color:'+col+'">'+(w.own>0?'+':'')+GST._num(w.own)+'</b>'; }).join(', ')+'</div>';
    if(f.fc!=null) h+='<div class="gbf-fc">↻ '+T.fc+': <b>'+GST._num(f.fc)+GST._esc(f.unit)+'</b></div>';
    return h+'</div>'+GST._spark(f.data,86,30,col)+'</div>';
  }).join('');
  const ov=GST._ovOpen(
     '<div class="gov-h"><h4>🔔 '+T.t+'</h4><span class="gov-sub">'+T.sub+'</span><span class="gov-sp"></span>'
    +'<button class="gov-b" data-brf="copy">'+T.copy+'</button>'
    +'<button class="gov-b" data-brf="close">'+T.close+'</button></div>'
    +'<div class="gov-body">'+body+'</div>'
    +'<div class="gov-f"><span>'+T.cfg+'</span>'
    +'<label>'+T.warn+' <input id="gbfWarn" type="number" min="1" max="200" value="'+cfg.warn+'"></label>'
    +'<label>'+T.z+' <input id="gbfZ" type="number" min="1" max="6" step="0.5" value="'+cfg.z+'"></label>'
    +'<button class="gov-b" data-brf="save">'+T.save+'</button></div>');
  ov.addEventListener('click',function(e){
    const b=e.target.closest('[data-brf]'); if(!b)return;
    const a=b.dataset.brf;
    if(a==='close'){ GST._ovClose(); return; }
    if(a==='copy'){
      const txt=GST.briefText();
      const done=function(){ b.textContent=T.copied; setTimeout(function(){ b.textContent=T.copy; },1400); };
      if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,function(){});
      else { const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta);
             ta.select(); try{ document.execCommand('copy'); done(); }catch(err){} ta.remove(); }
      return;
    }
    if(a==='save'){
      const w=+(document.getElementById('gbfWarn')||{}).value, z=+(document.getElementById('gbfZ')||{}).value;
      GST.briefCfgSave({warn:(isFinite(w)&&w>0)?w:15, z:(isFinite(z)&&z>=1)?z:3});
      GST._ovClose(); GST.barSync(); GST.briefOpen();
    }
  });
};

/* ============================================================
   23. 다차원 피벗 — 엑셀 피벗테이블에 준하는 교차 분석
   페이지는 "데이터 세트"를 하나 이상 등록한다. 한 페이지 안에서도 성격이 다른
   표(작업 실적 / 인원 / 휴가 / 설치 …)를 골라 볼 수 있게 하기 위해서다.

     GST.pivotReg({sets:[
       {k:'wk', t:'작업 실적', rows:()=>fWK, date:'wd',
        dims:[{k:'fab',t:'라인'},…], measures:[{k:'cnt',t:'건수',agg:'count'},…],
        detailCols:[…]},
       …]});
   세트가 하나뿐이면 예전 형태({rows,dims,measures})도 그대로 받는다.

   기능(엑셀 대응)
     · 데이터 세트 전환 · 기간(날짜 범위) 좁히기
     · 행 축 3단계 중첩 + 소계  — 예) 알람유형 → 원인 → 조치
     · 열 축 1단계 · 축 전치
     · 값(측정값) 여러 개 동시 표시 — 열값 × 측정값으로 컬럼이 늘어난다
     · 값 표시 형식: 원값 / 행 대비 % / 열 대비 % / 총계 대비 %
     · 행·열 값 골라보기(체크박스 + 검색) · 상위 N만 보기(나머지는 '기타'로 합산)
     · 헤더 클릭 정렬(내림 → 오름 → 해제)
     · TSV 복사 · CSV 내려받기 · 셀 클릭 시 원본 상세
   ============================================================ */
GST.PIV_T={
  ko:{t:'다차원 피벗',sub:'현재 필터 기준 교차 집계',src:'데이터',per:'기간',row:'행',col:'열',val:'값',swap:'⇄ 전치',
      copy:'복사(TSV)',copied:'복사됨',csv:'CSV',close:'닫기',tot:'합계',sub2:'소계',etc:'기타',
      none:'표시할 데이터가 없습니다.',no:'(없음)',detail:'상세',more:'외 {n}건',pick:'값 고르기',
      all:'전체',clr:'해제',apply:'적용',find:'검색',rows:'{n}행',non:'—',cmp:'Δ 기간비교',cmpA:'기간 A',cmpB:'직전 B',cmpD:'Δ%',cmpHint:'A=기간 필터(비우면 최근 30일) · B=같은 길이의 직전 구간',
      disp:'표시',d_raw:'원값',d_row:'행 대비 %',d_col:'열 대비 %',d_all:'총계 대비 %',
      top:'상위',t_all:'전체',sub_on:'소계'},
  en:{t:'Pivot',sub:'Cross-tab on current filters',src:'Data',per:'Period',row:'Rows',col:'Cols',val:'Values',swap:'⇄ Swap',
      copy:'Copy (TSV)',copied:'Copied',csv:'CSV',close:'Close',tot:'Total',sub2:'Subtotal',etc:'Others',
      none:'No data to show.',no:'(none)',detail:'Detail',more:'+{n} more',pick:'Filter',
      all:'All',clr:'Clear',apply:'Apply',find:'Search',rows:'{n} rows',non:'—',cmp:'Δ Compare',cmpA:'Period A',cmpB:'Prev B',cmpD:'Δ%',cmpHint:'A = date filter (last 30d if empty) · B = preceding window of equal length',
      disp:'Show as',d_raw:'Value',d_row:'% of row',d_col:'% of column',d_all:'% of total',
      top:'Top',t_all:'All',sub_on:'Subtotals'},
  zh:{t:'多维透视',sub:'按当前筛选交叉汇总',src:'数据',per:'期间',row:'行',col:'列',val:'值',swap:'⇄ 转置',
      copy:'复制(TSV)',copied:'已复制',csv:'CSV',close:'关闭',tot:'合计',sub2:'小计',etc:'其他',
      none:'无数据。',no:'(无)',detail:'明细',more:'其他{n}条',pick:'筛选值',
      all:'全部',clr:'清除',apply:'应用',find:'搜索',rows:'{n}行',non:'—',cmp:'Δ 期间对比',cmpA:'期间A',cmpB:'前一期B',cmpD:'Δ%',cmpHint:'A=所选期间(空则近30天) · B=等长的前一区间',
      disp:'显示方式',d_raw:'数值',d_row:'占行%',d_col:'占列%',d_all:'占总计%',
      top:'前',t_all:'全部',sub_on:'小计'},
  ja:{t:'多次元ピボット',sub:'現在のフィルタで集計',src:'データ',per:'期間',row:'行',col:'列',val:'値',swap:'⇄ 転置',
      copy:'コピー(TSV)',copied:'コピー済',csv:'CSV',close:'閉じる',tot:'合計',sub2:'小計',etc:'その他',
      none:'データがありません。',no:'(なし)',detail:'明細',more:'他{n}件',pick:'値を選ぶ',
      all:'全体',clr:'解除',apply:'適用',find:'検索',rows:'{n}行',non:'—',cmp:'Δ 期間比較',cmpA:'期間A',cmpB:'直前B',cmpD:'Δ%',cmpHint:'A=期間フィルタ(空なら直近30日) · B=同じ長さの直前区間',
      disp:'表示形式',d_raw:'実数',d_row:'行比%',d_col:'列比%',d_all:'総計比%',
      top:'上位',t_all:'全体',sub_on:'小計'}
};
GST._pivot=null;
GST.PIV_LV=3;                 // 행 축 중첩 단계 수
GST._PIV_SEP='';
GST.pivotReg=function(spec){
  if(spec && !spec.sets) spec={sets:[Object.assign({k:'d0'},spec)]};
  if(spec && spec.sets) spec.sets=spec.sets.filter(function(s){ return s&&s.rows&&(s.dims||[]).length&&(s.measures||[]).length; });
  GST._pivot=(spec&&spec.sets&&spec.sets.length)?spec:null;
};
GST._pivGet=function(rec,k){
  if(typeof k==='function'){ try{ return k(rec); }catch(e){ return null; } }
  return rec ? rec[k] : null;
};
GST._pivLbl=function(v,T){
  if(v==null||v===''||(typeof v==='number'&&!isFinite(v))) return T.no;
  if(v instanceof Date) return GST.fmtDate(v);
  return String(v);
};
// 레코드 묶음 하나를 측정값 정의대로 집계
GST.pivotAgg=function(recs, meas){
  if(!recs||!recs.length) return null;
  const a=meas.agg||'count';
  if(a==='count') return recs.length;
  if(a==='uniq'){ const s=new Set();
    recs.forEach(function(r){ const v=GST._pivGet(r,meas.f); if(v!=null&&v!=='') s.add(String(v)); }); return s.size; }
  let sum=0,n=0;
  recs.forEach(function(r){ const v=+GST._pivGet(r,meas.f); if(isFinite(v)){ sum+=v; n++; } });
  if(!n) return null;
  if(a==='avg') return Math.round(sum/n*10)/10;
  return Math.round(sum*10)/10;
};
// 레코드를 행키(중첩)×열값으로 버킷팅. 집계는 호출부가 측정값별로 수행한다.
GST.pivotCalc=function(rows, rowKs, colK, T){
  const SEP=GST._PIV_SEP, buck=new Map(), rMap=new Map(), cSet=new Set();
  (rows||[]).forEach(function(rec){
    const parts=rowKs.map(function(k){ return GST._pivLbl(GST._pivGet(rec,k),T); });
    const rv=parts.join(SEP);
    const cv=colK?GST._pivLbl(GST._pivGet(rec,colK),T):T.tot;
    if(!rMap.has(rv)) rMap.set(rv,parts);
    cSet.add(cv);
    const key=rv+SEP+SEP+cv; let a=buck.get(key); if(!a){ a=[]; buck.set(key,a); }
    a.push(rec);
  });
  const rKeys=[...rMap.keys()].sort(), cNames=[...cSet].sort();
  const recsOf=function(rk,c){ return buck.get(rk+SEP+SEP+c)||[]; };
  const rowRecs=function(rk){ let a=[]; cNames.forEach(function(c){ a=a.concat(recsOf(rk,c)); }); return a; };
  const many=function(keys,c){ let a=[];
    keys.forEach(function(rk){ a=a.concat(c==null?rowRecs(rk):recsOf(rk,c)); }); return a; };
  const preKeys=function(pfx){ return rKeys.filter(function(rk){ return rk===pfx||rk.indexOf(pfx+SEP)===0; }); };
  return {rKeys:rKeys, cNames:cNames, parts:function(rk){ return rMap.get(rk)||[]; },
          recs:recsOf, rowRecs:rowRecs, many:many, preKeys:preKeys,
          colRecs:function(c){ return many(rKeys,c); },
          allRecs:function(){ return many(rKeys,null); }};
};
GST._pivKey=function(){ return 'gst_piv_'+location.pathname.replace(/[^a-z0-9]/gi,''); };
GST._pivLoad=function(){ try{ return JSON.parse(sessionStorage.getItem(GST._pivKey())||'{}')||{}; }catch(e){ return {}; } };
GST._pivSave=function(o){ try{ sessionStorage.setItem(GST._pivKey(), JSON.stringify(o)); }catch(e){} };

GST.pivotOpen=function(){
  const SPEC=GST._pivot; if(!SPEC) return;
  const T=GST.PIV_T[GST._lang()]||GST.PIV_T.ko, SEP=GST._PIV_SEP, LV=GST.PIV_LV;
  const SETS=SPEC.sets, sv=GST._pivLoad();
  let si=(SETS[sv.s]?+sv.s:0);
  let RD=[0,-1,-1], ci=-1, MS=[0];
  let from=sv.from||'', to=sv.to||'';
  let RF=[null,null,null], CF=null;
  let sortC=sv.sc||'', sortD=(sv.sd===-1?-1:1);
  let disp=sv.disp||'raw', topN=+sv.top||0, showSub=(sv.sub!==0), cmp=(sv.cmp===1);
  let LAST=null, POP=null, VIEW=null;

  const S=function(){ return SETS[si]; };
  const dims=function(){ return S().dims; }, meas=function(){ return S().measures; };
  function norm(){
    const D=dims(), M=meas();
    RD=RD.map(function(v){ return (v>=0&&v<D.length)?v:-1; });
    if(RD.every(function(v){ return v<0; })) RD[0]=0;
    if(ci>=D.length) ci=-1;
    MS=MS.filter(function(i){ return i>=0&&i<M.length; });
    if(!MS.length) MS=[0];
  }
  if(SETS[sv.s]&&Array.isArray(sv.rd)){ RD=sv.rd.slice(0,LV); while(RD.length<LV)RD.push(-1);
    ci=(sv.c==null?-1:+sv.c); MS=Array.isArray(sv.ms)?sv.ms.slice():[0]; }
  else { const D=SETS[si].dims; RD=[0,-1,-1]; ci=D.length>1?1:-1; MS=[0]; }
  norm();
  const active=function(){ return RD.filter(function(v){ return v>=0; }); };
  const save=function(){ GST._pivSave({s:si,rd:RD,c:ci,ms:MS,from:from,to:to,sc:sortC,sd:sortD,disp:disp,top:topN,sub:showSub?1:0,cmp:cmp?1:0}); };

  const opt=function(list,sel,none){ return (none?'<option value="-1"'+(sel<0?' selected':'')+'>'+T.non+'</option>':'')
    + list.map(function(d,i){ return '<option value="'+i+'"'+(i===sel?' selected':'')+'>'+GST._esc(d.t||d.k)+'</option>'; }).join(''); };

  const ov=GST._ovOpen(
     '<div class="gov-h"><h4>🧊 '+T.t+'</h4><span class="gov-sub">'+T.sub+'</span><span class="gov-sp"></span>'
    +'<button class="gov-b" data-piv="copy">'+T.copy+'</button>'
    +'<button class="gov-b" data-piv="csv">'+T.csv+'</button>'
    +'<button class="gov-b" data-piv="close">'+T.close+'</button></div>'
    +'<div class="gpv-c" id="gpvC0"></div>'
    +'<div class="gpv-sc" id="gpvSc"></div><div id="gpvD"></div>', true);

  function ctrls(){
    const D=dims(), M=meas(), hasDate=!!S().date;
    const badge=function(f){ return f?'<span class="gpv-badge">'+f.size+'</span>':''; };
    let h=(SETS.length>1?'<label>'+T.src+'</label><select id="gpvS">'+opt(SETS,si,false)+'</select>':'')
      +(hasDate?('<label>'+T.per+'</label><input type="date" id="gpvF" value="'+from+'">'
                +'<span style="opacity:.6">~</span><input type="date" id="gpvT" value="'+to+'">'):'')
      +'<label>'+T.row+'</label>';
    for(let L=0;L<LV;L++){
      h+='<select id="gpvR'+L+'" data-lv="'+L+'">'+opt(D,RD[L],L>0)+'</select>'
        +(RD[L]>=0?'<button class="gov-b'+(RF[L]?' on':'')+'" data-piv="rf" data-lv="'+L+'" title="'+T.pick+'">▾'+badge(RF[L])+'</button>':'');
    }
    h+='<label>'+T.col+'</label><select id="gpvC">'+opt(D,ci,true)+'</select>'
      +(ci>=0?'<button class="gov-b'+(CF?' on':'')+'" data-piv="cf" title="'+T.pick+'">▾'+badge(CF)+'</button>':'')
      +'<button class="gov-b" data-piv="swap">'+T.swap+'</button>'
      +'<label>'+T.val+'</label><button class="gov-b'+(MS.length>1?' on':'')+'" data-piv="ms">'
        + GST._esc(MS.map(function(i){ return M[i].t||M[i].k; }).join(', ')) +' ▾</button>'
      +'<label>'+T.disp+'</label><select id="gpvDisp">'
        +['raw','row','col','all'].map(function(k){ return '<option value="'+k+'"'+(disp===k?' selected':'')+'>'+T['d_'+k]+'</option>'; }).join('')
      +'</select>'
      +'<label>'+T.top+'</label><input type="number" id="gpvTop" min="0" step="1" value="'+(topN||'')+'"'
        +' placeholder="'+T.t_all+'" title="'+T.top+' N — 0/'+T.t_all+'" style="width:52px">'
      +'<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer">'
        +'<input type="checkbox" id="gpvSub"'+(showSub?' checked':'')+'>'+T.sub_on+'</label>'
      +(hasDate?('<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer" title="'+(T.cmpHint||'')+'">'
        +'<input type="checkbox" id="gpvCmp"'+(cmp?' checked':'')+'>'+T.cmp+'</label>'):'');
    document.getElementById('gpvC0').innerHTML=h;
  }
  function baseRows(){
    let rows=[]; try{ const r=S().rows; rows=(typeof r==='function')?(r()||[]):(r||[]); }catch(e){ rows=[]; }
    const dk=S().date; if(!dk||(!from&&!to)) return rows;
    const fd=from?new Date(from+'T00:00:00Z'):null, td=to?new Date(to+'T23:59:59Z'):null;
    return rows.filter(function(rec){
      const d=GST._pivGet(rec,dk); if(!(d instanceof Date)||isNaN(d)) return false;
      if(fd&&d<fd) return false; if(td&&d>td) return false; return true; });
  }
  function filtered(){
    const D=dims();
    return baseRows().filter(function(rec){
      for(let L=0;L<LV;L++){ if(RD[L]>=0&&RF[L]&&!RF[L].has(GST._pivLbl(GST._pivGet(rec,D[RD[L]].k),T))) return false; }
      if(ci>=0&&CF&&!CF.has(GST._pivLbl(GST._pivGet(rec,D[ci].k),T))) return false;
      return true; });
  }
  const fmtV=function(v,base){
    if(v==null) return '·';
    if(disp==='raw') return GST._num(v);
    if(base==null||!base) return '·';
    return (Math.round(v/base*1000)/10)+'%';
  };
  // Δ 기간비교: A = 기간 필터(비우면 데이터 최신일 기준 최근 30일) · B = 같은 길이의 직전 구간.
  // 열 축을 A/B 버킷 함수로 바꿔치기하면 정렬·소계·%·값필터가 전부 그대로 동작한다.
  function cmpWins(){
    const dk=S().date; if(!dk)return null;
    let a1=to?new Date(to+'T23:59:59Z'):null, a0=from?new Date(from+'T00:00:00Z'):null;
    if(!a1){ let mx=null, rows0=[];
      try{ const r=S().rows; rows0=(typeof r==='function')?(r()||[]):(r||[]); }catch(e){}
      rows0.forEach(function(rec){ const d=GST._pivGet(rec,dk); if(d instanceof Date&&!isNaN(d)&&(!mx||d>mx))mx=d; });
      a1=mx||new Date(); }
    if(!a0) a0=new Date(a1.getTime()-29*864e5);
    const len=a1.getTime()-a0.getTime()+1;
    return {a0:a0,a1:a1,b0:new Date(a0.getTime()-len),b1:new Date(a0.getTime()-1)};
  }
  function draw(){
    ctrls(); save();
    const D=dims(), M=meas(), AC=active();
    let rows, colK=(ci>=0?D[ci].k:null), W=null;
    if(cmp&&S().date){
      W=cmpWins();
      const dk=S().date;
      const dfSave=[from,to]; from=''; to='';        // 기간 필터는 A창 정의로만 쓰고
      const all=filtered(); from=dfSave[0]; to=dfSave[1];
      rows=all.filter(function(rec){ const d=GST._pivGet(rec,dk);
        return d instanceof Date&&!isNaN(d)&&d>=W.b0&&d<=W.a1; });
      colK=function(rec){ const d=GST._pivGet(rec,dk); return d>=W.a0?T.cmpA:T.cmpB; };
    } else rows=filtered();
    const P=GST.pivotCalc(rows, AC.map(function(i){ return D[i].k; }), colK, T);
    const A=GST.pivotAgg;
    const cell =function(rk,c,m){ return A(P.recs(rk,c), M[m]); };
    const rowT =function(rk,m){ return A(P.rowRecs(rk), M[m]); };
    const colT =function(c,m){ return A(P.colRecs(c), M[m]); };
    const preC =function(ks,c,m){ return A(P.many(ks,c), M[m]); };
    const preT =function(ks,m){ return A(P.many(ks,null), M[m]); };
    const grand=function(m){ return A(P.allRecs(), M[m]); };
    const nLv=AC.length;
    const sc=document.getElementById('gpvSc'), dv=document.getElementById('gpvD');
    dv.innerHTML='';
    if(!P.rKeys.length){ sc.innerHTML='<div class="gbf-none">'+T.none+'</div>'; return; }

    // ---- 정렬 ----
    // 중첩일 때는 반드시 1단계 그룹이 붙어 있어야 한다. 그렇지 않으면 같은 그룹의
    // 소계가 표 여기저기서 반복 출력된다. 그래서 정렬은 항상 (그룹, 그 안의 값) 2단계로 한다.
    let keys=P.rKeys.slice();
    const gVal={}; if(nLv>1) keys.forEach(function(rk){ const g=P.parts(rk)[0];
      if(!(g in gVal)) gVal[g]=preT(P.preKeys(g),MS[0])||0; });
    const leafVal=function(rk){
      let v;
      if(!sortC||sortC==='#tot') v=rowT(rk,MS[0]);
      else if(sortC==='#lab') return null;
      else { const q=String(sortC).split(SEP); v=cell(rk,q[0],+q[1]||0); }
      return v==null?-Infinity:v;
    };
    const order=function(list){
      if(sortC==='#lab'){
        list.sort(function(a,b){ return String(a).localeCompare(String(b),undefined,{numeric:true})*(sortD>0?1:-1); });
        return list;
      }
      if(nLv>1) list.sort(function(a,b){
        const ga=P.parts(a)[0], gb=P.parts(b)[0];
        if(ga!==gb) return (gVal[gb]-gVal[ga])*sortD || String(ga).localeCompare(String(gb));
        return (leafVal(b)-leafVal(a))*sortD; });
      else list.sort(function(a,b){ return (leafVal(b)-leafVal(a))*sortD; });
      return list;
    };
    order(keys);
    // ---- 상위 N ----
    // 중첩일 때는 '상위 N개 그룹'(엑셀의 행 필드 상위 N과 같은 의미)을 남긴다.
    // 잎 단위로 자르면 한 그룹이 반토막 나서 소계가 실제와 어긋난다.
    let etcKeys=[];
    if(topN>0){
      if(nLv>1){
        const gs=Object.keys(gVal).sort(function(a,b){ return gVal[b]-gVal[a]; });
        if(gs.length>topN){
          const keep=new Set(gs.slice(0,topN));
          etcKeys=keys.filter(function(rk){ return !keep.has(P.parts(rk)[0]); });
          keys=keys.filter(function(rk){ return keep.has(P.parts(rk)[0]); });
        }
      }else if(keys.length>topN){
        etcKeys=keys.slice(topN); keys=keys.slice(0,topN);
      }
    }
    // 열 축이 없으면 pivotCalc이 만든 합성 '합계' 열과 행 합계 열이 중복된다 → 합계 열만 남긴다
    const noCol=(ci<0);
    const cN=noCol?[]:P.cNames.slice(0,40), cut=noCol?0:(P.cNames.length-cN.length);
    // 히트맵 기준값 (원값일 때만)
    let mx=0; if(disp==='raw') keys.forEach(function(rk){
      if(noCol){ MS.forEach(function(m){ const v=rowT(rk,m); if(v!=null&&v>mx)mx=v; }); }
      else cN.forEach(function(c){ MS.forEach(function(m){ const v=cell(rk,c,m); if(v!=null&&v>mx)mx=v; }); }); });

    const arrow=function(k){ return sortC===k?(sortD>0?' ▼':' ▲'):''; };
    const multi=MS.length>1;
    // ---- 헤더 ----
    let h='<table class="gpv-t"><thead><tr>';
    AC.forEach(function(i,n){ h+= n===0
      ? '<th class="gpv-sort" data-sc="#lab"'+(multi?' rowspan="2"':'')+'>'+GST._esc(D[i].t||D[i].k)+arrow('#lab')+'</th>'
      : '<th'+(multi?' rowspan="2"':'')+'>'+GST._esc(D[i].t||D[i].k)+'</th>'; });
    cN.forEach(function(c){
      if(multi) h+='<th colspan="'+MS.length+'" style="text-align:center">'+GST._esc(c)+'</th>';
      else h+='<th class="gpv-sort" data-sc="'+GST._esc(c+SEP+MS[0])+'">'+GST._esc(c)+arrow(c+SEP+MS[0])+'</th>';
    });
    const cmpOn=!!(W&&cN.indexOf(T.cmpA)>=0&&cN.indexOf(T.cmpB)>=0&&MS.length===1);
    if(cmpOn) h+='<th>'+T.cmpD+'</th>';
    h+= multi?'<th colspan="'+MS.length+'" style="text-align:center">'+T.tot+'</th>'
             :'<th class="gpv-sort" data-sc="#tot">'+T.tot+arrow('#tot')+'</th>';
    h+='</tr>';
    if(multi){
      h+='<tr>';
      cN.forEach(function(c){ MS.forEach(function(m){
        h+='<th class="gpv-sort" data-sc="'+GST._esc(c+SEP+m)+'">'+GST._esc(M[m].t||M[m].k)+arrow(c+SEP+m)+'</th>'; }); });
      MS.forEach(function(m){ h+='<th'+(m===MS[0]?' class="gpv-sort" data-sc="#tot"':'')+'>'+GST._esc(M[m].t||M[m].k)+(m===MS[0]?arrow('#tot'):'')+'</th>'; });
      h+='</tr>';
    }
    h+='</thead><tbody>';
    // ---- 본문 ----
    const cellHTML=function(rk,c,m){
      const v=cell(rk,c,m);
      if(v==null) return '<td>·</td>';
      const base = disp==='row'?rowT(rk,m) : disp==='col'?colT(c,m) : disp==='all'?grand(m) : null;
      const a=(disp==='raw'&&mx>0)?(0.07+0.42*(v/mx)):0;
      return '<td class="gpv-cell" data-r="'+GST._esc(rk)+'" data-c="'+GST._esc(c)+'"'
        +(a?' style="background:rgba(var(--gov-heat),'+a.toFixed(3)+')"':'')+'>'+fmtV(v,base)+'</td>';
    };
    let prev=[];
    const subRow=function(g){
      const ks=P.preKeys(g).filter(function(rk){ return keys.indexOf(rk)>=0; });
      if(!ks.length) return '';
      return '<tr class="gpv-tot"><td colspan="'+nLv+'">'+GST._esc(g)+' '+T.sub2+'</td>'
        + cN.map(function(c){ return MS.map(function(m){
            const v=preC(ks,c,m);
            const base= disp==='row'?preT(ks,m) : disp==='col'?colT(c,m) : disp==='all'?grand(m) : null;
            return '<td>'+fmtV(v,base)+'</td>'; }).join(''); }).join('')
        + (cmpOn?'<td></td>':'')
        + MS.map(function(m){ const v=preT(ks,m);
            return '<td>'+fmtV(v, disp==='raw'?null:(disp==='all'?grand(m):v))+'</td>'; }).join('')
        + '</tr>';
    };
    keys.forEach(function(rk,idx){
      const parts=P.parts(rk);
      if(showSub && nLv>1 && idx>0 && parts[0]!==prev[0]) h+=subRow(prev[0]);
      let lab='';
      for(let L=0;L<nLv;L++){
        const same=(prev.length&&L<nLv-1&&parts.slice(0,L+1).join(SEP)===prev.slice(0,L+1).join(SEP));
        lab+='<td'+(same?' style="opacity:.35"':'')+'>'+(same?'〃':GST._esc(parts[L]))+'</td>';
      }
      let dHtml='';
      if(cmpOn){ const va=cell(rk,T.cmpA,MS[0])||0, vb=cell(rk,T.cmpB,MS[0]);
        if(vb==null||!vb) dHtml='<td>'+(va?'NEW':'·')+'</td>';
        else { const dpc=Math.round(va/vb*1000)/10-100;
          const cc=dpc>0?'var(--bad,#fb7185)':(dpc<0?'var(--ok,#4ade80)':'var(--gov-mut)');
          dHtml='<td style="font-weight:800;color:'+cc+'">'+(dpc>0?'+':'')+(Math.round(dpc*10)/10)+'%</td>'; } }
      h+='<tr>'+lab
        + cN.map(function(c){ return MS.map(function(m){ return cellHTML(rk,c,m); }).join(''); }).join('')
        + dHtml
        + MS.map(function(m){ const v=rowT(rk,m);
            const a2=(noCol&&disp==='raw'&&mx>0&&v!=null)?(0.07+0.42*(v/mx)):0;
            return '<td class="'+(noCol?'gpv-cell':'gpv-tot')+'"'
              +(noCol?' data-r="'+GST._esc(rk)+'" data-c="'+GST._esc(T.tot)+'"':'')
              +(a2?' style="background:rgba(var(--gov-heat),'+a2.toFixed(3)+')"':'')+'>'
              +fmtV(v, disp==='all'?grand(m):(disp==='raw'?null:v))+'</td>'; }).join('')
        + '</tr>';
      prev=parts;
    });
    if(showSub && nLv>1 && prev.length) h+=subRow(prev[0]);
    if(etcKeys.length){
      h+='<tr class="gpv-tot"><td'+(nLv>1?' colspan="'+nLv+'"':'')+'>'+T.etc+' ('+etcKeys.length+')</td>'
        + cN.map(function(c){ return MS.map(function(m){ const v=preC(etcKeys,c,m);
            const base= disp==='col'?colT(c,m) : disp==='all'?grand(m) : disp==='row'?preT(etcKeys,m) : null;
            return '<td>'+fmtV(v,base)+'</td>'; }).join(''); }).join('')
        + (cmpOn?'<td></td>':'')
        + MS.map(function(m){ const v=preT(etcKeys,m);
            return '<td>'+fmtV(v, disp==='all'?grand(m):(disp==='raw'?null:v))+'</td>'; }).join('')+'</tr>';
    }
    h+='</tbody><tfoot><tr class="gpv-tot"><td'+(nLv>1?' colspan="'+nLv+'"':'')+'>'+T.tot+'</td>'
      + cN.map(function(c){ return MS.map(function(m){ const v=colT(c,m);
          const base= disp==='row'?grand(m) : disp==='col'?v : disp==='all'?grand(m) : null;
          return '<td>'+fmtV(v,base)+'</td>'; }).join(''); }).join('')
      + (cmpOn?(function(){ const ta=colT(T.cmpA,MS[0])||0, tb=colT(T.cmpB,MS[0]);
          if(tb==null||!tb) return '<td></td>';
          const dpc=Math.round(ta/tb*1000)/10-100;
          const cc=dpc>0?'var(--bad,#fb7185)':(dpc<0?'var(--ok,#4ade80)':'inherit');
          return '<td style="color:'+cc+'">'+(dpc>0?'+':'')+(Math.round(dpc*10)/10)+'%</td>'; })():'')
      + MS.map(function(m){ const v=grand(m); return '<td>'+fmtV(v, disp==='raw'?null:v)+'</td>'; }).join('')
      + '</tr></tfoot></table>';
    sc.innerHTML=h;
    VIEW={P:P,keys:keys,cN:cN,noCol:noCol,AC:AC,nLv:nLv,cell:cell,rowT:rowT,colT:colT,grand:grand,M:M,D:D};
    LAST=VIEW;
    dv.innerHTML='<div class="gpv-d">'+T.rows.replace('{n}',rows.length.toLocaleString())
      +(cut>0?' · '+T.more.replace('{n}',cut):'')+'</div>';
  }
  function detail(rk,c){
    const dv=document.getElementById('gpvD'); if(!VIEW||!dv) return;
    const recs=VIEW.P.recs(rk,c);
    const cols=(S().detailCols&&S().detailCols.length)?S().detailCols
      : Object.keys(recs[0]||{}).filter(function(k){ const v=recs[0][k];
          return v==null||typeof v!=='object'||v instanceof Date; }).slice(0,7).map(function(k){ return {k:k,t:k}; });
    const show=recs.slice(0,60);
    dv.innerHTML='<div class="gpv-d"><b>'+GST._esc(String(rk).split(SEP).join(' › '))+' × '+GST._esc(c)+'</b> — '+T.detail+' '+recs.length
      +(recs.length>show.length?' ('+T.more.replace('{n}',recs.length-show.length)+')':'')
      +'<div style="overflow:auto;max-height:190px"><table><thead><tr>'
      + cols.map(function(cc){ return '<th>'+GST._esc(cc.t||cc.k)+'</th>'; }).join('')+'</tr></thead><tbody>'
      + show.map(function(rec){ return '<tr>'+cols.map(function(cc){
          const v=GST._pivGet(rec,cc.k);
          return '<td>'+GST._esc(v instanceof Date?GST.fmtDate(v):(v==null?'':v))+'</td>'; }).join('')+'</tr>'; }).join('')
      +'</tbody></table></div></div>';
  }
  // 체크박스 팝오버 — 값 고르기(rf/cf)와 측정값 고르기(ms)를 함께 처리
  function popup(kind, lv, btn){
    const id=kind+lv, was=POP&&POP._id===id;
    if(POP){ POP.remove(); POP=null; }
    if(was) return;
    const D=dims(), M=meas();
    let names=[], counts=null, cur=null;
    if(kind==='ms'){ names=M.map(function(m,i){ return String(i); }); cur=new Set(MS.map(String)); }
    else{
      const di=(kind==='rf')?RD[lv]:ci; if(di<0) return;
      const m=new Map();
      baseRows().forEach(function(rec){ const k=GST._pivLbl(GST._pivGet(rec,D[di].k),T); m.set(k,(m.get(k)||0)+1); });
      names=[...m.keys()].sort(); counts=m;
      const f=(kind==='rf')?RF[lv]:CF; cur=f;
    }
    if(!names.length) return;
    const p=document.createElement('div'); p.className='gpv-pop'; p._id=id;
    p.innerHTML=(kind==='ms'?'':'<input type="search" placeholder="'+T.find+'">')
      +'<div class="gpv-list">'+names.map(function(n){
          const on=(kind==='ms')?cur.has(n):(!cur||cur.has(n));
          const lbl=(kind==='ms')?(M[+n].t||M[+n].k):n;
          return '<label><input type="checkbox" data-v="'+GST._esc(n)+'"'+(on?' checked':'')+'>'
            +'<span>'+GST._esc(lbl)+'</span>'+(counts?'<span class="n">'+counts.get(n).toLocaleString()+'</span>':'')+'</label>'; }).join('')
      +'</div><div class="gpv-pb">'+(kind==='ms'?'':'<button class="gov-b" data-pp="all">'+T.all+'</button>'
      +'<button class="gov-b" data-pp="clr">'+T.clr+'</button>')
      +'<button class="gov-b" data-pp="ok">'+T.apply+'</button></div>';
    const c0=document.getElementById('gpvC0');
    c0.appendChild(p);
    p.style.left=Math.max(8,Math.min(btn.offsetLeft, c0.clientWidth-248))+'px';
    p.style.top=(btn.offsetTop+btn.offsetHeight+6)+'px';
    POP=p;
    const se=p.querySelector('input[type=search]');
    if(se) se.addEventListener('input',function(e){
      const q=e.target.value.trim().toLowerCase();
      p.querySelectorAll('.gpv-list label').forEach(function(l){
        l.style.display=(!q||l.textContent.toLowerCase().indexOf(q)>=0)?'':'none'; });
    });
    p.addEventListener('click',function(e){
      const b=e.target.closest('[data-pp]'); if(!b)return;
      const boxes=[].slice.call(p.querySelectorAll('.gpv-list input'));
      const vis=boxes.filter(function(x){ return x.closest('label').style.display!=='none'; });
      if(b.dataset.pp==='all'){ vis.forEach(function(x){ x.checked=true; }); return; }
      if(b.dataset.pp==='clr'){ vis.forEach(function(x){ x.checked=false; }); return; }
      const sel=new Set(); boxes.forEach(function(x){ if(x.checked) sel.add(x.dataset.v); });
      if(kind==='ms'){ const a=[...sel].map(Number).sort(function(x,y){return x-y;}); MS=a.length?a:[0]; sortC=''; }
      else if(kind==='rf') RF[lv]=(sel.size===boxes.length)?null:sel;
      else CF=(sel.size===boxes.length)?null:sel;
      p.remove(); POP=null; draw();
    });
  }
  function matrix(){
    if(!VIEW) return [];
    const V=VIEW, out=[];
    const head=V.AC.map(function(i){ return V.D[i].t||V.D[i].k; });
    V.cN.forEach(function(c){ MS.forEach(function(m){ head.push(MS.length>1?(c+' · '+(V.M[m].t||V.M[m].k)):c); }); });
    MS.forEach(function(m){ head.push(T.tot+(MS.length>1?(' · '+(V.M[m].t||V.M[m].k)):'')); });
    out.push(head);
    V.keys.forEach(function(rk){
      const r=V.P.parts(rk).slice();
      V.cN.forEach(function(c){ MS.forEach(function(m){ const v=V.cell(rk,c,m); r.push(v==null?'':v); }); });
      MS.forEach(function(m){ const v=V.rowT(rk,m); r.push(v==null?'':v); });
      out.push(r);
    });
    const tot=[T.tot].concat(Array(Math.max(0,V.nLv-1)).fill(''));
    V.cN.forEach(function(c){ MS.forEach(function(m){ const v=V.colT(c,m); tot.push(v==null?'':v); }); });
    MS.forEach(function(m){ const v=V.grand(m); tot.push(v==null?'':v); });
    out.push(tot);
    return out;
  }
  ov.addEventListener('change',function(e){
    const el=e.target;
    if(el.id==='gpvS'){ si=+el.value; RF=[null,null,null]; CF=null; from=to=''; sortC='';
      const D=dims(); RD=[0,-1,-1]; ci=D.length>1?1:-1; MS=[0]; norm(); draw(); return; }
    if(el.id&&el.id.indexOf('gpvR')===0){ const L=+el.dataset.lv; RD[L]=+el.value; RF[L]=null; norm(); draw(); return; }
    if(el.id==='gpvC'){ ci=+el.value; CF=null; sortC=''; draw(); return; }
    if(el.id==='gpvDisp'){ disp=el.value; draw(); return; }
    if(el.id==='gpvTop'){ topN=+el.value; draw(); return; }
    if(el.id==='gpvSub'){ showSub=el.checked; draw(); return; }
    if(el.id==='gpvCmp'){ cmp=el.checked; sortC=''; draw(); return; }
    if(el.id==='gpvF'){ from=el.value; RF=[null,null,null]; CF=null; draw(); return; }
    if(el.id==='gpvT'){ to=el.value;   RF=[null,null,null]; CF=null; draw(); return; }
  });
  ov.addEventListener('click',function(e){
    if(POP && !e.target.closest('.gpv-pop') && !e.target.closest('[data-piv="rf"],[data-piv="cf"],[data-piv="ms"]')){ POP.remove(); POP=null; }
    const th=e.target.closest('.gpv-sort');
    if(th){ const k=th.dataset.sc;
      if(sortC===k){ if(sortD>0) sortD=-1; else { sortC=''; sortD=1; } }   // 내림 → 오름 → 해제
      else { sortC=k; sortD=1; }
      draw(); return; }
    const cell=e.target.closest('.gpv-cell');
    if(cell){ detail(cell.dataset.r, cell.dataset.c); return; }
    const b=e.target.closest('[data-piv]'); if(!b)return;
    const a=b.dataset.piv;
    if(a==='close'){ GST._ovClose(); return; }
    if(a==='rf'){ popup('rf', +b.dataset.lv, b); return; }
    if(a==='cf'){ popup('cf', 0, b); return; }
    if(a==='ms'){ popup('ms', 0, b); return; }
    if(a==='swap'){ const t0=RD[0], f0=RF[0]; RD[0]=(ci<0?RD[0]:ci); ci=(t0<0?-1:t0);
      RF[0]=CF; CF=f0; sortC=''; norm(); draw(); return; }
    if(a==='copy'){
      const txt=matrix().map(function(r){ return r.join('\t'); }).join('\n');
      const done=function(){ b.textContent=T.copied; setTimeout(function(){ b.textContent=T.copy; },1400); };
      if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,function(){});
      else { const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta);
             ta.select(); try{ document.execCommand('copy'); done(); }catch(err){} ta.remove(); }
      return;
    }
    if(a==='csv'){
      const esc=function(v){ const s2=String(v==null?'':v); return /[",\n]/.test(s2)?'"'+s2.replace(/"/g,'""')+'"':s2; };
      const csv='﻿'+matrix().map(function(r){ return r.map(esc).join(','); }).join('\r\n');
      try{ const bl=new Blob([csv],{type:'text/csv;charset=utf-8'}), u=URL.createObjectURL(bl);
        const el2=document.createElement('a'); el2.href=u;
        el2.download='pivot-'+(S().t||S().k||'data')+'.csv';
        document.body.appendChild(el2); el2.click(); el2.remove(); setTimeout(function(){ URL.revokeObjectURL(u); },1500);
      }catch(err){}
    }
  });
  draw();
};

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

/* ============================================================
   26. 대시보드 챗봇 — 답변 엔진
   ① 로컬: 수집한 fact(화면의 숫자)에서 질문과 맞는 항목을 찾아 즉답. 배포 없이 바로 동작.
   ② AI  : GST.FN_CHAT 엣지펑션이 있으면 같은 fact를 Claude에 넘겨 자유 문장으로 답한다.
   숫자는 어느 경로든 대시보드가 계산한 값 그대로라 화면과 어긋나지 않는다.
   ============================================================ */
// 웹 챗봇도 카카오봇과 같은 엔진을 쓴다(kakao-bot의 op=web 분기) — 한 두뇌, 두 프런트엔드.
// 봇이 시트를 bot_cache에 미러링해 두므로 행 단위 질문(라인×기간 교차 등)에도 답할 수 있다.
GST.FN_CHAT = (typeof window!=='undefined' && window.GST_FN_CHAT) || 'kakao-bot';
GST._chatNorm = function(s){ return GST.nfw(String(s==null?'':s)).toLowerCase().replace(/[\s,·]/g,''); };
// 질문↔항목 유사도 — 한국어는 조사가 붙어 토큰이 어긋나므로 부분일치 위주로 센다
GST._chatScore = function(q, text){
  const a=GST._chatNorm(q), b=GST._chatNorm(text); if(!a||!b)return 0;
  let sc=0; if(a.indexOf(b)>=0||b.indexOf(a)>=0)sc+=b.length*2;
  const toks=String(text).split(/[\s()·,\/|]+/).filter(function(t){return t.length>1;});
  toks.forEach(function(t){ if(a.indexOf(GST._chatNorm(t))>=0)sc+=GST._chatNorm(t).length; });
  const SYN={'인원':'명 사람 인력','고장':'bm 알람 문제','공수':'시간 man','교육':'이수 훈련',
             '완료율':'달성률 진행율','설치':'install','휴가':'연차','퇴사':'이탈','입사':'채용'};
  Object.keys(SYN).forEach(function(k){ if(b.indexOf(k)>=0)SYN[k].split(' ').forEach(function(w){ if(a.indexOf(w)>=0)sc+=2; }); });
  return sc;
};
GST.chatLocal = function(q, packs){
  const hits=[];
  (packs||[]).forEach(function(P){
    (P.kpi||[]).forEach(function(k){ hits.push({s:GST._chatScore(q,k.name),kind:'kpi',tab:P.title||P.tab,
      txt:k.name+' — **'+k.value+'**'+(k.sub?' ('+k.sub+')':'')}); });
    (P.series||[]).forEach(function(w){ const n=w.data.length; if(!n)return;
      const last=w.data[n-1], prev=n>1?w.data[n-2]:null;
      const dl=(prev!=null&&isFinite(prev)&&isFinite(last))?(last-prev):null;
      hits.push({s:GST._chatScore(q,w.name),kind:'series',tab:P.title||P.tab,
        txt:w.name+' — 최근 '+(w.labels[n-1]||'')+' **'+last+(w.unit||'')+'**'
           +(dl!=null?(' (직전 대비 '+(dl>0?'+':'')+Math.round(dl*10)/10+')'):'')}); });
    (P.groups||[]).forEach(function(g){
      const head=g.top.slice(0,5).map(function(t){return t.name+' '+t.count;}).join(' · ');
      hits.push({s:GST._chatScore(q,g.by)+GST._chatScore(q,g.set)*0.6,kind:'group',tab:P.title||P.tab,
        txt:g.set+' · '+g.by+'별 (총 '+g.total+') — '+head}); });
  });
  hits.sort(function(a,b){return b.s-a.s;});
  const best=hits.filter(function(h){return h.s>=4;}).slice(0,4);
  if(!best.length)return null;
  return best.map(function(h){return '· '+h.txt+'  <span class="ct-src">'+h.tab+'</span>';}).join('\n');
};
GST.chatAI = async function(q, packs, hist){
  if(!GST.SB_URL) throw new Error('no-endpoint');
  var tok=null; try{ tok=await GST.token(); }catch(e){}
  if(!tok){ var e401=new Error('unauthorized'); e401.status=401; throw e401; }   // 봇 웹 분기는 로그인 필수
  var h={'Content-Type':'application/json',Authorization:'Bearer '+tok};
  var res=await fetch(GST.SB_URL+'/functions/v1/'+GST.FN_CHAT+'?op=web',
    {method:'POST',headers:h,body:JSON.stringify({q:q,facts:packs,history:(hist||[]).slice(-6)})});
  var txt=await res.text(), data=null; try{ data=JSON.parse(txt); }catch(e){}
  if(!res.ok)throw new Error((data&&data.error)||('HTTP '+res.status));
  return (data&&(data.answer||data.text))||'';
};

global.GST = GST;
})(window);
