/* ============================================================================
   offline/shim.js — 오프라인 단일 HTML 에 심어지는 런타임 (v137)

   «오프라인 판»은 /offline/ 내보내기 화면이 배포 코드를 fetch 해 브라우저에서 조립하는
   단일 HTML 이다(offline.html + data.js 두 파일 · file:// 로 연다). 이 파일은 그 안에서
   core.js «뒤»에 그대로 이어 붙는다 — t-kpi 의 STUB 과 같은 이음새로, core 는 모든 내부
   참조를 GST.x 프로퍼티 조회로 하므로 뒤에서 갈아끼우면 그대로 먹힌다.

   지키는 규약 셋:
   · 조용한 0 금지 — 스냅샷에 없는 gid/표는 «크게» 던진다. 빈 화면이 제일 나쁘다.
   · 조용한 무반응 금지(v105) — 오프라인에서 못 하는 버튼(PPT·엑셀·저장)은 눌렀을 때
     이유를 말한다. 쓰기는 «온라인 viewer 계정과 똑같은» read_only/0행 경로로 거절된다.
   · 기준 시각을 항상 밝힌다(v128) — 출처 배지가 「오프라인 스냅샷 · 기준 …」 을 적는다.
     조용히 두면 보는 사람이 스냅샷을 오늘 값으로 읽는다.

   ⚠ 이 파일은 온라인 페이지에는 «실리지 않는다». 혹시 실수로 실려도 __OFFLINE__ 가드가
     아무 일도 하지 않게 막는다. 온라인 동작은 한 글자도 바뀌면 안 된다.
   ⚠ 스냅샷 배열은 여덟 iframe 이 «한 인스턴스»를 공유한다(374MB 를 여덟 벌 복사할 수는
     없다). 페이지는 원본 행을 읽기만 한다는 관례 위에 서 있다 — 원본 2D 행을 제자리에서
     고치는 코드를 페이지에 넣으면 안 된다(t-offline 의 동일성 대조가 어긋나기 시작한다).
   ============================================================================ */
(function(){
'use strict';
if(!window.__OFFLINE__) return;                       // 온라인 보호 가드
if(typeof GST==='undefined'){ try{ console.error('[offline] core.js 가 먼저 실려야 한다'); }catch(e){} return; }

var GSTOFF = window.GSTOFF = window.GSTOFF || {};

/* ---------- 공통 작은 도구 ---------- */
function domReady(){
  return new Promise(function(res){
    if(document.readyState!=='loading') return res();
    document.addEventListener('DOMContentLoaded', function(){ res(); });
  });
}
/* 셸이면 자기 자신, 페이지(srcdoc)면 부모가 스냅샷을 든다 — srcdoc 은 부모 출처를 상속하므로 읽을 수 있다 */
function offRoot(){
  if(window.__OFF) return window.__OFF;
  try{ if(window.parent && window.parent.__OFF) return window.parent.__OFF; }catch(e){}
  return null;
}
function snapReady(){
  var R = offRoot();
  if(!R) return Promise.reject(new Error('OFFLINE_NO_SNAP — data.js 가 로드되지 않았습니다'));
  return R.ready();
}
GSTOFF.msgRO = function(){ return '오프라인 판 — 저장되지 않습니다 (시연용 읽기 전용)'; };
GSTOFF.msgNS = function(){ return '오프라인 판에서는 지원하지 않습니다 (온라인 대시보드에서 쓰세요)'; };

/* ---------- ① 인증 — t-kpi STUB 과 같은 이음새 ---------- */
GST.USE_DB = false;
GST.authOn = function(){ return false; };
GST.getSession = async function(){ return { user:{ email:'offline@local' } }; };
GST.token = async function(){ return null; };
GST.db = async function(){ return { from: miniFrom }; };          // pm_adjust 전용 미니 빌더(아래)
GST.sb = async function(){ throw new Error(GSTOFF.msgNS()); };    // supabase-js 를 기다리다 15초 멎는 길을 끊는다
GST.signOut = function(){ try{ alert(GSTOFF.msgNS()); }catch(e){} };
GST.authGate = async function(){
  /* 셸은 authGate 가 풀리는 즉시 start() 를 돌린다 — data.js·__FILES 가 본문 끝에 있으므로
     파싱이 끝나기 «전»에 풀리면 frameSrc 가 빈 __FILES 를 만난다. DOM 완성까지 기다린다. */
  await domReady();
  if(window.__OFF_FATAL){                              // data.js 없음/잘림 — 로그인처럼 멈추고 할 일을 적는다
    GSTOFF._fatalCard(window.__OFF_FATAL);
    return new Promise(function(){});                  // 온라인 fail-closed 와 같은 모양 — start() 가 영영 안 돈다
  }
  var o = document.getElementById('loginOverlay'); if(o) o.remove();
  if(GST._authOk) GST._authOk();
  return true;
};

/* 등급은 viewer 로 «명시적으로» 고정한다 — authOn=false 에 _me 가 없으면 isAdmin() 이
   true(legacy) 가 되어 업로드 버튼·관리자 메타가 전부 열린다. 시연 화면은 온라인 viewer
   와 똑같이 보여야 한다. _meP 까지 심어 loadMe 가 네트워크 없이 끝나게 한다. */
GST._meApply({ email:'offline@local', can_write:false, role:'viewer' });
GST._meP = Promise.resolve(GST._me);
/* 이 심은 <head> 에서 돈다 — body 가 아직 없어 dataset.role 이 못 실린다. DOM 이 서면
   한 번 더 발라 CSS 등급 게이트(body[data-role])가 viewer 로 제대로 잠기게 한다. */
domReady().then(function(){ try{ GST._meApply(GST._me); }catch(e){} });

/* dbWrite — perm 은 위 viewer 를 돌려주고, 나머지는 온라인 viewer 가 받는 그 에러다.
   (fault:sheetWrite('perm')·hr 편집·fault dq 저장이 이 길로 온다 — 페이지의 기존
   read_only 처리·문구가 그대로 동작한다. 새 문구를 지어내지 않는다.) */
GST.dbWrite = async function(op){
  if(op==='perm') return { ok:true, email:'offline@local', can_write:false, role:'viewer' };
  throw GST._dbwErr('read_only', 403);
};

/* ---------- ② 데이터 — 스냅샷 파사드 ---------- */
/* fetchCSVCached 가 돌려주던 «그 모양» 그대로 돌려준다({rows,cached,ageMin,src}).
   스냅샷에는 라이브에서 같은 함수가 돌려준 그 배열이 담겨 있다(_cipBand 띠·_abpWide
   크로스탭 재편이 이미 끝난 결과) — 재성형 규칙을 여기 복제하지 않는다(제2원칙). */
/* 빠진 표는 던지는 것으로 끝내지 않는다 — failNote 는 에러 원문을 관리자에게만 붙이는데
   오프라인 판은 viewer 고정이라, 띠를 직접 세워 «누구나» 무엇이 빠졌는지 보게 한다. */
function snapMiss(msg){
  try{
    var d=document.createElement('div');
    d.style.cssText='background:#7f1d1d;color:#fff;padding:8px 14px;font:12px/1.6 sans-serif;position:relative;z-index:99998';
    d.textContent='⚠️ '+msg;
    (document.body||document.documentElement).prepend(d);
  }catch(e){}
  return new Error(msg);
}
GST.fetchCSVCached = async function(url, key){
  var gm = String(url||'').match(/[?&]gid=(\d+)/), gid = gm && gm[1];
  var S = await snapReady();
  if(!gid || !S.gid[gid] || !S.gid[gid].length)
    throw snapMiss('SNAP_MISSING gid='+gid+' — 스냅샷에 이 표가 없습니다. /offline/ 에서 데이터를 다시 내보내 주세요');
  return { rows:S.gid[gid], cached:false, ageMin:0, src:'snap' };
};
/* report 가 국내 알람·올바 원장을 이 함수로 직접 읽는다(맨 2D 배열) */
GST.csvTableRows = async function(tbl){
  var S = await snapReady();
  if(!S.tbl[tbl]) throw snapMiss('SNAP_MISSING tbl='+tbl+' — 스냅샷에 이 표가 없습니다. /offline/ 에서 데이터를 다시 내보내 주세요');
  return S.tbl[tbl];
};
/* pm_adjust · ops_params · ops_targets 미니 빌더 — 읽기는 스냅샷, 쓰기는 «0행 반환»(RLS 거부 규율 그대로 — pm 이
   낙관적 반영을 스스로 되돌리고 「읽기전용」이라 말한다. 거짓 「저장됨」이 안 나온다). */
function miniFrom(tbl){
  var q = { _w:false, _single:false };
  ['select','eq','neq','gt','gte','lt','lte','ilike','order','limit','range','in','is','not'].forEach(function(m){ q[m]=function(){ return q; }; });   // is·not — 운영 목표 읽기(v172 · 감춘 목표는 스냅샷에 애초에 없다)
  ['upsert','insert','update','delete'].forEach(function(m){ q[m]=function(){ q._w=true; return q; }; });
  q.maybeSingle = function(){ q._single=true; return q; };
  q.single = q.maybeSingle;
  q.then = function(res, rej){
    return snapReady().then(function(S){
      if(q._w) return { data:[], error:null };                       // 0행 = 권한 없음(페이지가 아는 모양)
      var rows = S.tbl[tbl] || [];                                   // pm_adjust 는 객체 배열로 담긴다
      return { data: q._single ? (rows[0]||null) : rows, error:null };
    }).then(res, rej);
  };
  return q;
}

/* ---------- ③ 네트워크가 남아 있으면 «크게» 끊는다 ---------- */
GST.chatAI = async function(){ throw new Error('OFFLINE'); };        // 셸이 즉시 chatLocal(기본 응답)로 간다
GST.proxyFetch = async function(){ throw new Error('OFFLINE_NET proxyFetch'); };
GST.fetchCSV = async function(u){ throw new Error('OFFLINE_NET '+u); };
GST.fetchCSVFresh = async function(u){ throw new Error('OFFLINE_NET '+u); };
GST.sheetWrite = async function(op, gid, body, params){
  if(GST.DBW && GST.DBW[gid]) return GST.dbWrite(op, gid, body, params);
  throw new Error(GSTOFF.msgRO());
};
GST.pptLoad = GST.zipLoad = GST.xlsxLibLoad = async function(){ throw new Error(GSTOFF.msgNS()); };
/* 남아 있을지 모르는 fetch 는 전부 «말하면서» 거절한다 — 조용한 무반응 금지(v105).
   (report 의 qbr-template.pptx 로드가 이 길로 와서 「미지원」 문구를 그대로 띄운다) */
window.fetch = function(u){ return Promise.reject(new Error(GSTOFF.msgNS()+' ['+u+']')); };

/* ---------- ④ 갱신·배지 ---------- */
GST.startAutoRefresh = function(){};                                 // 스냅샷은 스스로 안 바뀐다 — 30분 재로딩이 무의미
/* 출처 배지 — 「오프라인 스냅샷 · 기준 …」. _srcChip 를 통째로 바꾼다: 원본은 snap 을
   «시트 폴백»으로 세어 ⚠ 를 띄우는데, 그 ⚠ 는 «문제»라는 뜻이라 여기선 거짓말이 된다. */
GST._srcChip = function(){
  try{
    if(!document.body) return;
    var R = offRoot(), at = R && R.meta && R.meta.at ? String(R.meta.at) : '';
    var el = document.getElementById('gstSrcChip');
    if(!el){
      el = document.createElement('div'); el.id='gstSrcChip';
      el.style.cssText='position:fixed;left:10px;bottom:10px;z-index:999998;padding:4px 10px;border-radius:999px;'+
        'font:11px/1.5 system-ui,-apple-system,sans-serif;font-weight:700;opacity:.85;user-select:none;cursor:default';
      document.body.appendChild(el);
    }
    el.style.background='#1e3a5f'; el.style.color='#bfdbfe';
    el.textContent='오프라인 스냅샷 · 기준 '+at.replace('T',' ').slice(0,16)+' · core '+GST.VER;
    el.title='이 화면은 내보낸 시점의 데이터입니다 — 네트워크를 쓰지 않습니다. 최신 값은 온라인 대시보드에서 보세요.';
  }catch(e){}
};

/* ---------- ⑤ 셸 부트(셸 문서에서만 호출된다) ---------- */
/* data.js 형식:
     window.__SNAP_META = {at, core, counts:{'gid:646668307':n, 'tbl:sheet_alarm':n, ...}}
     window.__SNAP_PARTS = [[kind('gid'|'tbl'), key, b64(gzip(JSON 행 블록))], ...]
   wk 가 374MB JSON 이라 «한 문자열»로는 V8 문자열 한도·메모리를 친다 — 행 블록 조각으로
   쓰고 조각마다 풀어 이어 붙인다(라이브가 1,000행씩 페이징하는 것과 같은 철학). */
GSTOFF.bootShell = function(){
  if(!window.__SNAP_META || !window.__SNAP_PARTS){
    window.__OFF_FATAL = 'data.js 가 없거나 깨져 있습니다.\noffline.html 과 «같은 폴더»에 data.js 를 두세요.\n(/offline/ 내보내기 화면에서 「데이터 내보내기」로 받습니다)';
    return;
  }
  if(typeof DecompressionStream==='undefined'){
    window.__OFF_FATAL = '이 브라우저에는 압축 해제 기능(DecompressionStream)이 없습니다.\nChrome 또는 Edge(80 이상)로 열어 주세요.';
    return;
  }
  var META = window.__SNAP_META, PARTS = window.__SNAP_PARTS;
  var S = { gid:{}, tbl:{} };
  var prog = null;
  function note(txt){
    try{
      if(!document.body) return;
      if(!prog){ prog=document.createElement('div'); prog.id='gstOffProg';
        prog.style.cssText='position:fixed;right:10px;bottom:10px;z-index:999998;padding:4px 10px;border-radius:999px;'+
          'font:11px/1.5 system-ui,sans-serif;font-weight:700;background:#1e3a5f;color:#bfdbfe;opacity:.9';
        document.body.appendChild(prog); }
      if(txt==null){ prog.remove(); prog=null; } else prog.textContent=txt;
    }catch(e){}
  }
  function inflate(b64){
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
    var ds = new DecompressionStream('gzip');
    return new Response(new Blob([u]).stream().pipeThrough(ds)).text().then(JSON.parse);
  }
  var readyP = (async function(){
    /* counts 에 적힌 키는 «빈 배열로 먼저» 만들어 둔다 — 행이 0인 표(비어 있는 pm_adjust 등)는
       조각이 하나도 없어서, 이 선적재가 없으면 «정당하게 빈 표»와 «아예 안 담긴 표»를
       파사드가 구분할 수 없다(빈 표를 SNAP_MISSING 으로 오판해 화면이 죽는다). */
    var c0 = META.counts||{};
    Object.keys(c0).forEach(function(k){ var m=k.split(':'); (m[0]==='gid'?S.gid:S.tbl)[m[1]]=[]; });
    for(var i=0;i<PARTS.length;i++){
      var p=PARTS[i], tgt=(p[0]==='gid'?S.gid:S.tbl), key=p[1];
      var chunk = await inflate(p[2]);
      var arr = tgt[key] || (tgt[key]=[]);
      for(var j=0;j<chunk.length;j++) arr.push(chunk[j]);
      note('스냅샷 푸는 중 '+(i+1)+'/'+PARTS.length);
    }
    /* 잘린 data.js 를 모자란 채로 그리지 않는다 — CSV_SHORT/MIRROR_SHORT 와 같은 규율 */
    var c = META.counts||{};
    Object.keys(c).forEach(function(k){
      var m=k.split(':'), got=((m[0]==='gid'?S.gid:S.tbl)[m[1]]||[]).length;
      if(got!==c[k]) throw new Error('SNAP_SHORT '+k+' — 기대 '+c[k]+'행, 실제 '+got+'행. data.js 가 잘렸습니다 — 다시 내보내 주세요');
    });
    note(null);
    return S;
  })();
  readyP.catch(function(e){
    window.__OFF_FATAL = String((e&&e.message)||e);
    note(null); GSTOFF._fatalCard(window.__OFF_FATAL);
  });
  window.__OFF = { meta:META, ready:function(){ return readyP; } };
  domReady().then(function(){ GST._srcChip(); try{ var lb=document.getElementById('logoutBtn'); if(lb) lb.style.display='none'; }catch(e){} });
};

GSTOFF._fatalCard = function(msg){
  try{
    var o = document.getElementById('loginOverlay');
    if(!o){ o=document.createElement('div'); o.id='loginOverlay';
      o.style.cssText='position:fixed;inset:0;z-index:99999;background:#070b10'; document.body.appendChild(o); }
    o.innerHTML='';
    var c=document.createElement('div');
    c.style.cssText='max-width:460px;margin:18vh auto 0;padding:26px 28px;border-radius:14px;background:#111823;'+
      'color:#e5e7eb;font:14px/1.8 system-ui,sans-serif;white-space:pre-line;border:1px solid rgba(151,170,196,.25)';
    c.textContent='⚠️ 오프라인 판을 열 수 없습니다\n\n'+msg;
    o.appendChild(c);
  }catch(e){}
};

/* ---------- ⑥ 페이지 부트(페이지 srcdoc 에서 자동) ---------- */
if(window.__PAGE_PATH){
  /* 로드가 끝나면 페이지에도 오프라인 배지를 세운다 — 각 페이지의 _srcNote 가 부르는
     _srcChip 이 이미 위 오프라인 판이라 따로 할 일은 타이밍 하나뿐이다. */
  domReady().then(function(){ GST._srcChip(); });
}
})();
