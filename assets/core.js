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
/* ---------- 0.1 버전 ----------
   페이지들은 배포본 core.js 를 «절대경로»로 부른다. 그래서 core.js 만 캐시에 옛 것이 남으면
   페이지는 새 API(GST.ORG.emp 같은 것)를 부르다 TypeError 로 죽는데, 화면에는 «숫자가 전부 0» 으로만
   보인다 — 원인을 짚을 단서가 하나도 없는 실패다. 페이지가 필요한 버전을 선언하게 해서
   그 상황을 «조용한 0» 이 아니라 «붉은 배너» 로 만든다. 기능을 추가하면 이 숫자를 올린다. */
GST.VER = 168;   /* 기능 추가 시 올린다 — 출처 배지에 «core N» 으로 찍혀, 브라우저가 옛 코드를 물고 있는지 눈으로 판정한다(v128 사고의 교훈) */
/* «이 페이지가 누구인가»는 location.pathname 이 아니라 여기서 묻는다 (v137 · 오프라인 판).
   오프라인 단일 HTML 은 페이지를 srcdoc iframe 으로 띄우는데, srcdoc 의 pathname 은 전부
   'srcdoc' 한 값이다 — 그대로 쓰면 축편집(axbKey)·피벗(sessionStorage)·섹션탭 저장 키가
   여덟 페이지에서 «한 키»로 충돌하고, 챗봇 출처 라벨·자동순회 페이지 id 도 전부 같아진다.
   에러는 하나도 안 나고, 마지막에 저장한 페이지가 남의 설정을 덮을 뿐이다. 오프라인 심이
   페이지마다 __PAGE_PATH('/fault/')를 심고, 온라인에서는 지금까지와 한 글자도 다르지 않다. */
GST.pagePath = function(){ return window.__PAGE_PATH || location.pathname; };
/* 인사이트 띠의 머리글. 예전에는 «INSIGHT» 영문 대문자가 core 에 박혀 있어 네 언어 어디서도 안 바뀌고
   PPT 장표까지 그대로 나갔다(v135). core 의 공용 문자열 관례(GST._lang + 사전) 그대로다. */
GST.INS_T = {ko:'요약', en:'Summary', zh:'摘要', ja:'要約'};
GST.insHead = function(){ var l=(GST._lang && GST._lang()) || 'ko'; return GST.INS_T[l] || GST.INS_T.ko; };

/* 사이드바·칩·출처 배지·상태줄의 공용 문구 (v135 · 5단계). 예전에는 core.js 에 한국어로 박혀 있어
   페이지 언어를 바꿔도 그 열여덟 칸은 그대로였다. 규약은 GST.XXX_T + GST._lang() 한 벌. */
GST.FLT_T = {
  ko:{ axes:{region:'구분', op:'운영단위', div:'사업부', customer:'고객사', campus:'단지', line:'라인', line2:'라인2', team:'팀', period:'기간'},
       grpEq:'설비 기준', grpEqNote:'설치·실적', grpHr:'인원 기준', grpHrNote:'인원현황', hrPrefix:'인원 ',
       all:'전체', emptyNone:'전체 (이 화면 미적용)', emptyFilt:'전체 (필터에 해당 없음)',
       own:'이 페이지 전용', ownPeriod:'이 페이지 전용 · 기간', filters:'필터 · Filters', dtOwn:'이 화면은 자체 기준일을 씁니다',
       selAll:'전체 선택', selNone:'전체 해제', reset:'↺ 초기화', csvTitle:'현재 필터가 적용된 표를 CSV 로 내려받습니다',
       autoTitle:'{n}분마다 데이터만 다시 불러옵니다. 필터는 유지됩니다.', auto:'⟳ 자동 {n}분',
       p1m:'1개월', p3m:'3개월', p6m:'6개월', p1y:'1년', pall:'전체', chipsActive:'활성 필터', chipsClear:'전체 해제' },
  en:{ axes:{region:'Region', op:'Entity', div:'Division', customer:'Customer', campus:'Site', line:'Line', line2:'Line 2', team:'Team', period:'Period'},
       grpEq:'Equipment', grpEqNote:'install · records', grpHr:'People', grpHrNote:'roster', hrPrefix:'People ',
       all:'All', emptyNone:'All (not applicable here)', emptyFilt:'All (none under current filters)',
       own:'This page only', ownPeriod:'This page only · period', filters:'Filters', dtOwn:'This page uses its own reference date',
       selAll:'Select all', selNone:'Clear', reset:'↺ Reset all', csvTitle:'Download the filtered table as CSV',
       autoTitle:'Reloads data every {n} min. Filters are kept.', auto:'⟳ Auto {n} min',
       p1m:'1 mo', p3m:'3 mo', p6m:'6 mo', p1y:'1 yr', pall:'All', chipsActive:'Active filters', chipsClear:'Clear all' },
  zh:{ axes:{region:'区分', op:'运营单位', div:'事业部', customer:'客户', campus:'园区', line:'线', line2:'线2', team:'团队', period:'期间'},
       grpEq:'设备基准', grpEqNote:'安装·实绩', grpHr:'人员基准', grpHrNote:'人员现况', hrPrefix:'人员 ',
       all:'全部', emptyNone:'全部 (此页面不适用)', emptyFilt:'全部 (当前筛选无匹配)',
       own:'仅此页面', ownPeriod:'仅此页面 · 期间', filters:'筛选 · Filters', dtOwn:'此页面使用自己的基准日',
       selAll:'全选', selNone:'全部取消', reset:'↺ 重置', csvTitle:'下载当前筛选的表格 (CSV)',
       autoTitle:'每{n}分钟仅重新加载数据，筛选保持不变。', auto:'⟳ 自动 {n}分',
       p1m:'1个月', p3m:'3个月', p6m:'6个月', p1y:'1年', pall:'全部', chipsActive:'活动筛选', chipsClear:'全部清除' },
  ja:{ axes:{region:'区分', op:'運営単位', div:'事業部', customer:'顧客', campus:'団地', line:'ライン', line2:'ライン2', team:'チーム', period:'期間'},
       grpEq:'設備基準', grpEqNote:'設置·実績', grpHr:'人員基準', grpHrNote:'人員現況', hrPrefix:'人員 ',
       all:'全体', emptyNone:'全体 (この画面は対象外)', emptyFilt:'全体 (現在のフィルタに該当なし)',
       own:'このページ専用', ownPeriod:'このページ専用 · 期間', filters:'フィルタ · Filters', dtOwn:'この画面は独自の基準日を使います',
       selAll:'全て選択', selNone:'全て解除', reset:'↺ リセット', csvTitle:'現在のフィルタ適用表を CSV で保存',
       autoTitle:'{n}分ごとにデータだけ再読み込みします。フィルタは維持されます。', auto:'⟳ 自動 {n}分',
       p1m:'1ヶ月', p3m:'3ヶ月', p6m:'6ヶ月', p1y:'1年', pall:'全体', chipsActive:'有効フィルタ', chipsClear:'全解除' }
};
GST._fltT = function(){ var l=(GST._lang && GST._lang()) || 'ko'; return GST.FLT_T[l] || GST.FLT_T.ko; };
GST.SRC_T = {
  ko:{ db:'Supabase', sheet:'시트', cache:'캐시', dbL:'Supabase', sheetL:'구글시트', cacheL:'브라우저 캐시', src:'출처', reuse:'재사용', idbFail:'⚠ 캐시 저장 실패',
       title:'데이터를 어디서 읽었는지 — 누르면 자세히', idbTitle:'IndexedDB: {e} — 매번 다시 받습니다',
       verTitle:'화면 코드 버전', verBad:' · 자료 출처에 이상이 있습니다 — 관리자에게 알려 주세요', rows:'행', vmap:'기준 정보 — {t}: 규칙 {r}개 · {n}행을 바꿔 읽음' },
  en:{ db:'Supabase', sheet:'sheet', cache:'cache', dbL:'Supabase', sheetL:'Google Sheet', cacheL:'browser cache', src:'Source', reuse:'reused', idbFail:'⚠ cache save failed',
       title:'Where the data came from — click for details', idbTitle:'IndexedDB: {e} — fetching every time',
       verTitle:'Page code version', verBad:' · a data source has a problem — tell the admin', rows:' rows', vmap:'Value rules — {t}: {r} rules · {n} rows re-read' },
  zh:{ db:'Supabase', sheet:'表格', cache:'缓存', dbL:'Supabase', sheetL:'谷歌表格', cacheL:'浏览器缓存', src:'来源', reuse:'复用', idbFail:'⚠ 缓存保存失败',
       title:'数据来源 — 点击查看详情', idbTitle:'IndexedDB: {e} — 每次重新获取',
       verTitle:'页面代码版本', verBad:' · 数据来源异常 — 请联系管理员', rows:'行', vmap:'基准信息 — {t}：规则 {r} 条 · {n} 行改读' },
  ja:{ db:'Supabase', sheet:'シート', cache:'キャッシュ', dbL:'Supabase', sheetL:'Googleシート', cacheL:'ブラウザキャッシュ', src:'出所', reuse:'再利用', idbFail:'⚠ キャッシュ保存失敗',
       title:'データの読み込み元 — 押すと詳細', idbTitle:'IndexedDB: {e} — 毎回再取得します',
       verTitle:'画面コードのバージョン', verBad:' · データ出所に異常があります — 管理者へ', rows:'行', vmap:'基準情報 — {t}：ルール {r} 件 · {n} 行を読み替え' }
};
GST._srcT = function(){ var l=(GST._lang && GST._lang()) || 'ko'; return GST.SRC_T[l] || GST.SRC_T.ko; };
/* 상태줄 — 캐시 표시·로드 실패·빈 결과. 실패 «부류»별 한 줄(무엇을 하면 되는지) + 원문은 관리자에게만(A-4). */
GST.STA_T = {
  ko:{ stale:'📡 시트 접속 실패 — 캐시({n}분 전) 표시 중', staleNoAge:'📡 시트 접속 실패 — 캐시 표시 중',
       failAuth:'로그인이 만료되었거나 권한이 없습니다 — 다시 로그인하세요',
       failNet:'서버에 연결하지 못했습니다 — 네트워크를 확인하고 새로고침하세요',
       failData:'자료 표가 비어 있거나 적재가 끝나지 않았습니다 — 관리자에게 알려 주세요',
       failRead:'자료를 읽지 못했습니다 — 새로고침해 보고, 계속되면 관리자에게 알려 주세요',
       failGen:'데이터를 불러오지 못했습니다 — 새로고침해 보고, 계속되면 관리자에게 알려 주세요',
       emptyFilt:'현재 필터에 맞는 행이 없습니다 — 필터를 지우면 {n}건', emptyClear:'필터 해제',
       emptyTable:'이 화면이 보는 표에 행이 없습니다 — 관리자에게 알려 주세요', emptyRows:'해당 행이 없습니다' },
  en:{ stale:'📡 Sheet unreachable — showing cached data ({n} min old)', staleNoAge:'📡 Sheet unreachable — showing cached data',
       failAuth:'Session expired or no permission — sign in again',
       failNet:'Could not reach the server — check the network and refresh',
       failData:'The data table is empty or still loading on the server — tell the admin',
       failRead:'Could not read the data — refresh, and tell the admin if it persists',
       failGen:'Failed to load data — refresh, and tell the admin if it persists',
       emptyFilt:'No rows match the current filters — clearing them shows {n}', emptyClear:'Clear filters',
       emptyTable:'The table this page reads has no rows — tell the admin', emptyRows:'No rows' },
  zh:{ stale:'📡 无法连接表格 — 显示缓存({n}分钟前)', staleNoAge:'📡 无法连接表格 — 显示缓存',
       failAuth:'登录已过期或无权限 — 请重新登录',
       failNet:'无法连接服务器 — 请检查网络后刷新',
       failData:'数据表为空或尚未加载完成 — 请联系管理员',
       failRead:'无法读取数据 — 请刷新，若持续请联系管理员',
       failGen:'数据加载失败 — 请刷新，若持续请联系管理员',
       emptyFilt:'当前筛选无匹配行 — 清除筛选可见 {n} 行', emptyClear:'清除筛选',
       emptyTable:'此页面读取的表没有行 — 请联系管理员', emptyRows:'无对应行' },
  ja:{ stale:'📡 シート接続失敗 — キャッシュ表示中({n}分前)', staleNoAge:'📡 シート接続失敗 — キャッシュ表示中',
       failAuth:'ログインが切れたか権限がありません — 再ログインしてください',
       failNet:'サーバーに接続できません — ネットワークを確認して更新してください',
       failData:'データ表が空か読み込みが終わっていません — 管理者へ',
       failRead:'データを読めませんでした — 更新しても続く場合は管理者へ',
       failGen:'データを読み込めませんでした — 更新しても続く場合は管理者へ',
       emptyFilt:'現在のフィルタに合う行がありません — 解除すると {n} 件', emptyClear:'フィルタ解除',
       emptyTable:'この画面が読む表に行がありません — 管理者へ', emptyRows:'該当行なし' }
};
GST._staT = function(){ var l=(GST._lang && GST._lang()) || 'ko'; return GST.STA_T[l] || GST.STA_T.ko; };
GST.staleText = function(ageMin){
  const T = GST._staT();
  return (ageMin==null || isNaN(ageMin)) ? T.staleNoAge : T.stale.replace('{n}', String(ageMin));
};
/* 로드 실패 한 줄. 예전에는 여섯 페이지가 raw exception(`Failed to fetch`·`READ PGRST…`)을 그대로 상태줄에 찍었다 —
   사람이 할 일이 부류마다 다르다(재로그인 / 네트워크 / 관리자). 원문은 관리자에게만 붙이고 콘솔에는 늘 남긴다. */
GST.failNote = function(e){
  const T = GST._staT(), m = String((e && e.message) || e || '');
  let txt = T.failGen;
  if(/DB_OFF|AUTH 40[13]|JWT|expired|forbidden|not allowed|권한/i.test(m)) txt = T.failAuth;
  else if(/Failed to fetch|NetworkError|network|timeout|timed out|ECONN|HTTP 5\d\d|Load failed/i.test(m)) txt = T.failNet;
  else if(/MIRROR_EMPTY|MIRROR_SHORT|CSV_SHORT|BACKFILL_SHORT|SRC_ROW|^EMPTY|no data/i.test(m)) txt = T.failData;
  else if(/^READ|^LOG |NO_SPEC|HTTP 4\d\d|column|does not exist/i.test(m)) txt = T.failRead;
  try{ console.error('[gst] load failed:', e); }catch(x){}
  return txt + ((GST.isAdmin && GST.isAdmin() && m) ? ' (' + m.slice(0,120) + ')' : '');
};
/* 빈 표 한 칸. 「자료 없음」이라고 적지 않는다 — «자료를 안 올렸다»로 읽혀 사용자가 엑셀을 열어 확인한 자리다.
   total>0 이면 «필터 때문»이고 무엇을 하면 되는지(필터 해제)까지 준다. total==0 이면 표가 비어 있는 것이다. */
GST.emptyHTML = function(total){
  const T = GST._staT();
  if(total > 0) return GST._esc(T.emptyFilt.replace('{n}', Number(total).toLocaleString()))
    + ' <button type="button" class="gst-empty-clear" onclick="GST.clearFilters()">' + GST._esc(T.emptyClear) + '</button>';
  return GST._esc(T.emptyTable);
};
GST.emptyRowsText = function(){ return GST._staT().emptyRows; };
/* 필터 전체 해제 — 페이지가 자기 해제 함수를 갖고 있으면(페이지 전용 필터까지 지운다) 그것을, 없으면 공통 필터만 */
GST.clearFilters = function(){
  if(typeof window.clearAllFilters==='function'){ try{ window.clearAllFilters(); return; }catch(e){} }
  if(typeof window.clearFilt==='function'){ try{ window.clearFilt(); return; }catch(e){} }
  try{ GST.filters.clear(); }catch(e){}
};

/* ---------- 화면 등급 (v135) ----------
   권한은 «두 축»이다 — 쓰기(allowed_users.can_write · RLS 가 최종 판정)와 메타정보 표시(allowed_users.role).
   viewer 는 지표만 · editor 는 + 편집·업로드 버튼 · admin 은 + 출처 배지 상세·미러 배너 원문·열 인식 패널·/diag/.
   ⚠ 이것은 보안이 아니라 «화면 정리»다 — 지표 값 자체는 네트워크 탭·IndexedDB 에 그대로 있다(사용자 확정: 메타만).
   ⚠ 두 축을 억지로 잇지 않는다 — role='admin' 이면서 can_write=false 도 가능한 조합이고, 쓰기는 계속 can_write 가 정한다.
   role 열이 아직 없으면(setup-15 실행 전) 'legacy' — 지금까지처럼 전원이 다 본다(잠그면 관리자도 업로드 버튼을 잃는다).
   인증이 꺼진 환경(로컬 파일·검증 스크립트)도 legacy 다 — 그 환경은 애초에 로그인 게이트가 안 열린다. */
GST._me = null; GST._meP = null;
GST.isAdmin = function(){
  if(!GST._me) return !GST.authOn();
  var r = GST._me.role; return r==='admin' || r==='legacy';
};
GST.canWrite = function(){ return !!(GST._me && GST._me.can_write); };
/* 국내 데모(주간현황(국내) · kr_ 표)에 쓸 수 있는 사람인가 (v146) — 서버 _kr_can 과 같은 규칙:
   관리자(쓰기 권한) 또는 국내 운영자(role='kr'). ⚠ kr 은 can_write 가 «꺼져» 있다(서버 제약) — 운영 표의 모든 쓰기
   검사가 can_write 를 보므로 그대로 막힌다. 이 함수는 버튼을 보일지 정할 뿐, 실제로 막는 것은 서버다. */
GST.isKrOp = function(){
  if(!GST._me) return false;
  var r = GST._me.role;
  return r === 'kr' || ((r === 'admin' || r === 'legacy') && !!GST._me.can_write);
};
/* 처리함(v166)에 담고·바꿀 수 있는 사람인가 — 서버 _act_who 와 같은 규칙(쓰기 권한 또는 관리자·사이트 담당자·국내 운영자).
   단추를 보일지 정할 뿐, 막는 것은 서버다. 등급을 모르면 false(fail-closed). */
GST.actCan = function(){
  if(!GST._me) return false;
  var r = GST._me.role;
  return !!GST._me.can_write || r === 'admin' || r === 'editor' || r === 'kr';
};
/* ---------- 설명 표시 (v172 · 사용자 확정 「경영진·고객에게 보이는 화면에 설명문은 격이 떨어진다」) ----------
   화면에는 «값»만 둔다. 근거·산식·사용법 설명 — 카드 노트(.card-note) · 카드 부제 · 입력률 안내(.fill-hint) · 지도 메모 · 처리 상태 줄 — 은
   기본으로 숨기고, 관리자가 셸의 「설명 표시」를 켰을 때만 보인다(localStorage gst_explain — 같은 출처라 모든 탭이 같은 값을 본다).
   ⚠ 숫자의 뜻이 바뀌는 경고(.card-note.warn — 예: 원장이 비어 다른 자료로 집계 중)는 지우지 않는다. ⚠ 하나로 줄이고 누르면 내용이 뜬다
     (v147 공수 차트에서 사용자가 정한 방식). 지우면 그 경고를 못 본 사람이 다른 뜻의 숫자를 읽는다(v92).
   ⚠ 주간현황(report · report-kr)은 예외 — 보고서 작성용이라 지금까지대로 다 보인다(사용자 지시 · 손대지 않는다).
   판정은 이 한 함수다 — CSS(theme.css · ds.css · 셸)는 body.gst-explain 만 본다. */
GST.EXPLAIN_SKIP = /^\/report(-kr)?\//;
GST.EXP_T = { ko:{warn:'안내', col:'내용'}, en:{warn:'Note', col:'Detail'}, zh:{warn:'提示', col:'内容'}, ja:{warn:'お知らせ', col:'内容'} };
GST.explainOn = function(){
  try{ if(GST.EXPLAIN_SKIP.test(GST.pagePath ? GST.pagePath() : location.pathname)) return true; }catch(e){}
  if(!(GST._me && (GST._me.role==='admin' || GST._me.role==='legacy'))) return false;   // 등급을 모르면 끈다(fail-closed) — 조회자 화면이 깨끗한 것이 기본이다
  try{ return localStorage.getItem('gst_explain') === '1'; }catch(e){ return false; }
};
GST._explainApply = function(){ try{ if(document.body) document.body.classList.toggle('gst-explain', GST.explainOn()); }catch(e){} };
if(typeof document!=='undefined'){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', GST._explainApply); else GST._explainApply();
  window.addEventListener('message', function(e){ var d=e.data||{}; if(d.type==='gst-explain') GST._explainApply(); });
  window.addEventListener('storage', function(e){ if(e.key==='gst_explain') GST._explainApply(); });
  /* ⚠ 로 줄인 경고를 누르면 그 글을 띄운다 — 설명을 켜 둔 사람은 이미 글이 보이므로 안 띄운다 */
  document.addEventListener('click', function(e){
    var n=e.target&&e.target.closest&&e.target.closest('.card-note.warn'); if(!n || document.body.classList.contains('gst-explain')) return;
    var T=GST.EXP_T[(GST._lang&&GST._lang())||'ko']||GST.EXP_T.ko;
    GST.rowsModal(T.warn, [T.col], String(n.textContent||'').split('\n').filter(Boolean).map(function(x){ return [x]; }));
  });
}
GST._meApply = function(me){
  GST._me = me;
  try{ if(document.body) document.body.dataset.role = me && me.role ? me.role : 'viewer'; }catch(e){}
  /* 등급이 «나중에» 도착하므로, 이미 그려진 메타 요소를 다시 그린다 — 등급을 모를 때는 가려 두었다가 연다 */
  try{ GST._srcChip(); }catch(e){}
  try{ GST._dbBanner(); }catch(e){}
  try{ var bad=(GST.SM&&GST.SM._reg||[]).filter(function(r){ return r.miss.length; }); if(bad.length) GST.SM.banner(bad); }catch(e){}
  try{ GST._explainApply(); }catch(e){}   // 등급이 늦게 오므로 그때 다시 정한다(v172)
  try{ window.dispatchEvent(new CustomEvent('gst-role', {detail:me})); }catch(e){}
};
GST.loadMe = function(){
  if(GST._meP) return GST._meP;
  GST._meP = (async function(){
    if(!GST.authOn()){ GST._meApply({email:'', can_write:false, role:'legacy'}); return GST._me; }
    try{ await GST.dbWrite('perm', 'perm'); }                         // perm 경로가 자기 행을 읽어 _meApply 를 부른다 — 두 번째 읽기를 만들지 않는다
    catch(e){ if(!GST._me) GST._meApply({email:'', can_write:false, role:'viewer'}); }   // 모르면 viewer(fail-closed)
    return GST._me;
  })();
  return GST._meP;
};

/* 숫자 칸 파서. `Number('2,093')` 은 **NaN** 이다 — 시트를 CSV 로 내보내면 천 단위 쉼표가
   그대로 들어오므로, 그동안 작업시간·공수·사용일이 1,000 이상인 행은 «조용히» 값이
   사라지고 있었다(빈칸과 구별이 안 된다). xlsx 로 올리면 쉼표가 없어 정상인데, 그러면
   같은 자료가 올린 방식에 따라 다른 숫자를 낸다 — 그게 더 나쁘다. 여기 한 곳에서 흡수한다.
   ⚠ 빈칸은 0 이 아니라 NaN 으로 낸다. 호출부가 `|| null` `|| 0` 으로 뜻을 정하게 두어야
   «값이 0» 과 «값이 없음» 을 구별할 수 있다. */
GST.numv = function(v){
  if(v==null) return NaN;
  if(typeof v==='number') return v;
  const s = String(v).replace(/[\s\u00a0,]/g,'');
  return s==='' ? NaN : Number(s);
};
GST.needVer = function(n){
  if(GST.VER >= n) return true;
  try{
    var d = document.createElement('div');
    d.style.cssText='background:#7f1d1d;color:#fff;padding:10px 16px;font:13px/1.5 sans-serif;position:relative;z-index:99999';
    /* 숫자·배포 이야기는 title(관리자용)로 — 사용자가 할 일은 강력 새로고침 하나뿐이다(v135) */
    d.textContent='⚠️ 화면 코드가 최신이 아닙니다 — Ctrl+Shift+R (Mac ⌘⇧R) 로 강력 새로고침하세요. 그래도 같으면 관리자에게 알려 주세요.';
    d.title='core v'+GST.VER+' 실행 · 이 페이지는 v'+n+' 필요 — 브라우저 캐시이거나 assets/core.js 배포가 페이지보다 늦은 것';
    try{ console.warn('[needVer] 실행 v'+GST.VER+' · 필요 v'+n); }catch(e){}
    (document.body||document.documentElement).insertAdjacentElement('afterbegin', d);
  }catch(e){}
  return false;
};
/* 코드가 던지는 실패를 «보이게» 한다 (v135). 자료 실패는 배너·배지로 촘촘한데 코드 예외만 아무 데도 안 떴다 —
   iframe 안의 예외는 셸 콘솔에도 안 뜨고 사용자는 F12 를 열지 않는다. 같은 메시지는 한 번만 띄운다.
   ⚠ 관리자에게만 메시지·위치를 적는다(A-4 · 메타정보). 조회자에게는 «무엇을 하면 되는지» 한 줄. */
GST._errSeen = {};
GST._errBand = function(msg, where){
  try{
    const key = String(msg||'').trim().slice(0,160);
    if(!key || GST._errSeen[key]) return;
    if(/ResizeObserver loop|^Script error\.?$/.test(key)) return;      // 브라우저 잡음 · 교차출처 스크립트의 빈 메시지
    GST._errSeen[key] = 1;
    const detail = key + (where ? ' @ ' + where : '') + ' (core ' + GST.VER + ')';
    try{ console.error('[gst] ' + detail); }catch(e){}
    if(typeof document==='undefined') return;
    let d = document.getElementById('gstErrBand');
    if(!d){
      d = document.createElement('div'); d.id = 'gstErrBand';
      d.style.cssText = 'background:#F4F3FF;color:#4C1D95;border:1px solid #DDD6FE;border-radius:10px;padding:8px 14px;margin:0 0 12px;font:12.5px/1.5 \'Pretendard Variable\',Pretendard,system-ui,-apple-system,sans-serif;position:relative;z-index:99999';
      (document.body||document.documentElement).insertAdjacentElement('afterbegin', d);
    }
    d.textContent = '⚠️ 화면 일부가 그려지지 않았을 수 있습니다 — 새로고침해 보고, 계속되면 관리자에게 알려 주세요'
      + ((GST.isAdmin && GST.isAdmin()) ? ' · ' + detail : '');
    d.title = detail;
    try{ if(window.self!==window.top) window.parent.postMessage({type:'gst-error', msg:key}, '*'); }catch(e){}
  }catch(e){}
};
if(typeof window!=='undefined' && window.addEventListener){
  window.addEventListener('error', function(ev){
    if(!ev || !ev.message) return;                                    // 리소스 로드 실패는 여기로 안 온다(버블링 없음) — 로더가 따로 알린다
    GST._errBand(ev.message, (ev.filename||'').replace(/^.*\//,'') + (ev.lineno ? ':' + ev.lineno : ''));
  });
  window.addEventListener('unhandledrejection', function(ev){
    const r = ev && ev.reason;
    GST._errBand(r && r.message ? r.message : String(r), r && r.stack ? String(r.stack).split('\n')[1] || '' : '');
  });
}
GST.FONT_STACK = '"Pretendard Variable",Pretendard,"Segoe UI","Malgun Gothic",sans-serif';
GST.font = function(px, weight){ return (weight||400)+' '+px+'px '+GST.FONT_STACK; };
// 웹폰트는 첫 렌더보다 늦게 도착할 수 있다 — 캔버스는 스스로 다시 그리지 않으므로
// 폰트 준비가 끝나면 한 번 재렌더해서 폴백 메트릭으로 그려진 차트를 교정한다.
if (typeof document!=='undefined' && document.fonts && document.fonts.ready){
  document.fonts.ready.then(function(){
    try{ if(typeof window!=='undefined' && typeof window.render==='function') window.render(); }catch(e){ console.warn('[gst] 폰트 준비 후 재렌더 실패', e); }
  });
}

/* ---------- 1. 날짜 유틸 ---------- */
// 구글시트의 다양한 날짜 표현(시리얼 숫자, YYYY-MM-DD, Date 문자열)을 UTC Date로 통일
GST.toDate = function(v){
  if(!v) return null;
  if(v instanceof Date) return isNaN(v) ? null : v;
  const n = Number(v);
  if(!isNaN(n) && n>20000 && n<80000) return new Date(Date.UTC(1899,11,30) + n*86400000);
  const s = String(v).trim();
  /* 구분자 둘레의 공백을 허용한다 — '2022. 8. 1'(구글시트 한국 서식)·'2022/8/1'·'2022-08-01 10:00'.
     ⚠ 예전 정규식은 공백을 몰라 그 표기가 아래 new Date(s) 폴백으로 떨어졌고, 그것은 «로컬 자정»이라
       KST 에서 UTC 로 찍으면 하루가 밀렸다. report·hr 은 그래서 자기 pd() 를 따로 들고 있었고 같은
       문자열에 core 와 다른 날짜를 냈다 — v135 에 사본을 지우고 여기로 모았다(t-quiet [1b] 가 대조한다). */
  const m = s.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/);
  if(m) return new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
};
GST.fmtDate = function(d){ return d ? d.toISOString().slice(0,10) : '—'; };
GST.fmtD    = function(d){ return d ? d.toISOString().slice(0,10) : ''; };
/* 「사람이 보는 날짜」는 그 사람의 시계로 찍는다.
   ⚠ toISOString() 은 UTC 다. KST(+9)에서 «로컬 자정»으로 만든 Date 를 그걸로 찍으면
     하루 앞 날짜가 나온다 — 사용자가 08-01 을 넣었는데 화면에는 07-31 이 뜬다.
     오전 9시 이전에는 «오늘»조차 어제로 찍힌다(빠른 프리셋이 오늘 자료를 잘라 먹는다).
   위 두 함수는 그대로 둔다 — 그쪽은 Date.UTC(…) 로 만든 «UTC 자정» 값을 찍는 자리라
     UTC 로 찍는 것이 맞다. 두 시계가 섞이는 것이 문제이지 어느 한쪽이 틀린 게 아니다.
     그래서 합치지 않고 이름을 나눠 둔다 — 부르는 쪽이 어느 시계인지 고르게. */
GST.ymdL = function(d){
  const x = (d instanceof Date && !isNaN(d)) ? d : new Date();
  return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0')
                         + '-' + String(x.getDate()).padStart(2,'0');
};

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
/* supabase-js — 대시보드의 «현관문». v105 규율(CDN 을 기다리는 곳에는 반드시 시간 제한)이 PPT·xlsx 버튼에는
   있었는데 여기에는 없었다 — 사내망이 cdn.jsdelivr.net 을 «묵살»하면 onerror 가 영영 안 와 로그인 오버레이가
   글자 없는 검은 화면으로 남았다(v135). 자체 사본 → CDN 순 · 15초. 버전은 사본과 CDN 이 같아야 한다 —
   `@2` 처럼 열어 두면 «어느 날 바뀌는» 유일한 의존성이 되고 롤백 손잡이도 없다(assets/vendor/README.md ·
   t-pptchart [1] 이 둘을 대조한다). */
GST.SB_VER    = '2.116.0';
GST.SB_VENDOR = '/assets/vendor/supabase.min.js';                                      // 2.116.0
GST.SB_CDN    = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js';
GST._sbFail   = '로그인 모듈을 불러오지 못했습니다 — 새로고침하거나 잠시 뒤 다시 시도하세요 (cdn.jsdelivr.net 이 막혀 있을 수 있습니다)';
GST.sb = async function(){
  if(GST._sb) return GST._sb;
  if(!global.supabase){
    if(!GST._sbLoad) GST._sbLoad = GST._loadScript([GST.SB_VENDOR, GST.SB_CDN], function(){ return !!global.supabase; }, 15000)
      .catch(function(e){ GST._sbLoad=null;
        var err=new Error('supabase-js 로드 실패 ('+(e&&e.message||'?')+')'); err.tried=e&&e.tried; throw err; });
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
GST.sendOtp = async function(email){ var c, r;
  /* 로더가 던지면 await 가 다시 던져 버튼이 「전송 중…」에 잠긴 채 굳었다(v135) — 여기서 받아 한 줄로 돌려준다 */
  try{ c=await GST.sb(); r=await c.auth.signInWithOtp({email:email,options:{shouldCreateUser:false}}); }
  catch(e){ return GST._sbFail; }
  if(!r.error)return null;
  var m=String(r.error.message||'');
  if(/signup|not allowed|not found|does not exist/i.test(m))
    return '등록되지 않은 이메일입니다. 관리자에게 이메일 등록을 요청하세요.';
  return m||'전송 실패';
};
GST.verifyOtp = async function(email,code){ var c, r;
  try{ c=await GST.sb(); r=await c.auth.verifyOtp({email:email,token:code,type:'email'}); }
  catch(e){ return GST._sbFail; }
  return r.error?(r.error.message||'코드 확인 실패'):null; };
/* 아이디+비밀번호 로그인 (조회용 계정 · 국내 데모 운영자 kr 계정 — v146).
   Supabase 는 이메일 형태만 받으므로, @ 없는 아이디에는 아래 도메인을 붙여 계정 이메일로 만든다.
   계정은 관리자가 콘솔(Authentication → Add user, Auto Confirm)에서 만들고 allowed_users 에
   can_write=false 로 넣는다 — 쓰기 권한은 RLS 가 막으므로 화면 조회만 된다.
   role='kr' 이면 데모 표(kr_sheet_*)에만 쓸 수 있다(setup-17 · can_write 는 꺼진 채 — 운영 표는 그대로 막힌다). */
GST.PW_DOMAIN='gstcs.view';
GST.pwLogin = async function(id,pw){ var c, r;
  var em=(id.indexOf('@')>=0?id:(id+'@'+GST.PW_DOMAIN)).toLowerCase();
  try{ c=await GST.sb(); r=await c.auth.signInWithPassword({email:em,password:pw}); }
  catch(e){ return GST._sbFail; }
  if(!r.error)return null;
  var m=String(r.error.message||'');
  if(/invalid login credentials|invalid_credentials/i.test(m))return '아이디 또는 비밀번호가 올바르지 않습니다';
  if(/email not confirmed/i.test(m))return '계정이 승인되지 않았습니다 — 관리자가 Auto Confirm 으로 만들어야 합니다';
  return m||'로그인 실패';
};
/* 401 을 받았다고 곧장 «다시 로그인»을 띄우지 않는다. 절전·백그라운드 탭에서는 브라우저가
   타이머를 늦춰 자동 갱신을 놓치고, 만료된 액세스 토큰으로 첫 요청이 나가 401이 된다 —
   갱신 토큰은 살아 있으므로 한 번 갱신해 재시도하고, 그래도 401이면 그때가 진짜 만료다.
   (주간현황을 오래 켜두면 가끔 재로그인을 요구하던 원인이 이것이었다.) */
GST.freshToken = async function(){
  try{ var c=await GST.sb(); var r=await c.auth.refreshSession();
       return (r.data&&r.data.session&&r.data.session.access_token)||null; }
  catch(e){ return null; }
};
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
GST._authOk=function(){ GST.authReady(); GST._readyRes&&GST._readyRes(); try{ GST.loadMe(); }catch(e){} };
/* ⚠ 판정 기준(ops_params)을 여기서 미리 읽지 않는다(v172) — 쓰는 화면(고장분석·관제·사이트 상세·내 화면·운영 목표)은
   계산 전에 GST.params.ready() 를 스스로 기다린다. 여기서 모든 화면이 읽게 하면 국내 데모 화면이 데모 표 밖을 읽는다(t-edit [24]). */
/* 로그인 화면의 생김새 — 첫인상이다(v139). 흰 카드 하나, 액센트 하나. 셸·페이지 어디서 떠도 같은 모양이어야 하므로
   토큰을 여기 인라인으로 둔다(오버레이는 theme.css 를 안 싣는 셸에서도 뜬다). */
GST._loginUI = {
  card:'max-width:380px;width:92%;background:#FFFFFF;border:1px solid #E4E7EC;border-radius:14px;padding:30px 28px 24px;'
      +'box-shadow:0 8px 28px rgba(16,24,40,.08);text-align:center;color:#101828;'
      +'font-family:\'Pretendard Variable\',Pretendard,\'Segoe UI\',\'Malgun Gothic\',sans-serif',
  mark:'<div style="display:flex;align-items:center;justify-content:center;gap:9px;margin-bottom:18px">'
      +'<span style="display:inline-block;width:30px;height:30px;border-radius:8px;background:#2F6FED url(&quot;data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2.4\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M4 17l5-6 4 3 7-8\'/%3E%3C/svg%3E&quot;) center/19px no-repeat"></span>'
      +'<span style="font-size:15px;font-weight:700;letter-spacing:-.2px">GST CS Global</span></div>',
  title:'font-size:19px;font-weight:700;letter-spacing:-.3px;margin-bottom:6px',
  sub:'font-size:13px;color:#667085;line-height:1.6',
  input:'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #D0D5DD;background:#fff;color:#101828;'
       +'font-size:14px;font-family:inherit;margin-bottom:8px;outline:none',
  btn:'width:100%;padding:10px;border-radius:8px;border:0;background:#2F6FED;color:#fff;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit',
  btnSm:'margin-top:14px;padding:9px 22px;border-radius:8px;border:0;background:#2F6FED;color:#fff;font-weight:600;cursor:pointer;font-family:inherit',
  err:'#D92D20'
};
GST._loginCard=function(title, sub, extra, color){
  const U=GST._loginUI;
  return '<div class="login-card" style="'+U.card+'">'+U.mark
    +'<div style="'+U.title+';color:'+(color||'#101828')+'">'+title+'</div>'
    +(sub?'<div style="'+U.sub+'">'+sub+'</div>':'')+(extra||'')+'</div>';
};
// 로그인 게이트: #loginOverlay를 이메일 OTP UI로 교체(없으면 생성). 성공 시 resolve.
GST.authGate = async function(){
  var ov=document.getElementById('loginOverlay');
  if(!ov){ ov=document.createElement('div'); ov.id='loginOverlay'; ov.className='login-overlay';
    ov.style.cssText='position:fixed;inset:0;background:#F5F6F8;z-index:9998;display:flex;align-items:center;justify-content:center';
    document.body.appendChild(ov); }
  else { ov.style.background='#F5F6F8'; }   // 페이지에 박힌 옛 어두운 오버레이 색을 덮는다(v139)
  // 인증이 설정되지 않았으면 통과시키지 않는다(fail-closed). 예전엔 공용 비밀번호로 우회됐다.
  if(!GST.authOn()){
    ov.classList.remove('hidden'); ov.style.display='flex';
    ov.innerHTML=GST._loginCard('인증이 설정되지 않았습니다','관리자에게 문의하세요','',GST._loginUI.err);
    return new Promise(function(){});   // 절대 resolve하지 않음 → 페이지가 열리지 않는다
  }
  /* 로그인 모듈부터 확보한다 (v135). 예전에는 getSession() 안에서 CDN 을 기다렸고 그 대기에 시간 제한이 없어,
     사내망이 묵살하면 오버레이가 «글자 없는 검은 화면»으로 영영 남았다. 이제 15초 뒤 실패로 오고 그때
     무엇을 하면 되는지를 적는다 — 막다른 길로 두지 않는다(v105 규율). 0.6초 넘게 걸리면 «준비 중»이라도 적는다. */
  var slow=setTimeout(function(){ if(!global.supabase && !ov.querySelector('.login-card')){
    ov.classList.remove('hidden'); ov.style.display='flex'; ov.innerHTML=GST._loginCard('로그인 준비 중…','',''); } }, 600);
  try{ await GST.sb(); }
  catch(e){
    clearTimeout(slow);
    ov.classList.remove('hidden'); ov.style.display='flex';
    ov.innerHTML=GST._loginCard('로그인 모듈을 불러오지 못했습니다',
      'cdn.jsdelivr.net 을 막고 있을 수 있습니다 — 전산팀에 허용을 요청하거나 잠시 뒤 다시 시도하세요',
      '<button onclick="location.reload()" title="'+String(e&&e.tried||e&&e.message||'').replace(/"/g,'&quot;')+'" style="'+GST._loginUI.btnSm+'">다시 시도</button>',
      GST._loginUI.err);
    return new Promise(function(){});   // 모듈 없이는 인증도 자료도 없다 — 열지 않는다
  }
  clearTimeout(slow);
  var s=await GST.getSession();
  if(s){ ov.classList.add('hidden'); ov.style.display='none'; GST._authOk(); return true; }
  ov.classList.remove('hidden'); ov.style.display='flex';
  var U=GST._loginUI;
  ov.innerHTML='<div class="login-card" style="'+U.card+'">'+U.mark
    +'<div style="'+U.title+'">Service Operation Dashboard</div>'
    +'<div style="'+U.sub+';margin-bottom:20px">등록된 이메일로 인증코드를 받아 로그인하세요</div>'
    +'<input id="sbEmail" type="email" placeholder="name@company.com" autocomplete="email" style="'+U.input+'">'
    +'<button id="sbSend" style="'+U.btn+'">인증코드 받기</button>'
    +'<div id="sbStep2" style="display:none;margin-top:10px">'
      +'<input id="sbCode" inputmode="numeric" maxlength="8" placeholder="이메일로 받은 6자리 코드" style="'+U.input+';letter-spacing:3px;text-align:center">'
      +'<button id="sbVerify" style="'+U.btn+'">로그인</button></div>'
    // 아이디+비밀번호 (조회 전용 계정) — 이메일 인증 없이 들어온다. 권한은 RLS(allowed_users)가 판정.
    +'<div id="sbPw" style="display:none">'
      +'<input id="pwId" placeholder="아이디" autocomplete="username" style="'+U.input+'">'
      +'<input id="pwPw" type="password" placeholder="비밀번호" autocomplete="current-password" style="'+U.input+'">'
      +'<button id="pwGo" style="'+U.btn+'">로그인</button></div>'
    +'<div id="sbErr" style="color:'+U.err+';font-size:12.5px;margin-top:10px;min-height:16px"></div>'
    +'<a id="sbMode" style="display:block;font-size:12.5px;color:#2F6FED;margin-top:10px;cursor:pointer;user-select:none">아이디·비밀번호로 로그인</a>'
    +'<a id="sbPwc" style="display:block;font-size:12px;color:#667085;margin-top:8px;cursor:pointer;user-select:none">관리자 비밀번호 변경</a></div>';
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
    // 이메일 인증 ↔ 아이디·비밀번호 전환
    var pwMode=false;
    $('sbMode').onclick=function(){
      pwMode=!pwMode; err('');
      $('sbPw').style.display=pwMode?'block':'none';
      $('sbEmail').style.display=pwMode?'none':'block';
      $('sbSend').style.display=pwMode?'none':'block';
      $('sbStep2').style.display='none';
      $('sbMode').textContent=pwMode?'이메일 인증코드로 로그인':'아이디·비밀번호로 로그인';
      (pwMode?$('pwId'):$('sbEmail')).focus();
    };
    $('pwGo').onclick=async function(){
      var id=($('pwId').value||'').trim(), pw=$('pwPw').value||'';
      if(!id||!pw){err('아이디와 비밀번호를 입력하세요');return;}
      err(''); $('pwGo').disabled=true; $('pwGo').textContent='확인 중…';
      var e=await GST.pwLogin(id,pw);
      $('pwGo').disabled=false; $('pwGo').textContent='로그인';
      if(e){err(e);return;}
      ov.classList.add('hidden'); ov.style.display='none';
      GST._authOk(); resolve(true);
    };
    $('pwPw').addEventListener('keydown',function(ev){if(ev.key==='Enter')$('pwGo').click();});
    $('sbPwc').onclick=function(){ GST._pwChange(ov, resolve); };
  });
};
/* 관리자 «아이디 계정» 비밀번호 변경 (v150 · 사용자 요청 · setup-19).
   ① 관리자 이메일로 인증코드 → ② 코드로 로그인 → ③ 아이디·새 비밀번호. 확인은 서버(admin_set_pw)가 «다시» 한다:
   관리자+쓰기 권한 · 15분 안 이메일 코드로 받은 세션 · 아이디 계정(@gstcs.view)만 · 등록된 계정만.
   ⚠ 비밀번호로 들어온 세션으로는 못 바꾼다 — «비밀번호를 아는 사람»이 아니라 «관리자 메일함을 가진 사람»만 바꾸게 한다.
   ⚠ 변경 사실은 이력(sheet_edits · op pw_change)에 남고 비밀번호 값은 어디에도 남지 않는다. */
GST.PWC_ERR={login:'로그인이 풀렸습니다 — 처음부터 다시 해 주세요', forbidden:'이 이메일은 관리자(쓰기 권한)가 아닙니다',
  need_otp:'이메일 인증코드로 로그인한 지 15분이 지났습니다 — 코드를 다시 받아 주세요', weak:'비밀번호는 8자 이상이어야 합니다',
  not_id_account:'이메일 계정은 비밀번호가 없습니다(인증코드로 로그인) — 아이디 계정만 바꿀 수 있습니다',
  not_found:'등록된 아이디가 아닙니다'};
GST._pwChange=function(ov, resolve){
  var U=GST._loginUI, $=function(id){return document.getElementById(id);};
  ov.innerHTML='<div class="login-card" style="'+U.card+'">'+U.mark
    +'<div style="'+U.title+'">관리자 비밀번호 변경</div>'
    +'<div style="'+U.sub+';margin-bottom:16px">관리자 이메일로 받은 인증코드로 본인을 확인한 뒤 바꿉니다</div>'
    +'<div id="pcS1"><input id="pcEmail" type="email" placeholder="관리자 이메일" autocomplete="email" style="'+U.input+'">'
      +'<button id="pcSend" style="'+U.btn+'">인증코드 받기</button>'
      +'<div id="pcS1b" style="display:none;margin-top:10px"><input id="pcCode" inputmode="numeric" maxlength="8" placeholder="이메일로 받은 코드" style="'+U.input+';letter-spacing:3px;text-align:center">'
      +'<button id="pcVerify" style="'+U.btn+'">확인</button></div></div>'
    +'<div id="pcS2" style="display:none">'
      +'<input id="pcId" placeholder="바꿀 아이디" value="gstadmin" autocomplete="username" style="'+U.input+'">'
      +'<input id="pcPw1" type="password" placeholder="새 비밀번호 (8자 이상)" autocomplete="new-password" style="'+U.input+'">'
      +'<input id="pcPw2" type="password" placeholder="새 비밀번호 확인" autocomplete="new-password" style="'+U.input+'">'
      +'<button id="pcGo" style="'+U.btn+'">비밀번호 바꾸기</button></div>'
    +'<div id="pcDone" style="display:none"><button id="pcEnter" style="'+U.btn+'">대시보드로 들어가기</button></div>'
    +'<div id="pcErr" style="color:'+U.err+';font-size:12.5px;margin-top:10px;min-height:16px"></div>'
    +'<a id="pcBack" style="display:block;font-size:12.5px;color:#2F6FED;margin-top:10px;cursor:pointer">로그인 화면으로</a></div>';
  var err=function(m,ok){ var e=$('pcErr'); e.textContent=m||''; e.style.color=ok?'#067647':U.err; };
  $('pcBack').onclick=function(){ GST.signOut(); };
  $('pcSend').onclick=async function(){
    var em=($('pcEmail').value||'').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ err('이메일 형식을 확인하세요'); return; }
    err(''); $('pcSend').disabled=true; $('pcSend').textContent='전송 중…';
    var e=await GST.sendOtp(em);
    $('pcSend').disabled=false; $('pcSend').textContent='인증코드 다시 받기';
    if(e){ err(e); return; }
    $('pcS1b').style.display='block'; $('pcCode').focus(); err('메일이 안 보이면 스팸함을 확인하세요', true);
  };
  $('pcVerify').onclick=async function(){
    var em=($('pcEmail').value||'').trim().toLowerCase(), cd=($('pcCode').value||'').trim();
    if(!cd){ err('코드를 입력하세요'); return; }
    $('pcVerify').disabled=true; var e=await GST.verifyOtp(em,cd); $('pcVerify').disabled=false;
    if(e){ err('확인 실패: '+e); return; }
    err(''); $('pcS1').style.display='none'; $('pcS2').style.display='block'; $('pcPw1').focus();
  };
  $('pcGo').onclick=async function(){
    var id=($('pcId').value||'').trim(), p1=$('pcPw1').value||'', p2=$('pcPw2').value||'';
    if(!id){ err('아이디를 입력하세요'); return; }
    if(p1.length<8){ err(GST.PWC_ERR.weak); return; }
    if(p1!==p2){ err('두 비밀번호가 다릅니다'); return; }
    $('pcGo').disabled=true;
    try{
      var c=await GST.sb(), r=await c.rpc('admin_set_pw',{p_login:id,p_pw:p1});
      $('pcGo').disabled=false;
      if(r.error){ err(/function|does not exist/i.test(r.error.message)?'서버 준비가 안 됐습니다 — setup-19-admin-pw.sql 을 Run 하세요':r.error.message); return; }
      var d=r.data||{};
      if(!d.ok){ err(GST.PWC_ERR[d.err]||('변경 실패: '+(d.err||''))); return; }
      $('pcS2').style.display='none'; $('pcDone').style.display='block';
      err('«'+String(d.login||id).replace(/@gstcs\.view$/,'')+'» 의 비밀번호를 바꿨습니다. 이미 열려 있던 그 계정의 접속은 만료될 때까지 남습니다.', true);
    }catch(x){ $('pcGo').disabled=false; err(String(x&&x.message||x)); }
  };
  $('pcEnter').onclick=function(){ ov.classList.add('hidden'); ov.style.display='none'; GST._authOk(); resolve(true); };
  $('pcEmail').focus();
};
// 미등록 이메일(403) 안내
GST.authDenied=function(code){
  var ov=document.getElementById('loginOverlay'); if(!ov)return;
  ov.classList.remove('hidden'); ov.style.display='flex';
  ov.style.background='#F5F6F8';
  ov.innerHTML=GST._loginCard(code===403?'접근 권한이 없습니다':'로그인이 만료되었습니다',
    code===403?'관리자에게 이메일 등록을 요청하세요':'다시 로그인해 주세요',
    '<button onclick="GST.signOut()" style="'+GST._loginUI.btnSm+'">다시 로그인</button>', GST._loginUI.err);
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
  /* v80 — 교육·인원·휴가는 쓰기도 Import 표(Supabase)로 간다. 읽기가 DB 로 옮겨진 뒤(v79)
     쓰기만 시트로 가면 «저장했는데 새로고침하면 사라지는» 상태가 된다 — 화면이 시트를
     더 이상 안 보기 때문이다. gid 로 갈라지므로 페이지는 한 줄도 안 고친다(읽기 이관과 같은 수법).
     수선실적(646668307) dq 편집은 그대로 sheet-write 로 간다. */
  if(GST.DBW && GST.DBW[String(gid)]) return GST.dbWrite(op, String(gid), body, params);
  var tok = await GST.token();
  if(!tok){ await GST.authReady(); tok = await GST.token(); }
  if(!tok){ var e0=new Error('unauthorized'); e0.status=401; throw e0; }
  var qs = '?op='+encodeURIComponent(op)+'&gid='+encodeURIComponent(gid)+'&t='+Date.now();
  if(params) Object.keys(params).forEach(function(k){ qs += '&'+k+'='+encodeURIComponent(params[k]); });
  var h = {Authorization:'Bearer '+tok};
  if(body) h['Content-Type']='application/json';
  var res = await fetch(GST.SB_URL+'/functions/v1/'+GST.FN_WRITE+qs,
    {method: body?'POST':'GET', headers:h, body: body?JSON.stringify(body):undefined});
  if(res.status===401){                            // 만료 의심 — 갱신 후 한 번만 재시도
    var tok2=await GST.freshToken();
    if(tok2){ h.Authorization='Bearer '+tok2;
      res=await fetch(GST.SB_URL+'/functions/v1/'+GST.FN_WRITE+qs,
        {method: body?'POST':'GET', headers:h, body: body?JSON.stringify(body):undefined}); }
  }
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
/* ---------- 2.6 DB 쓰기 (v80) ----------
   Import 표에 브라우저에서 직접 쓴다 — pm_adjust 와 같은 규약(RLS 가 최종 권한).
   sheet-write 의 op 규약(perm·row·update·append·delete)과 응답 모양을 그대로 흉내내므로
   hr 페이지의 저장·충돌(409)·롤백 흐름이 전부 무수정으로 동작한다.

   컬럼은 표의 실제 열 이름에서 «정규화 후 정확일치»로 찾는다(GST.SM.norm — 제1원칙).
   못 찾으면 no_col 로 던진다. 행 지정은 PK 가 아니라 업무 키(사번)로 하되
   **정확히 한 행일 때만** 쓴다 — sheet-write mirrorWrite 와 같은 규율. 0행이면 not_found,
   2행이면 dup_key. 낙관적 잠금은 행 전체를 직렬화한 지문(baseHash)으로 유지한다. */
GST.DBW = {
  '1213453343': {
    table:'sheet_roster', keyField:'id', keyCol:['사원번호','ID'], nameField:'name', cascadeTo:'0',
    required:['id','name','join'],
    /* 양식이 세 벌이라 별칭으로 받는다 — 새 한글 · 한글 · 옛 영문 순. 읽기(hr·report·
       kakao-bot)가 이미 이 순서를 쓰고 있고, 쓰기만 옛 영문에 묶여 있었다. */
    cols:{ id:['사원번호','ID'], name:['이름(영문)','Name((영문)'], cn:['이름(중문)','Name(중문)'],
           dept:['부서','Dept.'], level:['직급(레벨)','Position Level'],
           wp:['근무지','Work Place'], role:['담당업무','2025 Position Role'],
           join:['입사일','Date of entry'], quit:['퇴사일','Resignation'],
           org:['담당구분','조직도 위치'], posKo:['직급(한글)','직급'],
           duty:['업무/직책'], onsite:['현장 인원여부'] }
  },
  '0': {
    table:'sheet_edu', keyField:'id', keyCol:'사원번호', nameField:'name',
    required:['name'],
    cols:{ id:'사원번호', site:'Site', name:'인원',
           bdate:'Basic 교육완료일', vdate:'Veteran 교육완료일',
           lv2date:'Scrubber Lv.2 교육완료일', lv3date:'Scrubber Lv.3 교육완료일' }
  },
  '262805841': {
    table:'sheet_leave', appendOnly:true, keyField:'empId', keyCol:'사원번호', nameField:'name',
    required:['name','type','start','end'],
    cols:{ empId:'사원번호', name:'이름', site:'소속', type:'항목', occur:'발생일',
           start:'휴가시작일', stime:'휴가시작시간', end:'휴가종료일', etime:'휴가종료시간',
           amt:'휴가신청시간', note:'비고' }
  },
  /* 수선실적 dq 4열 (v82) — 시트 은퇴 후 실적 원장은 sheet_wk(CSV 업로드)다.
     예전에는 sheet-write 가 시트에 쓰고 미러에 따라 적었지만, 시트가 죽으면 그 절반이
     허공에 쓰는 것이라 미러에 직접 쓴다. ops 로 update 만 연다 — 실적 행의 생성·삭제는
     CSV 업로드가 원장이고, 여기서 지우면 다음 업로드 때 «누가 왜 지웠는지» 아무도 모른다. */
  '646668307': {
    table:'sheet_wk', keyField:'rs', keyCol:'rs_code', ops:['perm','row','update'],
    cols:{ rs:'rs_code', alarm:'alarm', phenom:'phenom', cause:'cause', action:'action' }
  }
};
GST._dbwErr = function(code, status, extra){
  var e = new Error(code); e.status = status||400;
  e.data = Object.assign({error:code}, extra||{});
  return e;
};
// 실제 행의 열 이름 사전 (정규화 → 원래 이름). 관리용 열은 뺀다.
GST._dbwColMap = function(rowObj){
  var m = {};
  Object.keys(rowObj||{}).forEach(function(k){ if(!GST._CSV_SKIP[k]) m[GST.SM.norm(k)] = k; });
  return m;
};
/* 컬럼 이름을 «별칭 배열»로 받는다 — 인원명단 양식이 세 벌이라(옛 영문 · 한글 · 새 한글)
   읽기 세 곳은 이미 별칭으로 흡수하는데 **쓰기만 단일 문자열이었다**(제2원칙 그대로의 자리).
   그래서 v96 새 양식 이후 hr 의 인원 편집이 아무에게도 안 열렸고(빈 `ID` 열로 찾아 0행),
   신규 등록은 «저장됨»이라 답하고 옛 열에 값을 넣어 어느 화면에도 안 보였다.
   ⚠ 순서가 규약이다 — «새 양식 먼저». Import 표는 ALTER 로 열을 맨 뒤에 붙이므로
     빈 `ID` 가 앞, 채워진 `사원번호` 가 뒤에 온다. 이름 순서로 고르면 빈 열을 집는다. */
GST._dbwPick = function(cmap, want){
  var list = Array.isArray(want) ? want : [want];
  for(var i=0;i<list.length;i++){ var k = cmap[GST.SM.norm(list[i])]; if(k) return k; }
  return null;
};
GST._dbwCol = function(cmap, want){
  var k = GST._dbwPick(cmap, want);
  if(!k) throw GST._dbwErr('no_col', 500, {col:Array.isArray(want)?want.join('/'):want});
  return k;
};
/* 낙관적 잠금 지문 — 열이름순 직렬화의 FNV+djb2. sheet-write 의 SHA-256 과 형식은 다르지만
   역할이 같다: 폼을 연 뒤 누가 같은 행을 고쳤으면 저장이 409 로 막힌다. */
GST._dbwHash = function(rowObj){
  var ks = Object.keys(rowObj||{}).filter(function(k){ return !GST._CSV_SKIP[k]; }).sort();
  var s = ks.map(function(k){ return k+'\x01'+String(rowObj[k]==null?'':rowObj[k]); }).join('\x02');
  var h1=0x811c9dc5, h2=0x1505;
  for(var i=0;i<s.length;i++){ var c=s.charCodeAt(i);
    h1=((h1^c)*0x01000193)>>>0; h2=(((h2<<5)+h2)^c)>>>0; }
  return h1.toString(16)+'-'+h2.toString(16);
};
GST._dbwFields = function(W, rowObj){          // 표 행 → 페이지가 아는 논리 필드
  var cmap = GST._dbwColMap(rowObj), out = {};
  Object.keys(W.cols).forEach(function(f){
    var k = GST._dbwPick(cmap, W.cols[f]);
    if(k!=null) out[f] = rowObj[k]==null?'':String(rowObj[k]);
  });
  return out;
};
/* 업무 키로 행을 찾는다. 키가 비었거나 못 찾으면 이름으로 한 번 더(교육 표에는 사번이
   빈 행이 실제로 있다). 어느 쪽이든 **정확히 한 행**이 아니면 던진다. */
GST._dbwFind = async function(c, W, key, name){
  var tries = [];
  if(key) tries.push([W.keyCol, key]);
  if(name) tries.push([W.cols[W.nameField], name]);
  if(!tries.length) throw GST._dbwErr('not_found', 404);
  var lastEmpty = true;
  for(var i=0;i<tries.length;i++){
    var probe = await c.from(W.table).select('*').limit(1);
    if(probe.error) throw GST._dbwErr('sheets_error', 500, {detail:probe.error.message});
    if(!probe.data || !probe.data.length) throw GST._dbwErr('not_found', 404);
    var col = GST._dbwCol(GST._dbwColMap(probe.data[0]), tries[i][0]);
    var r = await c.from(W.table).select('*').eq(col, tries[i][1]);
    if(r.error) throw GST._dbwErr('sheets_error', 500, {detail:r.error.message});
    var n = (r.data||[]).length;
    if(n === 1) return { row:r.data[0], matchCol:col, matchVal:tries[i][1] };
    if(n > 1) throw GST._dbwErr('dup_key', 409, {n:n});
  }
  throw GST._dbwErr('not_found', 404);
};
GST._dbwGuard = function(vals){                // 수식 주입 차단 — sheet-write 와 같은 검사
  for(var k in vals){ if(/^[=+\-@]/.test(String(vals[k]||''))) throw GST._dbwErr('bad_value', 400, {field:k}); }
};
/* 쓰기 «뒤»의 두 가지 — 이력 한 줄과 캐시 도장 (v140).
   ① 이력: 예전에는 hr·고장분석 편집이 아무 기록도 안 남겼다 — 「누가 언제 이 값을 바꿨나」를
      물을 곳이 없었다. edit_note(setup-16)가 sheet_edits 에 «행 전체» before/after 를 남긴다.
      누가(edited_by)는 인자가 아니라 서버가 로그인 토큰에서 읽는다 — 위조할 수 없다.
   ② 캐시 도장: 미러 표(sheet_wk 등)를 고치고 sheet_sync_log 를 안 건드리면, 캐시 열쇠
      (synced_at+행수 · v101)가 그대로라 «저장했는데 새로고침하면 옛 값»이 된다(v80 의 그 실패).
      고장분석의 dq 편집이 실제로 그 상태였다 — 고친 사람 자신도 새로고침하면 옛 값을 봤다.
      정본 규칙은 csv_upload_finish 한 곳이다(여기서 sync_log 를 직접 쓰지 않는다).
   ⚠ 둘 다 «최선»이다 — 쓰기는 이미 끝났으므로 여기 실패가 저장을 되돌리면 안 된다.
     다만 조용하지 않게 콘솔에 남긴다(setup-16 을 아직 안 돌린 DB 면 edit_note 가 없다). */
GST._DBW_MIRROR = {sheet_wk:1, sheet_mat:1, sheet_inst:1};
GST._dbwNote = async function(c, tbl, op, before, after){
  var row = after || before || {};
  var key = row.id != null ? row.id : (row.src_row != null ? row.src_row : '');
  try{ var r = await c.rpc('edit_note', {p_tbl:tbl, p_op:'dbw:'+op, p_key:String(key), p_before:before||null, p_after:after||null});
       if(r && r.error) console.warn('[dbWrite] 변경 이력을 못 남겼습니다 (setup-16 미적용?)', r.error.message||r.error); }
  catch(e){ console.warn('[dbWrite] 변경 이력을 못 남겼습니다', e&&e.message||e); }
  if(GST._DBW_MIRROR[tbl]){
    try{ var f = await c.rpc('csv_upload_finish', {p_tbl:tbl});
         if(f && f.error) console.warn('[dbWrite] 캐시 도장 실패 — 다른 브라우저는 옛 값을 볼 수 있습니다', f.error.message||f.error); }
    catch(e){ console.warn('[dbWrite] 캐시 도장 실패', e&&e.message||e); }
  }
};
GST.dbWrite = async function(op, gid, body, params){
  var W = GST.DBW[gid]; body = body||{}; params = params||{};
  var c = await GST.db(); if(!c) throw GST._dbwErr('unauthorized', 401);
  var s = await GST.getSession(); if(!s) throw GST._dbwErr('unauthorized', 401);
  var email = String((s.user && s.user.email) || '').toLowerCase();

  /* 권한 — allowed_users.can_write. RLS 가 최종 결정하므로 이 검사는 UI·메시지용이다
     (검사를 우회해도 정책이 막는다). 자기 행 조회는 setup-7 의 self read 정책이 연다. */
  // ilike = 대소문자 무시 일치. %·_ 는 와일드카드라 이메일에 든 _ 를 이스케이프한다
  var like = email.replace(/[%_\\]/g, '\\$&'), legacy = false;
  var au = await c.from('allowed_users').select('email,can_write,role').ilike('email', like).maybeSingle();
  /* role 열이 아직 없으면(setup-15 실행 전) 옛 두 열만 다시 읽는다 — 그 상태에서 쓰기·업로드가 멈추면 안 된다(v135) */
  if(au.error && /role/i.test(String(au.error.message||''))){
    legacy = true;
    au = await c.from('allowed_users').select('email,can_write').ilike('email', like).maybeSingle();
  }
  if(au.error) throw GST._dbwErr('sheets_error', 500, {detail:au.error.message});
  if(!au.data){ GST.authDenied && GST.authDenied(403); throw GST._dbwErr('forbidden', 403); }
  var me = { ok:true, email:email, can_write:!!au.data.can_write, role: legacy ? 'legacy' : (au.data.role || 'viewer') };
  GST._meApply(me);
  if(op === 'perm') return me;
  if(!au.data.can_write) throw GST._dbwErr('read_only', 403);
  if(W.ops && W.ops.indexOf(op) < 0) throw GST._dbwErr('op_disabled', 400, {op:op});

  if(op === 'row'){
    var f0 = await GST._dbwFind(c, W, params.key, params.name);
    var out = { ok:true, hash:GST._dbwHash(f0.row), fields:GST._dbwFields(W, f0.row) };
    if(params['with'] === 'edu' && W.cascadeTo && GST.DBW[W.cascadeTo]){
      var We0 = GST.DBW[W.cascadeTo];
      try{ var fe0 = await GST._dbwFind(c, We0, params.key, out.fields.name);
           out.edu = { hash:GST._dbwHash(fe0.row), fields:GST._dbwFields(We0, fe0.row) }; }
      catch(e){ out.edu = null; }         // 교육 미등록 — 페이지가 append 로 새 행을 만든다
    }
    return out;
  }

  if(op === 'update'){
    if(W.appendOnly) throw GST._dbwErr('op_disabled', 400);
    var ch = body.changes || {};
    if(!Object.keys(ch).length) throw GST._dbwErr('no_changes', 400);
    GST._dbwGuard(ch);
    (W.required||[]).forEach(function(k){ if(ch[k]!=null && ch[k]==='') throw GST._dbwErr('missing_field', 400, {field:k}); });
    var f = await GST._dbwFind(c, W, body.key, body.name);
    var hash = GST._dbwHash(f.row);
    if(body.baseHash && body.baseHash !== hash)
      throw GST._dbwErr('conflict', 409, {hash:hash, fields:GST._dbwFields(W, f.row)});
    var cmap = GST._dbwColMap(f.row), upd = {};
    Object.keys(ch).forEach(function(k){ if(W.cols[k]) upd[GST._dbwCol(cmap, W.cols[k])] = String(ch[k]); });
    if(!Object.keys(upd).length) throw GST._dbwErr('no_changes', 400);
    /* 이력의 «전» 행은 쓰기 «전에» 떠 둔다 — 클라이언트가 읽은 객체를 갱신 결과로 덮을 수 있다(그러면 전=후가 된다) */
    var before0 = JSON.parse(JSON.stringify(f.row));
    var r = await c.from(W.table).update(upd).eq(f.matchCol, f.matchVal).select('*');
    if(r.error) throw GST._dbwErr('sheets_error', 500, {detail:r.error.message});
    /* RLS 가 막으면 PostgREST 는 에러가 아니라 **0행**을 돌려준다. 그걸 '저장됨'으로
       보이게 두면 안 되므로 여기서 던진다. */
    if(!r.data || r.data.length !== 1) throw GST._dbwErr('read_only', 403);
    var row = r.data[0];
    await GST._dbwNote(c, W.table, 'update', before0, row);
    var res = { ok:true, hash:GST._dbwHash(row), fields:GST._dbwFields(W, row) };
    // 사번/이름이 바뀌면 교육 표의 짝 행도 같은 문자열로 — 조인이 깨지지 않게 (sheet-write 규약)
    if(W.cascadeTo && GST.DBW[W.cascadeTo] && (ch.id!=null || ch.name!=null)){
      var We = GST.DBW[W.cascadeTo], oldF = GST._dbwFields(W, f.row);
      try{
        var fe = await GST._dbwFind(c, We, body.key, oldF.name);
        var cm2 = GST._dbwColMap(fe.row), up2 = {}, beforeE = JSON.parse(JSON.stringify(fe.row));
        if(ch.id!=null)   up2[GST._dbwCol(cm2, We.cols.id)]   = String(ch.id);
        if(ch.name!=null) up2[GST._dbwCol(cm2, We.cols.name)] = String(ch.name);
        var r2 = await c.from(We.table).update(up2).eq(fe.matchCol, fe.matchVal).select('*');
        if(r2.error || !r2.data || r2.data.length !== 1) res.cascade = { done:false };
        else { await GST._dbwNote(c, We.table, 'update', beforeE, r2.data[0]);
               res.cascade = { done:true, hash:GST._dbwHash(r2.data[0]), fields:GST._dbwFields(We, r2.data[0]) }; }
      }catch(e){ res.cascade = { done:false }; }
    }
    return res;
  }

  if(op === 'append'){
    var flds = body.fields || {};
    (W.required||[]).forEach(function(k){ if(!flds[k]) throw GST._dbwErr('missing_field', 400, {field:k}); });
    GST._dbwGuard(flds);
    // 키 중복 차단 (휴가는 같은 사람 여러 행이 정상이라 검사하지 않는다)
    if(!W.appendOnly && flds[W.keyField]){
      try{ await GST._dbwFind(c, W, flds[W.keyField], null); throw GST._dbwErr('dup_key', 409); }
      catch(e){ if(e && e.data && e.data.error !== 'not_found') throw e; }
    }
    /* ⚠ 별칭의 «첫 이름»을 그대로 쓰면 안 된다 — 표에 없는 옛 열에 값을 넣게 되고,
       insert 는 성공하는데(그 열이 남아 있으면) 파서는 «채워진 열»을 보므로 어느 화면에도
       안 뜬다. «저장됨»이라 답하고 아무 데도 없는, 가장 설명하기 어려운 실패다.
       그래서 표의 실제 열 목록을 한 번 읽어 거기서 고른다. */
    var probeA = await c.from(W.table).select('*').limit(1);
    if(probeA.error) throw GST._dbwErr('sheets_error', 500, {detail:probeA.error.message});
    /* ⚠ «한 행 받아 키 보기»는 표가 비어 있으면 못 쓴다 — 그런데 첫 등록이 바로 그 순간이다.
       행이 없으면 별칭의 «첫 이름»(=새 양식의 정본 이름)으로 넣는다. 행이 있으면 그 행의
       실제 열에서 고른다 — 옛 열이 남아 있는 표에서 빈 열을 집지 않기 위해서다. */
    var hasRowsA = !!(probeA.data && probeA.data.length);
    var cmapA = GST._dbwColMap((probeA.data && probeA.data[0]) || {});
    var ins = {};
    Object.keys(flds).forEach(function(k){
      /* 시트 시절 잔재 필드(join·role·posKo 등 교육 표에서 없어진 열)는 버린다 —
         페이지가 아직 보내지만 담을 열이 없다. 여기 한정으로 의도된 무시다. */
      var want = W.cols[k]; if(!want) return;
      var col = hasRowsA ? GST._dbwPick(cmapA, want)
                         : (Array.isArray(want) ? want[0] : want);
      if(col) ins[col] = String(flds[k]);
    });
    if(!Object.keys(ins).length) throw GST._dbwErr('bad_value', 400);
    var ri = await c.from(W.table).insert(ins).select('*');
    if(ri.error) throw GST._dbwErr('sheets_error', 500, {detail:ri.error.message});
    if(!ri.data || !ri.data.length) throw GST._dbwErr('read_only', 403);   // RLS 거부 = 0행
    var nrow = ri.data[0];
    await GST._dbwNote(c, W.table, 'append', null, nrow);
    var out2 = { ok:true, hash:GST._dbwHash(nrow), fields:GST._dbwFields(W, nrow) };
    // 인원 신규 등록이면 교육 표에도 짝 행 (같은 사번/이름 문자열 — sheet-write 규약)
    if(body.edu && W.cascadeTo && GST.DBW[W.cascadeTo]){
      var We2 = GST.DBW[W.cascadeTo];
      var ef = Object.assign({ id:flds.id||'', name:flds.name||'', site:flds.wp||'' }, body.edu);
      try{
        var ins2 = {};
        Object.keys(ef).forEach(function(k){ if(We2.cols[k]) ins2[We2.cols[k]] = String(ef[k]); });
        var r3 = await c.from(We2.table).insert(ins2).select('*');
        if(r3.error || !r3.data || !r3.data.length) out2.edu = { ok:false, error:(r3.error&&r3.error.message)||'insert failed' };
        else { await GST._dbwNote(c, We2.table, 'append', null, r3.data[0]);
               out2.edu = { ok:true, hash:GST._dbwHash(r3.data[0]), fields:GST._dbwFields(We2, r3.data[0]) }; }
      }catch(e){ out2.edu = { ok:false, error:String(e&&e.message||e) }; }
    }
    return out2;
  }

  if(op === 'delete'){
    if(W.appendOnly) throw GST._dbwErr('op_disabled', 400);
    var fd = await GST._dbwFind(c, W, body.key, body.name);
    var hd = GST._dbwHash(fd.row);
    if(body.baseHash && body.baseHash !== hd)
      throw GST._dbwErr('conflict', 409, {hash:hd, fields:GST._dbwFields(W, fd.row)});
    var rd = await c.from(W.table)['delete']().eq(fd.matchCol, fd.matchVal).select('*');
    if(rd.error) throw GST._dbwErr('sheets_error', 500, {detail:rd.error.message});
    if(!rd.data || rd.data.length !== 1) throw GST._dbwErr('read_only', 403);
    await GST._dbwNote(c, W.table, 'delete', fd.row, null);     // 행 전체를 남긴다 — /edit/ 의 변경 이력에서 되살릴 수 있다
    var del = { row:true, edu:false };
    if(body.cascade && W.cascadeTo && GST.DBW[W.cascadeTo]){
      var We3 = GST.DBW[W.cascadeTo];
      try{
        var fe3 = await GST._dbwFind(c, We3, body.key, GST._dbwFields(W, fd.row).name);
        var r4 = await c.from(We3.table)['delete']().eq(fe3.matchCol, fe3.matchVal).select('*');
        del.edu = !!(r4.data && r4.data.length === 1);
        if(del.edu) await GST._dbwNote(c, We3.table, 'delete', fe3.row, null);
      }catch(e){ /* 교육 미등록 — 지울 것이 없다 */ }
    }
    return { ok:true, deleted:del };
  }

  throw GST._dbwErr('op_disabled', 400, {op:op});
};

// 저장 직후 최신 데이터. 웹게시 CSV는 수 분 지연되므로 라이브 시트를 직접 읽는다.
// 쿼터가 서비스계정 1개에 공유되므로 초기 로드·자동 새로고침에는 쓰지 말 것.
GST.fetchCSVFresh = async function(gid){
  var tok = await GST.token();
  if(!tok){ await GST.authReady(); tok = await GST.token(); }
  var res = await fetch(GST.SB_URL+'/functions/v1/'+GST.FN_WRITE+
    '?op=fresh&gid='+encodeURIComponent(gid)+'&t='+Date.now(), {headers:{Authorization:'Bearer '+tok}});
  if(res.status===401){                            // 만료 의심 — 갱신 후 한 번만 재시도
    var tok2=await GST.freshToken();
    if(tok2) res=await fetch(GST.SB_URL+'/functions/v1/'+GST.FN_WRITE+
      '?op=fresh&gid='+encodeURIComponent(gid)+'&t='+Date.now(), {headers:{Authorization:'Bearer '+tok2}});
  }
  if(res.status===401){ GST.authDenied(401); throw new Error('AUTH 401'); }
  if(!res.ok) throw new Error('HTTP '+res.status);
  return Papa.parse(await res.text(), {skipEmptyLines:true}).data;
};

// PapaParse 필요. 캐시 무효화 포함. 반환: 헤더 포함 2차원 배열
// Supabase 인증 활성 시: 시트 직접 URL → 프록시(Edge Function)로 자동 치환 + JWT 첨부
/* 시트 «주소»가 아니라 «gid» 만 코드에 둔다.
   ⚠ 공개 저장소에 웹게시 토큰(/d/e/2PACX-…)이 9개 파일에 평문으로 박혀 있었다. 웹게시에는
     인증이 없어, URL 만 알면 로그인 없이 전량을 받을 수 있었다(v78 이 경고한 바로 그것).
     사용자가 2026-08 에 웹게시를 해제해 통로 자체는 닫혔지만, 문자열을 남겨 두면 새 파일이
     그대로 복사해 간다 — 실제로 /diag/ 를 만들 때 그렇게 됐다.
   실제로 필요한 정보는 gid 뿐이다: 읽기는 gid 로 미러·Import 표를 고르고(fetchCSVCached),
   폴백도 gid 로 sheet-proxy 를 부른다(서비스 계정). 이 URL 은 «gid 를 실어 나르는 껍데기»다.
   tests/t-leak.mjs 가 2PACX 토큰의 부활을 막는다. */
GST.SHEET_PUB = 'https://docs.google.com/spreadsheets/d/e/PUBLISH-DISABLED/pub';
GST.sheetUrl = function(gid){ return GST.SHEET_PUB + '?gid=' + gid + '&single=true&output=csv'; };

GST.fetchCSV = async function(url){
  if(GST.authOn() && /docs\.google\.com/.test(url)){
    var gm=url.match(/[?&]gid=(\d+)/); var gid=gm?gm[1]:'0';
    var tok=await GST.token();
    if(!tok){ await GST.authReady(); tok=await GST.token(); }
    var pres=await GST.proxyFetch(gid, tok);
    if(pres.status===401){                        // 만료 의심 — 갱신 후 한 번만 재시도
      var tok2=await GST.freshToken();
      if(tok2) pres=await GST.proxyFetch(gid, tok2);
    }
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
  const cur = b.indexOf('theme-slate')>-1?'slate':'light';
  if(typeof global.changeDashboardTheme==='function'){ try{ global.changeDashboardTheme(cur,cur); }catch(e){} }
};
try{ const k=localStorage.getItem('gst_pal'); if(k&&GST.PALETTES[k]) GST.setPalette(k,true); }catch(e){}
// 현재 테마에 맞는 차트 잉크/팔레트/상태색. 차트 생성 시점에 호출해야 함.
// 상태색은 의미(정상/경고/위험) 전용 — 범주 시리즈로 재사용하지 않는다.
// v139 — 테마는 둘뿐이다. 다크 클래스가 없으면 라이트다(옛 'default'·'burgundy' 저장값 포함).
// key 는 'light' | 'slate'. ink 는 «값 라벨»처럼 또렷해야 하는 글자색이다(플러그인 기본값).
GST.chartTheme = function(){
  const b = (document.body&&document.body.className) || '';
  const slate = b.indexOf('theme-slate')>-1;
  const key = slate?'slate':'light';
  const txt = slate?'#8B98A9':'#667085', grid = slate?'rgba(151,170,196,.10)':'rgba(16,24,40,.07)';
  return { key, txt, grid, ink: slate?'#E6EDF3':'#101828', pal:GST.PAL, pal8:GST.PAL8,
    status:{ bad: slate?'#F0716B':'#D92D20', warn: slate?'#F2B134':'#B7670A',
             ok: slate?'#3FBF7F':'#12873F', na: slate?'#5E6D80':'#98A2B3' } };
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
  // 툴팁: 어두운 잉크 — 테마와 무관하게 일관(라이트에서도 어두운 툴팁이 가독 우수)
  const tt=Chart.defaults.plugins.tooltip;
  tt.backgroundColor='rgba(16,24,40,.94)'; tt.borderColor='rgba(255,255,255,.08)'; tt.borderWidth=1;
  tt.cornerRadius=8; tt.padding=10; tt.titleColor='#FFFFFF'; tt.bodyColor='#D0D5DD';
  tt.titleFont={family:GST.FONT_STACK,size:11.5,weight:'700'};
  tt.bodyFont={family:GST.FONT_STACK,size:11};
  tt.boxPadding=4; tt.usePointStyle=true;
  // 막대 기하 — 페이지마다 2~6으로 흩어져 있던 radius를 한 값으로, 두께 상한으로 과비만 방지
  Chart.defaults.elements.bar.borderRadius = 4;
  Chart.defaults.datasets.bar.maxBarThickness = 34;

  /* 차트 세부내역 (v84) — 막대·꺾은선·점을 누르면 그 점을 «구성하는 원본 레코드»를 보여준다.
     페이지는 차트를 만든 뒤 `chart.$rows = (di, i) => ({title, cols, rows})` 한 줄만 단다.
     $rows 가 없는 차트는 아무 일도 없다 — 기존 클릭 핸들러(드릴·필터 좁히기)와 공존한다.
     플러그인으로 심는 이유: 페이지들이 Chart.defaults.onClick 을 각자 덮어써서(hr 등)
     onClick 에 끼우면 어느 페이지에선 조용히 사라진다. */
  if(!Chart.registry.plugins.get('gstRows')) Chart.register({
    id:'gstRows',
    afterEvent(chart, args){
      if(args.event.type!=='click' || typeof chart.$rows!=='function') return;
      let els=[];
      try{ els=chart.getElementsAtEventForMode(args.event.native,'nearest',{intersect:true},true); }catch(e){}
      if(!els.length) return;
      let spec=null;
      try{ spec=chart.$rows(els[0].datasetIndex, els[0].index); }catch(e){}
      if(spec && spec.rows) GST.rowsModal(spec.title, spec.cols, spec.rows, spec.note);
    }
  });
};
try{ GST.chartDefaults(); }catch(e){}

/* 세부내역 모달 — 차트/표 어디서든 «이 숫자를 만든 행들»을 보여준다.
   rows 는 2차원 배열(값은 문자열/숫자), cols 는 헤더. 500행까지만 그린다 —
   그 이상은 브라우저가 버벅이고, 목록의 목적(어떤 건들인지 눈으로 확인)에 500이면 충분하다. */
GST._ROWS_T = {
  ko:{n:'건', more:'처음 {m}건만 표시', close:'닫기', copy:'⧉ 복사', copied:'복사됨', list:'세부내역 보기'},
  en:{n:' rows', more:'showing first {m}', close:'Close', copy:'⧉ Copy', copied:'Copied', list:'View details'},
  zh:{n:'件', more:'仅显示前 {m} 件', close:'关闭', copy:'⧉ 复制', copied:'已复制', list:'查看明细'},
  ja:{n:'件', more:'先頭 {m} 件のみ表示', close:'閉じる', copy:'⧉ コピー', copied:'コピー済み', list:'明細を見る'}
};
GST.rowsModal = function(title, cols, rows, note){
  const T=GST._ROWS_T[GST._lang()]||GST._ROWS_T.ko, esc=GST._esc, MAX=500;
  const shown=rows.slice(0,MAX);
  const sub=rows.length.toLocaleString()+T.n
    +(rows.length>MAX?' · '+T.more.replace('{m}',MAX):'')
    +(note?' · '+esc(note):'');
  const ov=GST._ovOpen(
     '<div class="gov-h"><h4>'+esc(title)+'</h4><span class="gov-sub">'+sub+'</span><span class="gov-sp"></span>'
    +'<button class="gov-b" data-rm="copy">'+T.copy+'</button>'
    +'<button class="gov-b" data-rm="close">'+T.close+'</button></div>'
    +'<div class="gov-body" style="overflow:auto;max-height:72vh;padding-top:6px"><table class="gpv-t"><thead><tr>'
    +cols.map(function(c){ return '<th>'+esc(c)+'</th>'; }).join('')+'</tr></thead><tbody>'
    +shown.map(function(r){ return '<tr>'+r.map(function(v){ return '<td>'+esc(v)+'</td>'; }).join('')+'</tr>'; }).join('')
    +'</tbody></table></div>', true);
  ov.addEventListener('click', function(e){
    const b=e.target.closest('[data-rm]'); if(!b) return;
    if(b.dataset.rm==='close'){ GST._ovClose(); return; }
    if(b.dataset.rm==='copy'){
      // 전량(500 제한 없이)을 탭 구분으로 — 엑셀에 그대로 붙는다
      const txt=[cols.join('\t')].concat(rows.map(function(r){ return r.join('\t'); })).join('\n');
      try{ navigator.clipboard.writeText(txt); b.textContent=T.copied; }catch(err){}
    }
  });
  return ov;
};

/* ---------- KPI 카드 클릭 → 세부내역 (v133) ----------
   ⚠ 이 기능은 «있었다가 지워진» 것이 아니라 한 번도 없었다. 그런데 theme.css 가 모든
     .kpi 에 cursor:pointer 를 걸어 두어, 실측 56장 중 48장이 «손가락 커서가 뜨고 눌리는
     느낌까지 나는데 아무 일도 안 하는» 카드였다 — 화면이 없는 기능을 있다고 말한 것이다.
     그래서 여기서 «동작»을 만들고, theme.css 는 «동작이 붙은 카드»만 pointer 로 바꾼다.

   열쇠는 카드가 아니라 «값 element 의 id»(kp1·ck2·rk3)다. 그 id 가 숫자를 쓴 유일한
   자리(setTxt('kp4', …))라, 카드를 옮기거나 KPI 블록이 하나 더 생겨도 팝업이 «그 숫자»를
   따라간다. .kpi 를 위치(querySelectorAll 순서)로 잡으면 pm 이 겪던 결함
   (data-s 없는 카드까지 잡혀 activeStatus=undefined)이 여덟 페이지로 퍼진다.

   spec 은 «열 때» 부른다 — mount 때 계산하면 필터를 바꾼 뒤 옛 숫자가 열린다.
     () => ({title, cols, rows, note})   → GST.rowsModal 이 연다 (표 하나 · 500행 · 복사)
     () => ({open:fn})                   → 페이지 자기 모달 (요약 + 표 여럿 + 안내)
   두 반환형을 두는 이유: 페이지 모달이 내는 것은 «행 목록»이 아니라 요약·복수 표·
   「해외 n건은 크로스탭이라 목록이 없습니다」 같은 안내다. rowsModal 로 통일하면 그것이
   통째로 사라진다(= 조용히 빼는 것). */
GST.kpiDrill = function(map, opt){
  if(!map) return;
  const badge = !!(opt && opt.badge);
  const run = function(id, host){
    const fn=(host._kdMap||{})[id]; if(typeof fn!=='function') return;
    let spec=null;
    try{ spec=fn(); }catch(e){ console.error('kpiDrill '+id, e); return; }
    if(!spec) return;
    if(typeof spec.open==='function'){ spec.open(); return; }
    if(spec.rows) GST.rowsModal(spec.title, spec.cols, spec.rows, spec.note);
  };
  Object.keys(map).forEach(function(id){
    const el=document.getElementById(id); if(!el) return;
    const card=el.closest('.kpi')||el.parentElement; if(!card) return;
    if(badge){
      /* ⚠ 배지 모드 — «카드 클릭이 이미 자기 일을 하는» 카드용 (v135 · 6단계).
         fault 의 .kpi[data-stage] 3장과 pm 의 .kpi[data-s] 5장은 페이지가 k.onclick 으로
         단계·상태 필터를 건다. kpiDrill 은 addEventListener 라 서로 지우지 않고 «둘 다»
         돈다 — 한 번 눌러 필터가 바뀌고 팝업이 동시에 터지며, 팝업은 재렌더 때문에 방금
         사라진 숫자를 보여준다. 그래서 팝업은 값 옆 작은 배지에 둔다.
         ⚠ data-kdrill 은 붙이지 «않는다» — theme.css 의 커서 셀렉터가 그것으로 «동작이
         붙은 카드»를 아는데, 이 카드들은 data-stage/data-s 로 이미 커서를 갖고 자기
         동작이 따로 있다. 표식은 data-kdrillb 로 가른다(검사가 두 모드를 구분한다). */
      card.setAttribute('data-kdrillb', id);
      card._kdMap = map;
      let b=card.querySelector('.kdb[data-kdb="'+id+'"]');
      if(!b){
        const row=el.closest('.krow')||el.parentElement||card;
        b=document.createElement('button');
        b.className='kdb'; b.type='button'; b.dataset.kdb=id;
        b.textContent='\u2630';                       // ☰ — 목록
        b.title=(GST._ROWS_T[GST._lang()]||GST._ROWS_T.ko).list||'';
        row.appendChild(b);
        b.addEventListener('click', function(ev){
          /* 카드의 필터 클릭까지 같이 돌면 «누르자마자 숫자가 바뀐 팝업»이 된다. */
          ev.stopPropagation(); ev.preventDefault();
          run(id, card);
        });
      }
      return;
    }
    /* 표식을 남긴다 — theme.css 의 커서 셀렉터와 검사가 «동작이 붙은 카드»를 이것으로 안다. */
    card.setAttribute('data-kdrill', id);
    /* render 가 여러 번 도는 페이지(report·pm)에서 핸들러가 겹쳐 붙지 않게 한 번만 단다.
       spec 은 클릭 시점에 map 에서 다시 꺼내므로, 다시 mount 해도 새 spec 이 쓰인다. */
    card._kdMap = map;
    if(card._kd) return;
    card._kd = true;
    card.addEventListener('click', function(){ run(id, card); });
  });
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
GST.renderChips = function(F, LABELS, onClearName, opt){
  if(!(opt && opt.noCtx)){ try{ GST.ctxSave(F); }catch(e){} }   // 사이트·공정은 다른 탭으로 승계
  const box=document.getElementById('fchips'), list=document.getElementById('fchipList');
  if(!box || !list) return;
  // 다중선택(Set)도 칩으로 보여야 한다 — 걸린 조건이 화면에 안 보이면 모집단을 오해한다
  const shown = v => (v instanceof Set) ? Array.from(v).join(' · ') : v;
  const has   = v => (v instanceof Set) ? v.size > 0 : !!v;
  const active = Object.entries(F||{}).filter(([k,v])=>has(v));
  /* 공통 축(GST.filters)의 칩도 «같은 줄»에 낸다 (v135). 예전에는 tco·cip 만 손으로 합쳤고(한국어 이름표를 다시 박아서)
     fault·material 은 공통 축이 걸려도 칩이 안 떴다 — 어제 걸어 둔 구분·단지가 오늘 화면을 좁히는데 아무 표시가 없었다. */
  let core = [];
  try{ core = (GST.filters && GST.filters.active) ? GST.filters.active() : []; }catch(e){}
  if(!active.length && !core.length){ box.style.display='none'; list.innerHTML=''; return; }   // 숨길 때 옛 칩도 지운다 — 남겨 두면 다음에 보일 때 한 박자 옛 조건이 보인다
  box.style.display='flex';
  list.innerHTML = active.map(([k,v])=>
    `<span class="fchip" onclick="${onClearName}('${k}')">${LABELS[k]||k}: <b>${GST._esc(shown(v))}</b> <span class="fx">✕</span></span>`
  ).join('') + core.map(c =>
    `<span class="fchip gf-chip" onclick="GST.filters.unset('${c.k}','${c.grp}')">${GST._esc(c.label)}: <b>${GST._esc(c.value)}</b> <span class="fx">✕</span></span>`
  ).join('');
};
/* core 가 만든 칩 칸(#fchips[data-gst]) — 자기 칩 줄이 없는 페이지(pm·scrubber)에 mount 가 끼워 넣는다.
   페이지가 자기 #fchips 나 #filtBadge 를 갖고 있으면 만들지 않는다(두 줄이 되면 어느 쪽을 믿을지 모른다). */
GST._chipsMount = function(){
  if(document.getElementById('fchips') || document.getElementById('filtBadge')) return;
  const T = GST._fltT();
  const d = document.createElement('div'); d.className='fchips gst-fchips'; d.id='fchips'; d.dataset.gst='1'; d.style.display='none';
  d.innerHTML = '<span class="fchips-label"><span class="gst-fchips-l">'+GST._esc(T.chipsActive)+'</span>:</span>'
    + '<span id="fchipList"></span>'
    + '<button type="button" class="fchip-clear gst-fchips-c" onclick="GST.clearFilters()">'+GST._esc(T.chipsClear)+'</button>';
  const anchor = document.querySelector('.kpis') || document.querySelector('[data-sec]') || document.querySelector(GST.CARD_SEL||'.card');
  if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(d, anchor);
};
GST._chipsRender = function(){
  const box = document.getElementById('fchips');
  if(!box || !box.dataset.gst) return;               // 페이지 소유 칩 줄은 페이지의 render() 가 그린다
  GST.renderChips({}, {}, '', {noCtx:true});
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
  /* v139 — 테마는 둘이다: light(기본 · :root) · slate(다크). 옛 저장값(default=navy · burgundy)은 라이트로 읽는다.
     ⚠ body.className 을 통째로 갈지 않는다 — gst-inframe·gst-sb-open·kiosk-* 가 함께 날아가던 자리. 테마 클래스만 바꾼다. */
  function setThemeClass(th){
    th = (th==='slate') ? 'slate' : 'light';
    const cl=document.body.classList;
    Array.prototype.slice.call(cl).forEach(function(c){ if(/^theme-/.test(c)) cl.remove(c); });
    cl.add('theme-'+th);
    return th;
  }
  function applyStored(){
    let th=null, lg=null;
    try{ th=sessionStorage.getItem('gst_theme'); lg=sessionStorage.getItem('gst_lang'); }catch(e){}
    /* 저장값이 없으면(교차 출처 iframe 은 셸의 sessionStorage 를 못 본다) 셸이 메시지로 걸어 둔 클래스를 지킨다 —
       1.5초 뒤 재적용이 그것을 라이트로 되돌리던 자리. */
    if(!th && document.body && /theme-slate/.test(document.body.className)) th='slate';
    th = setThemeClass(th || 'light');
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
      const th=setThemeClass(d.theme);
      if(typeof global.changeDashboardTheme==='function'){
        try{ global.changeDashboardTheme(th, th); }catch(e){}
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
  /* 설치현황 — **국내·해외 양식이 완전히 다르다** (v96). 국내 74열(한글 머리글) ·
     해외 118열(영문 머리글). 통합할 수 없다는 것이 사용자 확정이라, 세 벌로 파싱하는
     대신 **별칭 배열 한 곳으로 흡수한다**(알람 K·P·H 와 같은 방식 — 제2원칙).

     ⚠⚠ **`FAB` 은 두 양식에서 «다른 뜻»이다.** 해외 FAB = F16·FAB1·201A(화면의 라인).
     국내 FAB = FSF·R/P·CSF·MAIN(공장 구역). 국내에서 화면의 라인에 해당하는 것은
     `Line 1` 이다. 그래서 별칭 **순서가 규약이다** — 'Line 1' 을 먼저 둔다.
     뒤집으면 국내 라인 축이 통째로 FSF/R/P 로 바뀐다(에러 없이).
     실측 대조로 확정했다: 국내 `Line 1` = P3-D 485 · P2-D 390 · P1-3 300 으로
     현재 표의 FAB 분포와 건수까지 일치한다.

     ⚠ 챔버 판정도 이름이 다르다 — 해외 `Scrubber type`, 국내 `Type2`(SINGLE 5,294 ·
     DUAL 1,955). 국내 `Type1` 은 버너 방식(BURN-WET·PLASMA)이지 챔버 수가 아니다.
     여기를 잘못 잡으면 전 설비가 챔버 1로 계산된다.

     ⚠ 옛 주석의 «'Type'이 44·79·96열 중복» 경고는 그대로 유효하다 — 맨 이름 'Type' 은
     어느 별칭에도 쓰지 않는다.

     · div(사업부)는 국내에만 있다 → opt. 해외는 빈 값이고 필터에서 그렇게 보인다.
     · location(단지)·start 는 해외 양식에 없다 → opt. */
  inst: { name:'설치현황', gid:'891608329', hints:['Scrubber S/N'],
    /* ⚠ 새 열은 반드시 opt 에도 넣는다 — 그 열이 없는 옛 추출본이 통째로 «열을 못 찾았습니다»
       로 거부되고 픽스처·테스트까지 같이 죽는다(CLAUDE.md v89 의 승격 순서 2번). */
    opt:['pjt','toolId','pmCycle','warrantyDate','start','group2','detail2',
         'div','location','burner','bay','warranty','floor','fabIn','turnOn','state','line2'],
    fields:{
      pjt:['PJT.','Product code'],
      country:['Country','운영단위'], customer:['Customer','고객사'], div:'사업부',
      location:['Location','Site'],
      code:'Scrubber CODE', sn:'Scrubber S/N', model:'Scrubber Model', burner:'Burner Type',
      /* 국내 양식은 라인이 «두 단」이다 — `Line 1` 아래에 `Line 2` 가 있고 그 아래가 Bay 다.
         해외 118열 양식에는 `Line 2` 라는 열 자체가 없다(그래서 opt). 별칭을 하나만 두는
         이유가 그것이다 — 해외의 `Line`(=Floor)을 여기에 끌어오면 한 축에 두 차원이 섞인다.
         ⚠ 정규화는 공백·마침표를 지우므로 `Line 1`→line1 · `Line 2`→line2 · `Line`→line 으로
           셋이 서로 다른 이름이다. 부분일치를 쓰면 그 순간 셋이 뒤엉킨다(제1원칙). */
      fab:['Line 1','FAB'], line2:'Line 2', floor:['Floor','Line'], bay:'Bay',
      group1:['Group_1','Process'], group2:['Group_2','Detail Process(HQ)'],
      detail1:['Detail_1','Detail Process(Customer)'], detail2:'Detail_2',
      toolId:'Main Tool ID', toolMaker:'Main Tool Maker', toolModel:'Main Tool Model',
      fabIn:['FAB In','Receipt date'], start:['Start','Setup date'], turnOn:['Turn On','Turn-on date'],
      warrantyDate:'Warranty date', warranty:'Warranty In/Out',
      pmCycle:['Target PM Cycle','PM CYCLE'], type:['Scrubber type','Type2'],
      /* 설비 대수 판정의 정본 (v99). opt 에 넣어야 «이 열이 없는 옛 추출본»이 거부되지 않는다. */
      state:['설비상태','Equipment Status','Status']
    }}
};

/* ============================================================
   설비 대수 판정 — 「설비상태」 열이 정본이다 (v99 · 사용자 확정)

   왜 바꾸나. 예전에는 반입일(FAB In)·Turn On 날짜로 셌다. 그런데 그 칸이 비어 있는
   설비가 있고, 그러면 «아직 반입 안 됨»으로 읽혀 합계에서 조용히 빠진다. 시트는
   상태를 따로 적고 있으므로 그것을 믿는 것이 맞다.

   실측 검산(2026-08 워크북 피벗) — 네 법인 모두 총대수와 정확히 맞는다:
     AMERICA 반입 365 · 가동 364 · 제외 171 = 536
     CHINA(WUHAN) 1803 · 1780 · 78 = 1,881
     CHINA(XIAN) 566 · 464 · 104 = 670
     JAPAN 311 · 280 · 15 = 326
   ⚠ 「반출완료」는 사용자가 든 제외 목록에 없었지만 JAPAN 1대를 빼야 합계가 맞는다.
     그래서 제외목록이 아니라 «반입 상태 넷» 허용목록으로 짠다 — 새 상태가 생기면
     자동으로 제외 쪽에 붙는다.

   ⚠ 허용목록은 CLAUDE.md 가 경고하는 형태다(목록에 없으면 합계에서 조용히 사라진다).
     그래서 cls() 가 모르는 값에 '?' 를 내고, 화면은 그 건수를 밝힌다.
   ============================================================ */
/* ── PM 판정 — 구분에 따라 «다른 열»을 본다 (v113 · 사용자 확정) ──
   · 해외: 작업단계 TBM
   · 국내: 「조치」 컬럼에 «설비 PM» 또는 «SWAP»
     국내는 TBM 작업단계로만 PM 을 하지 않는다(사용자 지적) — TBM 으로만 세면 국내 PM 이
     통째로 빠진다. 그래서 국내는 «조치 컬럼에서만» 센다(작업단계는 보지 않는다).
   ⚠ 그러면 PM 과 非PM 이 겹칠 수 있다. 실제로 BM 행의 조치가 「SWAP PM」인 경우가 있고,
     그것도 PM 공수다(사용자 확정). 겹친 채로 두면 공수가 «두 번» 세어져 총합이 부푼다 —
     그래서 非PM 은 반드시 «정비성 작업 중 PM 이 아닌 것»으로 정의한다(svc).
     국내 BM «건수»는 어차피 수선실적이 아니라 알람 원장으로 세므로(v92) 충돌하지 않는다.
   ⚠ 판정을 페이지마다 적지 말 것. 주간현황(공수·PM건수·S커브)과 PM 점검이 같은 물음에
     답하는데 두 벌이면 반드시 갈라진다(제2원칙).
   ⚠ 어휘는 운영단위마다 다를 수 있다(사용자 지적). 그래서 «무엇이 잡혔는지»를 셀 수 있게
     matched() 를 둔다 — 화면이 그 목록을 보여 주면 사람이 규칙을 고쳐 줄 수 있다. */
GST.PM = {
  /* 국내 조치 어휘. 빠진 낱말이 있으면 여기 한 곳만 고친다.
     ⚠ 이 경로는 «국내 전용»이다(v118 · 사용자 확정: 「해외는 기존 로직 그대로」).
       한때 구분을 안 가리게 합쳤다가 되돌렸다 — 해외는 예전처럼 작업단계 TBM 만 본다. */
  KR_ACT_RE: /설비PM|SWAP/,
  SVC: ['BM', 'CBM', 'CM', 'CRM'],
  norm: function(v){ return GST.upk(String(v == null ? '' : v)).replace(/\s/g, ''); },
  stg:  function(v){ return String(v == null ? '' : v).trim().toUpperCase().replace(/\s/g, ''); },
  /* x = {region, stage, action}. 사용자 확정(v118):
       · 작업단계 TBM 이면 PM — 어느 구분이든. 단계가 이미 그렇게 적혀 있으면 PM 이다.
       · 국내는 «거기에 더해» 「조치」에 «설비 PM»·«SWAP» 이면 작업단계가 무엇이든(BM 이라도) PM.
       · 해외는 예전 로직 그대로 — 작업단계만 본다.
     ⚠ 두 경로는 «또는»이다. 「국내는 조치만 본다」로 두면 조치가 빈 국내 TBM 행이 PM 에서
       빠지고(v116 에 사용자가 짚었다), 「TBM 만 본다」로 두면 국내 PM 이 통째로 빠진다(v113).
     ⚠ 조치 경로를 해외까지 넓혔다가 되돌렸다(v117→v118) — 국내가 별도 계통이라는 것이
       사용자 확정이다. 해외 시트의 조치 어휘가 같은 뜻이라는 근거가 없다. */
  is: function(x){
    if(!x) return false;
    if(GST.PM.stg(x.stage) === 'TBM') return true;
    if(x.region !== GST.ORG.REGION_KR) return false;
    return GST.PM.KR_ACT_RE.test(GST.PM.norm(x.action));
  },
  // 국내에서 «조치 때문에» 잡힌 행인가 — 어휘를 보여 줄 때 TBM 행과 섞이지 않게 가른다
  byAction: function(x){
    return !!x && x.region === GST.ORG.REGION_KR && GST.PM.stg(x.stage) !== 'TBM'
           && GST.PM.KR_ACT_RE.test(GST.PM.norm(x.action));
  },
  /* 공수 차트의 «전체»(= PM + 非PM). 여기서 국내와 해외가 갈린다 (v119 · 사용자 확정):
       해외 — PM(작업단계 TBM) + 서비스 4단계(BM·CBM·CM·CRM). 설치(반입·SET-UP·TURN-ON)는 뺀다.
              **별도 지시가 있을 때까지 이 기준을 유지한다.**
       국내 — PM 을 뺀 «작업건 전부»가 非PM 이다. 단계 목록으로 거르지 않는다.
     ⚠ 국내에 단계 허용목록을 쓰면 목록에 없는 단계의 공수가 «조용히» 사라진다 —
       국내 작업단계 어휘가 해외와 같다는 근거가 없으므로 목록을 쓰지 않는 것이 맞다.
     ⚠ 이 함수는 «인당 작업건»의 분자이기도 하다. 국내는 그 건수도 전부가 된다 —
       공수와 건수가 같은 모집단을 보는 것이 맞다(두 벌이면 카드끼리 갈린다). */
  maint: function(x){
    if(!x) return false;
    if(GST.PM.is(x)) return true;
    if(x.region === GST.ORG.REGION_KR) return true;   // 국내: PM 아닌 작업건 전부가 非PM
    const st = GST.PM.stg(x.stage);
    return st === 'TBM' || GST.PM.SVC.indexOf(st) >= 0;
  },
  // 非PM — «PM 이 아닌 정비성 작업». 겹침이 생기지 않는 유일한 정의다.
  svc: function(x){ return GST.PM.maint(x) && !GST.PM.is(x); },
  /* 국내에서 «어떤 조치 값이 PM 으로 잡혔나» — 값별 건수. 운영단위마다 어휘가 다르므로
     이 목록이 있어야 빠진 낱말을 사람이 알려 줄 수 있다(화면에는 안 적는다 — 물으면 답한다).
     ⚠ TBM 으로 잡힌 행은 빼고 센다. 그 행들은 조치가 비어 있어도 PM 이라 «(공란) 120건»
       같은 줄이 목록을 덮어 버린다 — 이 목록의 쓸모는 «어떤 낱말이 잡히나»다. */
  matched: function(rows){
    const m = {};
    (rows || []).forEach(function(x){
      if(!GST.PM.byAction(x)) return;
      const k = String(x.action || '').trim() || '(공란)';
      m[k] = (m[k] || 0) + 1;
    });
    return Object.keys(m).map(function(k){ return [k, m[k]]; })
             .sort(function(a, b){ return b[1] - a[1]; });
  }
};

GST.EQ = {
  IN : ['반입완료', 'Set-up', 'Turn-off', 'Operation'],   // 반입된 것 (분모)
  RUN: ['Operation'],                                      // 가동 중
  OUT: ['반납', '반출대기', '반출완료', '출하대기'],        // 나갔거나 아직 안 온 것
  /* 표기 흔들림만 흡수한다 — 대소문자·공백·하이픈. 뜻은 짐작하지 않는다. */
  norm: function(v){ return GST.upk(String(v == null ? '' : v)).replace(/[\s\-_]/g, ''); },
  cls: function(v){
    const s = GST.EQ.norm(v);
    if(!s) return '';                                      // 값 없음 → 날짜 폴백
    const has = function(a){ return a.some(function(x){ return GST.EQ.norm(x) === s; }); };
    if(has(GST.EQ.RUN)) return 'run';
    if(has(GST.EQ.IN))  return 'in';
    if(has(GST.EQ.OUT)) return 'out';
    return '?';                                            // 모르는 상태 — 화면에 밝힌다
  },
  /* 마감일 기준 판정.
     ① 상태가 정본이다.
     ② 날짜가 «있으면» 마감일을 넘었는지 한 번 더 본다 — 과거 마감으로 돌려 보는 화면이
        아직 안 온 설비를 세면 안 된다.
     ③ 날짜가 비어 있으면 상태만 믿는다. 그게 이 개편의 이유다.
     ④ 상태 열 자체가 없으면(옛 추출본) 옛 날짜 판정 그대로 — 업로드 전후로 화면이
        죽는 구간을 만들지 않는다. */
  ok: function(kind, st, d, asOf){
    const c = GST.EQ.cls(st);
    if(c === 'out' || c === '?') return false;
    if(c === '')  return !!(d && (!asOf || d <= asOf));     // 상태 없음 → 옛 판정
    if(kind === 'run' && c !== 'run') return false;
    return !(d && asOf && d > asOf);
  },
  isIn : function(st, d, asOf){ return GST.EQ.ok('in',  st, d, asOf); },
  isRun: function(st, d, asOf){ return GST.EQ.ok('run', st, d, asOf); },

  /* ── 가동현황 표의 «미가동» — 사용자 확정 (v123) ──────────────────────────
     「가동 장비 대수는 Operation 만, 미가동은 «반납과 Operation 을 제외한 상태» 전부」.

     ⚠ 반입 4종(IN)과 «다른 모집단»이다. 예전에는 미가동 = 반입 − 가동 이라
       반출대기·반출완료·출하대기가 통째로 빠져 있었다(실측 SEC 561대). 그 세 상태는
       «지금 안 돌고 있는 설비»가 맞으므로 미가동에 든다. 나가 버린 «반납»만 뺀다.
     ⚠ 그래서 IN 목록은 손대지 않는다 — 그 목록은 설치현황·고장분석·TCO 의 «설비 대수»
       정본이고 v99 에 법인별 피벗으로 검산해 둔 값이다. 여기서 같이 바꾸면 이 표를
       고치려다 네 화면의 대수가 한꺼번에 움직인다(제3원칙과 같은 규율 — 규칙을 한 벌로
       만드는 것과 판정을 한 곳에 두는 것은 다른 일이다).
     ⚠ 모르는 상태('?')도 미가동에 든다. «반납도 Operation 도 아닌 것»이 규칙이므로
       그게 규칙에 충실하고, 조용히 사라지지도 않는다. 그 건수는 화면이 따로 밝힌다. */
  GONE: ['반납'],
  isIdle: function(st, d, asOf){
    const c = GST.EQ.cls(st);
    if(c === 'run') return false;                          // 돌고 있으면 미가동이 아니다
    if(c === '')    return !!(d && (!asOf || d <= asOf));   // 상태 열이 없는 옛 추출본 — 옛 날짜 판정
    const n = GST.EQ.norm(st);
    if(GST.EQ.GONE.some(function(x){ return GST.EQ.norm(x) === n; })) return false;
    return !(d && asOf && d > asOf);
  }
};

/* 워런티 라벨 — 「Warranty In/Out」 열 하나를 두 어휘가 쓴다 (v102 → v123 에 정본화).
   해외: `IN` / `OUT` · 국내(및 새 양식): 같은 열에 **무상 / 유상**.
   ⚠ 뜻이 뒤집혀 보이니 주의 — **무상 = 아직 보증 안(IN)** · **유상 = 보증 끝(OUT)**.
     실측으로 확인했다: `Warranty date 2026-08-28`(미래) 행이 무상, `2025-07-30`(과거)이 유상.
   ⚠ 이 판정이 두 곳에 복제돼 있었고 한 곳만 고쳐져 있었다(제2원칙 그대로) — 설치현황은
     v102 에 한글 표기를 받았는데 주간현황은 안 따라와서, 국내 자료에서 **W/I 열이 전부
     «-» 로 뜨고 W/O 가 TOTAL 과 같아졌다.** 에러는 하나도 안 난다.
   빈 칸은 '' 다 — IN 도 OUT 도 아니다(모르는 것을 아는 것처럼 세지 않는다). */
GST.WARR = function(v){
  const w = GST.upk(String(v == null ? '' : v)).replace(/\s/g, '');
  if(!w) return '';
  if(w.indexOf('OUT') >= 0) return 'OUT';
  if(w.indexOf('IN')  >= 0) return 'IN';
  if(w.indexOf('유상') >= 0) return 'OUT';   // 유상 = 고객 부담 = 보증 종료
  if(w.indexOf('무상') >= 0) return 'IN';    // 무상 = 우리 부담 = 보증 유효
  return '';
};
/* CIP 시트(F11 gid 2123129719 · F16 gid 1999732389)는 점검 '항목'이 열로 늘어난다.
   F11과 F16은 열 위치가 다르지만 머리글 이름은 같아서 스펙 하나로 둘 다 처리된다.
   헤더는 0행이 아니라 1행이다(0행은 항목별 적용일자 띠). */
/* SPEC-SYNC · CIP — kakao-bot/hr.js 의 parseCIP 과 «같은 이름 목록»이어야 한다.
   여기 이름을 더하면 그쪽도 더한다(제2원칙). t-cip 가 두 곳을 대조한다. */
GST.SM.SPEC.cip = { name:'CIP현황', hints:['Scrubber S/N','FAB In'], scan:6,
  /* 양식마다 있는 열이 다르다 — F11 에는 area·Model Type 이 없고, 옛 추출본에는
     NO·Country·Customer·FAB 이 없다. 못 찾아도 정상이므로 전부 opt 다. */
  opt:['area','mtype','no','country','customer','fab','remark'],
  fields:{
    no:'NO', country:'Country', customer:'Customer', fab:'FAB',
    floor:'Floor', area:'area', type:'Type', model:'Model', mtype:'Model Type', pjt:'PJT.',
    sn:'Scrubber S/N', code:'Scrubber Code', group:'Group', detail:'Detail', fabIn:'FAB In',
    remark:'Remark'
  }};
/* 점검 항목을 이름으로 유도한다 — 예전에는 F11 13~18 · F16 15~38 을 코드에 박아
   항목이 늘 때마다 손으로 고쳐야 했다.

   ⚠ 「FAB In 다음 ~ Remark 직전」이라는 «구간»으로 잡으면 안 된다 (v130 · 실사고).
     화면은 구글시트가 아니라 Supabase Import 표를 읽는데, 열을 추가하면 Postgres 는
     **언제나 표의 맨 뒤**에 붙인다(열 순서를 바꿀 수 없다). 그래서 시트에서는 Remark
     앞에 얌전히 붙은 새 항목이, 표에서는 Remark «뒤»로 가고 구간 밖이 된다 —
     실측: F16 신규 12항목(대상 1,363건)이 통째로 빠져 분모가 4,700→4,456 으로 줄었다.
     에러도 배너도 없이 «분모만 작아지는» 실패라 알아채기 어렵다.

   그래서 위치가 아니라 «이름»으로 가린다: FAB In 뒤의 열 중 SPEC 이 아는 이름
   (메타데이터·Remark)이 아닌 것이 항목이다. 시트든 표든, 순서가 어떻든 같은 답이 나온다.
   FAB In 을 하한으로 남겨 두는 이유는, 앞으로 «SPEC 에 없는 메타데이터»가 앞쪽에
   생겨도 항목으로 오해하지 않게 하기 위해서다. */
GST.SM.cipRange = function(headerRow){
  const H=(headerRow||[]).map(GST.SM.norm);
  const c0=H.indexOf(GST.SM.norm('FAB In'))+1;
  if(c0<=0) return null;
  const F=GST.SM.SPEC.cip.fields;
  const known={};
  Object.keys(F).forEach(function(k){
    [].concat(F[k]).forEach(function(n){ known[GST.SM.norm(n)]=1; });
  });
  const cols=[];
  for(let c=c0;c<H.length;c++){ if(H[c] && !known[H[c]]) cols.push(c); }
  if(!cols.length) return null;
  /* c0·c1 은 옛 호출부(구버전 페이지가 캐시에 남았을 때)를 위해 남긴다 — 새 코드는
     반드시 cols 를 돈다. 구간으로 돌면 위 사고가 그대로 재현된다. */
  return {c0:cols[0], c1:cols[cols.length-1], cols:cols};
};

/* ============================================================
   국내 알람 · 올바이패스 (v92)

   왜 별도 자료인가. 국내는 BM 건수를 수선실적에서 세면 정합성이 안 맞는다(사용자 확인).
   현장이 실제로 쓰는 것은 「CS 알람관리」 워크북이고, 그것을 원장으로 삼는다.

   ⚠ 한 워크북 안에서 K·P·H 세 운영단위가 «각자 다른 양식»으로 관리한다.
     같은 뜻의 열이 사이트마다 다른 이름이다 — 알람 유형 / 알람분류 / 대분류,
     외부 내부 / 내적 외적 / 구분기준. 세 벌로 파싱하면 반드시 갈라지므로(제2원칙)
     별칭 배열 하나로 흡수해 «한 스키마»로 눕힌다. 사이트별 코드를 만들지 말 것.

   ⚠ 집계 대상 판정을 새로 발명하지 말 것. 시트가 이미 자기 답을 열로 갖고 있다 —
     P는 「내적 / 제외」, H·K는 「내적/외적」·「외부 / 내부」. 그 열을 읽는다.
     그리고 H 올바이패스는 한 사건이 Seq 1·2·3 세 줄로 들어 있어(실측 각 918행),
     그냥 세면 건수가 정확히 3배가 된다. Seq=1 만 한 사건이다.
   ============================================================ */
GST.SM.SPEC.alarm = { name:'국내 알람', scan:8,
  hints:['SEQP S/N', ['Alarm Comment','ALARM COMMENT']],
  /* 거의 전부가 opt 다 — 어느 사이트에도 «전부 다 있는» 열은 S/N·알람·발생시각뿐이다.
     opt 에서 빼면 그 열이 없는 사이트의 시트가 통째로 거부된다. */
  opt:['site','line','area','bay','eqpId','proc','subproc','chamber','chpos','seqpId',
       'status','maker','model','ch','alevel','alarmName','relTime','hold','atype','ctype',
       'ctype2','inout','incl','cause','phenom','action','module','srcMonth','srcWeek',
       'srcYear','checker'],
  fields:{
    site:'Site', line:'Line', area:'Area', bay:'Bay', eqpId:['EQP ID','EQPID'],
    proc:'공정', subproc:['세부공정','소공정'],
    chamber:'Chamber ID', chpos:'Chamber Position',
    sn:'SEQP S/N', seqpId:['SEQP ID','SEQPID2'], status:'Status', maker:'Maker',
    model:'SEQP Model', ch:'SEQP CH', alevel:'Alarm Level',
    alarm:['Alarm Comment','ALARM COMMENT'], alarmName:'알람',
    occur:'Occur Time', relTime:'Release Time', hold:'Holding Time',
    // 현상 계열(무엇이 났나) — PRESSURE·FLAME·INLET P …
    atype:['알람 유형','알람분류','대분류'],
    // 원인 계열(왜 났나) — POWDER·PART·HUMAN …
    ctype:'유형1', ctype2:'유형2',
    inout:['외부 / 내부','내적/외적','구분기준'],
    incl:'내적 / 제외',
    cause:['알람 실제원인','발생 사유(서술형)'], phenom:'현상',
    action:['조치내용','조치 내용'], module:'발생 모듈',
    srcMonth:['정산월','월별'], srcWeek:'주차', srcYear:['년도','연도'],
    checker:['담당자','확인자']
  }};

/* ⚠ 이 SPEC 은 이제 «국내 + 해외» 올바이패스를 함께 눕힌다 (v133 · 사용자 제공 양식).
   해외(대만)는 지금까지 ABP 크로스탭 시트로만 셌는데, 그러면 «건수만 있고 행이 없어»
   막대를 눌러도 세부내역이 안 나온다(CLAUDE.md v125 의 그 자리). 사용자가 행 단위
   리스트를 만들어 주면서 그 통로가 열렸다.

   ⚠ «합치는 것»은 스키마뿐이다 — 규칙이 아니다(제3원칙). 국내는 시트가 「내적/외적」을,
     해외는 「담당(Responsible) = GST / External」을 적는다. 별칭 배열 한 곳에서 흡수하고
     판정은 GST.ALARM.inner 한 곳이 한다. 사이트별·구분별 코드를 만들지 말 것(제2원칙).

   ⚠ 해외 양식은 «한 사건이 두 줄»이다 — 올바이패스는 두 챔버가 모두 내려간 것이라
     Left·Right 가 각각 한 줄이고, A열 Group 번호가 같으면 한 세트다(사용자 설명).
     국내 H 의 All-ByPass Seq 1·2·3 과 같은 문제이고, 답도 같다 — 대표 줄 하나만 센다.
     그 대표를 고르는 방법은 아래 build 의 주석을 볼 것. */
GST.SM.SPEC.abp2 = { name:'올바이패스', scan:8,
  /* K 시트는 손으로 관리하는 별개 양식이라 P·H 와 공통 머리글이 하나도 없다.
     그래서 힌트도 별칭으로 준다(둘 중 하나만 있으면 통과).
     ⚠ 'Work Date' 를 빼면 해외 양식이 «헤더 행을 못 찾음»으로 통째로 거부된다. */
  hints:[['SEQP S/N','SEQP ID','S/N'], ['Occur Date','발생날짜','주차','Work Date']],
  opt:['site','line','area','eqpId','chamber','model','maker','occurT','relTime','hold',
       'alarm','seq','real','inout','incl','atype','ctype','cause','action','phenom',
       'srcMonth','srcWeek','srcYear','checker',
       /* 해외 양식에만 있는 열 — 국내 시트에는 없으므로 반드시 opt 다(v89 승격 규약).
          안 넣으면 국내 워크북이 통째로 「열을 못 찾았습니다」로 거부된다. */
       'grp','proc','subproc','ctype2','atype2','opRaw'],
  fields:{
    site:['Site','단지'], line:['Line','라인'], area:'Area',
    eqpId:['EQP ID','호기'], chamber:['Chamber ID','Chamber'],
    sn:['SEQP S/N','SEQP ID','S/N'],
    model:'SEQP Model', maker:'Maker',
    occur:['Occur Date','발생날짜','Work Date'],
    occurT:['Occur Time','정지 시작(AV)'], relTime:['Release Time','정지 종료(AW)'],
    hold:['Holding Time','By pass 유지시간','유지시간','유지시간(분, MTTR)'],
    alarm:['ALARM COMMENT','Alarm Comment','All Bypass 발생 Alarm명','Alarm/Warning Msg'],
    /* 한 사건의 여러 줄을 묶는 열. 국내 H 는 «몇 번째 줄인가»(Seq), 해외는 «어느 세트인가»
       (Group) 로 적는다 — 뜻이 달라 한 필드에 합칠 수 없다. build 가 grp → seq 로 눕힌다. */
    seq:'All-ByPass Seq', grp:'Group', real:'진성/가성',
    /* 「우리 책임인가」를 적는 열. 국내는 내적/외적, 해외는 GST/External — 낱말만 다르고
       묻는 것이 같다. 판정은 GST.ALARM.inner 한 곳(제2원칙). */
    inout:['내/외','내적/외적','발생 구분','담당(Responsible)'], incl:'발생 구분2',
    atype:['알람구분','New Fail Code'], atype2:'고장 유형(한글 분류)',
    ctype:['유형','원인 유형(코드)'], ctype2:'조치 유형(코드)',
    cause:['발생사유','All Bypass 발생사유','알람 발생 사유','실제원인','원인 (Deep rooted cause)'],
    action:['조치내용','조치 (Corrective action)'], phenom:['현상','Symptom'],
    proc:'Process', subproc:'Detail',
    /* 조직 축의 «정본»은 설치현황이다(S/N 조인 · CIP·국내 원장과 같은 규약) —
       고객사·단지는 화면 축으로 쓰지 않는다. 「고객사」는 SPEC 에 두지 않아 extra 로
       자동 보존된다(쓰지도 않을 컬럼을 표에 만들 이유가 없다).
       운영단위만 받는 이유는 하나 — 아래 build 가 op 를 그것으로 채운다. */
    opRaw:'운영단위',
    srcMonth:['정산월','발생월 삼성기준','월'], srcWeek:'주차', srcYear:['년도','연도'],
    checker:'확인자'
  }};

/* 주간현황이 국내 알람·올바이패스에서 실제로 쓰는 열.
   ⚠ checker(담당자·확인자)는 «일부러» 뺐다 — 실명이고 화면이 안 쓴다.

   ⚠⚠ **두 표는 열이 다르다 — 한 벌로 공유하면 안 된다.** 실제로 그랬고, 그래서
   `sheet_alarm` 읽기가 «column sheet_alarm.seq does not exist» 로 매번 통째로 실패했다.
   PostgREST 는 select 목록에 없는 열이 하나라도 있으면 **전체를 거부한다** — 그 열만
   비는 게 아니다. 그 실패가 KRA=[] 로 떨어지고, 원장이 «비었다»고 판정돼 국내가 조용히
   수선실적 BM 으로 계산됐다. 표에 있는 열만 요청한다:
     seq        — 올바이패스에만 (한 사건이 Seq 1·2·3 세 줄인 H 때문에 필요하다)
     alarm_name — 알람에만 (K 249행이 Alarm Comment 대신 「알람」 열에 적혀 있다)
   `tests/t-alarm.mjs` 가 setup-10-alarm.sql 의 실제 컬럼과 대조해 다시 어긋나는 것을 막는다. */
GST._KR_COLS_BASE = ['src_row','sn_key','sn','occur_date','fmonth','fweek','cnt',
                     'site','line','atype','ctype','alarm','cause','action','phenom',
                     'op','inout','incl'];
GST._KR_COLS_A = GST._KR_COLS_BASE.concat(['alarm_name']);   // sheet_alarm
/* 올바이패스에만 있는 열. grp·proc·subproc·ctype2 는 해외 양식(v133)이 들여온 것이다.
   ⚠ 표에 아직 없어도 안전하다 — GST.dbRows·csvTableRows 가 «표의 실제 컬럼과 교집합»만
     select 한다(v121). 없는 열을 요청하면 PostgREST 가 «전체»를 거부하기 때문이다. */
GST._KR_COLS_B = GST._KR_COLS_BASE.concat(
  ['seq','grp','chamber','hold','proc','subproc','ctype2','atype2']);   // sheet_allbypass
// 옛 이름 — 남은 호출자가 있어도 «둘 다에 있는 열»만 받아 안전하게 동작한다
GST._KR_COLS = GST._KR_COLS_BASE;

GST.ALARM = {
  /* 설비 S/N 조인 키. 표기가 사이트마다 다르다 — 아래 셋은 «꼴»을 보이려고 지어낸 값이다
     (저장소가 공개라 실제 번호를 예로 적지 않는다 · t-leak):
       SBW0000    하이픈을 빼고 적는 사이트가 있다
       DBW-0000S  꼬리 S = 싱글 챔버
       GBWS-0000L 꼬리 L/R = 듀얼의 좌/우 챔버
     영숫자만 남기면 하이픈 유무가 흡수돼 설치현황(GBWS-0000)과 붙는다. 그래도 안 붙으면
     채널 접미(L/R/S)를 떼고 한 번 더 본다 — 실측 조인율 99.9%(설치현황 S/N 은 15,474대 중
     두 대만 문자로 끝나 접미 제거가 남의 설비를 물 위험이 사실상 없다).
     ⚠ 접미를 떼는 것은 «어느 설비냐»를 찾을 때만이다. 건수를 셀 때 떼면 한 사건의
       좌·우 두 줄이 한 건으로 뭉친다(챔버 기준으로 세는 자리가 이 화면에 있다). */
  key: function(v){ return String(v==null?'':v).toUpperCase().replace(/[^A-Z0-9]/g,''); },
  keyBase: function(v){ return GST.ALARM.key(v).replace(/[A-Z]+$/,''); },
  /* 시트의 «정산월/주차»를 비교 가능한 꼴로 눕힌다. 표기가 넷이다:
       26년 7월 · 26_08 · 26년 02월 · 25_01   → 2026-07
       26년 25W · 21년4W · 26_32 · 26년 04주  → 2026-W25
     ⚠ 달력 월/주차로 대체하지 말 것 — 국내는 «삼성 기준 월»이 달력과 다르다
       (실측: 발생일 2022-02-18 인데 시트의 발생월은 22년 3월). 그래서 시트 값을 살린다. */
  /* ⚠ 한 열 안에서도 표기가 섞인다(실측 K 알람: 옛 행은 월별 '12' + 년도 '20년',
     새 행은 월별 '21년 1월'). 연도가 값에 없으면 년도 열을 받아 붙인다 — 안 그러면
     옛 행이 통째로 «월 미상»이 되어 추이 앞부분이 사라진다. */
  ym: function(s, yr){
    const t=String(s==null?'':s).trim(); if(!t) return '';
    let m=t.match(/(\d{2,4})\s*[년_\-.]\s*(\d{1,2})\s*월?\s*$/);
    let y, mo;
    if(m){ y=+m[1]; mo=+m[2]; }
    else {
      const only=t.match(/^(\d{1,2})\s*월?$/); if(!only) return '';
      const ym2=String(yr==null?'':yr).match(/(\d{2,4})/); if(!ym2) return '';
      y=+ym2[1]; mo=+only[1];
    }
    if(y<100) y+=2000;
    if(mo<1||mo>12) return '';
    return y+'-'+String(mo).padStart(2,'0');
  },
  yw: function(s, yr){
    const t=String(s==null?'':s).trim(); if(!t) return '';
    if(/월/.test(t)) return '';                      // 월 표기를 주차로 읽지 않는다
    let m=t.match(/(\d{2,4})\s*[년_\-.]\s*(\d{1,2})\s*(?:W|w|주)?\s*$/);
    let y, w;
    if(m){ y=+m[1]; w=+m[2]; }
    else {
      const only=t.match(/^(\d{1,2})\s*(?:W|w|주)?$/); if(!only) return '';
      const ym2=String(yr==null?'':yr).match(/(\d{2,4})/); if(!ym2) return '';
      y=+ym2[1]; w=+only[1];
    }
    if(y<100) y+=2000;
    if(w<1||w>53) return '';
    return y+'-W'+String(w).padStart(2,'0');
  },
  /* 발생일. 엑셀에서 이 칸은 «날짜형과 문자열이 섞여» 온다(실측 K 알람 7,396행 중
     날짜형은 164행뿐, 나머지는 '2020-12-21 00:15:54' 문자열). 하나만 처리하면
     한쪽이 통째로 버려진다 — 셋 다 받는다(Date · 문자열 · 엑셀 시리얼). */
  day: function(v){
    if(v==null||v==='') return '';
    if(v instanceof Date) return isNaN(v)?'':v.toISOString().slice(0,10);
    const t=String(v).trim();
    const n=Number(t);
    if(t && !isNaN(n) && n>20000 && n<80000)
      return new Date(Date.UTC(1899,11,30)+n*86400000).toISOString().slice(0,10);
    const m=t.match(/(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
    if(!m) return '';
    const y=+m[1], mo=+m[2], d=+m[3];
    if(mo<1||mo>12||d<1||d>31) return '';
    return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  },
  /* 엑셀 시리얼 → 사람이 읽는 시각. 「정지 시작(AV)」·「정지 종료(AW)」 자리에 쓴다.
     ⚠ 왜 여기냐. 이 변환은 «셀 서식»으로는 알 수 없다 — 사용자 파일의 그 칸들은
       서식이 General 이라 XLSX 가 그냥 숫자(45672.86)로 준다(실측 z:"General").
       upload 의 cellStr 은 «셀이 날짜라고 말할 때»만 날짜로 찍으므로 여기서 못 고친다.
       무엇이 시각 열인지 아는 것은 SPEC 뿐이라 판정을 여기 둔다.
     ⚠ 국내 시트는 이 칸에 문자열('2020-12-21 00:15:54')을 쓴다 — 숫자가 아니면 손대지
       않는다. 안 그러면 국내 원문이 조용히 다른 표기로 바뀐다. */
  stamp: function(v){
    const t=String(v==null?'':v).trim(); if(!t) return '';
    const n=Number(t);
    if(!t || isNaN(n) || n<=20000 || n>=80000) return t;      // day() 와 같은 시리얼 범위
    const ms=Math.round(n*86400)*1000 + Date.UTC(1899,11,30);
    const d=new Date(ms); if(isNaN(d)) return t;
    const p2=x=>String(x).padStart(2,'0');
    const ymd=d.getUTCFullYear()+'-'+p2(d.getUTCMonth()+1)+'-'+p2(d.getUTCDate());
    const hh=d.getUTCHours(), mm=d.getUTCMinutes(), ss=d.getUTCSeconds();
    return (hh||mm||ss) ? ymd+' '+p2(hh)+':'+p2(mm) : ymd;    // 자정 정각이면 날짜만 (v95 규약)
  },
  /* 집계 대상인가. 새로 발명하지 않고 «시트가 이미 적어 둔 답»을 읽는다.
       ① Seq 가 있고 1이 아니면 같은 사건의 2·3차 줄이다 → 제외 (H 올바이패스)
       ② 「내적 / 제외」·「발생 구분2」 같은 포함/제외 열이 있으면 그 답을 따른다
       ③ 그 열이 없는 사이트는 「내부·내적」만 센다 (K·H 알람)
     알람·올바이패스에 «같은» 규칙을 쓴다(사용자 확정 v92: 내부·내적만 센다).
     예전에는 올바이패스만 ③을 건너뛰어 외적 사유까지 셌는데, 두 지표가 다른 규율로
     갈리면 «Alarm 은 내적만인데 올바는 전부» 라는 설명 불가능한 표가 된다.
     판정을 바꾸려면 여기 한 곳만 고친다 — kind 는 앞으로 갈릴 때를 위해 남겨 둔다.
     ⚠ 원문(inout·incl·seq)을 전부 컬럼에 남겨 두므로, 「내/외」 필터로 화면에서
       외부까지 보는 것은 언제든 된다 — cnt 는 «기본 집계»의 답일 뿐이다. */
  // ISO 주차 — 시트에 주차 열이 없는 사이트(P 알람)의 폴백. 화면이 «주차 미상»으로 비지 않게.
  isoWeek: function(ymd){
    if(!ymd) return '';
    const d=new Date(ymd+'T00:00:00Z'); if(isNaN(d)) return '';
    const t=new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay()||7));
    const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));
    const w=Math.ceil(((t-y0)/86400000+1)/7);
    return t.getUTCFullYear()+'-W'+String(w).padStart(2,'0');
  },
  /* ⚠ 판정을 «둘»로 쪼개 둔다. 화면에서 「내/외」를 바꿔 볼 수 있어야 하는데,
     Seq 중복 제거는 «어느 모드에서도» 걸려야 하기 때문이다 — 안 걸면 「전체」를 고른
     순간 H 올바이패스가 정확히 3배로 부푼다. 둘을 한 함수에 묶어 두면 그 사고가 난다. */
  dedup: function(row){                    // 한 사건의 첫 줄인가 (H 올바 Seq 1·2·3)
    const seq=String(row&&row.seq!=null?row.seq:'').trim();
    return !seq || seq==='1';
  },
  /* 「우리 책임인가」를 적는 낱말이 자료마다 다르다 — 한 곳에서 흡수한다(제2원칙).
       국내  내부 · 내적  (P 는 「포함/제외」로 이미 답해 놨다)
       해외  GST          (사용자 확정 v133: 「GST 만 카운트, External 은 안 센다」)
     ⚠ 모르는 낱말을 «내부»로 치지 않는다. 예전에는 열이 있기만 하면 내부/내적 두 낱말만
       보고 나머지를 전부 false 로 떨어뜨렸는데, 그러면 해외 원장이 통째로 0 이 된다 —
       에러 없이. 반대로 아무거나 참으로 두면 External 이 섞여 든다. 아는 낱말만 참이다. */
  _IN_RE: /^(내부|내적|GST)$/i,
  _OUT_RE: /^(외부|외적|EXTERNAL|고객|CUSTOMER)$/i,
  inner: function(row){                    // 우리 책임 — 내부·내적·GST 인가
    const g=k=>String(row&&row[k]!=null?row[k]:'').trim();
    const incl=g('incl');
    if(incl) return incl==='포함';         // P 는 시트가 「포함/제외」로 이미 답해 놨다
    const io=g('inout');
    if(io) return GST.ALARM._IN_RE.test(io);
    return true;                            // 그 열 자체가 없는 시트는 «전부» 가 그 시트의 답이다
  },
  counts: function(row, kind){
    return GST.ALARM.dedup(row) && GST.ALARM.inner(row);
  },
  /* «내적이 아니라서 빠진» 행을 값별로 센다 (v134 · 사용자 확정).

     왜. P운영 통합 양식의 「내적/외적」 열에는 제3의 값 «자켓» 이 168건 있다
     (전부 유형1=가성 · 알람분류=JACKET). 규칙은 「내적만 센다」 하나이므로 그 168건이
     빠지는 것은 맞는데, **아무 말 없이 빠지는 것**이 문제다 — 시트는 4,532건인데
     화면은 2,398건이라, 나중에 「내 자료가 안 나온다」로 돌아온다(v92 의 교훈).

     ⚠ 낱말을 판정에 박지 않는다. 여기서 하는 일은 «세어서 보여주는 것»뿐이라,
       시트에 새 낱말이 생겨도 저절로 목록에 뜬다.
     ⚠ dedup 에 걸린 줄(한 사건의 2·3번째 줄)은 «빠진 것»이 아니다 — 같은 사건을
       두 번 세지 않으려고 접은 것이므로 이 목록에 넣으면 사람을 헷갈리게 한다. */
  dropReasons: function(rows){
    const m = new Map();
    (rows || []).forEach(function(x){
      if(!GST.ALARM.dedup(x)) return;
      if(GST.ALARM.inner(x)) return;
      const g = function(k){ return String(x && x[k] != null ? x[k] : '').trim(); };
      const v = g('incl') || g('inout') || '(공란)';
      m.set(v, (m.get(v) || 0) + 1);
    });
    return Array.from(m.entries()).map(function(e){ return {v:e[0], n:e[1]}; })
           .sort(function(a, b){ return b.n - a.n; });
  },

  /* 계산 칸 — 원장 한 행(DB 열 이름 · snake)에서 sn_key·occur_date·fmonth·fweek·cnt 를 낸다 (v143).
     업로드(build)와 데이터 관리(/edit/)가 «같은 함수»를 쓴다 — 사람이 S/N·발생시각·내/외를 고치면 대시보드가 실제로
     세는 칸(occur_date·sn_key·fmonth·fweek)이 따라와야 한다. 화면에서 따로 계산하면 업로드와 다른 규칙이 된다(제2원칙).
       day0  — 이미 구한 발생일(build 는 «스탬프 전» 원문으로 구한다). 안 주면 occur → occur_t 순으로 다시 구한다.
     ⚠ seq(해외 Group → seq)는 여기서 안 다룬다 — 한 줄만 보고는 정할 수 없는 칸이다(그 사건의 다른 줄을 봐야 한다).
       그래서 데이터 관리는 Group 이 있는 줄의 seq·grp·내/외를 잠근다. */
  derive: function(o, kind, day0){
    const g=function(k){ return String(o&&o[k]!=null?o[k]:'').trim(); };
    const day=day0!==undefined ? day0 : (GST.ALARM.day(g('occur'))||GST.ALARM.day(g('occur_t')));
    return {
      sn_key: GST.ALARM.key(g('sn'))||null,
      occur_date: day||null,
      // 시트의 «정산월·주차»를 우선 쓴다(국내는 삼성 기준 월이 달력과 다르다). 없으면 달력.
      fmonth: GST.ALARM.ym(g('src_month'), g('src_year')) || (day?day.slice(0,7):null),
      fweek:  GST.ALARM.yw(g('src_week'),  g('src_year')) || (day?GST.ALARM.isoWeek(day):null),
      cnt: GST.ALARM.counts({seq:g('seq'), incl:g('incl'), inout:g('inout')}, kind)
    };
  },
  /* 원장 행의 구분 — op 는 업로드가 붙인 «시트 표지»다(아래 build: K·P·H 워크북 = tag+'운영' · 해외 리스트 = 시트의 운영단위).
     그래서 K·P·H운영은 국내 워크북에서 온 행이고, 그 밖은 GST.ORG.region 이 운영단위로 가른다(v143 · 데이터 관리의 구분 칸).
     ⚠ 대시보드의 «조직 축»은 여전히 S/N → 설치현황 조인이다(krJoin) — 이것은 «어느 원장에서 왔나»를 묻는 칸이다. */
  region: function(op){
    const t=String(op==null?'':op).trim();
    if(/^[KPH]운영$/.test(t)) return GST.ORG.REGION_KR;
    return GST.ORG.region(t);
  },

  /* 시트 한 장 → DB 행. 업로드 화면과 검증 스크립트가 «같은 함수»를 쓴다 —
     화면에만 두면 테스트가 흉내를 내게 되고, 흉내는 반드시 본체와 갈라진다
     (t-upload 가 그 이유로 실제 페이지를 띄워 대조하고 있다).
     tag = 'K'|'P'|'H' (어느 운영단위 시트인가) · kind = 'alarm'|'abp2' */
  build: function(rows, kind, tag, spec){
    /* spec — 사이트별 열 맵핑 지정이 얹힌 스펙(v150 · 업로드의 cmapSpec). 안 주면 정본 그대로다.
       ⚠ 판정 규칙은 그대로 한 벌이다 — 지정은 별칭 배열 «맨 앞»에 얹힌 이름일 뿐이다. */
    const S=spec||GST.SM.SPEC[kind==='abp2'?'abp2':'alarm'];
    const m=GST.SM.map(rows, S);
    if(m.hi<0) return {err:'헤더 행을 찾지 못했습니다 (힌트: '+(S.hints||[]).join(' + ')+')'};
    if(m.miss.length) return {err:'열을 못 찾았습니다: '+m.miss.join(', ')};
    const keys=Object.keys(S.fields), C=m.C;
    const header=(rows[m.hi]||[]).map(function(x){ return String(x==null?'':x); });
    const mapped={}; keys.forEach(function(k){ if(C[k]>=0) mapped[C[k]]=1; });
    /* SPEC 에 없는 열은 버리지 않고 extra 로 담는다 — 사이트마다 자기만 쓰는 열이 있고
       (K 의 발생 모듈, H 의 추적완료여부 …), 버리면 «올린 줄 알았는데 없는» 상태가 된다. */
    const extraCols=[];
    header.forEach(function(h,i){ if(!mapped[i] && h.trim()!=='') extraCols.push({i:i,h:h.trim()}); });
    const out=[]; let skipped=0;
    for(let i=m.hi+1;i<rows.length;i++){
      const r=rows[i]||[];
      let any=false;
      for(let j=0;j<r.length;j++){ if(String(r[j]==null?'':r[j]).trim()!==''){ any=true; break; } }
      if(!any) continue;
      const v={};
      keys.forEach(function(k){ v[k]=C[k]>=0?String(r[C[k]]==null?'':r[C[k]]).trim():''; });
      const day=GST.ALARM.day(v.occur)||GST.ALARM.day(v.occurT);
      /* 설비도 날짜도 없는 줄은 자료가 아니다 — 이 시트들에는 합계·메모 줄이 섞여 있고
         (K 올바이패스 오른쪽에는 피벗표까지 붙어 있다) 그대로 넣으면 건수가 부풀어 오른다.
         조용히 버리지 않고 몇 줄을 건너뛰었는지 화면에 돌려준다. */
      if(!v.sn && !day){ skipped++; continue; }
      const o={};
      /* 시각 열은 «사람이 읽는 꼴»로 눕혀 담는다 — 시리얼 그대로 두면 화면에
         45672.86 이 찍힌다. 숫자가 아니면 그대로다(국내 문자열 보존). */
      ['occur','occurT','relTime'].forEach(function(k){ v[k]=GST.ALARM.stamp(v[k]); });
      /* 유지시간(MTTR)은 엑셀 부동소수 찌꺼기를 달고 온다(실측 165.9999999963분).
         숫자로 읽히는 값만 소수 첫째자리로 정리한다 — 국내의 '3시간' 같은 문자열은 그대로. */
      if(v.hold!=='' && !isNaN(Number(v.hold))) v.hold=String(Math.round(Number(v.hold)*10)/10);
      keys.forEach(function(k){ o[GST._snake(k)] = v[k]===''?null:v[k]; });
      o.src_sheet=tag;
      /* op — 화면의 조직 축은 어차피 설비 S/N 조인으로 얻는다(krJoin). 그런데 이 값에는
         다른 일이 하나 더 걸려 있다: 구간 교체(csv_window)가 «어느 행을 갈아끼울지»를
         날짜 × op 로 정한다. 그래서 이미 표에 든 행과 «같은 규칙»으로 만들어야 한다 —
         규칙이 바뀌면 옛 행이 안 지워지고 새 행이 얹혀 표가 조용히 두 배가 된다(v109 의 자리).
           K·P·H (국내 워크북)  지금까지대로 tag+'운영' — 손대지 않는다
           그 밖 (해외 리스트)   시트가 운영단위를 직접 적어 준다 → 그 값
         두 계통이 서로 다른 op 를 쓰므로, 해외 파일을 구간 교체로 올려도 국내 행은
         한 줄도 안 지워진다. 한 표에 두 계통을 담을 수 있는 이유가 이것이다. */
      o.op=/^[KPH]$/.test(String(tag||'')) ? (tag+'운영')
         : ((v.opRaw||'').trim() || (tag+'운영'));
      delete o.op_raw;                          // op 가 이미 그 값이다 — 컬럼을 둘 만들지 않는다
      /* 계산 칸(sn_key·occur_date·fmonth·fweek·cnt)은 derive 한 곳에서 — 데이터 관리(/edit/)가 한 칸을 고칠 때도
         «같은 함수»로 다시 계산한다(v143). 두 벌이면 고친 행만 다른 규칙으로 계산돼 대시보드가 조용히 갈린다.
         ⚠ 발생일은 «스탬프 전» 원문으로 이미 구해 둔 값을 넘긴다(위 skip 판정과 같은 값 — 출력이 한 글자도 안 바뀐다). */
      Object.assign(o, GST.ALARM.derive(o, kind, day));
      o._v=v;                                   // 아래 Group 눕히기에서만 쓰고 지운다
      const ex={};
      extraCols.forEach(function(x){ const t=String(r[x.i]==null?'':r[x.i]).trim(); if(t) ex[x.h]=t; });
      o.extra=Object.keys(ex).length?ex:null;
      out.push(o);
    }
    /* ── Group → seq (v133 · 해외 올바이패스) ──────────────────────────────
       올바이패스는 «두 챔버가 모두 내려간 것»이라 한 사건이 Left·Right 두 줄이고,
       A열 Group 번호가 같으면 한 세트다(사용자 설명). 그냥 세면 건수가 정확히 두 배다 —
       국내 H 의 All-ByPass Seq 1·2·3 과 «같은 문제»이므로 답도 같게 둔다:
       한 사건의 대표 줄에만 seq='1' 을 주고, dedup 은 지금 쓰던 그 함수를 그대로 쓴다.
       판정 함수를 새로 만들지 않는다(제2원칙).

       ⚠ 시트가 Seq 를 직접 적어 주면(국내 H) 손대지 않는다. 국내 숫자가 한 자리라도
         움직이면 그것은 사고다(제3원칙).

       ⚠ 대표 줄은 «파일 순서의 첫 줄»이 아니라 «GST 책임인 첫 줄»이다. 실측 25세트 중
         2세트가 한쪽 챔버 External · 다른 쪽 GST 인데, 파일 순서로 대표를 고르면 어느
         줄이 먼저 적혔느냐에 따라 그 사건이 세어지기도 하고 안 세어지기도 한다 —
         파일 순서는 자료가 아니다. GST 줄이 하나라도 있으면 그 사건은 GST 책임이 있다.
         (전부 External 인 사건은 대표도 External 이라 cnt=false 로 떨어진다.) */
    if(C.grp>=0 && C.seq<0){
      const first={}, firstIn={};
      out.forEach(function(o,i){ const g=String(o.grp==null?'':o.grp).trim(); if(!g)return;
        if(first[g]==null) first[g]=i;
        if(firstIn[g]==null && GST.ALARM.inner(o._v)) firstIn[g]=i; });
      const rep={};
      Object.keys(first).forEach(function(g){ rep[firstIn[g]!=null?firstIn[g]:first[g]]=1; });
      const nth={};
      out.forEach(function(o,i){ const g=String(o.grp==null?'':o.grp).trim();
        if(!g){ o.seq=null; return; }                 // 그룹이 없는 줄은 그 자체로 한 사건이다
        if(rep[i]){ o.seq='1'; return; }
        nth[g]=(nth[g]||1)+1; o.seq=String(nth[g]); });
      /* seq 가 바뀌었으니 집계 대상 판정도 다시 한다 — 판정 «함수»는 그대로 쓴다. */
      out.forEach(function(o){
        o.cnt=GST.ALARM.counts(Object.assign({}, o._v, {seq:o.seq||''}), kind); });
    }
    out.forEach(function(o){ delete o._v; });
    return {rows:out, skipped:skipped, hi:m.hi, extra:extraCols.length,
            found:keys.filter(function(k){return C[k]>=0;}).length, total:keys.length};
  }
};

/* ---------- 값 정규화 — 같은 것이 여러 표기로 갈라지면 집계가 거짓말을 한다 ----------
   실측: 모델명이 GAIA-I-D(21,020) / GAIA-I_D(3,081) / GAIA_I_D(373) 세 조각으로 나뉘어 있었다.
   이대로 모델축으로 묶으면 1위가 셋으로 쪼개져 순위 자체가 틀린다.
   시트를 고치는 게 근본이지만, 고치기 전에도 고친 뒤에도 같은 답이 나오도록 읽는 쪽에서 흡수한다. */
GST.canon = {
  // 구분자만 다른 표기를 하나로: GAIA_I_D · GAIA-I-D · GAIA I D → GAIA-I-D
  model: function(s){
    const t = GST.upk(s).replace(/[\s_]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
    return t || '';
  },
  // 공정 약칭·변형 통일: DIFF→DIFFUSION · WET PROCESS→WET
  proc: function(s){
    const t = GST.upk(s).trim();
    if(!t) return '';
    if(/^DIFF$/.test(t)) return 'DIFFUSION';
    if(/^WET\s*PROCESS$/.test(t)) return 'WET';
    return t;
  },
  /* 설비호기: 값이 아닌 것(빈칸·NA·하이픈)만 버린다.
     한때 '너무 짧으면 버린다'며 4자 미만을 잘랐는데, 실측해 보니 2VR·4AC·W6S 같은
     3자리 호기가 114종 1,034행 있었고 전부 GBWS-0000처럼 멀쩡한 S/N을 달고 있었다.
     길이로 자르면 그 설비들이 Best/Worst·주기·설비축에서 통째로 사라진다 —
     화면에는 아무 표시도 없이. 쓰레기는 이름으로 거르고, 짧다는 이유로 버리지 않는다. */
  eq: function(s){
    const t = GST.upk(s).trim();
    if(!t || t.length < 2) return '';
    return /^(NA|N\/A|NONE|NULL|-+|\.+)$/.test(t) ? '' : t;
  }
};

/* ---------- 조직 3계층 — Customer · FAB · Floor ------------------------------
   SPEC-SYNC: 정본은 여기다. kakao-bot/hr.js에 같은 규약이 복제돼 있다(런타임이 갈라
   파일 공유가 안 된다). 고치면 거기도 같이 고치고 tests/t-sync.mjs를 돌릴 것.

   왜 만들었나. 여섯 페이지가 각자 '고객사'와 '라인'을 해석하다 두 차원이 한 축에 섞였다.
   report의 lineKeyOf는 `fab + ' ' + customer`를 한 문자열로 합쳐 7키로 뭉갰고,
   그 바람에 Micron의 F16N(Tongluo)이 PSMC·TASC와 동급 형제로 렌더됐다.
   실측: 설치현황에 Customer=MICRON · Location=TONGLUO · FAB=F16N 58건, 예외 0건.
   Tongluo는 별도 고객사가 아니라 Micron의 **별도 FAB**이다.

   계층은 이렇게 고정한다:
     Customer  고객사 법인      MICRON · PSMC · TASC · WINBOND
     FAB       공장             F16 · F11 · F16N · F16S · F15 · F10
     Floor     그 안의 동·층    'A3 M2 4F' · 'B 2F' — 화면 표기는 'Line'
   실적 시트(수선·자재)에는 Floor 열이 없다. 설치현황을 S/N으로 조인해야 얻는다(instIndex).
   ------------------------------------------------------------------------- */
GST.ORG = {
  /* ---------- 국내 / 해외 (v88) ----------
     2026-08 에 국내(삼성·SK) 실적이 들어오면서 «전부 대만»이라는 전제가 깨졌다.
     판정 근거가 자료마다 다르므로 여기 한 곳에 모은다 — 페이지마다 새로 짜면 갈라진다.

       실적(수선·자재)  운영단위: 'SEC Scrubber'·'SDC Scrubber' = 국내 / 'GST XXX' = 해외
       설치현황         Country: 'KOREA' = 국내 / 'GST XXX' = 해외
                        ⚠ 이 열에는 국가가 아니라 사업부명이 섞여 들어온다(실측) —
                          그래서 국가로 쓰려면 아래 country() 로 한 번 걸러야 한다.
       인원현황         중문명·Dept.·사번 — 아래 emp() 참조

     반환값은 '국내' / '해외' / ''(모름). 빈 문자열을 국내로 치지 않는다 —
     모르는 것을 아는 척하면 합계가 조용히 틀어진다. */
  REGION_KR: '국내', REGION_OS: '해외',
  /* 국내 어휘 한 벌. region() 과 country() 가 **같은 목록**을 봐야 한다 —
     예전에는 region 만 `^SK`·화성·평택·기흥·탕정·천안을 알고 country 는 몰랐다. 그래서
     같은 값이 «구분=국내» 인데 «국가=미상» 으로 갈렸고, 국가를 세는 카드에서 SK·삼성
     설비가 통째로 「국가 미상」으로 떨어졌다(제2원칙 그대로의 자리 — 한쪽만 고치면 갈라진다).
     ⚠ /g 를 붙이지 말 것. 공유 정규식에 g 를 붙이면 test() 가 lastIndex 를 들고 다녀
       한 번 걸러 한 번씩 false 를 낸다 — 값의 절반이 조용히 미상이 된다. */
  _KR: /^SEC|^PSEC|^KSEC|^SDC|^SK\b|KOREA|한국|국내|이천|청주|화성|평택|기흥|탕정|천안/,

  region: function(s){
    const u = GST.upk(s || '');
    if(!u.trim()) return '';
    /* '국내' 를 빼먹으면 안 된다 — 실측 운영단위에 '국내기타 SCRUBBER' 가 있다.
       반대편 '해외 기타 SCRUBBER' 는 «해외» 글자로 잡히는데 국내만 안 잡혀,
       그 행이 «구분 미상»이 되어 국내 필터에서 조용히 빠졌다. 두 어휘를 대칭으로 둔다. */
    /* 인원현황 새 양식의 「지역」·「고객사」 어휘. 국내 사업장은 도시명으로 들어온다. */
    if(GST.ORG._KR.test(u)) return '국내';
    if(/TAICHUNG|LINKOU|TAINAN|TONGLUO|HSINCHU|SINCHU|KAOHSIUNG/.test(u)) return '해외';
    if(/^GST|해외/.test(u)) return '해외';
    /* 사업부명이 아니라 «국가»가 그대로 들어오는 자료가 있다(옛 설치현황 Country = 'TAIWAN').
       국가를 알면 구분도 아는 것이므로 여기서 되돌린다 — 이 줄이 없으면 그런 행이 전부
       «구분 미상»으로 떨어져, 해외를 걸었는데 설비가 하나도 안 나오는 상태가 된다. */
    const c = GST.ORG.country(u);
    if(c) return c === 'KOREA' ? '국내' : '해외';
    return '';
  },
  /* 인원현황 행 → 국내/해외. 실측(421명, 예외 0): 대만 인원은 중문명·Dept. 가 있고
     사번이 민국력(10x·11x), 국내 인원은 셋 다 반대(사번 서기 20xx)다.
     한 신호만 쓰면 그 열이 비는 날 통째로 틀리므로 **다수결**로 본다. */
  emp: function(o){
    o = o || {};
    let kr = 0, os = 0;
    const cn = String(o.cn || '').trim(), dept = String(o.dept || '').trim();
    const id = String(o.id || '').trim();
    if(cn) os++; else kr++;
    if(dept) os++; else kr++;
    if(/^20/.test(id)) kr++; else if(/^1[0-9]/.test(id)) os++;
    // 근무지가 대만 사이트 어휘면 그것이 가장 직접적인 증거다
    if(/F1[0156]|PSMC|POWERCHIP|WINBOND|TSMC|TASC|TONGL|TAINAN|TAICHUNG/.test(GST.upk(o.wp||''))) os += 2;
    return os > kr ? '해외' : (kr > os ? '국내' : '');
  },
  /* 단지 — 자료마다 채워진 층위가 다르다. 사용자 확정(2026-08): «대만은 단지 구분이 없다».
     실측이 그것을 뒷받침한다 — 대만 실적은 16,000행 전부 단지가 '기타'이고, 설치는
     도시명(TAICHUNG·LINKOU·TONGLUO)이 들어 있어 두 자료가 서로 안 맞물렸다.
     그 상태로 단지를 고르면 «설비는 나오는데 작업 실적이 0» 이 된다.
     → 대만은 단지 자리에 라인을 넣는다(F16 의 단지는 F16). 두 자료가 같은 값이 된다.
     ctx 는 국가를 알 수 있는 값이면 무엇이든 된다(운영단위·Country·FAB). */
  /* «이 값은 단지 이름이 아니라 «모른다»는 뜻이다» — 그것만 걸러낸다 (v124).
     ⚠ 예전에는 여기서 GST.FILT_DROP_ORG 를 썼다. 그 목록은 «사이드바 목록을 정리하려고»
       만든 것이라 OFFICE·통합·Repair Center·라인장 같은 **실재하는 조직명**이 들어 있다.
       그걸 값 판정에 쓰는 바람에 인원현황의 단지가 통째로 지워졌다 — 실측 통합 69명 ·
       OFFICE 48명 · Repair Center 16명, 합 133명(전체의 26%)이 «미배치»로 떨어졌고
       단지 목록에서도 사라졌다. 사용자가 「단지·라인 목록이 좀 비네」라고 한 자리다.
     v98 규약 그대로다 — 조직 축은 추론하지 않는다. 시트에 적힌 값을 코드가 «단지답지
     않다»는 이유로 지우면 안 된다. 지우는 것은 «모른다»는 낱말뿐이다. */
  _NOCAMP: /^(기타|미정|미상|해당없음|없음|N\/A|-)$/i,
  /* 반도체연구소 — 「반도체연구소는 별도로 분리 (H1,H2,H3,H4,반도체연구소)」
     (2026-09 CS관리팀 회신 · 사용자 확정).
     ⚠ 이것은 «낱말을 코드에 박는» 일이다. 실측 표기가 다섯 가지라(P운영 알람 시트:
       NRD(P3F) 82 · NRD-P 42 · P3-3RND 22 · P4-3RND 6 · P3ANRD·P3CNRD 3 = 155건)
       목록으로는 못 잡고 «NRD 또는 RND 를 품었는가»로 본다.
     ⚠ 그래서 «잡힌 값»을 화면이 밝힌다(GST.ORG.rndScan). 시트에 새 표기가 생기면
       사람이 그것을 보고 알려 줄 수 있어야 한다 — GST.PM.matched() 와 같은 규약이다.
     ⚠ 해외에는 안 건다. 대만 분기는 아래에서 먼저 돌아 여기까지 오지 않는다(제3원칙). */
  RND: '반도체연구소',
  _RND_RE: /NRD|RND/i,
  rndHit: function(v){ return GST.ORG._RND_RE.test(String(v == null ? '' : v)); },
  /* 어떤 낱말이 연구소로 잡혔나 — 화면 주석용. 순수 함수라 렌더마다 다시 세도 안전하다. */
  rndScan: function(vals){
    const m = new Map();
    (vals || []).forEach(function(v){
      const s = String(v == null ? '' : v).trim();
      if(s && GST.ORG.rndHit(s)) m.set(s, (m.get(s) || 0) + 1);
    });
    return Array.from(m.entries()).map(function(e){ return {v:e[0], n:e[1]}; })
           .sort(function(a, b){ return b.n - a.n; });
  },
  /* line2 = 국내 라인(설치현황 Line 2). 안 주면 line 만 본다 — 옛 호출부 보호. */
  campus: function(campus, line, ctx, line2){
    const ln = String(line == null ? '' : line).trim();
    const c  = String(campus == null ? '' : campus).trim();
    const bad = c && GST.ORG._NOCAMP.test(c);
    if(GST.ORG.country(ctx || '') === 'TAIWAN'){
      /* 대만의 단지 어휘는 F16·F11·F16N·PSMC 다(사용자가 인원현황을 그렇게 맞췄다).
         세 자료가 채워 넣은 것이 서로 다르다:
           인원현황  단지=F16      → 그대로 쓴다
           실적      단지='기타'   → 비어 있는 것과 같다 → 라인(F16)으로 대체
           설치현황  Location=TAICHUNG → 그건 «지역»이지 단지가 아니다 → FAB(F16)으로 대체
         도시명을 단지로 쓰면 인원·실적과 안 맞물려 «설비는 있는데 실적이 0» 이 된다. */
      if(c && !bad && !/TAICHUNG|LINKOU|TAINAN|TONGLUO|HSINCHU|SINCHU|KAOHSIUNG|台/i.test(c)) return c;
      return ln;
    }
    /* 연구소 판정은 «단지 이름»보다 앞선다 — 시트의 단지 칸이 P3·P4 로 적혀 있어도
       그 라인이 연구소면 연구소다(사용자 확정). 단지 칸이 이미 연구소면 아래에서
       그대로 살아 나가므로 여기서 한 번만 본다. */
    if(GST.ORG.rndHit(ln) || GST.ORG.rndHit(line2) || GST.ORG.rndHit(c)) return GST.ORG.RND;
    /* 「기타」처럼 «모른다»는 낱말만 미상으로 돌린다(실측 설치현황 Site=기타 28대).
       조직명(OFFICE·통합·Repair Center…)은 시트가 적어 둔 «그 단지»이므로 그대로 쓴다. */
    if(!c || bad) return '';
    return c;
  },

  /* 값 → 국가. 설치현황 Country 열에 'GST HEFEI SCRUBBER' 같은 사업부명이 섞여 들어와
     («국가» 축에 사업부명이 뜬다) 여기서 국가로 되돌린다. 모르면 ''. */
  country: function(s){
    const u = GST.upk(s || '');
    if(!u.trim()) return '';
    if(GST.ORG._KR.test(u)) return 'KOREA';   // region() 과 같은 목록을 본다 (_KR 주석)
    if(/TAIWAN|대만|TONGL|TAINAN|TAICHUNG|PSMC|POWERCHIP|WINBOND|TASC/.test(u)) return 'TAIWAN';
    if(/CHINA|WUHAN|HEFEI|XIAN|WUXI|중국/.test(u)) return 'CHINA';
    if(/AMERICA|USA|AUSTIN|미국/.test(u)) return 'USA';
    if(/JAPAN|일본/.test(u)) return 'JAPAN';
    if(/SINGAPORE|싱가포르/.test(u)) return 'SINGAPORE';
    /* FAB 코드도 국가를 가리킨다 — 인원현황 Work Place 는 'F16'·'F11' 처럼 FAB 만 적혀 있어
       법인명이 없다. 이 줄이 없으면 대만 인원이 «국가 미상»으로 떨어진다(실측 101명 중 6명만 잡혔다).
       F10=싱가포르 · F15=일본은 GST.ORG.fab 주석과 같은 대응이다. */
    if(/F1[016]N?S?/.test(u)){
      if(/F10/.test(u)) return 'SINGAPORE';
      if(/F15/.test(u)) return 'JAPAN';
      return 'TAIWAN';
    }
    if(/F15/.test(u)) return 'JAPAN';
    if(/EUROPE|유럽/.test(u)) return 'EUROPE';
    return '';
  },

  /* 법인명 → 고객사. 수선·자재 시트의 고객사 열은 법인명 안에 FAB이 박혀 있다
     ('Micron Memory Taiwan Co., Ltd.(F16)'). Micron은 대만 F16·대만 F11·일본·싱가포르
     네 법인으로 흩어져 있으나 전부 한 고객사다. */
  /* 법인격·구두점을 걷어낸 회사 이름. 브랜드가 여러 법인으로 흩어진 것만 규칙으로 모은다.
     ⚠ 예전 폴백은 «첫 단어»를 잘랐다. 대만 4개사만 있을 때는 안 드러났는데 고객사가 50개를
       넘자 그대로 튀어나왔다 — 실측: '주식회사 X' 꼴 네 회사가 전부 `주식회사` 한 칸에
       뭉쳤고(서로 다른 고객사가 합쳐지는 것이 가장 나쁜 실패다), 'Global Foundries' 는
       `GLOBAL`, 'Semiconductor Global Solutions' 는 `SEMICONDUCTOR` 가 됐다.
       그래서 첫 단어가 아니라 «걷어낸 이름 전체»를 쓴다. 길어도 갈라지지 않는 편이 낫다. */
  _CUST_KR: /\(주\)|（주）|주식회사|유한회사|株式会社|有限公司|股份有限公司/g,
  _CUST_EN: /\b(CO|LTD|INC|CORP|CORPORATION|COMPANY|LIMITED|GMBH|PTE|PTY|PLC)\b\.?/g,
  customer: function(s){
    const u = GST.upk(s || '');
    if(!u.trim()) return '';
    /* 자사(GST) 법인은 고객사가 아니다 — 설치현황 Customer 열에 'GST CHINA Co., LTD' 가
       1건 섞여 들어와 고객사 목록에 떴다. 고르면 실적·인원이 하나도 없어 «전부 0» 이 된다.
       미상으로 떨어뜨려 목록에서 뺀다(행은 남는다). */
    if(/^GST\b/.test(u.trim())) return '';
    if(/PSMC|POWERCHIP/.test(u)) return 'PSMC';
    if(/TASC|TAIWAN-ASIA|ASIA\s*SEMI/.test(u)) return 'TASC';
    if(/WINBOND/.test(u)) return 'WINBOND';
    if(/MICRON/.test(u)) return 'MICRON';
    if(/TSMC/.test(u)) return 'TSMC';
    /* 한 회사가 한글·영문 두 이름으로 들어온다 — 합치지 않으면 사이드바에 같은 회사가
       두 번 뜨고(실측 삼성 6,315+1,205 · 하이닉스 336+258) 필터를 걸면 절반만 잡힌다.
       디스플레이를 먼저 본다 — '삼성디스플레이' 는 아래 삼성 규칙에도 걸리기 때문이다. */
    /* 인원현황 새 양식은 고객사를 약어로 쓴다 — SEC·PSEC·KSEC 는 지역이 다를 뿐
       전부 삼성전자다(실측: 화성 155 · 평택 100 · 기흥 98). 지역은 단지 축으로 간다.
       ^ 를 붙여 다른 낱말 안에 든 SEC(예: SECOND)를 잡지 않게 한다. */
    if(/^SDC\b|삼성디스플레이|SAMSUNG\s*DISPLAY/.test(u)) return 'SAMSUNG DISPLAY';
    if(/^(P|K)?SEC\b/.test(u)) return 'SAMSUNG';
    if(/^SK\b/.test(u)) return 'SK HYNIX';
    if(/삼성|SAMSUNG/.test(u)) return 'SAMSUNG';
    if(/하이닉스|HYNIX/.test(u)) return 'SK HYNIX';
    /* 한 브랜드가 도시·법인별로 갈라져 들어오는 것들. Customer 축은 «브랜드»이고
       도시는 Location(하위 계층)이므로 여기서 모은다 — Micron 이 F16·F11·일본·싱가포르를
       한 고객사로 묶는 것과 같은 논리다. 실측(설치현황): 长鑫 계열 3종 1,601대 ·
       天马 계열 3종 100대 · CSOT 2종 142대로 갈라져 있었다.
       ⚠ 도시 이름을 자동으로 잘라 합치지 않는다 — 브랜드가 도시명인 회사를 지워버린다.
         «가르는 것이 기본, 합치는 것만 규칙»이다. 모르는 고객사는 이름 전체를 그대로 쓴다. */
    if(/CHANGXIN|长鑫|長鑫/.test(u)) return 'CHANGXIN';
    if(/TIANMA|天马|天馬/.test(u)) return 'TIANMA';
    if(/CSOT/.test(u)) return 'CSOT';
    // FAB 표기만 있고 법인명이 없는 행 — F1x대는 Micron 사이트다
    if(/(^|[^A-Z])F1[0156]/.test(u)) return 'MICRON';
    const t = u.replace(GST.ORG._CUST_KR,' ').replace(GST.ORG._CUST_EN,' ')
               .replace(/[.,()·]/g,' ').replace(/\s+/g,' ').trim();
    return t || u.trim();
  },

  /* 값 → FAB. 실적 시트는 '라인' 열, 설치·CIP는 'FAB' 열에서 온다.
     ⚠ 단어경계(\b)를 쓰지 않는다. 예전 `\bF10\b`가 'F10A'에서 A가 word char라 매치에
     실패해, 싱가포르 F10A/N/X와 일본 F15_E/F/B 합계 4,027건(자재의 13.6%)이
     빈 키로 떨어져 필터에서 통째로 사라졌다. 접두 매칭으로 바꿔 그 구멍을 막는다. */
  fab: function(s){
    const u = GST.upk(s || '').replace(/\s+/g, '');
    if(!u) return '';
    if(/TONGL/.test(u)) return 'F16N';      // Tong luo(통뤄) = F16N
    if(/TAINAN/.test(u)) return 'F16S';     // Tainan(타이난) = F16S
    const m = u.match(/F(16N|16S|16|15|11|10)/);
    return m ? 'F' + m[1] : '';
  },

  /* 하위 표기까지 살린 FAB — F10A · F15_E처럼 같은 FAB 안의 갈래를 구분해야 할 때.
     fab()이 'F15'로 뭉개는 것을 여기서는 'F15_E'로 남긴다. */
  fabFull: function(s){
    const u = GST.upk(s || '').replace(/\s+/g, '');
    if(!u) return '';
    const m = u.match(/F(?:16N|16S|16|15|11|10)[A-Z_0-9]*/);
    return m ? m[0] : GST.ORG.fab(u);
  },

  // 'MICRON F16' — 고객사와 FAB을 한 줄로 보일 때. hr의 SITE_ORDER와 같은 표기다.
  label: function(cust, fab){
    const c = GST.ORG.customer(cust), f = GST.ORG.fab(fab || cust);
    if(c && f && c === 'MICRON') return c + ' ' + f;   // Micron만 FAB이 여럿이다
    return c || f || '';
  },

  /* 고객사 «원문 정리» — customer() 가 브랜드로 접기 전의 이름(옛 report·hr 의 normCust · v135 에 core 로).
     『Micron Memory Taiwan Co., Ltd.(F16)』 → 'MICRON F16' 처럼 괄호·FAB 꼬리를 살린다.
     customer() 가 빈 값을 낼 때(자사 GST 행 등)의 폴백과 원문 표기용이다 — 축 판정에는 쓰지 않는다. */
  custRaw: function(name){
    if(!name) return '';
    const up = GST.upk(name).trim();
    if(!up) return '';
    let base = '';
    if(up.includes('MICRON')) base = 'MICRON';
    else if(up.includes('TAIWAN-ASIA') || up.includes('ASIA SEMICON')) base = 'TASC';
    else if(up.includes('POWERCHIP')) base = 'POWERCHIP';
    else if(up.includes('WINBOND')) base = 'WINBOND';
    else if(up.includes('TSMC')) base = 'TSMC';
    else if(up.includes('SAMSUNG')) base = 'SAMSUNG';
    else if(up.includes('HYNIX')) base = 'SK HYNIX';
    else base = up.split(/[\s,\.(]/)[0];
    const m = up.match(/\(([A-Z0-9\-]+)\)/) || up.match(/\b(F\d{1,2}N?)\b/);
    return m ? base + ' ' + m[1] : base;
  },

  /* 사이트 키 (v135) — 인원현황 근무지·휴가 소속·교육 Site 를 한 어휘로. 옛 report·hr 의 siteKey 사본 둘을
     여기로 모았다. 둘은 PSMC 를 'POWERCHIP' 이라 적어 고객사 축(customer)의 'PSMC' 와 «같은 회사가 다른
     이름»이었고, FAB 판정을 includes('F16')·\bF10\b 로 각자 해서 F15·F10A 를 놓쳤다(core 가 4,027건으로
     고친 자리를 hr 이 되돌린 판이었다) — fab() 하나로 본다. */
  site: function(s){
    const u = GST.upk(s || '').trim();
    if(!u) return '';
    const f = GST.ORG.fab(u);
    if(f) return 'MICRON ' + f;                          // Micron 만 FAB 이 여럿이다 — 사이트 = 고객사 + FAB
    if(/PSMC|POWERCHIP/.test(u)) return 'PSMC';
    if(/WINBOND/.test(u)) return 'WINBOND';
    if(/TSMC/.test(u)) return 'TSMC';
    if(/TASC|TAIWAN-ASIA|ASIA\s*SEMI/.test(u)) return 'TASC';
    return GST.ORG.custRaw(u);
  },

  /* Floor 값 정리. 설치현황 Floor는 'A3 M2 4F'·'B 2F' 형식인데 오염값이 섞여 있다
     (F16N에 도시명 '台中' 1건). 층 표기가 아닌 것은 받지 않는다 — 조용히 통과시키면
     Floor 축에 도시가 한 칸 끼어 축 자체를 의심하게 만든다. */
  floor: function(s){
    const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase();
    if(!t) return '';
    return /\d\s*F$|^\d+F/.test(t) ? t : '';
  },

  /* 설치현황 조인 인덱스 — 실적 시트에 없는 Floor·Location을 S/N으로 끌어온다.
     조회 순서는 설비호기(Scrubber CODE) 먼저, 미스면 S/N. 실측 커버리지가 이 순서에서
     가장 높다(수선 95.7% · 자재 85.7%).
     ⚠ 일본(F15_*)·싱가포르(F10*) 설비는 설치현황 시트에 아예 없어 원리적으로 못 붙는다.
        자재 미매치 4,235건 중 4,027건이 그것이다. 빈칸으로 두지 말고 '미상'으로 세라. */
  instIndex: function(rows, C, hi){
    const byCode = new Map(), bySN = new Map();
    const key = s => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
    (rows || []).slice((hi || 0) + 1).forEach(function(r){
      const rec = {
        customer: GST.ORG.customer(GST.SM.val(r, C, 'customer')),
        fab:      GST.ORG.fab(GST.SM.val(r, C, 'fab')),
        floor:    GST.ORG.floor(GST.SM.val(r, C, 'floor')),
        location: GST.upk(GST.SM.val(r, C, 'location') || '').trim(),
        bay:      GST.nfw(GST.SM.val(r, C, 'bay') || '').trim(),
        /* 라인 2 (국내 전용). 실적·CIP 에는 열 자체가 없어 Floor·사업부와 같은 규약으로
           S/N 조인해 얻는다. 해외 행은 빈 값이고, 필터에서 loose 로 통과한다 —
           버리면 「라인2 를 고르면 해외 설비가 통째로 사라진다」가 된다. */
        line2:    GST.nfw(GST.SM.val(r, C, 'line2') || '').trim(),
        /* 사업부(관리주체)·단지는 «설치현황에만» 있는 열이다 — 수선·자재 실적에는 없다.
           그래서 사업부를 골라도 실적 기반 카드가 하나도 안 바뀌었다(loose 라 전부 통과).
           국내는 같은 라인에 있는 설비라도 관리주체가 메모리냐 연구소냐 파운드리냐에 따라
           소속 단지가 갈리므로, 사업부로 좁히는 것이 «실제로 설비가 있는 곳»을 보는 길이다.
           Floor 와 같은 규약으로 S/N 조인해 얻는다 — 원본에 담아 두면 설치현황이 갱신될 때
           두 벌이 갈라진다(CIP·인원과 같은 규약). */
        div:      String(GST.SM.val(r, C, 'div') || '').trim(),
        campus:   GST.ORG.campus(GST.SM.val(r, C, 'location'), GST.SM.val(r, C, 'fab'),
                                 GST.SM.val(r, C, 'country'))
      };
      const c = key(GST.SM.val(r, C, 'code')), s = key(GST.SM.val(r, C, 'sn'));
      if(c && !byCode.has(c)) byCode.set(c, rec);
      if(s && !bySN.has(s)) bySN.set(s, rec);
    });
    return {
      byCode: byCode, bySN: bySN,
      // 설비호기 → S/N 순으로 찾는다. 못 찾으면 null (호출부가 '미상'으로 라벨링한다)
      find: function(code, sn){
        return byCode.get(key(code)) || bySN.get(key(sn)) || null;
      }
    };
  }
};

/* 표·PPT 머리의 «법인 표기» — 정본은 여기 하나다.
   ⚠ 예전에는 report 안에만 있었고 국가(F.country)·구분만 봤다. 그래서 운영단위로
     «GST CHINA(WUHAN) SCRUBBER» 를 골라도 머리에는 'GST Global' 이 그대로 붙어 있었고,
     PPT 양식(qbr-template.pptx)은 아예 'GST TAIWAN' 이 박제돼 있어 어느 법인을 보고 있든
     대만이라고 말했다 — 화면이 거짓말을 하는 자리다.
   축 우선순위는 «구체적인 것부터»다: 운영단위 → 국가 → 구분 → 전체.
   운영단위가 가장 좁으므로 그것을 고른 사람에게는 그 이름을 그대로 보여준다.
   ⚠ 이름을 지어내지 않는다(v98 규약 — 조직 축은 시트에 적힌 값 그대로).
     떼는 것은 꼬리의 담당구분(SCRUBBER·CHILLER)뿐이다. 'GST TAIWAN SCRUBBER' → 'GST TAIWAN',
     'GST CHINA(WUHAN) SCRUBBER' → 'GST CHINA(WUHAN)'. 그 앞은 한 글자도 손대지 않는다.
   인자 f 를 주면 그 필터 객체를 본다 — 페이지가 자기 F 를 갖고 있어도 같은 규칙을 쓰게. */
GST.corpLabel = function(f){
  const F = f || (GST.filters && GST.filters.F) || {};
  /* ⚠ 축이 다중선택(Set)이 됐다(v106). String(Set) 은 '[object Set]' 이라 그대로 쓰면
     법인 상자에 그 글자가 찍힌다 — 눈에 띄지만, 조용히 틀리는 것보다 낫자고 둘 수는 없다.
     Set·배열·문자열 어느 그릇으로 와도 «고른 값 목록»으로 눕혀 본다. */
  const list = v => v instanceof Set ? Array.from(v) : Array.isArray(v) ? v : (v ? [String(v)] : []);
  const strip = n => String(n).replace(/[\s·]*(SCRUBBER|CHILLER)\s*$/i,'').trim() || String(n);
  const ops = list(F.op);
  /* 여럿 고르면 이름을 하나로 지어낼 수 없다 — 개수를 밝힌다(v98: 이름을 짐작하지 않는다).
     둘까지는 이어 붙여 준다. 그 이상은 «N개 법인». */
  if(ops.length === 1) return strip(ops[0]);
  if(ops.length === 2) return ops.map(strip).join(' · ');
  if(ops.length > 2)   return ops.length + '개 법인';
  const ctry = list(F.country);
  if(ctry.length === 1){ const c = String(ctry[0]).trim();
    return 'GST ' + c.charAt(0).toUpperCase() + c.slice(1).toLowerCase(); }
  if(ctry.length > 1) return ctry.length + '개 국가';
  const rg = list(F.region);
  if(rg.length === 1) return rg[0] === GST.ORG.REGION_KR ? 'GST Korea'
                    : rg[0] === GST.ORG.REGION_OS ? 'GST Overseas' : 'GST Global';
  return 'GST Global';
};

/* 배수 표기 — '×'는 곱하기로 읽힌다. 4.5배라고 쓴다.
   한때 fault는 '×5.2'(접두), material·피벗은 '5.2×'(접미)로 갈려 있었다.
   같은 화면의 같은 개념이 두 표기로 나오면 사용자는 다른 지표라고 읽는다. */
GST.XMUL = { ko:'배', en:'x', zh:'倍', ja:'倍' };
GST.xmul = function(v){
  if(v == null || !isFinite(v)) return '—';
  const n = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return n + (GST.XMUL[GST._lang()] || GST.XMUL.ko);
};
// 배수의 세기를 색으로 — 3배 넘으면 눈에 걸리고, 10배 넘으면 먼저 보여야 한다
GST.xcol = function(v){
  return (v >= 10) ? 'var(--bad,#fb7185)' : (v >= 3 ? '#fbbf24' : 'inherit');
};

/* 월별 급증 판정 — 고장·자재 두 페이지가 **이 함수 하나만** 쓴다.
   v75에서 막대와 표가 각자 판정하다 같은 문구를 달고 서로 반대 결론을 낸 조합이
   110건 나왔다. 판정이 두 벌이면 반드시 갈라진다.

   ① 월 축을 '자료가 있는 달'이 아니라 최소~최대 사이 **연속 달력**으로 채운다.
      안 그러면 25-09와 26-03이 나란한 막대로 붙어 '꾸준히 늘다 튀었다'로 읽히고,
      '직전 6개월 평균'이 '직전 6개 항목 평균'으로 바뀌어 배수가 부풀려진다.
   ② 기준선 분모는 6으로 고정하고, 앞이 6개월 확보되지 않은 달은 판정하지 않는다. */
GST.SURGE = { minN: 5, x: 2 };
GST.monthSeq = function(counts){
  const ks = Object.keys(counts || {}).sort();
  if(!ks.length) return [];
  const idx = k => { const p = k.split('-'); return (+p[0]) * 12 + (+p[1] - 1); };
  const lab = i => Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0');
  const out = [];
  for(let i = idx(ks[0]); i <= idx(ks[ks.length - 1]); i++){
    const k = lab(i); out.push({ k: k, n: counts[k] || 0 });
  }
  return out;
};
GST.monthSurges = function(counts, opt){
  const o = opt || {}, minN = o.minN != null ? o.minN : GST.SURGE.minN,
        X = o.x != null ? o.x : GST.SURGE.x;
  const seq = GST.monthSeq(counts), hits = [];
  for(let i = 6; i < seq.length; i++){
    const cur = seq[i].n;
    if(cur < minN) continue;
    let sum = 0; for(let j = i - 6; j < i; j++) sum += seq[j].n;
    const base = sum / 6;                       // 빈 달도 0으로 세는 고정 분모
    if(base <= 0) continue;                     // 기준선 0이면 배수가 무한대다
    if(cur / base >= X) hits.push({ k: seq[i].k, n: cur, base: base, x: cur / base });
  }
  return { seq: seq, hits: hits };
};

/* 다중선택 체크박스 — FAB처럼 여러 개를 동시에 고르는 필터.
   주간현황이 쓰던 것을 공용으로 올렸다. **함정이 하나 있어 규약으로 고정한다:**
   박스는 최초 1회만 만들고 이후엔 체크 상태만 갱신한다. 렌더마다 innerHTML을 갈면
   체크 직후 그 노드가 문서에서 분리되어, 바깥 클릭 판정에 걸려 목록이 닫혀버린다.

     GST.mselFill('fab', ['F16','F11'], F.fab, onChange)   // 값 목록은 데이터에서
   마크업은 페이지가 둔다:
     <button id="fabBtn" class="mselbtn" onclick="GST.mselToggle('fab',event)">전체 ▾</button>
     <div id="fabBox" class="mselbox"></div>                                        */
GST.mselToggle = function(id, ev){
  if(ev) ev.stopPropagation();
  const el = document.getElementById(id + 'Box'); if(!el) return;
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
};
GST.mselFill = function(id, values, sel, onChange){
  const box = document.getElementById(id + 'Box'), btn = document.getElementById(id + 'Btn');
  if(!box) return;
  if(!box.dataset.built || box.dataset.keys !== values.join('\u001f')){
    box.dataset.built = '1'; box.dataset.keys = values.join('\u001f');
    GST._msel = GST._msel || {};
    GST._msel[id] = { sel: sel, cb: onChange, values: values };
    box.innerHTML =
      '<div class="ms-all"><button type="button" data-all="1">' + GST._fltT().selAll
      + '</button><button type="button" data-all="0">' + GST._fltT().selNone + '</button></div>'
      + values.map(function(v){
          return '<label><input type="checkbox" data-v="' + GST._esc(v) + '">' + GST._esc(v) + '</label>';
        }).join('');
    /* ⚠ 핸들러는 «지금의» Set·콜백을 GST._msel 에서 꺼내 쓴다. 클로저로 붙들면
       호출자가 Set 을 새로 만든 순간(예: 저장본 복원) 클릭이 옛 Set 으로 들어가
       **화면이 아무 반응도 안 한다** — 에러도 경고도 없다. 실제로 겪었다:
       주간현황은 mount 를 5번 부르는데 그때마다 Set 이 새로 만들어져,
       첫 항목만 체크되고 두 번째부터 먹지 않았다. */
    box.onclick = function(e){
      const st = (GST._msel && GST._msel[id]) || { sel: sel, cb: onChange };
      const cur = st.sel, cb = st.cb, vs = st.values || values;
      const a = e.target.closest('[data-all]');
      if(a){ cur.clear(); if(a.dataset.all === '1') vs.forEach(function(v){ cur.add(v); });
             GST.mselSync(id, vs, cur); cb && cb(); return; }
      const c = e.target.closest('input[data-v]');
      if(c){ if(c.checked) cur.add(c.dataset.v); else cur.delete(c.dataset.v);
             GST.mselSync(id, vs, cur); cb && cb(); }
    };
  } else if(GST._msel && GST._msel[id]) { GST._msel[id].sel = sel; GST._msel[id].cb = onChange;
    GST._msel[id].values = values; }
  GST.mselSync(id, values, sel);
};
GST.mselSync = function(id, values, sel){
  const box = document.getElementById(id + 'Box'), btn = document.getElementById(id + 'Btn');
  if(box) box.querySelectorAll('input[data-v]').forEach(function(i){ i.checked = sel.has(i.dataset.v); });
  if(btn) btn.textContent = (sel.size ? Array.from(sel).join(' · ') : GST._fltT().all) + ' \u25be';
};
// 바깥을 누르면 닫는다 — 한 번만 걸어 두고 모든 박스가 공유한다
if(typeof document !== 'undefined') document.addEventListener('click', function(e){
  document.querySelectorAll('.mselbox').forEach(function(b){
    if(b.style.display !== 'block') return;
    const id = b.id.replace(/Box$/, ''), btn = document.getElementById(id + 'Btn');
    if(!b.contains(e.target) && e.target !== btn) b.style.display = 'none';
  });
});

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
  if(GST.isAdmin()){
    el.textContent='⚠️ 시트에서 찾지 못한 열이 있습니다 — 해당 항목은 비어 보입니다. ('+lines.join(' | ')+') 클릭하면 상세';
    el.style.cursor='pointer';
  }else{   // 배너는 «보이되» 시트 이름·열 이름은 관리자만(v135) — 가리면 조회자만 경고 없이 빈 숫자를 본다
    el.textContent='⚠️ 시트에서 찾지 못한 열이 있어 일부 항목이 비어 보입니다 — 관리자에게 알려 주세요';
    el.style.cursor='default';
  }
};
/* 열 인식 상태 진단 — 어떤 항목이 몇 번 열로 잡혔는지, 못 찾은 건 무엇인지 한눈에.
   시트를 바꾼 뒤 여기만 보면 30초 안에 확인이 끝난다. 콘솔에서 GST.SM.panel()로도 연다. */
GST.SM.panel = function(){
  if(!GST.isAdmin()) return;   // 시트 이름·헤더 행·열 번호 전량 — 관리자만(v135)
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

/* 오프라인 캐시: 마지막 정상 데이터를 보관 (localStorage — 작은 표 전용)

   ⚠ 여기는 «큰 표에서는 항상 실패»한다. localStorage 한도가 5~10MB 인데 수선실적은
     JSON 으로 374MB 다(실측 257,606행). setItem 이 QuotaExceededError 를 던지고
     아래 catch 가 그걸 삼킨다 — 캐시가 없는 것과 같은데 아무 흔적이 없다.
     큰 표는 GST.idb(IndexedDB) 로 간다. 이 함수는 시트 경로 폴백용으로 남는다. */
/* localStorage 한도는 5~10MB 다. 수선실적은 푼 JSON 이 374MB 라(실측) stringify 자체가
   수백 MB 를 만들었다 버리는 헛돈이고, setItem 은 «반드시» QuotaExceeded 로 던진다 —
   캐시가 없는 것과 결과는 같은데 매 로드마다 그 비용만 낸다. 큰 표는 IndexedDB(GST.idb)가
   맡으므로 여기서는 아예 시도하지 않는다. 경계는 넉넉히 잡았다(한 행 38열 기준 약 5MB). */
GST.CACHE_MAX_ROWS = 20000;
/* 열쇠 앞머리 GST.TBL_NS (v146) — 데모 화면과 본 화면이 같은 출처의 localStorage 를 쓰므로 가른다 */
GST.cacheSave=function(key,rows){
  if(!rows || rows.length > GST.CACHE_MAX_ROWS){ GST._cacheSkip=(GST._cacheSkip||0)+1; return; }
  try{ localStorage.setItem('gstc_'+(GST.TBL_NS||'')+key, JSON.stringify({t:Date.now(),rows})); }
  catch(e){ GST._cacheQuota=(GST._cacheQuota||0)+1; }   // 조용히 버리지 않고 세어 둔다
};
GST.cacheLoad=function(key){
  try{ return JSON.parse(localStorage.getItem('gstc_'+(GST.TBL_NS||'')+key)||'null'); }catch(e){ return null; }
};

/* ---------- 9-a. IndexedDB 행 캐시 (v101) ----------
   왜 필요한가. 미러 경로는 캐시를 «아예 안 봤다» — cacheLoad 는 시트 경로가 실패했을
   때만 불린다. 그래서 새로고침할 때마다 수선 257,606행을 다시 받아 다시 파싱했다
   (전송은 gzip 으로 17MB 지만 푼 JSON 은 374MB 다 — 느림의 실체는 이쪽이다).

   무효화는 «시각»이 아니라 **미러의 synced_at + 행수**로 한다. 나이로 자르면
   ① 안 바뀐 데이터를 버리거나 ② 바뀐 데이터를 계속 쓴다. 적재 시각이 같으면 내용도
   같다는 것은 sheet_sync_log 가 보증하는 사실이다.

   ⚠ 실패해도 «조용히» 넘어가지 않는다. IndexedDB 가 막힌 환경(시크릿 창 등)에서는
     그냥 매번 받게 되는데, 그 사실을 _srcNote 에 남겨 「왜 느린지」를 알 수 있게 한다. */
GST.idb=(function(){
  const NAME='gst_rows', STORE='rows'; let dbp=null;
  function open(){
    if(dbp) return dbp;
    dbp=new Promise(function(res,rej){
      if(typeof indexedDB==='undefined') return rej(new Error('NO_IDB'));
      const rq=indexedDB.open(NAME,1);
      rq.onupgradeneeded=function(){ const d=rq.result;
        if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
      rq.onsuccess=function(){ res(rq.result); };
      rq.onerror=function(){ rej(rq.error||new Error('IDB_OPEN')); };
    });
    return dbp;
  }
  function tx(mode,fn){
    return open().then(function(d){ return new Promise(function(res,rej){
      const t=d.transaction(STORE,mode), s=t.objectStore(STORE);
      let out; const r=fn(s); if(r) r.onsuccess=function(){ out=r.result; };
      t.oncomplete=function(){ res(out); };
      t.onerror=function(){ rej(t.error||new Error('IDB_TX')); };
      t.onabort =function(){ rej(t.error||new Error('IDB_ABORT')); };
    }); });
  }
  return {
    get:function(k){ return tx('readonly', function(s){ return s.get(k); })
                       .catch(function(){ return null; }); },
    set:function(k,v){ return tx('readwrite', function(s){ return s.put(v,k); })
                         .then(function(){ return true; })
                         .catch(function(e){ GST._idbErr=String(e&&e.message||e).slice(0,80); return false; }); },
    del:function(k){ return tx('readwrite', function(s){ return s.delete(k); }).catch(function(){}); }
  };
})();
/* ---------- 9-b. Supabase 미러 읽기 (v77) ----------
   구글시트 셀 한도에 걸려 조회를 DB로 옮긴다. 페이지는 한 곳도 고치지 않는다 —
   `fetchCSVCached(url, key)`의 시그니처와 **2차원 배열 반환**을 그대로 지키고
   내부만 갈아끼운다. 첫 행에 시트 헤더 이름을 얹어 돌려주므로 `GST.SM`이 그대로 돈다.

   여기 없는 gid는 지금처럼 시트로 간다. 그래서 부분 이관이 자연스럽다
   (CIP·인원명단·교육현황은 아직 시트다 — 행이 100개 안팎이라 급하지 않다). */
GST.TABLE_OF_GID = { '646668307':'wk', '31302669':'mat', '891608329':'inst' };
GST.USE_DB = true;                       // 되돌리려면 이 한 줄을 false로

/* ── 다른 표 읽기 (v146 · 주간현황(국내) 데모) ──
   데모 화면은 운영 표가 아니라 «데모 표»(kr_sheet_*)를 읽는다. 페이지가 지도(TBL_MAP)만 주면 읽기 경로 셋
   (dbRows · csvTableRows · fetchCSVCached)이 같은 지도를 본다 — 페이지마다 표 이름을 바꿔 적으면 반드시 한 곳이 빠진다.
   ⚠ TBL_NS 는 캐시 열쇠의 앞머리다. 데모와 본 화면이 같은 출처(origin)의 localStorage·IndexedDB 를 나눠 쓰므로,
     가르지 않으면 «본 주간현황이 데모 숫자를 캐시에서 꺼내는» 사고가 난다(IndexedDB 열쇠는 실제 표 이름이 가른다).
   ⚠ 지도에 든 표는 구글시트로 되돌아가지 않는다(fetchCSVCached) — 데모 표를 못 읽었는데 시트(운영 보관본)로
     폴백하면, 화면은 «데모»라고 적힌 채 운영 숫자를 그린다. 그 자리에서 실패를 밝힌다.
   기본값은 빈 지도 — 지금까지의 모든 화면은 한 글자도 안 바뀐다. */
GST.TBL_MAP = GST.TBL_MAP || {};
GST.TBL_NS  = GST.TBL_NS  || '';
GST.physTbl = function(t){ return (GST.TBL_MAP && GST.TBL_MAP[t]) || t; };
/* 적재 기록(sheet_sync_log)의 열쇠 — csv_upload_finish 와 같은 규칙(sheet_ 를 뗀다): sheet_wk → wk · kr_sheet_wk → kr_wk */
GST.logKey = function(phys){ return String(phys).replace('sheet_', ''); };

/* ── 기간 기본창 (v127) ── 콜드 로드에서 «최근 것 먼저». 값은 대상 표의 날짜 컬럼(snake).
   창 크기 12 = 이번 달 1일 기준 12개월 전 1일부터 — 13개월치라, 화면 기본값
   «최근 12개 구간»(주별·월별 모두)이 첫 그림에서 이미 완전하다.
   ⚠ 최종 숫자는 창과 무관하다. 나머지 이력을 뒤에서 마저 받아 «전부 오면» 자동
     새로고침과 같은 경로로 한 번 다시 그리고, 부분본은 캐시에 절대 담지 않는다 —
     창은 첫 화면을 앞당길 뿐이다. 되돌리려면 이 맵을 비우면 된다({}).
   inst 는 «지금의 명부»라 날짜 축이 없다 — 창을 걸 수 없고(작기도 하다) 걸면 안 된다. */
GST.DB_WINDOW = { wk:'d_start', mat:'work_date' };
GST.DB_WINDOW_MONTHS = 12;
GST.DB_WINDOW_MIN = 20000;               // 이보다 작은 표는 두 번에 나눠 받을 이유가 없다
/* ⚠ 장 «폭»의 상한 (v129 · 실사고 2건의 결론). 한 장의 행수는 왕복 횟수만 정하는 게
   아니라 서버가 한 질의에서 직렬화(json_agg)하는 양을 정한다 — 10,000행(≈7MB)짜리
   장을 동시 여러 개 물리자 소형 인스턴스가 statement timeout 으로 죽거나(기본 한도),
   한도를 60s 로 올린 뒤에는 «에러도 없이 수 분간 갈리는» 상태가 됐다. 몇 달간 검증된
   프로파일은 1,000행짜리 가벼운 질의다 — 폭을 여기서 자르므로 Supabase Max Rows
   설정이 무엇이든 안전하다. 올리려면 실측(EXPLAIN·질의 시간)부터 다시 할 것. */
GST.DB_PAGE_MAX = 1000;
GST._snake = function(s){ return String(s).replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase(); };

/* 미러에서 못 읽었을 때 조용히 넘어가지 않는다. 시트로 되돌아가는 것 자체는 안전하지만,
   그 사실을 안 알리면 "왜 어제 넣은 데이터가 안 보이나"를 아무도 설명할 수 없다. */
GST._dbWarn = function(table, e){
  const m = String((e&&e.message)||e).slice(0,120);
  GST._dbMiss = (GST._dbMiss||[]).filter(function(x){ return x.t!==table; }).concat([{ t:table, m:m }]);
  try{ console.warn('[미러] '+table+': '+m); }catch(_){}
  GST._dbBanner();
};
/* 열 미인식 배너(붉은색)와 **다른 색·다른 자리**를 쓴다. 이건 숫자가 틀렸다는 뜻이 아니라
   "지금 보는 값의 출처가 예정과 다르다"는 뜻이다. 둘을 같은 붉은 배너로 묶으면
   진짜 위험한 쪽이 묻힌다. 아무 문제 없으면 배너 자체가 없다. */
GST._dbBanner = function(){
  const bad = GST._dbMiss||[];
  let el = document.getElementById('gstMirrorWarn');
  if(!bad.length){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div'); el.id='gstMirrorWarn';
    el.style.cssText='background:var(--warn-soft,#FFF6E5);color:var(--warn,#B7670A);border:1px solid rgba(183,103,10,.3);padding:9px 14px;border-radius:10px;'+
      'margin:0 0 12px;font-size:12.5px;font-weight:600;line-height:1.5';
    const a=document.querySelector('.status')||document.body.firstElementChild;
    if(a&&a.parentNode) a.parentNode.insertBefore(el, a.nextSibling);
    else document.body.insertAdjacentElement('afterbegin', el);
  }
  el.textContent = GST.isAdmin()
    ? 'ℹ️ '+bad.map(function(x){ return x.t+' — '+x.m; }).join(' | ')
    /* 숨기지 않는다 — 조용히 옛 값을 보여주는 것이 가장 나쁘다(v128). 표 이름·에러 원문만 관리자에게(v135) */
    : 'ℹ️ 일부 자료를 예정된 곳(미러)에서 불러오지 못해 대체 경로로 표시 중입니다 — 값이 옛것일 수 있습니다. 관리자에게 알려 주세요';
};

/* 한 표를 통째로 읽어 [헤더행, ...데이터행] 2차원 배열로 되돌린다. */
GST.dbRows = async function(table){
  const c = await GST.db(); if(!c) throw new Error('DB_OFF');
  const S = GST.SM.SPEC[table]; if(!S) throw new Error('NO_SPEC '+table);
  /* 실제로 읽는 표와 적재 기록 열쇠 (v146) — 지도가 비어 있으면 sheet_<table> · <table> 그대로다.
     IndexedDB 열쇠도 LK 로 가른다 — 데모(kr_wk)와 본 화면(wk)이 같은 브라우저에서 서로의 캐시를 쓰지 않게. */
  const PT = GST.physTbl('sheet_'+table), LK = GST.logKey(PT);
  const keys = Object.keys(S.fields);
  const cols = keys.map(GST._snake);
  // 헤더 행은 SPEC의 **첫 번째 이름**을 쓴다. 별칭은 시트 쪽 사정이고 미러는 컬럼이 고정이다.
  const head = keys.map(function(k){ return [].concat(S.fields[k])[0]; });

  /* 기대 행수를 먼저 본다. 미러가 아직 안 채워졌는데 빈 배열을 돌려주면
     화면이 "데이터 0건"으로 멀쩡히 그려진다 — 그게 가장 위험한 실패다. */
  const lg = await c.from('sheet_sync_log').select('rows,err,synced_at,ms').eq('tbl', LK).maybeSingle();
  /* ⚠ 여기서 던지면 IndexedDB 에 든 25만 행을 «갖고도» 못 쓴다 (v135 · 8단계).
     idb 조회가 이 질의가 «성공한 뒤에야» 나오기 때문이고, 폴백 cacheLoad 는
     localStorage 라 2만 행 초과는 애초에 저장하지 않는다 — 화면에는 「❌ Failed to
     fetch」 한 줄만 남았다.
     그래서 «일시 오류»(네트워크·타임아웃)일 때만 스탬프 대조 없이 마지막으로 받은
     자료를 쓴다. 자료 오류(없는 열 등)는 그대로 던진다 — 옛 값으로 덮으면 안 된다.
     ⚠ 나이를 «반드시» 밝힌다. 조용히 그리면 v128 의 «조용한 폴백»이 그대로 재현된다 —
       배너가 이 폴백의 절반이다. */
  if(lg.error){
    const m = String(lg.error.message||'');
    const transient = /fetch|network|timeout|abort|502|503|504|Load failed/i.test(m);
    if(transient){
      let last=null; try{ last = await GST.idb.get('rows:'+LK); }catch(e){}
      if(last && last.rows && last.rows.length){
        const hrs = Math.max(0, Math.round((Date.now()-(last.t||0))/3600000));
        GST._dbWarn(table, '연결이 안 돼 마지막으로 받은 자료를 보여줍니다 ('+hrs+'시간 전)');
        GST._srcNote(table, 'cache', last.rows.length-1);
        return last.rows;
      }
    }
    throw new Error('LOG '+m);
  }
  const want = lg.data && lg.data.rows;
  if(!want) throw new Error('MIRROR_EMPTY — 아직 적재된 적이 없다');

  /* 미러가 멈춰 있으면 **읽기는 성공하는데 값이 옛날 것**이다. 이게 가장 설명하기 어려운
     실패라 화면에 밝힌다. 30분마다 도는 것을 전제로 3시간(여섯 번 거름)에서 알린다.
     막지는 않는다 — 옛 데이터라도 없는 것보다 낫고, 판단은 사람이 한다.
     예외: ms = -1 은 «수동 CSV 업로드 모드» 표식이다(csv_upload_finish 가 남긴다).
     cron 이 없으니 오래된 것이 정상이고, 나이 경고를 계속 띄우면 아무도 안 보게 된다. */
  const ageMin = Math.round((Date.now() - new Date(lg.data.synced_at).getTime())/60000);
  if(lg.data.err) GST._dbWarn(table, '마지막 적재 실패: '+String(lg.data.err).slice(0,80));
  else if(ageMin > 180 && lg.data.ms !== -1) GST._dbWarn(table, '미러가 '+Math.round(ageMin/60)+'시간째 갱신되지 않았습니다');
  GST._dbAge = Math.max(GST._dbAge||0, ageMin);

  /* ── 행 캐시 (v101) ────────────────────────────────────────────────────
     적재 시각과 행수가 같으면 내용도 같다 — sheet_sync_log 가 보증하는 사실이다.
     그러면 한 바이트도 받지 않는다. 예전에는 이 자리가 없어서, 새로고침할 때마다
     25만 행을 다시 받아 다시 파싱했다(푼 JSON 374MB). 캐시는 «시트 경로가 실패했을
     때»만 읽히고 있었고, 게다가 localStorage 한도를 넘어 저장 자체가 늘 실패했다. */
  /* ⚠ 캐시 열쇠에 «고른 컬럼»도 넣는다. 안 넣으면 DB 에 열을 더한 뒤에도 옛 캐시가
     맞는 것으로 판정돼, 새 열이 영영 빈 채로 남는다(적재 시각이 안 바뀌므로).
     열 목록은 아래에서 정해지므로 stamp 도 그때 만든다. */

  /* 페이지네이션. PostgREST는 한 번에 돌려주는 행수에 상한이 있고 그 값은 프로젝트 설정이다.
     그래서 "요청한 만큼 안 왔으면 끝"으로 판정하면 안 된다 — 상한에 걸린 것을 완료로 착각해
     조용히 잘린 데이터를 그린다. **받은 만큼만 전진하고 0행일 때 멈춘다.** */
  /* ── 표에 «실제로 있는» 컬럼만 고른다 (v120) ──
     ⚠ PostgREST 는 select 에 없는 열이 하나라도 있으면 그 열만 비우는 게 아니라
       **전체를 거부한다**(v92 에 국내 알람이 그렇게 통째로 실패했다). 그래서 SPEC 에 새
       열을 더하는 순간, DB alter 를 아직 안 했으면 **그 시트가 전 페이지에서 안 뜬다.**
       CLAUDE.md v89 의 「승격 순서 — DB 가 먼저다」가 그래서 있었는데, 순서를 사람이
       기억해야 하는 규약은 언젠가 깨진다.
     표의 실제 컬럼을 한 번 물어 교집합만 고른다 — 이제 코드가 먼저 나가도 안 죽고,
     새 열은 DB 에 생기는 순간 저절로 살아난다(그때까지는 「이 화면 미적용」).
     RPC 가 없는 환경(setup-8 미실행)은 옛 동작 그대로 — 전부 고른다. */
  let use = cols, miss = [];
  try{
    const pc = await c.rpc('csv_table_cols', {p_tbl:PT});
    if(!pc.error && Array.isArray(pc.data) && pc.data.length){
      const have = new Set(pc.data);
      use  = cols.filter(function(x){ return have.has(x); });
      miss = cols.filter(function(x){ return !have.has(x); });
    }
  }catch(e){}
  /* ⚠ 여기는 «경고»가 아니다 — 승격 대기 중인 열은 정상 상태이고, 그 사실은 이미
     필터 칸이 「전체 (이 화면 미적용)」으로 말한다. 붉은 배너를 매번 띄우면 진짜 위험한
     배너(적재 실패·미러 정지)가 그 속에 묻힌다.
     ⚠ 그렇다고 «조용히» 넘기지도 않는다(제1원칙). GST._dbCols 에 남겨, 「왜 그 축이
       미적용인가」를 물으면 곧바로 답할 수 있게 한다. _dbMiss 에 넣으면 안 된다 —
       그 배열은 {t,m} 객체를 담고 _dbBanner 가 x.t·x.m 을 읽으므로 문자열을 섞으면
       배너가 «undefined — undefined» 를 찍는다. */
  if(miss.length) GST._dbCols = (GST._dbCols||[]).concat(miss.map(function(x){ return table+'.'+x; }));
  const SEL = use.join(',') + ',src_row';

  /* ── 행 캐시 (v101) ────────────────────────────────────────────────────
     적재 시각과 행수가 같으면 내용도 같다 — sheet_sync_log 가 보증하는 사실이다.
     ⚠ 열쇠에 «고른 컬럼»도 넣는다(v120). 안 넣으면 DB 에 열을 더한 뒤에도 옛 캐시가
       맞는 것으로 판정돼, 새 열이 영영 빈 채로 남는다(적재 시각이 안 바뀌므로). */
  const stamp = LK+'|'+lg.data.synced_at+'|'+want+'|'+use.length;

  /* 직전 백필이 완성해 둔 전체본이 있으면 그것부터 소비한다 (v127 — 기간 기본창).
     IndexedDB «저장»이 실패하는 환경(시크릿 창·용량)에서 이 다리가 없으면
     재렌더 → 콜드 → 또 창+백필 → 또 재렌더 … 로 같은 데이터를 영원히 다시 받는다.
     한 번 쓰면 지운다 — 붙들고 있으면 탭마다 수백 MB 가 눌러앉는다. */
  const mem = GST._bfFull && GST._bfFull[table];
  if(mem){ delete GST._bfFull[table];
    if(mem.stamp === stamp){
      GST._idbHit = (GST._idbHit||0)+1;                 // 배지의 «재사용» — 뜻이 같다
      GST.idb.set('rows:'+LK, {stamp:stamp, rows:mem.rows, t:Date.now()});   // 저장 재시도(실패해도 무해)
      return mem.rows;
    }
  }

  const hit = await GST.idb.get('rows:'+LK);
  if(hit && hit.stamp === stamp && Array.isArray(hit.rows) && hit.rows.length === want+1){
    GST._idbHit = (GST._idbHit||0)+1;
    return hit.rows;
  }

  /* ⚠ 범위는 OFFSET 이 아니라 «src_row 값»으로 자른다 (v128 · 실사고 2026-08-25).
     PostgREST 의 range() 헤더는 LIMIT/OFFSET 이 되는데, OFFSET N 은 서버가 앞 N 행을
     매번 읽고 버린다 — 뒤쪽 장일수록 무거워져 전체 비용이 O(N²)다. Max Rows 를
     1,000→10,000 으로 올리자 장당 스캔+직렬화가 커지면서 Supabase 의 statement
     timeout(수 초)에 걸렸고, 수선실적 읽기가 «READ canceling statement due to
     statement timeout» 으로 통째로 실패해 옛 시트 보관본으로 폴백했다.
     src_row 는 PK 라 `src_row >= a AND src_row < a+폭` 은 어떤 깊이에서도 폭만큼의
     인덱스 범위 스캔이다 — 장당 비용이 상수가 되어 타임아웃이 원리적으로 사라진다.
     ⚠ src_row 는 연속이 아니다 — 구간 교체(v87)가 지운 자리는 비고 새 행은 max+1 부터
       붙는다. 그래서 «짧은 장 = 끝» 판정을 쓸 수 없고(중간에 빈 구간이 정상이다),
       마지막 번호까지 전 구간을 훑은 뒤 총합을 want 와 대조한다. */
  /* 일시 오류(타임아웃·순간 과부하·네트워크)만 1.2초 뒤 «한 번» 다시 해 본다.
     옛 core 를 문 브라우저들이 무거운 OFFSET 질의로 인스턴스를 붙들고 있는 동안에는
     가벼운 질의도 순간적으로 같이 밀릴 수 있다 — 한 번이면 대개 지나간다.
     자료 문제(없는 열 등)는 재시도해도 같으므로 그대로 던진다(v121 의 규율).
     오류에는 «어느 단계»인지 적는다 — 배너의 READ[단계]가 곧 진단이다. */
  const TRANSIENT = /timeout|timed out|canceling|fetch|network|50[234]/i;
  const runQ = async function(tag, fn){
    let r = await fn();
    if(r.error && TRANSIENT.test(String(r.error.message||''))){
      await new Promise(function(x){ setTimeout(x, 1200); });
      r = await fn();
    }
    if(r.error) throw new Error('READ['+tag+'] '+r.error.message);
    return r.data || [];
  };
  const page = function(a, b, mod){                     // src_row ∈ [a, b)
    return runQ('범위 '+a+'~'+b, function(){
      let q = c.from(PT).select(SEL).gte('src_row', a).lt('src_row', b);
      if(mod) q = mod(q);                               // 창·백필의 날짜 조건이 여기 끼워진다
      return q.order('src_row', {ascending:true});
    });
  };
  /* 장 «폭»은 min(서버 상한, DB_PAGE_MAX)로 정한다. src_row 만 골라 첫 10,000개를
     받아 보면(정수 하나짜리 행이라 가볍고, 오프셋 0 이라 깊이 비용도 없다) 그 길이가
     min(상한, 전체)이고, 거기에 DB_PAGE_MAX(1,000)를 덧씌운다 — 큰 장은 서버 직렬화를
     누른다는 것이 실사고로 확인됐기 때문이다(v129 · DB_PAGE_MAX 주석 참조).
     폭이 min(상한, 1,000) 이하이므로 PK 유일성 때문에 어떤 범위 질의도 상한에 잘리지
     않는다 — «조용히 모자라는» 일이 원리적으로 없다. */
  const capD = await runQ('폭탐침', function(){
    return c.from(PT).select('src_row')
            .order('src_row', {ascending:true}).range(0, 9999);
  });
  const width = Math.min(capD.length, GST.DB_PAGE_MAX || 1000);   // 폭 상한 — 주석은 DB_PAGE_MAX 정의부
  if(!width) throw new Error('MIRROR_SHORT 0/'+want);
  const mxD = await runQ('최대번호', function(){
    return c.from(PT).select('src_row')
            .order('src_row', {ascending:false}).limit(1);
  });
  const maxSr = mxD[0] ? +mxD[0].src_row : -1;
  const nR = Math.ceil((maxSr+1)/width);
  /* 폭주 방지 — 번호 인플레이션(구간 교체 반복)이 비정상적으로 커졌다면 밝히고 멈춘다.
     조용히 일부만 받으면 want 대조가 어차피 막지만, 원인 없는 MIRROR_SHORT 보다
     원인 있는 실패가 낫다. 1,000행 폭 기준으로도 수백 구간이면 넉넉하다. */
  if(nR > 2000) throw new Error('SRC_ROW_INFLATED max='+maxSr+' width='+width);
  GST._pgSize = width;

  /* pump — 전 구간을 값 범위로 나눠 받는 공용 펌프. 전체·창·백필 세 호출이 이 하나를
     쓴다(나눠 짜면 세 벌이 갈라진다 — 제2원칙). 동시 6 × 폭 1,000 은 몇 달간 서버가
     견딘 것이 실증된 부하 프로파일이다 — 동시성·폭을 올리려면 서버 실측부터(v129).
     각 장이 src_row 오름차순의 겹치지 않는 구간이라 이어 붙이면 정렬이 유지된다. */
  const pump = async function(mod){
    const out = [];
    for(let p = 0; p < nR; p += 6){
      const batch = [];
      for(let k = 0; k < 6 && p + k < nR; k++)
        batch.push(page(width*(p+k), width*(p+k+1), mod));
      const res = await Promise.all(batch);
      for(let i = 0; i < res.length; i++)
        for(let j = 0; j < res[i].length; j++) out.push(res[i][j]);
    }
    return out;
  };
  const materialize = function(out){
    const rows = new Array(out.length+1); rows[0] = head;
    for(let i=0;i<out.length;i++){
      const o = out[i], r = new Array(cols.length);
      /* 표에 없는 열은 빈 값이다 — 헤더 자리는 그대로 두어야 SPEC 이 열을 «이름으로»
         찾는 규약(제1원칙)이 유지된다. 자리를 지우면 그 뒤 열이 통째로 밀린다. */
      for(let j=0;j<cols.length;j++){ const v=o[cols[j]]; r[j] = (v==null?'':String(v)); }
      rows[i+1] = r;
    }
    return rows;
  };
  /* 다음 로드를 위해 담아 둔다. 저장 실패(용량·시크릿 창)는 «느려질 뿐» 틀리지 않으므로
     막지 않는다 — 다만 왜 느린지 알 수 있게 흔적은 남긴다(GST._idbErr). */
  const keep = function(rows){ GST.idb.set('rows:'+LK, {stamp:stamp, rows:rows, t:Date.now()}); };

  /* ── 기간 기본창 (v127) — 최근 13개월을 먼저 그리고, 나머지는 뒤에서 받는다 ──
     gte(cutoff) 와 or(lt.cutoff, is.null) 은 어떤 값이든 «정확히 한쪽»에 들어간다
     (텍스트 비교의 삼분법 + null). 그래서 날짜 표기가 섞여 있어도 행이 겹치거나 빠질 수
     없고, 합친 행수가 want 와 다르면 그 자리에서 멈춘다 — 이상한 표기는 어느 반쪽에
     실리는지만 달라질 뿐이다(첫 그림의 구성이 조금 달라질 뿐 최종본은 같다).
     ⚠ 부분본(rowsW)은 keep() 하지 않는다 — 캐시 적중 조건이 want+1 행이라 담아도
       안 맞지만, 애초에 담지 않는 것이 규율이다. 전체가 확인된 것만 캐시에 간다. */
  const winCol = (GST.DB_WINDOW||{})[table];
  if(winCol && use.indexOf(winCol) >= 0 && want >= GST.DB_WINDOW_MIN){
    const now = new Date();                                       // 로컬 달력 (v109 — UTC 왕복 금지)
    const mAbs = now.getFullYear()*12 + now.getMonth() - GST.DB_WINDOW_MONTHS;
    const cutoff = Math.floor(mAbs/12) + '-' + String(mAbs%12+1).padStart(2,'0') + '-01';
    let recent = null;
    try{ recent = await pump(function(q){ return q.gte(winCol, cutoff); }); }
    catch(e){ recent = null; }               // 창이 실패하면 전체 경로로 — 창은 최적화일 뿐이다
    if(recent && recent.length === want){    // 전부 창 안 — 이미 전체본이다
      const rowsF = materialize(recent); keep(rowsF); return rowsF;
    }
    if(recent && recent.length && recent.length < want){
      const rowsW = materialize(recent);
      GST._bfNote(table, true);
      (async function(){
        try{
          const rest = await pump(function(q){ return q.or(winCol+'.lt.'+cutoff+','+winCol+'.is.null'); });
          const all = recent.concat(rest);
          if(all.length !== want) throw new Error('BACKFILL_SHORT '+all.length+'/'+want);
          all.sort(function(a,b){ return (a.src_row||0) - (b.src_row||0); });   // 시트 순서 복원 — 전체 경로와 같은 출력
          const rowsF = materialize(all);
          (GST._bfFull = GST._bfFull || {})[table] = { stamp: stamp, rows: rowsF };
          keep(rowsF);
          GST._bfNote(table, false);
          GST._bfKick();                     // 전 표의 백필이 끝났으면 한 번 다시 그린다
        }catch(e){
          /* 부분인 채로 조용히 두면 «누적 지표가 작은» 화면이 완성본처럼 보인다 —
             경고를 남기고 캐시에는 아무것도 안 담는다(다음 로드가 처음부터 다시). */
          GST._bfNote(table, false);
          GST._dbWarn(table, '전체 이력 뒷부분을 못 받았습니다 — 새로고침하면 처음부터 다시 받습니다 ('
            + String(e && e.message || e).slice(0, 60) + ')');
        }
      })();
      return rowsW;
    }
    /* recent 0행(최근 13개월 자료가 없음) → 창이 무의미 — 전체 경로로 내려간다 */
  }

  const out = await pump(null);
  /* 적재 기록과 실제로 받은 행수가 다르면 그 자리에서 멈춘다.
     모자란 채로 그리면 KPI가 조용히 작아진다. */
  if(out.length !== want) throw new Error('MIRROR_SHORT '+out.length+'/'+want
    +' (한 페이지 '+(GST._pgSize||'?')+'행)');
  const rows = materialize(out);
  keep(rows);
  return rows;
};

/* ---------- 9-c. CSV Import 표 (v79) ----------
   Table Editor 로 직접 올린 표. 위의 미러(sheet_wk 등)와 두 가지가 다르다:
     · 컬럼 이름이 **시트 머리글 그대로**다(snake_case 가 아니다) → SPEC 이 필요 없다
     · sheet_sync_log 에 적재 기록이 없다 → 행수 대조를 할 수 없다
   그래서 별도 경로로 읽는다. 반환 모양은 같다 — [헤더행, ...데이터행].

   여기가 «모양 복원»을 맡는다. Import 하면서 잃은 구조(CIP 의 적용일자 띠,
   All By-Pass 의 크로스탭)를 되살려 페이지에 넘긴다. 그래야 페이지·파서를 한 줄도
   안 고친다 — 고치면 시트 경로와 DB 경로가 갈라지고, 갈라진 것은 반드시 어긋난다. */
GST.CSV_TABLE_OF_GID = {
  '0':          'sheet_edu',
  '1213453343': 'sheet_roster',
  '262805841':  'sheet_leave',
  '2123129719': 'sheet_cip_f11',
  '1999732389': 'sheet_cip_f16',
  '1263412805': 'sheet_abp'
};
// Import 표에 딸려오는 관리용 열 — 헤더로 내보내지 않는다
GST._CSV_SKIP = { id:1, created_at:1, imported_at:1, src_row:1, synced_at:1, extra:1 };

/* 정렬 열을 **가정하지 않는다.** Table Editor 로 만든 표에 id 가 늘 있는 것이 아니다
   (실제로 없었고, `column sheet_roster.id does not exist` 로 읽기가 통째로 실패했다).
   한 행을 먼저 받아 실제 열 이름을 보고 고른다.
   그리고 **이름에 점·공백이 든 열은 후보에서 뺀다** — PostgREST 의 order= 구문은
   점(.)이 «컬럼.방향» 구분자라, 인원현황의 «No.» 를 넘겼더니
   `failed to parse order (No..asc)` 로 읽기가 통째로 죽었다(실제 사고).
   안전한 열이 하나도 없으면 정렬 없이 간다 — 이 표들은 전부 한 페이지(5,000행)
   안이라 겹치거나 빠질 위험이 없다. */
GST._csvOrderCol = function(keys){
  const safe = keys.filter(function(k){ return /^[A-Za-z0-9_가-힣]+$/.test(k); });
  const pref = ['id','src_row','No','no','NO'];
  for(let i=0;i<pref.length;i++) if(safe.indexOf(pref[i])>=0) return pref[i];
  return safe[0] || null;
};

/* cols 를 주면 그 열«만» 받는다. 안 주면 전 열(옛 동작).
   왜 필요한가. 국내 알람 원장은 44열 × 2만 행이라 통째로 받으면 화면이 뜨기 전에 몇 MB 를
   내려받는다. 그리고 그 안에는 **작업자 실명(checker)** 이 들어 있다 — 화면이 안 쓰는 값을
   브라우저까지 보낼 이유가 없다. 열을 추리면 전송량도 줄고 실명도 안 나간다. */
/* 일시적인 «인증» 실패인가 — 자료 문제가 아니라 다시 해 보면 되는 것.
   ⚠ 실제로 겪었다: 국내 알람 원장이 «READ JWT issued at future» 로 실패해 화면이
     수선실적 BM 으로 폴백했고, 사용자는 「알람 건수를 또 바꿨냐」고 물었다(잠시 뒤 저절로
     돌아왔다). 브라우저 시계가 Supabase 보다 앞서면 토큰의 iat 가 «미래»로 보인다.
   자료가 없는 것과 «지금 못 읽은 것»은 다른 사실이다 — 후자를 폴백으로 삼으면 화면이
   조용히 다른 기준으로 갈아탄다. 한 번은 다시 해 본다. */
GST._authGlitch = function(msg){
  return /JWT|issued at future|expired|token|401|403/i.test(String(msg||''));
};
/* Import 표는 미러와 두 가지가 다르다 — sheet_sync_log 가 없고(csv_upload_finish 는 실적 3종만 기록한다),
   src_row 가 아닌 id 로만 정렬되는 표가 있다(Table Editor 로 만든 표 · truncate 로도 id 가 되돌아가지 않아
   희소해진다). 그래서 dbRows 의 «값 범위 분할»을 그대로 못 쓴다 — 희소한 id 를 폭 1,000 으로 자르면 빈 구간이
   수백 개다. 대신 «마지막 값 다음»(keyset · gt + order + limit)으로 이어 받는다. OFFSET 은 쓰지 않는다 —
   뒤쪽 장일수록 서버가 앞 N 행을 읽고 버리는 O(N²) 이고, 그것이 v128 의 statement timeout 이었다(v135 이전에는
   이 경로만 range(5,000) 로 남아 있었다). 장은 순차이지만 페이지가 여러 표를 동시에 읽으므로 전체는 병렬이다. */
GST._CSV_KEYS = ['src_row', 'id'];      // 키셋에 쓸 유일·정수 열 — 앞의 것을 우선한다
GST.csvTableRows = async function(table, cols){
  const c = await GST.db(); if(!c) throw new Error('DB_OFF');
  /* 실제로 읽는 표 (v146) — 데모 화면은 지도(TBL_MAP)가 kr_ 표를 가리킨다. 아래의 표 이름은 전부 이것이다 —
     단, «화면이 직접 고치는 표인가»(GST.DBW)는 논리 이름(table)으로 본다. */
  const logical = table; table = GST.physTbl(table);
  const sel = (cols && cols.length) ? cols.join(',') : '*';

  /* count 를 같이 받는다(exact 는 응답 헤더 한 줄이다) — 캐시 열쇠와 «다 받았나» 대조에 쓴다 */
  let probe = await c.from(table).select(sel, {count:'exact'}).limit(1);
  /* 시계 어긋남은 몇 초면 지나간다. 세션을 새로 받아 한 번만 다시 해 본다 —
     여기서 포기하면 그 화면은 «다른 기준»으로 그려지고, 그 사실이 숫자에는 안 보인다. */
  if(probe.error && GST._authGlitch(probe.error.message)){
    GST._authRetry = (GST._authRetry||0)+1;
    try{ if(c.auth && c.auth.refreshSession) await c.auth.refreshSession(); }catch(e){}
    await new Promise(function(r){ setTimeout(r, 1200); });
    probe = await c.from(table).select(sel, {count:'exact'}).limit(1);
  }
  if(probe.error) throw new Error('READ '+probe.error.message);
  if(!probe.data || !probe.data.length) throw new Error('EMPTY — '+table+' 에 행이 없다 (Import 했는가)');
  const keys0 = Object.keys(probe.data[0]);
  const total = (typeof probe.count==='number') ? probe.count : null;
  /* ⚠ 열을 추렸으면 정렬 후보(src_row·id)가 안 올 수 있다 — 5,000행을 넘는 표는 반드시 정렬 열을 함께 받는다. */
  const ordCol = GST._csvOrderCol(keys0);
  const kcol = GST._CSV_KEYS.filter(function(k){ return keys0.indexOf(k)>=0; })[0] || null;

  /* ── 행 캐시 (v135) — 열쇠는 «행수 + 마지막 적재 시각 + 고른 열». imported_at 이 있는 표(알람·올바)만 담는다.
     hr 이 브라우저에서 직접 고치는 표(GST.DBW · 인원·교육·휴가)는 적재 시각이 안 바뀌므로 담지 않는다 —
     담으면 «저장했는데 새로고침하면 옛 값»이 된다(v80 의 그 실패). 열쇠를 못 만들면 담지 않는다(느릴 뿐 틀리지 않는다). */
  const writable = Object.keys(GST.DBW||{}).map(function(g){ return (GST.DBW[g]||{}).table; });
  let stamp = null;
  if(total!=null && keys0.indexOf('imported_at')>=0 && writable.indexOf(logical)<0){
    const mx = await c.from(table).select('imported_at').order('imported_at', {ascending:false}).limit(1);
    if(!mx.error && mx.data && mx.data[0]) stamp = table+'|'+total+'|'+mx.data[0].imported_at+'|'+sel;
  }
  if(stamp){
    const hit = await GST.idb.get('csv:'+table);
    if(hit && hit.stamp===stamp && Array.isArray(hit.rows) && hit.rows.length===total+1){
      GST._idbHit = (GST._idbHit||0)+1;
      return hit.rows;
    }
  }

  const out = [];
  if(kcol){
    /* keyset — «0행일 때만» 멈춘다. 서버 상한(max-rows)이 폭보다 작으면 장이 짧게 오는데, 그것을 끝으로 읽으면
       조용히 잘린다(CLAUDE.md 「요청한 만큼 안 오면 끝으로 판정하지 말 것」). 마지막 값 다음을 다시 묻는 것이
       상한이 얼마든 옳다 — 끝에 빈 장 한 번이 비용의 전부다. */
    const width = GST.DB_PAGE_MAX || 1000;
    let last = null;
    for(let guard=0; guard<5000; guard++){
      let q = c.from(table).select(sel);
      if(last!=null) q = q.gt(kcol, last);
      const r = await q.order(kcol, {ascending:true}).limit(width);
      if(r.error) throw new Error('READ '+r.error.message);
      const n = (r.data||[]).length; if(!n) break;
      for(let i=0;i<n;i++) out.push(r.data[i]);
      const nl = r.data[n-1][kcol];
      if(nl==null || nl===last) throw new Error('READ keyset '+table+'.'+kcol+' 값이 없거나 늘지 않는다');   // 조용한 무한 루프 대신
      last = nl;
    }
  }else{
    /* 유일 열이 없는 표(옛 Table Editor 표) — 안전한 열로 정렬해 range 로 받는다(옛 경로 그대로).
       「요청한 만큼 안 오면 끝」으로 판정하지 않는다 — 0행일 때만 멈춘다. */
    const STEP = 5000; let from = 0;
    for(let guard=0; guard<400; guard++){
      let q = c.from(table).select(sel);
      if(ordCol) q = q.order(ordCol, {ascending:true});
      const r = await q.range(from, from+STEP-1);
      if(r.error) throw new Error('READ '+r.error.message);
      const n = (r.data||[]).length; if(!n) break;
      for(let i=0;i<n;i++) out.push(r.data[i]);
      from += n;
    }
  }
  if(!out.length) throw new Error('EMPTY — '+table+' 에 행이 없다 (Import 했는가)');
  /* count 와 실제로 받은 행수가 다르면 멈춘다 — 받는 도중 업로드가 표를 비웠거나 정렬 열에 중복이 있는 것이다.
     모자란 채로 그리면 그 지표만 조용히 작아진다(미러의 MIRROR_SHORT 와 같은 규율). */
  if(total!=null && out.length!==total) throw new Error('CSV_SHORT '+table+' '+out.length+'/'+total);

  const head = Object.keys(out[0]).filter(function(k){ return !GST._CSV_SKIP[k]; });
  const rows = new Array(out.length+1); rows[0] = head;
  for(let i=0;i<out.length;i++){
    const o = out[i], r = new Array(head.length);
    for(let j=0;j<head.length;j++){ const v=o[head[j]]; r[j] = (v==null?'':String(v)); }
    rows[i+1] = r;
  }
  if(stamp) GST.idb.set('csv:'+table, {stamp:stamp, rows:rows, t:Date.now()});   // 저장 실패는 느릴 뿐 틀리지 않는다(GST._idbErr 에 남는다)
  return rows;
};

/* CIP — Import 표에는 «적용일자 띠»(시트 0행)가 없다. Table Editor 는 머리글을 한 줄만 받는다.
   열별 «가장 이른 완료일»로 되살린다. 실측 대조: F11 6/6 밴드와 일치, F16 14/18 일치이고
   나머지도 몇 달 차이다. 밴드가 아예 없던 (Right) 열들은 오히려 제 날짜를 갖게 된다
   (예전에는 (Left) 의 병합셀을 물려받았다).
   **2010년 이전은 버린다** — 시트에 `1901-02-19` 오타가 하나 있고, 그걸 최솟값으로 쓰면
   그 열의 경과일이 4만 5천 일이 되어 「잔여 경과일 분포」가 통째로 망가진다. */
GST._cipBand = function(rows){
  const head = rows[0]||[], band = new Array(head.length).fill('');
  const D = /^(\d{4})-(\d{2})-(\d{2})/;
  for(let c=0;c<head.length;c++){
    let min = '';
    for(let i=1;i<rows.length;i++){
      const m = D.exec(String((rows[i]||[])[c]||'').trim());
      if(!m || m[1] < '2010') continue;
      const d = m[0].slice(0,10);
      if(!min || d < min) min = d;
    }
    band[c] = min;
  }
  return band;
};

/* All By-Pass — 세로형으로 Import 했다(period_type·period_key·period_end·site·bypass_count).
   report 의 parseABP 는 시트의 크로스탭(‘Month’/‘Week’ 라벨 행 + 사이트 행)을 전제하므로
   여기서 그 모양으로 되돌린다. 파서를 고치는 대신 모양을 복원하는 이유는 위와 같다 —
   시트 경로와 DB 경로가 같은 입력을 보게 해야 갈라지지 않는다. */
GST._abpWide = function(rows){
  const H = {}; (rows[0]||[]).forEach(function(h,i){ H[String(h).trim().toLowerCase()] = i; });
  const iT=H['period_type'], iK=H['period_key'], iE=H['period_end'], iS=H['site'], iV=H['bypass_count'];
  if(iT==null||iK==null||iS==null||iV==null) return rows;   // 모양이 다르면 손대지 않는다
  const blk = { month:{keys:[], ends:{}, sites:[], v:{}}, week:{keys:[], ends:{}, sites:[], v:{}} };
  for(let i=1;i<rows.length;i++){
    const r = rows[i]||[], t = String(r[iT]||'').trim().toLowerCase(), b = blk[t];
    if(!b) continue;
    const k = String(r[iK]||'').trim(), s = String(r[iS]||'').trim();
    if(!k||!s) continue;
    if(b.keys.indexOf(k)<0) b.keys.push(k);
    if(b.sites.indexOf(s)<0) b.sites.push(s);
    b.ends[k] = iE!=null ? String(r[iE]||'') : '';
    b.v[s+'\0'+k] = String(r[iV]||'');
  }
  const out = [];
  ['month','week'].forEach(function(t){
    const b = blk[t]; if(!b.keys.length) return;
    // parseABP 는 월을 숫자로, 주를 W## 로 읽는다. 월 키는 2025-07 이므로 월 숫자만 떼어 준다.
    const label = t==='month' ? function(k){ return String(Number(k.slice(5,7))||k); } : function(k){ return k; };
    out.push([t==='month'?'Month':'Week'].concat(b.keys.map(label)));
    out.push(['Site'].concat(b.keys.map(function(k){ return b.ends[k]||''; })));
    b.sites.forEach(function(s){
      out.push([s].concat(b.keys.map(function(k){ return b.v[s+'\0'+k] || '0'; })));
    });
    out.push([]);                                   // 블록 사이 빈 줄 — 시트와 같다
  });
  return out;
};

/* ---------- 9-d. 출처 표시 (v79) ----------
   "아직 구글시트를 읽는 것 같다"를 사람이 눈으로 판정할 방법이 없었다. 배너는 «실패했을 때»만
   뜨므로 «성공했는데 시트에서 읽은» 경우와 «DB 에서 읽은» 경우가 화면상 구별되지 않는다.
   그래서 성공 경로도 남긴다. 이관 중에는 이 한 줄이 추측을 없앤다. */
GST._srcSeen = {};
GST._srcLabel = { db:'Supabase', sheet:'구글시트', cache:'브라우저 캐시' };   // 콘솔용 — 화면 문구는 GST.SRC_T(v135)
GST._srcNote = function(key, src, n){
  GST._srcSeen[key] = { src:src, n:n };
  try{ if(GST.isAdmin()) console.info('[출처] '+key+' ← '+(GST._srcLabel[src]||src)+' '+n+'행'); }catch(_){}
  GST._srcChip();
};
GST._srcChip = function(){
  const ks = Object.keys(GST._srcSeen); if(!ks.length || !document.body) return;
  let db=0, sh=0, ca=0;
  ks.forEach(function(k){ const s=GST._srcSeen[k].src; if(s==='db')db++; else if(s==='cache')ca++; else sh++; });
  let el = document.getElementById('gstSrcChip');
  if(!el){
    el = document.createElement('div'); el.id='gstSrcChip';
    /* 오른쪽 아래 — 왼쪽은 필터 사이드바 발치(「자동 30분」 버튼)와 겹친다(v139) */
    el.style.cssText='position:fixed;right:12px;bottom:10px;z-index:999998;padding:4px 10px;border-radius:999px;'+
      'font:11px/1.5 \'Pretendard Variable\',Pretendard,system-ui,-apple-system,sans-serif;font-weight:600;cursor:pointer;opacity:.85;user-select:none';
    el.title = GST._srcT().title;
    el.onclick = function(){
      if(!GST.isAdmin()) return;   // 표 이름·행수·캐시 상태는 관리자만(v135) — «core N» 은 누구나 본다(v128 규약)
      let d = document.getElementById('gstSrcDetail');
      if(d){ d.remove(); return; }
      d = document.createElement('div'); d.id='gstSrcDetail';
      d.style.cssText='position:fixed;right:12px;bottom:38px;z-index:999998;max-width:320px;padding:9px 12px;'+
        'border-radius:10px;background:#111827;color:#e5e7eb;font:11px/1.7 system-ui,sans-serif;'+
        'box-shadow:0 6px 24px rgba(0,0,0,.35);white-space:pre-wrap';
      d.textContent = Object.keys(GST._srcSeen).map(function(k){
        const v = GST._srcSeen[k];
        return (v.src==='db'?'✅ ':'⚠️ ')+k+' ← '+(GST._srcT()[v.src+'L']||v.src)+' · '+v.n+GST._srcT().rows;
      }).concat(Object.keys(GST.vmap.applied).filter(function(t){ return GST.vmap.applied[t].rows; }).map(function(t){
        /* 기준 정보 규칙이 «바꿔 읽은» 행 — 조용히 바꾸지 않는다(v152 · 원본과 화면이 다른 이유가 여기 있다) */
        const a = GST.vmap.applied[t];
        return '🔁 '+GST._srcT().vmap.replace('{t}',t).replace('{r}',a.rules).replace('{n}',a.rows.toLocaleString());
      })).join('\n');
      document.body.appendChild(d);
    };
    document.body.appendChild(el);
  }
  const bad = sh + ca;
  el.style.background = bad ? '#78350f' : '#064e3b';
  el.style.color      = bad ? '#fde68a' : '#a7f3d0';
  /* 캐시가 실제로 먹었는지 보이게 한다. 안 보이면 «왜 느린지»를 아무도 못 묻는다. */
  const ST = GST._srcT();
  if(GST.isAdmin()){
    el.textContent = ST.src+' DB '+db + (sh?' · '+ST.sheet+' '+sh:'') + (ca?' · '+ST.cache+' '+ca:'')
      + ' · core '+GST.VER
      + (GST._idbHit?' · '+ST.reuse+' '+GST._idbHit:'')
      + (GST._idbErr?' · '+ST.idbFail:'');
    el.style.cursor='pointer';
    el.title = GST._idbErr ? ST.idbTitle.replace('{e}', GST._idbErr) : ST.title;
  }else{
    /* 조회 계정에는 «core N» 만 — v128 규약(옛 코드를 물고 있는지 눈으로 판정)은 지키고,
       표 이름·행수·캐시 상태는 가린다(v135 · 사용자 확정 «메타정보만»). 색은 그대로라 이상은 보인다. */
    el.textContent = 'core '+GST.VER + (bad||GST._idbErr ? ' · ⚠' : '');
    el.style.cursor='default';
    el.title = ST.verTitle + (bad||GST._idbErr ? ST.verBad : '');
    const dd = document.getElementById('gstSrcDetail'); if(dd) dd.remove();
  }
};

// 캐시 폴백 로드: 성공 시 저장, 실패 시 캐시로 대체 (cached/ageMin 플래그 반환)
/* ---------- 기준 정보(값 사전) — «이 칸에 이 값이 오면 이렇게 읽는다» (v152 · 사용자 요청 · setup-20) ----------
   사이트마다 같은 뜻을 다르게 적는다 — F16 원본은 법인 «GST TAIWAN SCRUBBER», F11·F16N·F16S 사이트 파일은 «TAIWAN».
   그대로면 같은 법인이 두 행으로 갈려 세어지고, 새 사이트가 들어올 때마다 코드를 고쳐야 했다
   (사용자: 「계속 이럴 때마다 유지보수 개념으로 코딩을 변경할 수는 없는 노릇」). 규칙은 데이터 관리 「기준 정보」에서 사람이 정한다.
   ⚠ 원본 자료는 그대로 두고 «읽을 때» 바꾼다 — 모든 화면이 지나는 fetchCSVCached 한 곳(아래). 다시 올려도 규칙이 그대로 먹고,
     규칙을 지우면 원래대로 돌아간다. 데이터 관리 목록은 원본을 보여 준다(고칠 대상은 원본이다).
   ⚠ 조건은 «원본» 값으로 본다 — 규칙끼리 서로의 결과를 보면 적용 순서에 따라 답이 갈린다.
   ⚠ 판정은 대소문자·앞뒤 공백만 무시한다(GST.vmap.K) — 짐작으로 비슷한 값을 묶지 않는다(제1원칙의 부분일치 사고).
   ⚠ 카카오 챗봇(kakao-bot)은 표를 직접 읽어 이 규칙을 모른다 — 원본 값으로 답한다(알려진 차이 · CLAUDE.md v152).
   우선순위: «값 + 조건» > «값» > «아무 값(*) + 조건» > «아무 값(*)». 같은 단계 안에서는 만든 순서가 아니라 열쇠가 하나뿐이다(PK). */
GST.vmap = {
  rules: [], _p: null, applied: {},
  K: function(v){ return String(v == null ? '' : v).trim().toUpperCase(); },
  load: function(force){
    if(this._p && !force) return this._p;
    const self = this;
    return this._p = (async function(){
      if(!(GST.USE_DB && GST.authOn())) return self.rules;
      try{
        const c = await GST.db(); if(!c) return self.rules;
        const r = await c.from('value_map').select('tbl,col,raw,when_col,when_val,val');
        if(r.error){ console.warn('[vmap] 기준 정보 읽기 실패 (setup-20 미적용?)', r.error.message); return self.rules; }
        self.rules = r.data || [];
      }catch(e){ console.warn('[vmap] 기준 정보 읽기 실패', e); }
      return self.rules;
    })();
  },
  /* 한 표의 규칙을 «칸 → 단계별 목록»으로 */
  compile: function(tbl, rules){
    const K = this.K, by = {};
    (rules || this.rules).filter(function(r){ return r.tbl === tbl; }).forEach(function(r){
      const any = r.raw === '*', cond = !!r.when_col;
      (by[r.col] = by[r.col] || []).push({ raw:any ? '*' : K(r.raw), wc:r.when_col || '', wv:K(r.when_val), val:r.val, lv:(any ? 2 : 0) + (cond ? 0 : 1) });
    });
    Object.keys(by).forEach(function(c){ by[c].sort(function(a, b){ return a.lv - b.lv; }); });
    return by;
  },
  /* 한 행(값 꺼내는 함수 get)에 대해 칸 col 의 «읽는 값» — 규칙이 없으면 원본 그대로. 기준 정보 화면·업로드 점검도 이것을 부른다(판정 한 벌). */
  pick: function(list, get, col){
    const K = this.K, cur = get(col), kc = K(cur);
    for(let i = 0; i < (list || []).length; i++){
      const r = list[i];
      if(r.raw !== '*' && r.raw !== kc) continue;
      if(r.wc && K(get(r.wc)) !== r.wv) continue;
      return { val:r.val, rule:r };
    }
    return null;
  },
  /* 대시보드가 이 값을 어떻게 읽나 — 판정은 대시보드 함수 그대로(GST.EQ · GST.ORG). 기준 정보 화면·업로드 점검이 같이 쓴다. */
  mean: function(col, v){
    const s = String(v == null ? '' : v).trim();
    if(col === 'state'){
      const c = GST.EQ.cls(s);
      return c === 'run' ? '가동 · 반입에 셈' : c === 'in' ? '반입(미가동)' : c === 'out' ? '대수에 안 셈(나감·미반입)'
        : c === '?' ? '⚠ 처음 보는 상태 — 대수에 안 셈 · 미가동에 듦' : '⚠ 빈칸 — 반입일(FAB In)이 있을 때만 반입으로 셈';
    }
    if(!s) return '⚠ 빈칸 — 이 축에서 「미배치·미상」';
    if(col === 'country' || col === 'op' || col === 'location' || col === 'fab'){
      const r = GST.ORG.region(s), c = GST.ORG.country(s);
      return (r || '⚠ 구분 미상') + (c ? ' · ' + c : '');
    }
    if(col === 'customer') return '고객사 축: ' + (GST.ORG.customer(s) || s);
    return '';
  },
  /* 법인 칸에 «국가 이름»이 적혔나 — 같은 국가의 다른 행은 법인 이름(GST TAIWAN SCRUBBER)으로 적혀 있을 때만 짚는다.
     국내의 SEC·SDC·SK 처럼 «같은 국가의 서로 다른 법인»은 짚지 않는다(그건 다른 법인이 맞다). */
  countryName: function(v){ const c = GST.ORG.country(v); return !!c && this.K(v) === c; },
  /* 새로 올릴 행(objs · 표 열 이름 키)을 지금 표(groups · value_groups 결과)와 견줘 «처음 보는 값»·«법인 칸의 국가 이름»·«빈 상태»를 센다.
     막지 않는다 — 말할 뿐이다(규칙은 올린 뒤에 정해도 원본을 안 건드리고 읽을 때 먹는다). */
  check: function(tbl, objs, groups, cols){
    const self = this, by = this.compile(tbl), K = this.K, out = { fresh:[], cname:[], blankState:0, blankStateDated:0 };
    const rd = function(o, c){ const h = self.pick(by[c], function(f){ return o[f]; }, c); return h ? h.val : (o[c] == null ? '' : String(o[c])); };
    const big = {};      // 국가 → 지금 표에서 가장 많이 쓴 «법인 이름»
    if(cols.indexOf('country') >= 0 || cols.indexOf('op') >= 0){
      const cc = cols.indexOf('country') >= 0 ? 'country' : 'op', cnt = {};
      (groups || []).forEach(function(g){ const v = rd(g, cc); if(v && !self.countryName(v)){ const c = GST.ORG.country(v); if(c){ cnt[c] = cnt[c] || {}; cnt[c][v] = (cnt[c][v] || 0) + (g.n || 1); } } });
      Object.keys(cnt).forEach(function(c){ big[c] = Object.keys(cnt[c]).sort(function(a, b){ return cnt[c][b] - cnt[c][a]; })[0]; });
      const fn = {};
      objs.forEach(function(o){ const v = rd(o, cc); if(self.countryName(v) && big[GST.ORG.country(v)]) fn[v] = (fn[v] || 0) + 1; });
      Object.keys(fn).forEach(function(v){ out.cname.push({ col:cc, v:v, n:fn[v], to:big[GST.ORG.country(v)] }); });
    }
    cols.forEach(function(c){
      if(c === 'state') return;
      const cn = {}; out.cname.forEach(function(x){ if(x.col === c) cn[K(x.v)] = 1; });   // 위에서 이미 짚은 값은 두 번 적지 않는다
      const known = {}; (groups || []).forEach(function(g){ known[K(g[c])] = 1; });
      const seen = {};
      objs.forEach(function(o){ const v = o[c] == null ? '' : String(o[c]).trim(); if(v && !known[K(v)] && !cn[K(v)]) seen[v] = (seen[v] || 0) + 1; });
      Object.keys(seen).sort(function(a, b){ return seen[b] - seen[a]; }).forEach(function(v){
        const o0 = objs.find(function(o){ return String(o[c] == null ? '' : o[c]).trim() === v; });
        const r = o0 ? rd(o0, c) : v;
        out.fresh.push({ col:c, v:v, n:seen[v], read:r, mean:self.mean(c, r) });
      });
    });
    if(cols.indexOf('state') >= 0) objs.forEach(function(o){ if(!K(rd(o, 'state'))){ out.blankState++; if(o.fab_in) out.blankStateDated++; } });
    return out;
  },
  /* 규칙이 먹는 표의 스펙 — 미러 셋은 SPEC 정본 그대로, 인원현황은 «조직 칸만» 아는 작은 스펙(v161).
     ⚠ 인원 SPEC 을 GST.SM.SPEC 에 넣지 않는다 — 그 이름표는 gen-ddl·업로드·봇이 «미러 표»로 읽는다(넣으면 sheet_roster 미러를 만들려 든다).
     열 이름은 Import 표의 실제 머리글이다(새 한글 양식 · 옛 영문 양식 Work Place 는 단지의 별칭). 전부 opt — 없는 양식이 거부되지 않게. */
  XSPEC: {
    roster: { name:'인원현황', hints:[['입사일','Date of entry']], scan:6,
      opt:['op','customer','campus','line','region'],
      fields:{ op:['운영단위'], customer:['고객사'], campus:['단지','Work Place'], line:['라인'], region:['구분'] } }
  },
  spec: function(tbl){ return GST.SM.SPEC[tbl] || this.XSPEC[tbl] || null; },
  /* 2차원 배열(머리글 + 행)에 적용 — 바뀐 행만 복사한다(캐시가 든 원본 배열을 고치지 않는다). */
  apply: function(tbl, rows){
    const S = this.spec(tbl), by = this.compile(tbl), cols = Object.keys(by);
    const out = { rows:rows, n:0, cells:0, rules:cols.reduce(function(a, c){ return a + by[c].length; }, 0) };
    if(!S || !cols.length || !rows || rows.length < 2) return out;
    const m = GST.SM.map(rows, S); if(m.hi < 0) return out;
    const C = m.C, need = cols.filter(function(c){ return C[c] >= 0; });
    if(!need.length) return out;
    const res = rows.slice(), self = this;
    for(let i = m.hi + 1; i < rows.length; i++){
      const r = rows[i]; if(!r) continue;
      const get = function(f){ return C[f] >= 0 ? r[C[f]] : ''; };
      let cp = null;
      need.forEach(function(c){
        const hit = self.pick(by[c], get, c);
        if(hit && String(hit.val) !== String(r[C[c]] == null ? '' : r[C[c]])){ if(!cp) cp = r.slice(); cp[C[c]] = hit.val; out.cells++; }
      });
      if(cp){ res[i] = cp; out.n++; }
    }
    out.rows = res;
    return out;
  }
};
/* ---------- 사이트 등록부 (v160 · setup-23) ----------
   CIP 사이트(F11·F16)가 코드 열 군데에 박혀 있어 새 사이트(F18)는 코드를 고치지 않으면 못 넣었다.
   이제 «어느 사이트가 CIP 표를 갖는가»를 site_registry 가 말한다 — CIP 화면·업로드·데이터 관리가 같은 목록을 본다.
   · 옛 두 사이트는 지금까지의 길(gid → fetchCSVCached)을 그대로 지난다 — 숫자가 한 자리도 안 움직인다.
     새 사이트에는 시트 gid 가 없으므로 표에서 바로 읽고 적용일자 띠를 같은 함수(GST._cipBand)로 되살린다.
   · ⚠ 등록부를 못 읽으면(표 없음·정책 미적용·인증 꺼짐·오프라인) 옛 두 사이트로 «말하며» 돌아간다(GST._siteWhy).
     비면 CIP 화면이 통째로 빈다 — 그건 지금보다 나쁘다.
   · CIP 를 한 표로 합치지 않는다 — 적용일자 띠가 열마다 «최초 완료일»이라 합치면 공통 항목의 띠가 움직인다(setup-23 머리 주석). */
GST.CIP_DEFAULT = [
  { fab:'F11', label:'MICRON F11', cip_table:'sheet_cip_f11', region:'해외', gid:'2123129719' },
  { fab:'F16', label:'MICRON F16', cip_table:'sheet_cip_f16', region:'해외', gid:'1999732389' }
];
GST._siteP = null;
GST._siteWhy = '';
/* client 를 주면(데이터 관리 — 자기 연결을 쓴다) USE_DB 스위치와 무관하게 그 연결로 읽는다 */
GST.sites = function(force, client){
  if(GST._siteP && !force) return GST._siteP;
  const gidOf = {}; GST.CIP_DEFAULT.forEach(function(d){ gidOf[d.cip_table] = d.gid; });
  const fallback = function(why){ GST._siteWhy = why; return GST.CIP_DEFAULT.map(function(d){ return Object.assign({ fallback:true }, d); }); };
  GST._siteP = (async function(){
    if(!client && !(GST.USE_DB && GST.authOn && GST.authOn())) return fallback('off');
    try{
      const c = client || await GST.db(); if(!c) return fallback('off');
      const r = await c.from('site_registry').select('*').order('fab');
      if(r.error) return fallback('read: ' + r.error.message);
      if(!r.data || !r.data.length) return fallback('empty');
      GST._siteWhy = '';
      return r.data.map(function(x){ return Object.assign({}, x, { gid: gidOf[x.cip_table] || '' }); });
    }catch(e){ return fallback('read: ' + (e && e.message || e)); }
  })();
  return GST._siteP;
};
GST.cipSites = async function(force, client){
  return (await GST.sites(force, client)).filter(function(s){ return !!s.cip_table; });
};
/* 한 사이트의 CIP 행 — 반환 모양은 fetchCSVCached 와 같다({rows,cached,ageMin,src}).
   ⚠ 새 사이트 표가 비어 있는 것은 «실패»가 아니다(막 등록해 아직 안 올렸다) — empty:true 로 돌려준다. */
GST.cipRows = async function(site, key){
  if(site.gid) return GST.fetchCSVCached(GST.sheetUrl(site.gid), key || ('cip_' + site.fab));
  try{
    const rows = await GST.csvTableRows(site.cip_table);
    const out = [GST._cipBand(rows)].concat(rows);
    GST._srcNote(key || ('cip_' + site.fab), 'db', rows.length - 1);
    return { rows:out, cached:false, ageMin:0, src:'db' };
  }catch(e){
    if(/^EMPTY/.test(String(e && e.message || ''))) return { rows:[], cached:false, ageMin:0, src:'db', empty:true };
    throw e;
  }
};
/* 모든 화면이 지나는 문 — 실적·설치 3표는 여기서 «기준 정보» 규칙을 입힌다(v152). 시트·DB·캐시·오프라인 스냅샷 어느 길로 와도 같다. */
/* 미러가 아닌데 규칙이 먹는 표 — gid → 논리 이름 (v161 · 인원현황) */
GST.VMAP_GID = { '1213453343':'roster' };
GST.fetchCSVCached = async function(url, key){
  const gm = String(url||'').match(/[?&]gid=(\d+)/), tbl = gm && (GST.TABLE_OF_GID[gm[1]] || GST.VMAP_GID[gm[1]]);
  const rp = (tbl && GST.vmap.spec(tbl)) ? GST.vmap.load() : null;
  const r = await GST._fetchCSVCached0(url, key);
  if(rp && r && r.rows){
    try{ await rp; const a = GST.vmap.apply(tbl, r.rows); r.rows = a.rows; GST.vmap.applied[tbl] = { rules:a.rules, rows:a.n, cells:a.cells }; }
    catch(e){ console.warn('[vmap] 적용 실패 — 원본 그대로 보여 줍니다', e); }
  }
  return r;
};
GST._fetchCSVCached0 = async function(url, key){
  const gm = String(url||'').match(/[?&]gid=(\d+)/);
  const table = gm && GST.TABLE_OF_GID[gm[1]];
  /* 지도에 든 표(데모)는 시트·옛 캐시로 되돌아가지 않는다 (v146) — 아래에서 실패하면 그 자리에서 던진다 */
  const ctbl0 = gm && GST.CSV_TABLE_OF_GID[gm[1]];
  const mapped = !!((table && GST.TBL_MAP['sheet_'+table]) || (ctbl0 && GST.TBL_MAP[ctbl0]));
  /* 인증이 꺼진 환경(로컬 파일 열기·검증 스크립트)에서는 Supabase 자체가 없다.
     그건 폴백이 아니라 원래 시트 경로이므로 경고하지 않는다 — 늘 뜨는 경고는 아무도 안 본다. */
  if(table && GST.USE_DB && GST.authOn()){
    try{
      const rows = await GST.dbRows(table);
      if(rows && rows.length>1){ GST.cacheSave(key, rows); GST._srcNote(key,'db',rows.length-1); return {rows, cached:false, ageMin:0, src:'db'}; }
      throw new Error('MIRROR_EMPTY');
    }catch(e){ GST._dbWarn(table, e); if(mapped) throw e; }   // 시트로 되돌아간다(데모 표는 제외). 아래가 그 경로다.
  }
  /* CSV Import 표 (v79). 위 미러와 같은 자리에서 갈라지고 실패하면 똑같이 시트로 되돌아간다.
     모양 복원은 여기서 한다 — 페이지는 자기가 DB 를 보는지 시트를 보는지 모른다. */
  const ctbl = gm && GST.CSV_TABLE_OF_GID[gm[1]];
  if(ctbl && GST.USE_DB && GST.authOn()){
    try{
      let rows = await GST.csvTableRows(ctbl);
      if(/^sheet_cip_/.test(ctbl)) rows = [GST._cipBand(rows)].concat(rows);  // 적용일자 띠 복원
      else if(ctbl === 'sheet_abp') rows = GST._abpWide(rows);                // 크로스탭 복원
      if(rows && rows.length>1){ GST.cacheSave(key, rows); GST._srcNote(key,'db',rows.length-1); return {rows, cached:false, ageMin:0, src:'db'}; }
      throw new Error('EMPTY');
    }catch(e){ GST._dbWarn(ctbl, e); if(mapped) throw e; }
  }
  if(mapped) throw new Error('DB_OFF — 데모 표는 시트 경로가 없다');
  try{
    const rows = await GST.fetchCSV(url);
    if(rows && rows.length>1) GST.cacheSave(key, rows);
    GST._srcNote(key,'sheet',Math.max(0,(rows||[]).length-1));
    return {rows, cached:false, ageMin:0, src:'sheet'};
  }catch(e){
    const c = GST.cacheLoad(key);
    if(c && c.rows){ GST._srcNote(key,'cache',Math.max(0,c.rows.length-1));
      return {rows:c.rows, cached:true, ageMin:Math.round((Date.now()-c.t)/60000)}; }
    throw e;
  }
};

/* ---------- 10. 스켈레톤 로딩 (Stage 3) ---------- */
GST.skeleton=function(on){
  document.querySelectorAll('.kpi,.card,.trend-card,.cross-card,.tablecard,.alert').forEach(el=>el.classList.toggle('skeleton',!!on));
};

/* ---------- 10-b. i18n 적용 한 벌 (v135 · 5단계) ----------
   여덟 페이지가 applyLang 안에서 data-i 루프를 각자 들고 있었고(일곱 벌), data-i-th 는 넷·data-i-ph 는 hr 만
   알았다 — 그래서 검색 placeholder 가 페이지마다 한국어·영어로 갈렸다. 여기 한 벌이 넷 다 본다.
   ⚠ lang 을 같이 받아 sessionStorage 에 남긴다 — core 의 사전(GST.XXX_T)은 GST._lang() 을 보는데, 페이지 메뉴로
     바꾼 언어를 여섯 페이지가 window.name 에만 적고 있어 사이드바·칩·배지만 옛 언어로 남았다. */
GST.applyI18n = function(t, lang){
  if(lang){ try{ sessionStorage.setItem('gst_lang', lang); }catch(e){} }
  const q = function(sel, fn){ document.querySelectorAll(sel).forEach(fn); };
  q('[data-i]', function(el){ if(el.hasAttribute('data-lock')) return; el.textContent = t(el.getAttribute('data-i')); });
  q('[data-i-th]', function(el){ el.textContent = t(el.getAttribute('data-i-th')); });
  q('[data-i-ph]', function(el){ el.placeholder = t(el.getAttribute('data-i-ph')); });
  q('[data-i-title]', function(el){ el.title = t(el.getAttribute('data-i-title')); });
  try{ GST.filters.relabel(); }catch(e){}
  try{ GST.relabelChrome(); }catch(e){}
  try{ GST._srcChip(); }catch(e){}
};
/* 카드 노트 한 곳 (report·cip 이 byte 까지 같은 사본을 들고 있었다). sev='warn' 이면 색·굵기로 «화면 전체의 뜻이
   바뀌는 경고»를 가른다(v92 규약대로 자리는 노트 맨 앞 그대로). 줄바꿈이 든 문장은 pre-line 으로 — 마크업을
   넣지 않는 이유는 applyLang·setNote 가 textContent 로 덮기 때문이다(v131). */
GST.setNote = function(canvasId, txt, sev){
  const c = document.getElementById(canvasId); if(!c) return;
  const card = c.closest(GST.CARD_SEL || '.card'); if(!card) return;
  const n = card.querySelector('.card-note'); if(!n) return;
  n.textContent = txt;
  n.classList.toggle('warn', sev === 'warn');
  n.classList.toggle('ml', String(txt||'').indexOf('\n') >= 0);
};
/* 앵커 목차 — 세로로 이어 읽는 긴 페이지(주간현황)용. GST.sectionNav 는 «숨기는 탭»이라 맞지 않는다. */
GST.anchorNav = function(sel){
  const hs = Array.from(document.querySelectorAll(sel || '.sec-h')); if(hs.length < 2) return;
  let nav = document.getElementById('gstAnchors');
  if(!nav){ nav = document.createElement('nav'); nav.id = 'gstAnchors'; nav.className = 'gst-anchors';
    hs[0].parentNode.insertBefore(nav, hs[0]); }
  nav.innerHTML = hs.map(function(h, i){
    if(!h.id) h.id = 'sec-' + i;
    const lbl = (h.firstElementChild && h.firstElementChild.textContent) || h.textContent;
    return '<a href="#' + h.id + '" data-sec-id="' + h.id + '">' + GST._esc(String(lbl).trim()) + '</a>';
  }).join('');
  nav.onclick = function(ev){
    const a = ev.target.closest('a[data-sec-id]'); if(!a) return;
    ev.preventDefault();
    const el = document.getElementById(a.dataset.secId);
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  };
};
/* 사이드바 껍데기(제목·프리셋·초기화·자동 새로고침)의 이름표를 지금 언어로 — initSidebar 가 한 번 만든 뒤 언어가
   바뀌면 여기가 다시 쓴다. 자동 새로고침 캡션은 initSidebar 가 남긴 GST._arSync 로. */
GST.relabelChrome = function(){
  const T = GST._fltT();
  document.querySelectorAll('.gst-sb-ttxt').forEach(function(el){ el.textContent = T.filters; });
  document.querySelectorAll('.gst-sb-lbl[data-lbl]').forEach(function(el){ el.textContent = T[el.dataset.lbl] || el.textContent; });
  document.querySelectorAll('.gst-preset[data-p]').forEach(function(el){ el.textContent = T['p'+el.dataset.p] || el.textContent; });
  document.querySelectorAll('.gst-sb-reset').forEach(function(el){ el.textContent = T.reset; });
  document.querySelectorAll('.gst-sb-tool[data-tool="csv"]').forEach(function(el){ el.title = T.csvTitle; });
  document.querySelectorAll('.gst-sb-toggle').forEach(function(el){ el.title = T.filters; });
  if(typeof GST._arSync === 'function'){ try{ GST._arSync(); }catch(e){} }
  const fc = document.getElementById('fchips');
  if(fc && fc.dataset.gst){
    fc.querySelectorAll('.gst-fchips-l').forEach(function(el){ el.textContent = T.chipsActive; });
    fc.querySelectorAll('.gst-fchips-c').forEach(function(el){ el.textContent = T.chipsClear; });
    try{ GST._chipsRender(); }catch(e){}
  }
};

/* ---------- 11. 필터 상태 URL 공유 (Stage 4) ---------- */
/* 다중선택(Set)도 실어야 한다. JSON.stringify(new Set) 은 '{}' 가 되므로 그대로 두면
   ① 링크에 FAB 선택이 안 담기고 ② 복원할 때 F.fab 이 빈 객체로 덮여 .has 가 사라진다
   (실제로 자재현황이 이 순서로 죽었다: "sel.has is not a function"). 배열로 눕혀 담는다. */
GST.encodeState=function(F){
  const a={}; Object.entries(F).forEach(([k,v])=>{
    if(v instanceof Set){ if(v.size) a[k]=Array.from(v); return; }
    if(v!==''&&v!=null&&v!=='ALL') a[k]=v;
  });
  if(!Object.keys(a).length) return '';
  return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(a)))));
};
GST.decodeState=function(s){
  try{ return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(s))))); }catch(e){ return null; }
};
/* 복원은 Object.assign 으로 하면 안 된다 — 배열이 Set 자리를 차지한다.
   현재 F 의 타입을 기준으로 되살린다. 페이지는 이 함수만 부르면 된다. */
GST.applyState=function(F, st){
  if(!st) return F;
  Object.keys(st).forEach(function(k){
    if(!(k in F)) return;
    if(F[k] instanceof Set){ F[k].clear(); [].concat(st[k]||[]).forEach(function(v){ F[k].add(v); }); }
    else F[k]=st[k];
  });
  return F;
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
GST.DELTA_ABS_MAX=10;
GST.deltaBadge=function(cur,prev,goodWhenDown){
  const p=GST.pctDelta(cur,prev);
  if(p===null) return '';
  /* 기준이 작으면 %가 과장된다 — 1건→9건이 「▲800%」로 떠 화면에서 가장 큰 경보가 됐다(v148).
     직전값이 DELTA_ABS_MAX 미만이면 «건수 차이»로 적는다. 색 규칙은 그대로다. */
  if(Math.abs(prev)<GST.DELTA_ABS_MAX && cur!==prev){
    const upA=cur>prev, goodA=goodWhenDown?!upA:upA;
    return '<span style="font-size:10px;font-weight:800;color:'+(goodA?'var(--ok,#4ade80)':'var(--bad,#fb7185)')+'">'
      +(upA?'▲ +':'▼ −')+Math.abs(Math.round((cur-prev)*10)/10).toLocaleString()+'</span>';
  }
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
// 특정 연/월 행 (dateKey는 Date 필드명) — 판정은 여기 한 곳뿐이다.
// ⚠ monthCount 가 «세기만» 해서, KPI 팝업이 같은 달을 페이지에서 다시 걸러야 했다.
//    두 식이 되면 카드와 목록이 갈린다(제2원칙) — 그래서 «거른 배열»을 내는 형제를 둔다.
GST.monthRows=function(arr,dateKey,y,m){
  return arr.filter(x=>{const d=x[dateKey];return d&&d.getUTCFullYear()===y&&d.getUTCMonth()===m;});
};
// 특정 연/월 건수 (dateKey는 Date 필드명)
GST.monthCount=function(arr,dateKey,y,m){ return GST.monthRows(arr,dateKey,y,m).length; };

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
  box.innerHTML = '<span class="gst-ins-head">'+GST.insHead()+'</span>' +
    items.slice(0,4).map(function(it){
      return '<span class="gst-ins '+(it.sev||'info')+'"><span class="gst-ins-dot"></span>'+it.text+'</span>';
    }).join('');
};

/* ---------- 데이터 품질 레지스트리 (v135 · 7단계) ----------
   무엇을 고치려는 것인가. 자료 결함 신호가 여덟 페이지에 마흔 곳 가까이 흩어져 있고
   **모으는 자리가 없었다.** 게다가 절반은 «사실»만 말한다 — 「날짜 이상 데이터 12건」
   을 본 사람이 무엇을 해야 하는지 화면 어디에도 없다. 그래서 레지스트리 하나를 두고
   **`act`(무엇을 하면 되나)를 필수로** 받는다.

   ⚠ 문구를 새로 짜지 않는다 — 각 페이지가 «이미 쓰고 있는 그 문장»이 정본이다.
     여기서 다시 만들면 같은 결함을 화면과 카드가 다른 말로 적게 된다(제2원칙).
   ⚠ 사실은 모두에게, 조치는 관리자에게 (A-4 · v135 2단계).
     숫자의 뜻이 바뀌는 사실을 조회자에게서 지우면 그 사람만 경고 없이 빈 숫자를 본다
     (core 의 「조용히 틀린 숫자를 보여주지 않는다」와 정면 충돌). 가리는 것은 «조치»뿐이고,
     그 자리에는 「관리자에게 알려 주세요」가 들어간다.
   ⚠ 이 수치는 «지금 걸린 필터» 기준이다 — 카드 머리에 기준 시각과 필터를 함께 적는다.
     안 적으면 필터를 걸어 둔 사람이 전사 수치로 읽는다.                                */
GST.DQ_T = {
  ko:{title:'데이터 품질', none:'이 화면에서 발견된 자료 문제가 없습니다',
      what:'무엇이', n:'건수', act:'무엇을 하면 되나',
      tell:'관리자에게 알려 주세요', basis:'기준 {t} · 필터 {f}', all:'전체', go:'데이터 관리에서 고치기', fix:'찾아서 고치기'},
  en:{title:'Data quality', none:'No data problems found on this page',
      what:'Finding', n:'Count', act:'What to do',
      tell:'Let an administrator know', basis:'as of {t} · filter {f}', all:'all', go:'Fix in Data management', fix:'Find & fix'},
  zh:{title:'数据质量', none:'本页未发现数据问题',
      what:'问题', n:'件数', act:'该怎么做',
      tell:'请告知管理员', basis:'基准 {t} · 筛选 {f}', all:'全部', go:'在数据管理中修正', fix:'查找并修正'},
  ja:{title:'データ品質', none:'この画面で見つかった資料の問題はありません',
      what:'内容', n:'件数', act:'何をすればよいか',
      tell:'管理者にお知らせください', basis:'基準 {t} · フィルタ {f}', all:'全体', go:'データ管理で修正', fix:'探して修正'}
};
GST._dqT = function(){ return GST.DQ_T[(GST._lang && GST._lang()) || 'ko'] || GST.DQ_T.ko; };
GST.dq = {
  _page:'', _l:[],
  /* render() 첫머리에서 부른다 — 다시 그릴 때마다 새로 센다.
     누적하면 필터를 두 번 바꿨을 때 같은 결함이 두 줄로 뜬다. */
  reset:function(page){ this._page=page||this._page||''; this._l=[]; return this; },
  /* o = {key, sev:'bad'|'warn'|'info', label, n, of, act}
     - label 은 «이미 화면에 쓰는 그 문장»을 그대로 넘긴다(번역 완료된 문자열).
     - act 가 없으면 담지 않는다. «무엇을 하면 되는지»가 이 레지스트리의 존재 이유다. */
  push:function(o){
    if(!o || !o.label) return this;
    if(!o.act){ console.warn('[gst.dq] act 없는 신호는 담지 않는다 —', o.key||o.label); return this; }
    this._l.push({key:o.key||'', sev:o.sev||'warn', label:String(o.label),
                  n:(o.n==null?null:o.n), of:(o.of==null?null:o.of), act:String(o.act)});
    return this;
  },
  list:function(){ return this._l.slice(); },
  /* 페이지 하단에 카드 한 벌. render() 끝에서 부른다(신호를 다 담은 뒤). */
  render:function(filterLabel){
    const T=GST._dqT(), esc=GST._esc, adm=!!(GST.isAdmin && GST.isAdmin());
    /* v155 — 화면 맨 아래 카드가 아니라 «팝업»이다(사용자: 「데이터 품질 표를 데이터 관리 페이지로 옮기고」).
       본 자리는 데이터 관리 「데이터 품질」 탭이고(아래 스냅샷을 읽는다), 각 화면에서는 요약 띠의 «확인할 것 N»을
       누르면 이 표가 뜬다. ⚠ 지우지 않고 감추는 이유 — 조회자도 «사실»은 봐야 한다(A-4 · 지우면 그 사람만 경고 없이
       빈 숫자를 본다). 관리자에게는 데이터 관리로 가는 단추를 붙인다. */
    let box=document.getElementById('gstDq');
    if(!box){
      box=document.createElement('div'); box.id='gstDq'; box.className='card gst-dq gst-dq-pop'; box.hidden=true;
      box.setAttribute('role','dialog');
      document.body.appendChild(box);
      document.addEventListener('keydown', function(e){ if(e.key==='Escape') box.hidden=true; });
      box.addEventListener('click', function(e){
        if(e.target.closest('[data-dqx]')) box.hidden=true;
        if(e.target.closest('[data-dqgo]')){ try{ window.open('/edit/?tab=dq','gstEdit'); }catch(x){} box.hidden=true; }
        /* v156 — 신호 한 줄의 «고칠 자리»로 바로 간다(사용자: 「경고만 주지 어디서 어떻게 고치는지 길잡이가 없다」).
           무엇을 어디서 여는지는 데이터 관리의 DQ_FIX 한 곳이 정한다(모르는 신호면 데이터 품질 탭만 연다). */
        const fx=e.target.closest('[data-dqfix]');
        if(fx){ try{ window.open('/edit/?tab=dq&fix='+encodeURIComponent(fx.getAttribute('data-dqfix')),'gstEdit'); }catch(x){} box.hidden=true; }
      });
    }
    const ts=new Date(), p2=function(v){ return String(v).padStart(2,'0'); };
    const basis=T.basis.replace('{t}', ts.getFullYear()+'-'+p2(ts.getMonth()+1)+'-'+p2(ts.getDate())
                 +' '+p2(ts.getHours())+':'+p2(ts.getMinutes()))
                .replace('{f}', filterLabel || T.all);
    const head='<div class="gst-dq-hd"><h3>'+esc(T.title)+'</h3><span style="flex:1"></span>'
      +(adm?'<button type="button" class="gst-dq-go" data-dqgo>'+esc(T.go)+'</button>':'')
      +'<button type="button" class="gst-dq-x" data-dqx aria-label="close">✕</button></div><div class="card-note">'+esc(basis)+'</div>';
    const page=this._page||'page';
    if(!this._l.length){ box.innerHTML=head+'<div class="gst-dq-ok">'+esc(T.none)+'</div>'; }
    else {
      const rows=this._l.map(function(d){
        const cnt=d.n==null ? '' : (d.n.toLocaleString()+(d.of==null?'':' / '+d.of.toLocaleString()));
        return '<tr class="dq-'+d.sev+'"><td>'+esc(d.label)+'</td><td class="dq-n">'+esc(cnt)+'</td>'
             + '<td>'+esc(adm ? d.act : T.tell)+'</td>'
             + (adm ? '<td><button type="button" class="gst-dq-go" data-dqfix="'+esc(page+'.'+d.key)+'">'+esc(T.fix)+'</button></td>' : '')+'</tr>';
      }).join('');
      box.innerHTML=head+'<div style="overflow-x:auto"><table class="gst-dq-t"><thead><tr><th>'+esc(T.what)
        +'</th><th>'+esc(T.n)+'</th><th>'+esc(T.act)+'</th>'+(adm?'<th></th>':'')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
    }
    /* /diag/ 가 여덟 페이지를 한 표로 모을 수 있게 스냅샷을 남긴다.
       ⚠ 진단 화면이 페이지를 여덟 개 띄우지 않아도 되게 하려는 것뿐이다 —
         그래서 «언제·어떤 필터로 잰 것인지»를 같이 담는다. 없으면 오래된 수치를
         지금 것으로 읽는다. localStorage 는 그 브라우저 안에만 산다(공유되지 않는다). */
    GST._dqChip(this._l);
    try{ localStorage.setItem('gst_dq_'+(this._page||'page'),
      JSON.stringify({at:ts.getTime(), filter:filterLabel||'', items:this._l})); }catch(e){}
    return this;
  }
};

/* 요약 띠 끝에 «확인할 것 N» 한 칸 (v148 · 5단계).
   데이터 품질 카드는 페이지 맨 아래라 아무도 거기까지 안 내려간다 — 숫자의 뜻이 바뀌는 경고가
   묻힌다. 그래서 warn·bad 신호가 있으면 첫 화면 요약 띠에 개수만 띄우고, 누르면 카드로 내려간다.
   ⚠ 문장을 옮기지 않는다(개수만) — 문장은 카드 한 곳이 정본이다. info 는 세지 않는다. */
GST.DQCHIP_T={ko:'확인할 것 {n}',en:'{n} to check',zh:'待确认 {n}',ja:'要確認 {n}'};
GST._dqChip=function(list){
  try{
    const n=(list||[]).filter(function(d){ return d.sev==='warn'||d.sev==='bad'; }).length;
    let el=document.getElementById('gstDqChip');
    if(!n){ if(el) el.remove(); return; }
    let box=document.getElementById('gstInsights');
    if(!box){
      const anchor=document.querySelector('.kpis'); if(!anchor||!anchor.parentNode) return;
      box=document.createElement('div'); box.id='gstInsights'; box.className='gst-insights';
      box.innerHTML='<span class="gst-ins-head">'+GST.insHead()+'</span>';
      anchor.parentNode.insertBefore(box, anchor);
    }
    if(!el||el.parentNode!==box){ if(el) el.remove();
      el=document.createElement('button'); el.type='button'; el.id='gstDqChip'; el.className='gst-dqchip';
      el.onclick=function(){ const c=document.getElementById('gstDq'); if(c) c.hidden=false; };   // v155 — 팝업으로 연다(맨 아래 카드는 없앴다)
      box.appendChild(el); }
    const T=GST.DQCHIP_T[(GST._lang&&GST._lang())||'ko']||GST.DQCHIP_T.ko;
    el.textContent='⚠ '+T.replace('{n}',n);
  }catch(e){ console.warn('[gst.dq] 요약 띠', e); }
};

/* KPI 숫자가 카드 폭을 넘으면 «줄바꿈» 대신 글자를 줄인다 (v148).
   「45% · 50%」가 두 줄로 꺾여 카드 높이가 제각각이 됐다. 값이 바뀔 때마다 다시 잰다. */
GST.fitKpis=function(root){
  try{
    (root||document).querySelectorAll('.kpi .val').forEach(function(v){
      v.style.fontSize='';
      const row=v.closest('.krow')||v.parentNode; if(!row) return;
      const avail=row.clientWidth-((row.querySelector('.kd')||{}).offsetWidth||0)-6;
      if(avail>0 && v.scrollWidth>avail){
        const base=parseFloat(getComputedStyle(v).fontSize)||28;
        v.style.fontSize=Math.max(15, Math.floor(base*avail/v.scrollWidth))+'px';
      }
    });
  }catch(e){}
};
(function(){
  if(typeof document==='undefined'||typeof MutationObserver==='undefined') return;
  let tm=0; const kick=function(){ clearTimeout(tm); tm=setTimeout(function(){ GST.fitKpis(); },60); };
  const arm=function(){
    document.querySelectorAll('.kpis').forEach(function(k){
      if(k._gstFit) return; k._gstFit=1;
      new MutationObserver(kick).observe(k,{subtree:true,childList:true,characterData:true});
    });
    kick();
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',arm); else arm();
  window.addEventListener('resize',kick);
})();

/* 자료 성적표 (v148 · 2단계) — 올리는 순간 «무엇이 이상한지»를 센다.
   왜: 알람유형 입력률 0.3% 같은 사실을 현장이 «올린 그 자리»에서 못 보면 품질이 영원히 안 오른다.
   업로드 검사 화면이 부르고, 결과(점수)는 업로드 이력에도 남는다.
   ⚠ 막지 않는다 — 판정은 «알리는 것»뿐이다. 막는 규칙은 업로드 검사(날짜 형식·op)에 이미 있다.
   ⚠ 어느 열이 «중요한가»는 표마다 다르므로 부르는 쪽이 준다(opt.key). 여기에 표 이름을 박지 않는다.
   rows = 업로드 직전의 행 객체 배열(snake 열 이름) · opt = {key:[열], date:'열', num:[열], cap:{열:최댓값}, by:'op'} */
GST.qa=function(rows, opt){
  opt=opt||{}; rows=rows||[];
  const N=rows.length, blank=v=>v==null||String(v).trim()==='';
  const pct=(a,b)=>b?Math.round(a/b*1000)/10:0;
  const res={n:N, fill:[], date:null, num:[], months:[], by:[], issues:[], score:100, grade:'A'};
  if(!N) return res;
  const cols=Object.keys(rows[0]).filter(k=>k!=='src_row'&&k!=='extra');
  const keyCols=(opt.key||[]).filter(k=>cols.indexOf(k)>=0);
  // ① 열별 입력률 — 중요 열 전부 + 그 밖에서 낮은 순 몇 개
  const fillOf=k=>{ let g=0; for(const r of rows) if(!blank(r[k])) g++; return g; };
  const all=cols.map(k=>({col:k, got:fillOf(k)})).map(x=>Object.assign(x,{pct:pct(x.got,N), key:keyCols.indexOf(x.col)>=0}));
  res.fill=all.filter(x=>x.key).concat(all.filter(x=>!x.key&&x.pct<50&&x.got>0).sort((a,b)=>a.pct-b.pct).slice(0,5));
  // ② 날짜 — 해석 불가 · 미래 · 2010 이전
  if(opt.date && cols.indexOf(opt.date)>=0){
    const today=new Date(); const lim=new Date(today.getTime()+86400000).toISOString().slice(0,10);
    let bad=0, fut=0, old=0; const mon={};
    for(const r of rows){ const v=String(r[opt.date]==null?'':r[opt.date]).slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){ bad++; continue; }
      if(v>lim) fut++; else if(v<'2010-01-01') old++;
      const m=v.slice(0,7); mon[m]=(mon[m]||0)+1; }
    res.date={col:opt.date, bad:bad, future:fut, old:old};
    // ③ 달마다 행 수 — 앞뒤 달(덜 찬 달)을 뺀 중앙값의 절반에 못 미치면 «빠졌나?»
    const ks=Object.keys(mon).sort();
    res.months=ks.map(k=>({ym:k, n:mon[k]}));
    if(ks.length>=4){
      const mid=ks.slice(1,-1).map(k=>mon[k]).sort((a,b)=>a-b), med=mid[Math.floor(mid.length/2)];
      ks.slice(1,-1).forEach(k=>{ if(mon[k]<med*0.5) res.issues.push({sev:'warn', kind:'month_low', ym:k, n:mon[k], med:med}); });
    }
    if(bad) res.issues.push({sev:'warn', kind:'date_bad', n:bad});
    if(fut) res.issues.push({sev:'bad', kind:'date_future', n:fut});
    if(old) res.issues.push({sev:'warn', kind:'date_old', n:old});
  }
  // ④ 숫자 — 음수 · 상한 초과
  (opt.num||[]).filter(k=>cols.indexOf(k)>=0).forEach(k=>{
    let neg=0, over=0; const cap=opt.cap&&opt.cap[k];
    for(const r of rows){ if(blank(r[k])) continue; const v=GST.numv(r[k]); if(!isFinite(v)) continue;
      if(v<0) neg++; if(cap!=null && v>cap) over++; }
    res.num.push({col:k, neg:neg, over:over, cap:cap==null?null:cap});
    if(neg) res.issues.push({sev:'bad', kind:'neg', col:k, n:neg});
    if(over) res.issues.push({sev:'warn', kind:'over', col:k, n:over, cap:cap});
  });
  // ⑤ 사이트(운영단위)별 — 중요 열 평균 입력률
  if(opt.by && cols.indexOf(opt.by)>=0 && keyCols.length){
    const g={}; for(const r of rows){ const b=String(r[opt.by]==null?'':r[opt.by]).trim()||'(빈칸)'; (g[b]=g[b]||[]).push(r); }
    res.by=Object.keys(g).map(b=>{ const L=g[b];
      const f=keyCols.map(k=>{ let x=0; for(const r of L) if(!blank(r[k])) x++; return pct(x,L.length); });
      return {v:b, n:L.length, fill:Math.round(f.reduce((a,c)=>a+c,0)/f.length)}; }).sort((a,b)=>b.n-a.n);
  }
  // 점수 — 중요 열 평균 입력률에서 문제 비율만큼 깎는다(설명 가능한 단순식)
  const base=keyCols.length ? res.fill.filter(x=>x.key).reduce((a,x)=>a+x.pct,0)/keyCols.length : 100;
  const badN=res.issues.filter(i=>i.kind!=='month_low').reduce((a,i)=>a+(i.n||0),0);
  res.score=Math.max(0, Math.round(base - pct(badN,N)*2 - res.issues.filter(i=>i.kind==='month_low').length*3));
  res.grade=res.score>=90?'A':res.score>=75?'B':res.score>=60?'C':'D';
  return res;
};

/* 고장 위험 설비 순위 (v148 · 3단계) — «세는 화면»에서 «이번 주 무엇을 할지»로.
   점수는 설명 가능한 단순식이다(기계학습 아님). 원인 코드가 거의 비어 있는 동안(입력률 ~10%)은
   «왜»를 못 배우므로, «언제·얼마나 자주»만 본다 — 그 한계를 카드 주석이 밝힌다.
     최근 90일 BM 1건당 3점 · 재고장(직전 BM 후 14일 안에 또) 1건당 4점
     · 직전 90일보다 2건 이상 늘면 3점 · 마지막 BM 이 14일 안이면 2점
     · PM 지연: 마지막 PM 이 180일보다 오래됐거나 180일 안에 PM 기록이 없으면 4점
   ⚠ 행 모양을 페이지마다 다시 맞추지 않게 «사건 목록»만 받는다 — 무엇이 BM 이고 무엇이 PM 인지는
     부르는 쪽이 이미 쓰는 정본(KPI 카드의 bmRowsIn · GST.PM.is)으로 고른다. 여기서 다시 판정하면
     카드와 순위표가 다른 BM 을 센다(제2원칙).
   ev = {bm:[{key,label,site,d:Date}], pm:[{key,d:Date}], asOf:Date, n:20}
   반환: [{key,label,site,score,bm90,bmPrev,rep,lastBm,lastPm,why:['bm90','rep','up','recent','pm']}] */
GST.RISK_W={bm:3, rep:4, up:3, recent:2, pm:4, repDays:14, recentDays:14, pmDays:180};
GST.snKey=function(v){ return String(v==null?'':v).toUpperCase().replace(/[^0-9A-Z가-힣]/g,''); };
GST.riskRank=function(ev){
  const W=GST.RISK_W, DAY=86400000, asOf=ev.asOf||new Date(), t0=asOf.getTime();
  const U={};
  (ev.bm||[]).forEach(function(e){ if(!e||!e.key||!(e.d instanceof Date)||isNaN(e.d)) return;
    const dt=e.d.getTime(); if(dt>t0) return;
    const u=U[e.key]||(U[e.key]={key:e.key,label:e.label||e.key,site:e.site||'',bm:[],lastPm:null});
    if(!u.site&&e.site) u.site=e.site; u.bm.push(dt); });
  (ev.pm||[]).forEach(function(e){ if(!e||!e.key||!U[e.key]||!(e.d instanceof Date)) return;
    const dt=e.d.getTime(); if(dt>t0) return; if(U[e.key].lastPm==null||dt>U[e.key].lastPm) U[e.key].lastPm=dt; });
  const out=[];
  Object.keys(U).forEach(function(k){
    const u=U[k], b=u.bm.sort(function(a,c){return a-c;});
    const in90=b.filter(function(x){return x>t0-90*DAY;}).length;
    const prev90=b.filter(function(x){return x<=t0-90*DAY&&x>t0-180*DAY;}).length;
    if(in90+prev90<2) return;                       // 한 번 난 설비는 «위험»이 아니라 사건이다
    let rep=0; for(let i=1;i<b.length;i++) if(b[i]>t0-180*DAY && b[i]-b[i-1]<=W.repDays*DAY && b[i]!==b[i-1]) rep++;
    const last=b[b.length-1], why=[]; let sc=0;
    if(in90){ sc+=in90*W.bm; why.push('bm90'); }
    if(rep){ sc+=rep*W.rep; why.push('rep'); }
    if(in90-prev90>=2){ sc+=W.up; why.push('up'); }
    if(last>t0-W.recentDays*DAY){ sc+=W.recent; why.push('recent'); }
    if(u.lastPm==null||u.lastPm<t0-W.pmDays*DAY){ sc+=W.pm; why.push('pm'); }
    out.push({key:k,label:u.label,site:u.site,score:sc,bm90:in90,bmPrev:prev90,rep:rep,
              lastBm:new Date(last),lastPm:u.lastPm==null?null:new Date(u.lastPm),why:why});
  });
  out.sort(function(a,c){ return c.score-a.score || c.bm90-a.bm90 || c.lastBm-a.lastBm; });
  return out.slice(0, ev.n||20);
};
GST.RISK_T={
  ko:{bm90:'최근 90일 고장 {n}건', rep:'{d}일 이내 재고장 {n}회', up:'직전 90일 대비 +{n}건', recent:'최근 {d}일 이내 고장', pm:'{d}일 넘게 PM 미실시'},
  en:{bm90:'{n} BM in 90d', rep:'{n} repeat within {d}d', up:'+{n} vs prior 90d', recent:'failed in last {d}d', pm:'no PM for {d}d+'},
  zh:{bm90:'近90天故障 {n}件', rep:'{d}天内复发 {n}次', up:'较前90天 +{n}', recent:'近{d}天内故障', pm:'超过{d}天未PM'},
  ja:{bm90:'直近90日故障 {n}件', rep:'{d}日以内再故障 {n}回', up:'前90日比 +{n}', recent:'直近{d}日で故障', pm:'PM {d}日以上なし'}
};
GST.riskWhy=function(r){
  const T=GST.RISK_T[(GST._lang&&GST._lang())||'ko']||GST.RISK_T.ko;
  const n={bm90:r.bm90, rep:r.rep, up:r.bm90-r.bmPrev, recent:'', pm:''};
  /* 기간({d})도 판정 기준(GST.RISK_W)을 따른다 — 「운영 목표 › 판정 기준」에서 바꾸면 이유 문장도 같이 바뀐다(v172) */
  const W=GST.RISK_W, d={rep:W.repDays, recent:W.recentDays, pm:W.pmDays};
  return r.why.map(function(w){ return T[w].replace('{n}',n[w]).replace('{d}',d[w]); }).join(' · ');
};

/* ---------- 지도 자료 · 위치 판정 (v171 · 「나라를 누르면 그 나라 지도로」) ----------
   모양은 assets/geo/*.json(tools/geo-build.mjs 가 공개 자료로 만든다 · Natural Earth · world-atlas) — 화면은 읽기만 한다.
   설비의 위치는 «설치현황의 지역 · 단지 · FAB» 값으로 정한다. 정하는 순서(위가 이긴다):
     ① geo_places(setup-26 · 사람이 정한 좌표) — 그 값 그대로 → 괄호를 뗀 값 → 끝 숫자를 뗀 값(P1 → P · 단지 코드 묶음)
     ② 그 나라 행정구역 이름과 «정확히» 같은 값(네 언어 · 시·현·City 같은 꼬리는 뗀다 — 부분일치 아님 · 제1원칙)
     ③ 못 정함 → null. 화면이 «위치 미지정»으로 대수와 함께 밝힌다(조용히 빼지 않는다 · 짐작하지 않는다).
   ⚠ 고객사 단지 코드(P1·H2)가 어느 도시인지를 코드에 박지 않는다 — DB 의 geo_places 가 정한다(데이터 관리 「사이트」 탭에서 고친다). */
GST.geo = {
  BASE:'https://gstcsglobal-cloud.github.io/assets/geo/',
  CC:{ KR:{id:'410',cty:'KOREA'}, TW:{id:'158',cty:'TAIWAN'}, CN:{id:'156',cty:'CHINA'}, JP:{id:'392',cty:'JAPAN'}, US:{id:'840',cty:'USA'}, SG:{id:'702',cty:'SINGAPORE'} },
  /* 지도 범위를 정할 때 빼는 먼 조각(그려는 진다) — 미국 알래스카·하와이 · 대만 진먼·롄장 · 중국 남중국해 섬 */
  FAR:{ 'US-AK':1, 'US-HI':1, 'TW-KIN':1, 'TW-LIE':1, 'CN-X01':1, 'CN-X02':1 },
  _p:{},
  load:function(name){
    if(!GST.geo._p[name]) GST.geo._p[name]=fetch(GST.geo.BASE+name+'.json?v='+GST.VER).then(function(r){ if(!r.ok) throw new Error('geo '+name+' '+r.status); return r.json(); })
      .catch(function(e){ delete GST.geo._p[name]; throw e; });
    return GST.geo._p[name];
  },
  ccOfCty:function(cty){ const C=GST.geo.CC; for(const k in C) if(C[k].cty===cty) return k; return ''; },
  ccOfId:function(id){ const C=GST.geo.CC; for(const k in C) if(C[k].id===String(id)) return k; return ''; },
  /* 정수 차이 배열 → [[경도,위도]…] */
  rings:function(f, P){ return f.g.map(function(poly){ return poly.map(function(a){ const r=[]; let x=0,y=0; for(let i=0;i<a.length;i+=2){ x+=a[i]; y+=a[i+1]; r.push([x/P,y/P]); } return r; }); }); },
  norm:function(v){ return String(v==null?'':v).toUpperCase().replace(/\s+/g,''); },
  /* 행정구역 이름 열쇠 — 꼬리(시·현·도·특별시·광역시·City·County·Province…)를 뗀 정규화 이름들 */
  admKeys:function(f){
    const out=[]; ['en','ko','zh','ja'].forEach(function(l){ const n=f.n&&f.n[l]; if(!n) return;
      const a=GST.geo.norm(n); out.push(a);
      const b=a.replace(/(CITY|COUNTY|PROVINCE|PREFECTURE|特別市|特別自治市|廣域市|广域市|自治區|自治区|特别行政区|特別行政區|市|縣|县|省|府|都|道|特별시|광역시|특별자치시|특별자치도|도|시|군|현|구)$/,'');
      if(b&&b!==a) out.push(b); });
    return out;
  },
  /* 한 설비의 위치 — PL: {열쇠:{lat,lng,label}} (geo_places) · adm: 그 나라 행정구역 자료(없어도 된다) */
  placeOf:function(x, PL, adm){
    const cand=[x.loc, x.campus, x.fab].filter(Boolean);
    for(let i=0;i<cand.length;i++){
      const k=GST.geo.norm(cand[i]); if(!k) continue;
      const ks=[k, k.replace(/\(.*?\)/g,''), k.replace(/\(.*?\)/g,'').replace(/[-_]?\d+[A-Z]?$/,'')];
      for(let j=0;j<ks.length;j++){ const p=PL&&PL[ks[j]]; if(p&&p.lat!=null&&p.lng!=null) return {key:ks[j], name:cand[i], lat:p.lat, lng:p.lng, label:p.label||cand[i], src:'db'}; }
    }
    if(adm){ for(let i=0;i<cand.length;i++){ const k=GST.geo.norm(cand[i]).replace(/(CITY|COUNTY)$/,'');
      const f=adm.f.find(function(f){ return f.c&&GST.geo.admKeys(f).indexOf(k)>=0; });
      if(f) return {key:'ADM:'+f.iso, name:cand[i], lat:f.c[1], lng:f.c[0], label:cand[i], src:'adm'}; } }
    return null;
  },
  /* 점이 든 행정구역(짝수-홀수 규칙) — 없으면 가장 가까운 중심(해안선 단순화로 바다에 찍힌 점) */
  regionOf:function(lng, lat, adm){
    if(!adm) return null;
    if(!adm._r) adm._r=adm.f.map(function(f){ return GST.geo.rings(f, adm.P); });
    for(let i=0;i<adm.f.length;i++){ const polys=adm._r[i];
      for(let p=0;p<polys.length;p++){ let inside=false; const ring=polys[p][0];
        for(let a=0,b=ring.length-1;a<ring.length;b=a++){ const xi=ring[a][0], yi=ring[a][1], xj=ring[b][0], yj=ring[b][1];
          if(((yi>lat)!==(yj>lat)) && (lng < (xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi)) inside=!inside; }
        if(inside) return adm.f[i]; } }
    let best=null, bd=1e9; adm.f.forEach(function(f){ if(!f.c) return; const d=(f.c[0]-lng)*(f.c[0]-lng)+(f.c[1]-lat)*(f.c[1]-lat); if(d<bd){ bd=d; best=f; } });
    return bd<1?best:null;
  },
  admName:function(f, lang){ if(!f) return ''; const n=f.n||{}; return n[lang]||n.en||''; },
  /* geo_places 읽기 — 못 읽어도(표 없음·오프라인) 빈 것으로 간다: 그때는 행정구역 이름으로만 놓는다 */
  places:async function(){
    try{ const C=await GST.db(); if(!C) return {};
      const r=await C.from('geo_places').select('key,lat,lng,label,cc'); if(r.error) return {};
      const o={}; (r.data||[]).forEach(function(p){ o[p.key]=p; }); return o; }catch(e){ return {}; }
  }
};

/* ---------- 움직임 (v169 · 「통합관리화면」 5단계) ----------
   카드가 차례로 떠오르고 · 숫자가 바뀌면 잠깐 빛나고 · 팝업이 튀어나온다. 규칙은 theme.css 의 «body.gst-motion» 아래에만 있다.
   ⚠ 주간현황(report · report-kr)에는 걸지 않는다 — 그 화면은 손대지 않는다(사용자 지시). 판정은 경로 한 곳.
   ⚠ 움직임 줄이기(prefers-reduced-motion)를 고른 사람에게는 CSS 가 아무것도 안 한다 — 이 함수는 클래스만 단다. */
GST.MOTION_SKIP = /^\/report(-kr)?\//;
GST._motionInit = function(){
  try{
    if(!document.body || GST.MOTION_SKIP.test(GST.pagePath())) return;
    document.body.classList.add('gst-motion');
    /* KPI 값이 «사람이 무언가를 바꾼 직후» 바뀌면 그 카드에 잠깐 표식을 단다 — 필터를 바꿨을 때 무엇이 움직였는지 눈이 따라간다.
       ⚠ 로드 중의 갱신(자리표시 → 숫자 · 번역 적용 · 자동 새로고침)에는 안 단다 — 사람 손이 닿은 지 2초 안의 변화만 센다. */
    if(typeof MutationObserver==='undefined') return;
    let lastAct=0; const act=function(){ lastAct=Date.now(); };
    ['pointerdown','keydown','change','input'].forEach(function(ev){ document.addEventListener(ev, act, true); });
    window.addEventListener('message', function(e){ const d=e.data||{}; if(d.type==='gst-filter'||d.type==='gst-lang') act(); });
    const seen=new WeakMap();
    new MutationObserver(function(ms){
      const hot=Date.now()-lastAct<2000;
      ms.forEach(function(m){
        const el=m.target.nodeType===3?m.target.parentElement:m.target; if(!el||!el.closest) return;
        const k=el.closest('.kpi'); if(!k) return;
        const txt=k.textContent, prev=seen.get(k); seen.set(k, txt);
        if(!hot||prev==null||prev===txt) return;
        k.classList.remove('gst-upd'); void k.offsetWidth; k.classList.add('gst-upd');
        clearTimeout(k._gstU); k._gstU=setTimeout(function(){ k.classList.remove('gst-upd'); }, 900);
      });
    }).observe(document.body,{subtree:true,childList:true,characterData:true});
  }catch(e){}
};
if(typeof document!=='undefined'){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', GST._motionInit);
  else GST._motionInit();
}

/* ---------- 운영 현황 읽기·판정 한 벌 — 통합 관제 · 사이트 상세가 같이 쓴다 (v167) ----------
   두 화면이 «같은 설비 · 같은 고장»을 다른 식으로 세면 관제의 숫자와 사이트 화면의 숫자가 갈린다(제2원칙).
   그래서 파싱·BM/PM 판정·위험 순위 입력을 여기 한 곳에 둔다. 판정은 전부 정본을 부른다:
   설비 대수 GST.EQ · PM GST.PM.is · 위험 GST.riskRank · 국내/해외 GST.ORG.region · 워런티 GST.WARR.
   BM 규칙은 주간현황과 같다(v92 · v115) — 해외 = 수선실적 BM(PM 판정 뺌) · 국내 = 알람 원장(한 사건 첫 줄 · 내적)이고,
   원장이 비면 국내도 수선실적 BM(KR_ON). ⚠ 주간현황(report)은 이 모듈을 쓰지 않는다 — 그 화면은 손대지 않는다(사용자 지시). */
GST.ops = {
  get KR(){ return GST.ORG.REGION_KR; }, get OS(){ return GST.ORG.REGION_OS; },
  cityOf:function(op,cty){
    const u=GST.upk(op||'');
    if(cty==='CHINA'){ const C=['WUHAN','HEFEI','XIAN','WUXI']; for(let i=0;i<C.length;i++) if(u.indexOf(C[i])>=0) return C[i]; }
    return cty||'';
  },
  parseInst:function(rows){
    const m=GST.SM.map(rows, GST.SM.SPEC.inst), C=m.C, v=function(r,k){ return GST.SM.val(r,C,k); };
    return rows.slice(m.hi+1).map(function(r){
      const op=String(v(r,'country')||'').trim(), cust=String(v(r,'customer')||'').trim(), fab=String(v(r,'fab')||'').trim();
      const cty=GST.ORG.country(op)||GST.ORG.country(cust)||GST.ORG.country(fab);
      return { op:op, region:GST.ORG.region(op)||GST.ORG.region(cty), cty:cty, cityKey:GST.ops.cityOf(op,cty),
        cust:cust, loc:String(v(r,'location')||'').trim(), campus:GST.ORG.campus(v(r,'location'),fab,op)||'', fab:fab, model:String(v(r,'model')||'').trim(),
        sn:String(v(r,'sn')||'').trim(), code:String(v(r,'code')||'').trim(),
        state:v(r,'state'), stateRaw:String(v(r,'state')||'').trim(), d:GST.toDate(v(r,'fabIn'))||GST.toDate(v(r,'turnOn')), dOn:GST.toDate(v(r,'turnOn')),
        warr:GST.WARR(v(r,'warranty')), wd:GST.toDate(v(r,'warrantyDate')) };
    }).filter(function(x){ return x.sn||x.code; });
  },
  parseWk:function(rows){
    const m=GST.SM.map(rows, GST.SM.SPEC.wk), C=m.C, v=function(r,k){ return GST.SM.val(r,C,k); };
    return rows.slice(m.hi+1).map(function(r){
      const op=String(v(r,'op')||'').trim();
      return { op:op, region:GST.ORG.region(op), stage:String(v(r,'stage')||'').trim().toUpperCase(), action:v(r,'action'),
        campus:GST.ORG.campus(v(r,'campus'),v(r,'line'),op)||'', line:String(v(r,'line')||'').trim(),
        model:String(v(r,'model')||'').trim(), proc:String(v(r,'proc')||'').trim(), rs:String(v(r,'rsCode')||'').trim(),
        d:GST.toDate(v(r,'dStart')), sn:String(v(r,'snIn')||'').trim(), code:String(v(r,'eqNo')||'').trim(),
        man:GST.numv(v(r,'manMin')),
        desc:String(v(r,'cause')||v(r,'phenom')||v(r,'alarm')||'').trim(), src:'wk' };
    }).filter(function(x){ return x.d; });
  },
  /* 반입·가동 판정 — 주간현황과 같은 날짜를 쓴다(report: 가동=Turn-on date · 반입=FAB In).
     ⚠ 설비상태가 빈 행은 날짜로 판정하는데(GST.EQ «옛 판정»), 가동까지 FAB In 으로 보면 «반입만 된 설비가 전부 가동»이 된다
       (실측 F16N: 상태 빈칸 82대 · Turn-on 빈칸 82대 → 화면은 77/77, 실제 가동 10대 · 사용자 보고 v170). */
  isIn :function(x, asOf){ return GST.EQ.isIn(x.state, x.d, asOf); },
  isRun:function(x, asOf){ return GST.EQ.isRun(x.state, x.dOn, asOf); },
  /* 원장(csvTableRows 의 2차원 배열 · 첫 줄이 열 이름) */
  parseLedger:function(rows){
    if(!rows||rows.length<2) return [];
    const h=rows[0], ix={}; h.forEach(function(k,i){ ix[k]=i; });
    const g=function(r,k){ return ix[k]==null?'':String(r[ix[k]]==null?'':r[ix[k]]).trim(); };
    return rows.slice(1).map(function(r){ return { snk:g(r,'sn_key'), sn:g(r,'sn'), d:GST.toDate(g(r,'occur_date').slice(0,10)),
      seq:g(r,'seq'), inout:g(r,'inout'), incl:g(r,'incl'), op0:g(r,'op'),
      desc:g(r,'alarm')||g(r,'alarm_name')||g(r,'cause'), src:'kr' }; });
  },
  /* 원장 행의 조직 축은 설비 S/N 으로 설치현황에서 얻는다(v92 — 원장에 담지 않는다). 못 붙으면 접미 L/R/S 를 떼고 한 번 더. */
  joinLedger:function(INST, KRA){
    const ix={};
    INST.forEach(function(x){ const k=GST.ALARM.key(x.sn); if(!k) return; if(!ix[k]) ix[k]=x; const b=GST.ALARM.keyBase(x.sn); if(!ix[b]) ix[b]=x; });
    KRA.forEach(function(x){ const o=ix[x.snk]||ix[GST.ALARM.keyBase(x.snk)]||null;
      x.op=o?o.op:''; x.region=o?o.region:''; x.campus=o?o.campus:''; x.code=o?o.code:''; x.model=o?o.model:''; x.fab=o?o.fab:''; });
    return KRA;
  },
  /* 기준일 = 자료의 마지막 날(오늘을 넘지 않는다) — 수동 업로드라 «오늘»로 자르면 이번 주가 빈다 */
  asOf:function(R){
    let last=0; R.WK.forEach(function(x){ const v=x.d.getTime(); if(v>last) last=v; });
    R.KRA.forEach(function(x){ if(x.d){ const v=x.d.getTime(); if(v>last) last=v; } });
    const now=Date.now(); return new Date(Math.min(now, last||now));
  },
  /* 고장(BM) 행 — ok(x) 는 화면의 거르기(구분·운영단위 등). 국내 원장 행은 {region, op} 를 채워 돌려준다. */
  bm:function(R, ok){
    const KR=GST.ops.KR, OS=GST.ops.OS, KR_ON=R.KRA.length>0, out=[];
    R.WK.forEach(function(x){ if(x.stage!=='BM'||GST.PM.is(x)) return; if(KR_ON&&x.region===KR) return; if(ok&&!ok(x)) return; out.push(x); });
    if(KR_ON) R.KRA.forEach(function(x){ if(!x.d||!GST.ALARM.dedup(x)||!GST.ALARM.inner(x)) return; if(x.region===OS) return;
      const y=Object.assign({}, x, {region:x.region||KR, op:x.op||x.op0||'—'}); if(ok&&!ok(y)) return; out.push(y); });
    return out;
  },
  pm:function(R, ok){ return R.WK.filter(function(x){ return GST.PM.is(x)&&(!ok||ok(x)); }); },
  /* 고장 위험 — 고장분석 「고장 위험 설비 TOP 20」과 같은 식(수선실적 BM·PM · v148) */
  risk:function(R, asOf, ok, n){
    const DAY=864e5, t0=asOf.getTime(), rk=function(x){ return GST.snKey(x.sn||x.code); };
    const bm=R.WK.filter(function(x){ return x.stage==='BM'&&!GST.PM.is(x)&&(!ok||ok(x))&&x.d.getTime()>=t0-180*DAY&&rk(x); })
      .map(function(x){ return {key:rk(x),label:x.code||x.sn,site:x.op,d:x.d}; });
    const pm=R.WK.filter(function(x){ return GST.PM.is(x)&&(!ok||ok(x))&&x.d.getTime()>=t0-400*DAY&&rk(x); })
      .map(function(x){ return {key:rk(x),d:x.d}; });
    return GST.riskRank({bm:bm, pm:pm, asOf:asOf, n:n||100000});
  },
  /* 읽기 — 화면 둘이 같은 세 자료를 같은 캐시 열쇠로 읽는다(한 번 받으면 다른 화면은 캐시에서). 실패한 것은 fails 에 남긴다. */
  load:async function(){
    const r=await Promise.allSettled([
      GST.params ? GST.params.ready() : null,                       // 판정 기준(위험 점수 가중치)을 먼저 — 첫 그림부터 같은 점수(v172)
      GST.fetchCSVCached(GST.sheetUrl('891608329'),'hub_inst'),
      GST.fetchCSVCached(GST.sheetUrl('646668307'),'hub_wk'),
      GST.csvTableRows('sheet_alarm', GST._KR_COLS_A)
    ]);
    const fails=[];
    r.shift();
    const INST=r[0].status==='fulfilled'?GST.ops.parseInst(r[0].value.rows):(fails.push('inst'),[]);
    const WK=r[1].status==='fulfilled'?GST.ops.parseWk(r[1].value.rows):(fails.push('wk'),[]);
    const KRA=r[2].status==='fulfilled'?GST.ops.parseLedger(r[2].value):[];
    GST.ops.joinLedger(INST, KRA);
    return {INST:INST, WK:WK, KRA:KRA, fails:fails};
  }
};

/* 입력률이 낮은 열의 차트에 «왜 비어 보이는지»를 적는다 (v135 · 7단계에 core 로).
   예전에는 fault 안에만 있어 입력률 0.3% 인 주간현황 TOP3 에는 없었다 —
   주간보고로 나가는 표가 그 사실을 말하지 않으면 받아 본 사람이 결함으로 읽는다.
   30% 를 넘으면 스스로 사라진다(현장이 채워 나가는 중이라 임계를 넘으면 안내가 방해다). */
GST.FILL_T = {
  ko:'ⓘ 이 항목은 시트 입력률이 {p}% ({g}/{n}건)입니다. 입력이 쌓이면 이 차트가 자동으로 채워집니다.',
  en:'ⓘ This field is {p}% filled in the sheet ({g}/{n}). The chart fills in as entries accumulate.',
  zh:'ⓘ 该项目表格填写率为 {p}% ({g}/{n}件)。随着录入增加，图表会自动补全。',
  ja:'ⓘ この項目のシート入力率は {p}% ({g}/{n}件) です。入力が溜まればこのチャートは自動的に埋まります。'
};
GST.FILL_MIN = 30;
GST.fillHint = function(canvasId, rows, key, altKey){
  const cv=document.getElementById(canvasId); if(!cv || !cv.closest) return null;
  const card=cv.closest(GST.CARD_SEL || '.card'); if(!card) return null;
  let el=card.querySelector('.fill-hint');
  const n=rows.length;
  const got=rows.filter(function(r){
    return String(r[key]||'').trim() || (altKey && String(r[altKey]||'').trim()); }).length;
  const pct=n?Math.round(got/n*100):0;
  if(!n || pct>=GST.FILL_MIN){ if(el) el.remove(); return null; }
  if(!el){ el=document.createElement('div'); el.className='fill-hint';
    card.insertBefore(el, card.querySelector('.cw')||null); }
  const T=GST.FILL_T[(GST._lang && GST._lang()) || 'ko'] || GST.FILL_T.ko;
  el.textContent=T.replace('{p}',pct).replace('{g}',got.toLocaleString()).replace('{n}',n.toLocaleString());
  return {n:n, got:got, pct:pct};
};

/* 값별 건수 목록을 «상위 N + 그 밖» 으로 줄인다 (v136).
   카드 주석이 목록 전량을 적던 자리가 넷이었다 — 실측으로 「집계 제외」한 줄이 여덟 종을
   늘어놓아 주석이 화면을 덮었다. 규약은 하나다:
     «몇 건이 빠졌나» 는 사실이라 카드에 남고, «어떤 낱말이었나» 는 진단이라 GST.dq → /diag/ 로 간다.
   ⚠ 세는 함수(dropReasons·rndScan·HEAD_EX.scan)는 그대로 전량을 센다 — 자르는 일은 부르는 쪽이 한다.
     그래야 /diag/ 가 받는 목록이 온전하다.
   ⚠ 단위(건·명·대)가 자리마다 달라 인자로 받는다. 한 곳에 모아 두지 않으면 같은 «그 밖» 문구가
     네 가지 표기로 갈린다(제2원칙). */
GST.TOPN_T = {
  ko:'그 밖 {k}종 {n}{u}', en:'+{k} more ({n}{u})',
  zh:'其他 {k}种 {n}{u}',  ja:'ほか {k}種 {n}{u}'
};
GST.topN = function(list, n, unit){
  const L=(list||[]).slice(), u=unit||'', k=(n==null?3:n);
  if(!L.length) return '';
  const out=L.slice(0,k).map(function(e){ return e.v+' '+Number(e.n||0).toLocaleString()+u; });
  const rest=L.slice(k);
  if(rest.length){
    const rn=rest.reduce(function(s,e){ return s+Number(e.n||0); },0);
    const T=GST.TOPN_T[(GST._lang && GST._lang()) || 'ko'] || GST.TOPN_T.ko;
    out.push(T.replace('{k}',rest.length).replace('{n}',rn.toLocaleString()).replace('{u}',u));
  }
  return out.join(' · ');
};

// 페이지 내 소분류 탭 (섹션 내비게이션).
// 페이지에 <div data-sec="id"> 컨테이너들이 있어야 하며, defs=[{id,label}] 순서대로 탭 생성.
// 선택 상태는 sessionStorage에 페이지별로 기억. 라벨 갱신(언어 전환)을 위해 재호출 가능.
GST.sectionNav = function(defs){
  if(!defs || !defs.length) return;
  const storeKey = 'gst_sec_' + GST.pagePath().replace(/[^a-z0-9]/gi,'');
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
  title.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></svg> <span class="gst-sb-ttxt">' + GST._esc(opts.title || GST._fltT().filters) + '</span>';
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
        if(s.lbl) h.dataset.lbl=s.lbl;   // 언어가 바뀌면 GST.relabelChrome 이 FLT_T[lbl] 로 다시 쓴다(v135)
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
    const PT=GST._fltT();
    [['1m',PT.p1m],['3m',PT.p3m],['6m',PT.p6m],['1y',PT.p1y],['all',PT.pall]].forEach(function(p){
      const b=document.createElement('button'); b.type='button'; b.className='gst-preset'; b.textContent=p[1]; b.dataset.p=p[0];
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
    rb.textContent=GST._fltT().reset;
    rb.onclick=function(){ try{ opts.onReset(); }catch(e){} };
    foot.appendChild(rb);
  }
  const tools=document.createElement('div'); tools.className='gst-sb-tools';
  if(document.querySelector('.tablecard table, table')){
    const cb=document.createElement('button'); cb.className='gst-sb-tool'; cb.type='button';
    cb.innerHTML='⬇ CSV'; cb.dataset.tool='csv';
    cb.title=GST._fltT().csvTitle;
    cb.onclick=function(){ GST.exportTableCSV(); };
    tools.appendChild(cb);
  }
  if(typeof window.loadData==='function' || typeof window.loadAll==='function'){
    const ab=document.createElement('button'); ab.className='gst-sb-tool'; ab.type='button'; ab.dataset.tool='ar';
    function arOn(){ try{ return localStorage.getItem('gst_auto_refresh')!=='0'; }catch(e){ return true; } }
    function syncAr(){ const T=GST._fltT();
      ab.title=T.autoTitle.replace('{n}',GST.AR_MIN);
      ab.textContent=T.auto.replace('{n}',GST.AR_MIN)+' · '+(arOn()?'ON':'OFF'); ab.classList.toggle('on',arOn()); }
    GST._arSync=syncAr;   // 언어가 바뀌면 relabelChrome 이 부른다
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
  tg.title=GST._fltT().filters; tg.setAttribute('aria-label','toggle filter sidebar');
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
/* 사이드바 버튼이 «자동 10분» 이라고 적혀 있는데 실제 주기는 30분이었다. 화면이 사실과
   다른 말을 하면 사용자는 «안 도는 것»으로 읽는다. 주기를 한 곳에 두고 라벨이 따라간다. */
GST.AR_MIN = 30;
/* 필터를 지키며 페이지를 다시 그린다 — 자동 새로고침과 백필 완료(v127)가 «같은 경로»를
   쓴다. 두 벌로 짜면 한쪽만 순회 규칙을 잊는 날이 온다(제2원칙). */
GST._softReload = async function(){
  const fn = window.loadData || window.loadAll;
  if(typeof fn!=='function') return;
  /* 순회 중에는 스냅샷/복원을 하지 않는다 — 빌린 필터의 주인은 순회다.
     사람이 걸어 둔 기준선(KSAVED)은 순회가 따로 들고 있으므로 여기서 손대면 안 된다. */
  const kiosk = !!(GST.filters && GST.filters.kioskOn && GST.filters.kioskOn());
  const snap = kiosk ? null : GST._snapFilters();
  try{ await fn(); }catch(e){ return; } // 로드 실패 시 상태 유지
  setTimeout(function(){
    try{ kiosk ? GST.filters.kioskReapply() : GST._restoreFilters(snap); }catch(e){}
  }, 300);
};
/* «안 보이는 화면»인가 — 자동 새로고침이 건너뛸 자리 (v135).
   ⚠ document.hidden 은 «최상위 브라우저 탭» 기준이다. 셸이 display:none 으로 감춘 iframe 안에서도 false 라,
     안 보이는 일곱 탭이 30분마다 전량을 다시 받고 있었다(gstAutoStart 의 「하루 768MB」는 한 페이지 몫이었다).
     셸은 보이는 iframe 에만 .active 를 준다 — 그것을 본다(교차 출처면 frameElement 접근이 던지므로 try). */
GST._arHidden = function(){
  if(document.hidden) return true;
  try{ const fe = window.frameElement; if(fe && fe.classList && !fe.classList.contains('active')) return true; }catch(e){}
  return false;
};
/* 건너뛴 새로고침을 «다시 보일 때» 한 번 한다 — 셸의 gst-shown 신호와 requestAnimationFrame(안 보이는 iframe 에서는
   보일 때까지 안 돈다) 둘이 같은 곳으로 온다. 아직 안 보이면 표식만 남긴다. */
GST._arCatchUp = function(){
  if(!GST._arMissed) return;
  if(GST._arHidden()) return;
  GST._arMissed = false;
  GST._softReload();
};
GST.startAutoRefresh = function(min){
  if(GST._arTimer) return;
  if(typeof (window.loadData || window.loadAll)!=='function') return;
  GST._arTimer = setInterval(async function(){
    let on=true; try{ on = localStorage.getItem('gst_auto_refresh')!=='0'; }catch(e){}
    if(!on) return;
    /* 순회(키오스크) 중에는 가드를 끈다 — 곧 보일 화면이라 미리 받아 두는 것이 맞다 */
    const kiosk = !!(GST.filters && GST.filters.kioskOn && GST.filters.kioskOn());
    if(!kiosk && GST._arHidden()){
      GST._arMissed = true;
      try{ requestAnimationFrame(function(){ GST._arCatchUp(); }); }catch(e){}
      return;
    }
    await GST._softReload();
  }, (min||10)*60000);
};

/* ── 백필 배지 + 완료 재렌더 (v127) ── 창으로 먼저 그린 화면은 누적·연간 지표가
   일시적으로 작다. 조용히 두면 사용자가 자기 자료나 코드를 의심한다(v92 의 교훈) —
   받는 중임을 밝히고, 다 받으면 위의 _softReload 로 한 번 다시 그린다.
   ⚠ 자동 새로고침의 on/off 스위치를 «안 본다» — 이건 새 데이터를 받는 것이 아니라
     지금 로드를 완성하는 일이라, 꺼 두었어도 마저 그려야 한다. */
GST._bfOn = {};
GST._bfNote = function(table, on){
  if(on) GST._bfOn[table] = 1; else delete GST._bfOn[table];
  if(!document.body) return;
  var el = document.getElementById('gstBackfill');
  if(!Object.keys(GST._bfOn).length){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div'); el.id = 'gstBackfill';
    el.style.cssText = 'position:fixed;right:12px;bottom:40px;z-index:999998;padding:5px 11px;'+
      'border-radius:999px;background:#EAF1FE;color:#1D4ED8;border:1px solid #C7D7FB;font:11px/1.5 \'Pretendard Variable\',Pretendard,system-ui,-apple-system,sans-serif;'+
      'font-weight:700;opacity:.92;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = '⏳ 최근 '+((GST.DB_WINDOW_MONTHS||12)+1)+'개월 먼저 표시 — 전체 이력 받는 중 (누적·연간 지표는 곧 갱신)';
};
GST._bfKick = function(){
  /* 아직 받는 중인 표가 있으면 기다린다 — 여기서 그리면 그 표가 «부분»인 채로 다시
     그려지고, 그 로드가 또 창+백필을 새로 시작해 같은 데이터를 두 번 받는다. */
  if(Object.keys(GST._bfOn).length) return;
  clearTimeout(GST._bfT);
  GST._bfT = setTimeout(function(){ GST._softReload(); }, 800);   // 표 둘이 잇달아 끝나면 한 번만
};

// 자동 초기화: 페이지가 initSidebar를 직접 호출하지 않아도,
// 알려진 필터 블록(.date-panel / .slicers / .filters)이 있으면 사이드바를 만든다.
// (DOMContentLoaded는 페이지 하단 스크립트 실행 이후에 발생하므로,
//  페이지가 직접 호출한 경우 그 설정이 우선되고 여기서는 no-op)
/* ============================================================
   19. GST.filters — 전 페이지 «기본 필터» 한 벌 (v90)

   왜 여기 있나. 여덟 페이지가 사이드바를 각자 손으로 짰다. 그래서 같은 대시보드인데
   페이지를 옮길 때마다 필터 항목·이름·동작이 달랐고(주간=구분/국가/고객사 ·
   고장=고객사/FAB/Line/공정 · 인원=칩), 국내 자료가 들어오자 갈 곳 없는 값들이
   고객사 목록으로 흘러들었다(인원현황 근무지가 고객사 칸에 뜨던 일).
   복제된 것은 반드시 갈라진다 — 그래서 기본 필터는 여기 한 곳에서만 만든다.

   기본 5종: 구분(국내/해외) · 고객사 · 단지 · 라인 · 기간
     · 단지 > 라인은 «종속»이다. 단지를 고르면 라인 목록이 그 단지 것만 남는다.
       실측으로 두 자료가 같은 계층을 쓰는 것을 확인했다 — 설치현황 Location>FAB 와
       실적 단지>라인이 같은 조합이다(H2>U2 · H2>15B · 탕정>A3 · TAICHUNG>F16).
     · FAB(F16·F11…)은 «라인 값을 대만식으로 정규화한 것»뿐이라 라인에 흡수했다.
       국내 라인(U2·15B·P3-D)은 애초에 FAB 으로 안 잡혀 목록이 비어 있었다.
     · 국가는 구분 아래 개념이라 기본에서 뺐다. 필요한 페이지는 고유 필터로 둔다.

   페이지가 할 일은 «데이터를 어디서 읽는지» 알려주는 것뿐이다:
     GST.filters.mount({ page:'fault', rows:()=>ROWS, onChange:render,
       get:{ region:x=>x.region, customer:x=>x.customer,
             campus:x=>x.campus, line:x=>x.line, date:x=>x.work } });
   그 뒤 페이지의 술어에 `GST.filters.pass(x)` 한 줄만 넣으면 된다.
   ============================================================ */
/* 「라인·단지」 칸에 들어온 «그 축의 값이 아닌 것». 인원현황 라인 칸에 직무가 섞여 온다
   (라인장·단지장·운영관리·세정·정산·주재원·Translator·Chiller·국내 …). 목록에 올리면
   지금 고객사 칸에 근무지가 뜨던 것과 같은 거짓말이 된다 — 목록에서만 뺀다(행은 남는다).
   ⚠ 값을 «고치는» 것이 아니다. 원본은 양식에서 바로잡는 것이 맞고, 이건 그때까지의 가림막이다. */
/* 「고객사」 칸에 들어온 «고객사가 아닌 것». 인원현황은 소속을 이 칸에 적어서 본사·칠러가
   고객사 목록에 뜬다(실측 본사 26 · 칠러 1). 예전에 설치현황의 GST CHINA 1행이 목록에 떠
   그것을 고르면 화면이 통째로 비던 것과 같은 부류다 — 목록에서만 뺀다(행은 남는다). */
GST.FILT_DROP_CUST = /^(본사|칠러|CHILLER|OFFICE|통합|미정|기타|해당없음|N\/A)$/i;

GST.FILT_DROP_ORG = /^(라인장|단지장|운영관리|세정|정산|주재원|국내|해외|기타|미정|TRANSLATOR|CHILLER|SCRUBBER|OFFICE|통합|REPAIR CENTER|서비스자재)$/i;

/* 「현장(O)인데 직책이 팀장·OFFICE·단지장」인 인원을 찾는다 — «확인할 사람» 목록이다.
   ⚠ 분모에서 «빼는» 판정이 아니다 (v163 · 사용자 확정). 공수/출근 분모는 인원현황
     「현장 인원여부 = O」 하나로 정한다. 직책은 «현장 체크가 잘못된 것 아닌가»를 판단하는
     참고일 뿐이라, 이 함수는 품질 신호(head_ex)에만 쓴다. v134 는 이것으로 분모를 줄였다 —
     직책을 기준 삼으면 현장 체크와 직책이 어긋날 때 «어느 쪽이 맞나»를 아무도 안 보게 된다.

   ⚠ 이 낱말들은 «직책 열»에만 있지 않다. 실측(v124) — OFFICE·통합·Repair Center 는
     인원현황의 **단지 칸**에, 단지장·라인장은 **라인 칸**에 실재한다. 한 칸만 보면
     그 사람이 안 잡힌다 → role(업무/직책)·campus(단지)·wp(라인)를 함께 본다.

   ⚠ GST.FILT_DROP_ORG 를 재사용하지 말 것. 그 목록은 «사이드바 목록 정리»용이고,
     라인장·세정·운영관리처럼 **여기서 빼면 안 되는** 값이 들어 있다(고객사가 말한 것은
     팀장·OFFICE·단지장 셋뿐이다). v124 는 그 목록을 값 판정에 썼다가 133명(26%)을
     미배치로 떨어뜨린 자리다 — 목적이 다르면 목록도 따로 둔다.

   scan() 이 «몇 명이 어떤 값으로 잡혔나»를 돌려주고, 데이터 관리가 그 사람들을 띄운다. */
GST.HEAD_EX = {
  RE:  /팀장|단지장/,                    // 값 «안»에 들어 있어도 잡는다 (P1팀장 등)
  OFF: /^(OFFICE|오피스)$/i,             // 단지 칸의 값 자체가 OFFICE 인 경우
  /* 잡혔으면 «잡힌 그 값»을, 아니면 '' 를 돌려준다 — 순수 함수라 렌더마다 다시 세도 된다. */
  why: function(p){
    if(!p) return '';
    const f = [p.role, p.campus, p.wp, p.site];
    for(let i = 0; i < f.length; i++){
      const v = String(f[i] == null ? '' : f[i]).trim();
      if(!v) continue;
      if(GST.HEAD_EX.RE.test(v) || GST.HEAD_EX.OFF.test(v)) return v;
    }
    return '';
  },
  hit: function(p){ return !!GST.HEAD_EX.why(p); },
  scan: function(list){
    const m = new Map(); let n = 0;
    (list || []).forEach(function(p){
      const v = GST.HEAD_EX.why(p);
      if(v){ n++; m.set(v, (m.get(v) || 0) + 1); }
    });
    return { n:n, vals:Array.from(m.entries()).map(function(e){ return {v:e[0], n:e[1]}; })
                        .sort(function(a, b){ return b.n - a.n; }) };
  }
};

GST.filters = (function(){
  /* ══════════════════════════════════════════════════════════════════════
     필터가 «두 벌»이다 — 설비 기준 / 인원 기준 (v114 · 사용자 지시)

     왜. 인당 지표는 분자(실적·설비)와 분모(인원)가 다른 자료에서 온다. 한 벌로 두면
     한쪽에만 있는 축을 걸 때 «한쪽만» 좁아진다 — 팀을 고르면 분모만 줄어 인당 일평균
     공수가 10.8h 로 뜨고(사람이 하루 10.8시간을 일할 수 없다), 사업부를 고르면 분자만
     줄어 인당이 실제보다 낮게 나온다. 둘 다 에러 없이 조용히 틀린다.
     → 같은 일곱 축을 «두 벌» 둔다. 위는 설비 기준, 아래는 인원 기준. 사람이 어느 쪽을
       좁혔는지 보고 고를 수 있어야 그 숫자를 믿을 수 있다.

     지킬 것:
     · 규칙은 여전히 «한 벌»이다. 두 그룹이 같은 함수를 그룹 인자로 나눠 쓴다 —
       복사하면 반드시 갈라진다(제2원칙).
     · 기간은 «하나»다. 실적의 기간과 인원의 기준일은 다른 개념이라 두 벌로 두면
       무엇을 물었는지 사람이 못 세운다. 맨 아래에 한 칸만 둔다.
     · 인원 블록은 페이지가 rowsH/getH 를 줄 때만 살아난다. 안 주면 전 칸이
       「이 화면 미적용」으로 잠긴다 — 칸을 숨기지는 않는다(v91 사용자 확정).
     ══════════════════════════════════════════════════════════════════════ */
  /* 일곱 축이 «전부» 다중선택이다 (v106 · 사용자 요청).
     왜. 국내 설비는 물리적 위치와 «관리주체(사업부)»가 따로 논다 — 같은 11라인 설비라도
     메모리냐 연구소냐 파운드리냐에 따라 소속 단지가 H3·H2·K1 로 갈린다. 하나씩만 고를 수
     있으면 «그 사업부의 설비가 실제로 어디에 있나»를 볼 수가 없다.
     ⚠ 값이 없을 때 «전체»인 것은 그대로다(빈 Set = 전체). 그래서 축 검사는 반드시
       hasK/hitK 를 지나야 한다 — `if(F.op)` 는 빈 Set 도 truthy 라 언제나 참이 된다. */
  const MULTI = { region:1, op:1, div:1, customer:1, campus:1, line:1, line2:1, team:1 };
  /* 축 순서 — 사용자 확정(v111): 구분 → 팀 → 운영단위 → 고객사 → 사업부 → 단지 → 라인.
     두 블록이 «같은 폼»이다 — 순서가 다르면 두 벌이라는 것 자체가 헷갈린다.
     ⚠ 이 배열은 순서에 의미가 «없는» 자리에서도 쓰인다(pass 의 AND 루프 · 종속 계산 ·
       AV 열 인덱스). 그래서 순서를 바꿔도 숫자는 한 자리도 안 움직인다 — 화면 순서만 바뀐다. */
  const AXES = ['region','team','op','customer','div','campus','line','line2'];
  /* 라인2 는 국내 설치현황의 `Line 2` 다 — 라인(`Line 1`) «아래» 단이라 바로 뒤에 둔다.
     ⚠ 이름을 지어내지 않는다(v98) — 시트 머리글이 「Line 2」이므로 「라인2」다.
       라인 칸을 「라인1」로 바꾸지는 않는다. 해외 양식에는 `Line 1` 이라는 열이 없고
       그 칸이 잡는 것은 `FAB` 이라, 해외 사용자에게는 없는 이름이 된다. */
  /* 축 이름표 — 정본은 GST.FLT_T(네 언어). 객체는 그대로 두고(다른 곳이 L[k] 로 본다) relabel() 이 값을 갈아 끼운다. */
  const L = Object.assign({}, GST._fltT().axes);
  const _T = function(){ return GST._fltT(); };

  const mkF = () => ({ region:new Set(), op:new Set(), div:new Set(), customer:new Set(),
                       campus:new Set(), line:new Set(), line2:new Set(), team:new Set() });
  /* 그룹 서술자. «어느 CFG 키를 보는가»만 다르고 나머지 규칙은 전부 같다.
     여기 한 곳만 보면 두 벌이 무엇으로 갈리는지 알 수 있다. */
  const GRP = {
    eq: { k:'eq', pre:'gf-', title:_T().grpEq, note:_T().grpEqNote, F:mkF(), LAST:{},
          cGet:'get',  cRows:'rows',  cDrop:'drop',  cLoose:'loose' },
    hr: { k:'hr', pre:'gh-', title:_T().grpHr, note:_T().grpHrNote, F:mkF(), LAST:{},
          cGet:'getH', cRows:'rowsH', cDrop:'dropH', cLoose:'looseH' }
  };
  const EQ = GRP.eq, HR = GRP.hr;
  const F = EQ.F;                       // 옛 이름 — 여덟 페이지가 이걸 본다(설비 기준)
  F.dtFrom = ''; F.dtTo = '';           // 기간은 «하나»다. 설비 쪽 객체에 담아 옛 코드를 지킨다.

  let CFG = null, KEY = '';
  const cfgOf = (G, key) => (CFG && CFG[G[key]]) || null;

  /* 술어에서 «고른 것에 걸리나»를 묻는 유일한 자리. 단일·다중을 여기서만 가른다 —
     페이지가 `x.campus===F.campus` 를 직접 쓰면 Set 이 된 순간 조용히 전부 false 가 된다. */
  const hitK  = (G, k, v) => MULTI[k] ? (!G.F[k].size || G.F[k].has(v)) : (!G.F[k] || v === G.F[k]);
  const hasK  = (G, k) => MULTI[k] ? G.F[k].size > 0 : !!G.F[k];
  const listK = (G, k) => MULTI[k] ? Array.from(G.F[k]) : (G.F[k] ? [G.F[k]] : []);

  /* 같은 표 안에서 연속 공백이 흔들린다(실측: `GST CHINA(WUHAN)··SCRUBBER`). 그대로 두면
     한 법인이 목록에 두 줄로 뜨고, 어느 쪽을 고르느냐에 따라 설비가 반씩 갈린다 —
     v98 이 「남은 문제 ③」으로 적어 둔 자리다. 공백만 눕힌다(낱말은 시트 값 그대로). */
  const val = (g, x) => { try{ const v = g ? g(x) : ''; return v==null?'':String(v).replace(/\s+/g,' ').trim(); }catch(e){ return ''; } };
  const dstr = v => {
    if(!v) return '';
    if(v instanceof Date) return isNaN(v)?'':v.toISOString().slice(0,10);
    return String(v).slice(0,10);
  };

  function setK(G, k, v){
    if(!(k in G.F)) return;
    if(MULTI[k]){ G.F[k].clear(); (Array.isArray(v)?v:(v?[v]:[])).forEach(function(x){ G.F[k].add(x); }); }
    else G.F[k] = v || '';
    save(); refresh(); if(CFG && CFG.onChange) CFG.onChange();
  }

  /* ── 자동순회(키오스크)가 이 페이지의 필터를 «빌려 쓴다» ──
     세 가지가 한 곳에 있어야 한다. 흩어 두면 각각이 조용히 틀린다:
     ① **mount 전에 온 값은 보류한다.** 탭은 지연 로딩이고 mount 는 25만행을 다 받은 뒤에
        불린다. 그 전에 값을 넣으면 뒤늦은 load() 가 저장본으로 덮어써서 «하단바는 H1,
        화면은 남의 단지»가 된다. 셸이 1.2초 뒤 한 번 더 보내는 것으로는 원리적으로 못 맞춘다.
     ② **사람 필터 기준선은 load() «다음»에 잡는다.** mount 전 빈 값을 기준선으로 잡으면,
        순회를 끄는 순간 사람이 걸어 둔 필터가 사라진다(복원이 오히려 지운다).
     ③ **정말로 걸렸는지 돌려준다.** 그 페이지 자료에 없는 값은 fill/fillMulti 가 버리는데
        (빈 Set·빈 문자열), 그 상태가 곧 «전체»다. 알려주지 않으면 벽 화면이 「H1」이라 적고
        전사 합계를 보여준다 — 지나가는 사람은 그걸 H1 숫자로 읽는다.
     ⚠ v114 부터 필터가 두 벌이다. 순회는 «두 벌 모두»에 건다 — 한쪽만 걸면 벽 화면에
        설비는 H1 인데 인원은 전사인 표가 뜬다(그 표는 거짓말을 하는 것이다). */
  let KPEND = null, KSAVED = null, KCUR = null;
  function kioskSet(k, v){
    if(!(k in EQ.F)) return { applied:false, why:'noaxis' };
    /* ⚠ 셸은 1.2초 뒤 «같은 값»을 한 번 더 보낸다 — 탭이 지연 로딩이라 mount 전에 온 값을
       놓치지 않으려는 것이고 그 자체는 옳다(v103). 그런데 받는 쪽에 «같은 값이면 무시»가
       없어 refresh()+render() 가 두 번 돌았다 — 전환 직후 화면이 한 번 더 껌뻑인다.
       ⚠ 판정을 F 로 하면 안 된다(이 함수 아래 주석의 함정 그대로) — «셸이 무엇을 걸라고
         했나»는 KCUR 이 들고 있으므로 그것으로 본다. CFG 가 아직 없으면(mount 전) 보류가
         먼저다 — 그때는 아무것도 그려지지 않았으므로 «같은 값»이어도 건너뛰면 안 된다. */
    const same = CFG && KCUR && KCUR.k===k &&
      (Array.isArray(v)&&Array.isArray(KCUR.v) ? (v.length===KCUR.v.length && v.every((x,i)=>x===KCUR.v[i]))
                                               : KCUR.v===v);
    KCUR = { k:k, v:v };   // 자동 새로고침이 끝난 뒤 «지금 걸린 값»을 다시 걸기 위해
    if(!CFG){ KPEND = { k:k, v:v }; return { applied:false, why:'loading' }; }
    if(same){
      /* 이미 걸려 있다 — 다시 그리지 않고 «그때의 답»을 그대로 돌려준다.
         applied 를 거짓으로 돌리면 셸이 그 조합을 «못 거는 것»으로 기억해 순회에서 빼 버린다. */
      const inEq0 = opts(EQ, k).indexOf(String(v)) >= 0, inHr0 = opts(HR, k).indexOf(String(v)) >= 0;
      if(!v) return { applied:true, why:'' };
      return { applied:(inEq0||inHr0), why:(inEq0||inHr0) ? '' : 'nodata' };
    }
    if(!KSAVED){
      const cp = cur => (cur instanceof Set) ? Array.from(cur) : cur;
      KSAVED = { k:k, eq:cp(EQ.F[k]), hr:cp(HR.F[k]) };
    }
    /* «걸렸나»를 F 로 확인하면 안 된다 — 목록에서 버리는 일은 fill/fillMulti(=DOM)가 하므로
       사이드바가 아직 없거나 접힌 상황에서는 F 에 값이 남아 «걸린 척»이 된다.
       물어야 할 것은 하나다: 이 페이지 자료에 그 값이 있는가.
       두 벌 중 «어느 한쪽에라도» 있으면 걸린 것이다 — 설비만 있는 화면도 많다. */
    const inEq = opts(EQ, k).indexOf(String(v)) >= 0;
    const inHr = opts(HR, k).indexOf(String(v)) >= 0;
    setBoth(k, v);
    if(!v) return { applied:true, why:'' };
    return { applied:(inEq||inHr), why:(inEq||inHr) ? '' : 'nodata' };
  }
  // 두 벌에 같은 값을 건다. 한 번만 저장·렌더한다(setK 를 두 번 부르면 화면이 두 번 그려진다).
  function setBoth(k, v){
    [EQ,HR].forEach(function(G){
      if(!(k in G.F)) return;
      if(MULTI[k]){ G.F[k].clear(); (Array.isArray(v)?v:(v?[v]:[])).forEach(function(x){ G.F[k].add(x); }); }
      else G.F[k] = v || '';
    });
    save(); refresh(); if(CFG && CFG.onChange) CFG.onChange();
  }
  function kioskRestore(){
    KPEND = null; KCUR = null;
    if(!KSAVED || !CFG) { KSAVED = null; return; }
    const sv = KSAVED; KSAVED = null;
    const put = (G, v) => { if(!(sv.k in G.F)) return;
      if(MULTI[sv.k]){ G.F[sv.k].clear(); (Array.isArray(v)?v:(v?[v]:[])).forEach(x=>G.F[sv.k].add(x)); }
      else G.F[sv.k] = v || ''; };
    put(EQ, sv.eq); put(HR, sv.hr);
    save(); refresh(); if(CFG && CFG.onChange) CFG.onChange();
  }
  /* 순회가 지금 이 페이지의 필터를 빌리고 있나. 30분 자동 새로고침이 이것을 물어야 한다 —
     ⚠ 그 새로고침은 «갱신 시작 시점»의 사이드바 값을 스냅샷으로 떠 두었다가 300ms 뒤에
       되돌린다. 순회는 15초마다 축을 바꾸므로, 25만 행을 다시 받는 동안 이미 다음 단지로
       넘어가 있다 — 그러면 복원이 «옛 단지»를 다시 걸고, 하단바는 H2 라고 적는데 화면은
       H1 자료가 된다. 벽에 걸린 화면이라 아무도 안 보고 있을 때 어긋난다. */
  function kioskOn(){ return !!(KSAVED || KPEND); }
  // 새로고침으로 화면이 다시 그려진 뒤, 순회가 걸어 둔 «지금» 값을 다시 건다
  function kioskReapply(){ if(KCUR && CFG) setBoth(KCUR.k, KCUR.v); }

  function opts(G, key, narrow, rowsIn){
    /* mount 전에도 불릴 수 있다 — options() 가 공개 API 라 셸이 언제든 물어본다.
       CFG 가 null 이면 예외가 아니라 «아직 아는 값이 없다»(빈 배열)가 맞다. */
    if(!CFG) return [];
    /* ⚠ rows 를 «받아» 쓴다. CFG.rows() 는 페이지가 매번 새 배열을 «만든다» —
       주간현황은 실적 25만 + 설치 + 인원을 합쳐 새로 짓는다. 축마다 부르면 한 번
       새로고침에 그 일이 일곱 번 일어나고, 체크박스를 누를 때마다 화면이 멈춘다
       (사용자 보고: «필터 누를 때마다 로딩이 엄청 길다»). refresh 가 한 번만 만들어 넘긴다. */
    const gg = cfgOf(G,'cGet') || {}, g = gg[key];
    const rf = CFG[G.cRows];
    const rows = rowsIn || (rf && rf()) || [];
    if(!g) return [];
    const dp = cfgOf(G,'cDrop') || {}, dr = dp[key];
    const s = new Set();
    for(let i=0;i<rows.length;i++){
      const x = rows[i];
      if(narrow && !narrow(x)) continue;
      const v = val(g, x); if(!v) continue;
      if(dr && dr.test(v)) continue;
      s.add(v);
    }
    return [...s].sort((a,b)=>a.localeCompare(b,'ko'));
  }

  /* 목록이 빈 이유는 둘이고, 사람이 할 일이 «완전히 다르다».
       ① 이 자료에 그 축이 아예 없다        → 「전체 (이 화면 미적용)」
       ② 값은 있는데 «다른 필터»가 다 떨어뜨렸다 → 「전체 (필터에 해당 없음)」
     ⚠ 「자료 없음」이라고 적으면 «자료를 안 올렸다»로 읽힌다(사용자 지적). 실제 뜻은
       «이 화면이 보는 자료에는 그 축이 없다»다 — 어느 쪽도 «자료가 없다»고 말하지 않는다. */
  function fill(G, key, list, hasAny){
    const id = G.pre + key;
    if(MULTI[key]) return fillMulti(G, id, key, list, hasAny);
    const el = document.getElementById(id); if(!el) return;
    const box = el.closest('.slicer'); if(box) box.style.display = '';
    el.disabled = !list.length;
    const cur = G.F[key];
    el.innerHTML = '<option value="">' + (list.length ? _T().all : (hasAny ? _T().emptyFilt : _T().emptyNone)) + '</option>' + list.map(function(v){
      return '<option value="'+String(v).replace(/"/g,'&quot;')+'">'+v+'</option>';
    }).join('');
    // 목록에서 사라진 선택값은 버린다 — 남겨두면 «아무것도 안 나오는» 화면이 된다
    if(list.indexOf(cur) < 0) G.F[key] = '';
    el.value = G.F[key];
  }

  /* 다중선택 칸. 목록이 바뀔 때만 다시 만든다(GST.mselFill 의 규약) — 매번 갈아끼우면
     체크 직후 노드가 분리돼 목록이 닫힌다. 목록에서 사라진 선택값은 여기서 버린다.
     안 버리면 «아무것도 안 나오는» 화면이 되고, 그 이유가 화면에 남지 않는다. */
  function fillMulti(G, id, key, list, hasAny){
    const btn = document.getElementById(id+'Btn'), box = document.getElementById(id+'Box');
    if(!btn || !box) return;
    const wrap = btn.closest('.slicer'); if(wrap) wrap.style.display = '';
    Array.from(G.F[key]).forEach(function(v){ if(list.indexOf(v) < 0) G.F[key].delete(v); });
    btn.disabled = !list.length;
    if(!list.length){ btn.textContent = (hasAny ? _T().emptyFilt : _T().emptyNone) + ' ▾'; box.innerHTML=''; box.style.display='none';
      box.dataset.built=''; box.dataset.keys=''; return; }
    GST.mselFill(id, list, G.F[key], function(){ save(); refresh();
      if(CFG && CFG.onChange) CFG.onChange(); });
  }

  /* 한 그룹의 목록을 만든다.
     ⚠ 성능 — 예전에는 축마다 rows() 를 새로 만들고 행마다 접근자를 다시 불렀다:
       7축 × N행 × 7축 = 49N 번. 주간현황은 N 이 25만이라 체크박스를 누를 때마다 화면이
       멈췄다(사용자 보고). 축 값을 «행당 한 번» 뽑아 두고 그 위에서 센다 — 7N 번.
     ⚠ 여기서 뽑는 값과 pass() 가 보는 값이 «같은 val()» 이어야 한다. 두 벌이 되면
       목록에는 있는데 골라도 0건인 값이 생긴다. */
  function refreshGroup(G){
    const gg = cfgOf(G,'cGet');
    const rf = CFG[G.cRows];
    /* 이 화면이 그 자료를 아예 안 보면(접근자·행 공급이 없으면) 전 칸을 잠근다.
       숨기지 않는다 — 칸이 나타났다 사라지면 그것 자체가 「페이지마다 필터가 다르다」다. */
    if(!gg || !rf){
      AXES.forEach(function(k){ G.LAST[k]={list:[],hasAny:false}; fill(G, k, [], false); });
      return;
    }
    const rows = rf() || [];
    const drop = cfgOf(G,'cDrop') || {}, loose = cfgOf(G,'cLoose') || {};
    const n = rows.length;
    /* 축별 «평면 배열» 로 뽑는다. 행마다 객체를 만들면(7키 × 25만) 할당 비용이 더 커서
       오히려 느려진다 — 실측으로 확인했다. 문자열 배열 일곱이면 헤더가 없다. */
    const AV = new Array(AXES.length);
    for(let a=0;a<AXES.length;a++){
      const acc = gg[AXES[a]], col = new Array(n);
      if(acc){ for(let i=0;i<n;i++){ let v; try{ v = acc(rows[i]); }catch(e){ v=''; }
                 col[i] = v==null ? '' : String(v).replace(/\s+/g,' ').trim(); } }
      else { for(let i=0;i<n;i++) col[i] = ''; }
      AV[a] = col;
    }
    /* 어느 축이 «걸려 있나»를 미리 뽑아 둔다 — 안 걸린 축은 루프에서 아예 건너뛴다.
       대개 한두 축만 걸려 있으므로 이것만으로 대부분의 비용이 사라진다. */
    const ON = [];
    for(let a=0;a<AXES.length;a++) if(hasK(G, AXES[a])) ON.push(a);
    AXES.forEach(function(k, ai){
      const dr = drop[k], col = AV[ai], seen = new Set();
      for(let i=0;i<n;i++){
        const v = col[i];
        if(!v || (dr && dr.test(v))) continue;
        /* 자기 축은 빼고 나머지로 좁힌다 — 자기까지 보면 한 번 고른 값 말고는
           목록에서 사라져 되돌릴 수 없다. */
        let ok = true;
        for(let z=0; z<ON.length; z++){
          const a = ON[z]; if(a === ai) continue;
          const w = AV[a][i];
          if(!w){ if(loose[AXES[a]]) continue; ok = false; break; }
          if(!hitK(G, AXES[a], w)){ ok = false; break; }
        }
        if(ok) seen.add(v);
      }
      const list = [...seen].sort(function(a,b){ return a.localeCompare(b,'ko'); });
      /* 비었을 때만 «값이 있기는 한가»를 한 번 더 훑는다. 늘 세면 25만 행 × 7축을 한 벌
         더 도는 셈이라 v107 에서 줄인 비용이 되돌아온다 — 빈 경우는 드물다. */
      let hasAny = list.length > 0;
      if(!hasAny){ for(let i=0;i<n;i++){ const v=col[i]; if(v && !(dr && dr.test(v))){ hasAny=true; break; } } }
      G.LAST[k] = { list: list, hasAny: hasAny };
      fill(G, k, list, hasAny);
    });
  }

  function refresh(){
    if(!CFG) return;
    refreshGroup(EQ); refreshGroup(HR);
    try{ GST._chipsRender(); }catch(e){}   // core 가 만든 칩 줄(pm·scrubber)은 여기서 그린다 — F 만 보므로 목록과 무관하다(v135)
    /* 기간은 «그 자료에 날짜 축이 있을 때만» 걸 수 있다. tco 의 기준 월, hr 의 기준일처럼
       페이지가 자기 시간축을 따로 갖는 곳은 date 접근자를 주지 않는다. 그때 칸을 그냥
       두면 날짜를 넣는 순간 조건을 만족할 수 없어 화면이 통째로 빈다 — 목록이 빈 select
       를 잠그는 것과 같은 이유로 잠근다(보이되 거짓말은 안 한다).
       ⚠ 기간은 두 벌이 아니다(위 머리말) — 설비·인원 어느 쪽이든 date 접근자가 있으면 연다. */
    const hasD = !!((CFG.get||{}).date || (CFG.getH||{}).date);
    const a=document.getElementById('gf-from'), b=document.getElementById('gf-to');
    [a,b].forEach(function(el){ if(!el)return; el.disabled=!hasD;
      el.title = hasD ? '' : _T().dtOwn; });
    if(!hasD){ F.dtFrom=''; F.dtTo=''; }
    if(a) a.value=F.dtFrom; if(b) b.value=F.dtTo;
  }

  function read(gk, changed){
    const G = GRP[gk] || EQ;
    /* 이제 일곱 축이 전부 다중선택이라 여기서 읽을 select 가 없다 — mselFill 이 Set 을
       직접 고친다. 단일 축이 다시 생기면 이 루프가 그것만 읽는다. */
    AXES.forEach(function(k){
      if(MULTI[k]) return;
      const el=document.getElementById(G.pre+k); if(el) G.F[k]=el.value;
    });
    const a=document.getElementById('gf-from'), b=document.getElementById('gf-to');
    F.dtFrom=a?a.value:''; F.dtTo=b?b.value:'';
    /* 단지를 바꾸면 그 아래 라인은 대개 유효하지 않다 — 명시적으로 비운다.
       ⚠ v106 에서 라인도 Set 이 됐다. `G.F.line=''` 로 대입하면 Set 이 문자열로 바뀌어
         그다음 .has 가 TypeError 로 죽는다 — 단지를 바꾸는 순간 화면이 통째로 빈다. */
    /* 위 축을 바꾸면 그 «아래» 단은 대개 무효다 — 단지 → 라인(Line 1) → 라인2(Line 2).
       ⚠ 지금은 여덟 축이 «전부» 다중선택이라 이 줄을 타는 축이 하나도 없다. 다중 축은
         mselFill 의 콜백이 changed 를 안 넘기고, 대신 refresh() 의 fill() 이 «목록에
         없어진 선택값을 지운다» — 그것이 실제로 도는 종속 장치다. 단일 축이 다시 생길
         때를 위해 남겨 둔다(그때 이 줄이 없으면 옛 하위 값이 걸린 채 남아 화면이 빈다). */
    if(changed==='campus'){ if(!MULTI.line)  G.F.line  = '';
                            if(!MULTI.line2) G.F.line2 = ''; }
    if(changed==='line'){   if(!MULTI.line2) G.F.line2 = ''; }
    save(); refresh();
    if(CFG && CFG.onChange) CFG.onChange();
  }

  /* ⚠ JSON.stringify(new Set) 은 '{}' 다 — 배열로 눕혀 저장하고 되살릴 때 Set 으로 되돌린다.
     그냥 Object.assign 으로 복원하면 F.campus 가 빈 객체가 되어 .has 가 사라진다(실제로 죽었다). */
  function save(){ try{
    /* mount 전에는 KEY 가 '' 다. 그대로 쓰면 «빈 이름» 키에 남의 페이지 값이 섞여 들어가고,
       정작 이 페이지 저장본은 안 바뀐다 — 저장한 줄 알았는데 안 된 상태가 된다. */
    if(!KEY) return;
    const dump = G => { const o={}; AXES.forEach(function(k){ o[k]=MULTI[k]?Array.from(G.F[k]):G.F[k]; }); return o; };
    localStorage.setItem(KEY, JSON.stringify({ v:2, eq:dump(EQ), hr:dump(HR),
                                               dtFrom:F.dtFrom, dtTo:F.dtTo }));
  }catch(e){} }
  function load(){
    try{ const o=JSON.parse(localStorage.getItem(KEY)||'{}');
      /* v113 이전 저장본은 «한 벌»이다(축이 최상위에 있다). 그때 값은 설비 기준으로 읽는다 —
         버리면 «어제 걸어 둔 필터가 오늘 풀려 있다»가 된다. */
      const src = { eq: (o && o.v===2) ? (o.eq||{}) : (o||{}),
                    hr: (o && o.v===2) ? (o.hr||{}) : {} };
      [['eq',EQ],['hr',HR]].forEach(function(pair){
        const d = src[pair[0]], G = pair[1];
        AXES.forEach(function(k){
          /* Set 을 새로 만들지 않는다 — 다중선택 박스가 이 객체를 들고 있어서,
             갈아끼우면 그때부터 체크가 옛 Set 으로 들어가 화면이 안 움직인다.
             페이지가 mount 를 여러 번 부르면(주간현황은 5번) 반드시 그 상태가 된다. */
          if(MULTI[k]){
            if(Array.isArray(d[k])){ G.F[k].clear(); d[k].forEach(function(v){ G.F[k].add(v); }); }
            else if(typeof d[k]==='string' && d[k]){ G.F[k].clear(); G.F[k].add(d[k]); }
            else G.F[k].clear();
            return;
          }
          if(typeof d[k]==='string') G.F[k]=d[k];
        });
      });
      if(typeof o.dtFrom==='string') F.dtFrom=o.dtFrom;
      if(typeof o.dtTo==='string')   F.dtTo=o.dtTo;
    }catch(e){}
  }

  function markup(){
    const sel = (G,k) => '<div class="slicer"><div class="lbl" data-fk="'+k+'">'+L[k]+'</div>'
      + '<select id="'+G.pre+k+'" onchange="GST.filters._on(\''+G.k+'\',\''+k+'\')"></select></div>';
    /* 다중선택 칸은 select 가 아니라 버튼+체크박스다(GST.mselFill 규약). position:relative
       가 없으면 박스가 사이드바 밖으로 나간다 — .slicer 가 이미 relative 다. */
    const msel = (G,k) => '<div class="slicer"><div class="lbl" data-fk="'+k+'">'+L[k]+'</div>'
      + '<button type="button" id="'+G.pre+k+'Btn" class="mselbtn" '
      + 'onclick="GST.mselToggle(\''+G.pre+k+'\',event)">'+_T().all+' ▾</button>'
      + '<div id="'+G.pre+k+'Box" class="mselbox"></div></div>';
    const head = G => '<div class="lbl gf-grp" data-fg="'+G.k+'">'+G.title+'<span class="gf-note">'+G.note+'</span></div>';
    /* 두 블록이 «같은 폼»이다 — 축 목록도 AXES 한 곳에서 나온다. 따로 두면 축이 늘 때
       한쪽만 고쳐져 그 칸이 조용히 사라진다. */
    const block = G => head(G) + AXES.map(function(k){ return (MULTI[k]?msel:sel)(G,k); }).join('');
    return '<div class="gf-base">'
      + block(EQ)
      + '<div class="slicer-div"></div>'
      + block(HR)
      + '<div class="slicer-div"></div>'
      + '<div class="slicer"><div class="lbl" data-fk="period">'+L.period+'</div>'
      + '<input type="date" id="gf-from" class="dt-input" onchange="GST.filters._on()"> ~ '
      + '<input type="date" id="gf-to" class="dt-input" onchange="GST.filters._on()"></div>'
      + '</div>';
  }

  /* «그 축이 아예 없는 자료»는 그 축으로 거르지 않는다. 예: 사업부는 설치현황에만 있어,
     조인이 안 된 실적 행을 그대로 거르면 「사업부를 고르면 실적이 반으로 준다」가 된다.
     CFG.loose 에 적은 축만 이렇게 다룬다 — 아무 축에나 적용하면 미상 행이 전 필터를
     통과해 숫자가 부풀어 오른다. «모르는 것»과 «아닌 것»은 다르다. */
  function axOk(G, key, x){
    const gg = cfgOf(G,'cGet') || {};
    const v = val(gg[key], x);
    if(!v){ const lo = cfgOf(G,'cLoose'); return !!(lo && lo[key]); }
    return hitK(G, key, v);
  }

  function passG(G, x, opt){
    if(!CFG) return true;
    /* 축마다 손으로 쓴 조건을 없앴다 — 하나만 빠뜨려도 그 축이 조용히 «전체»가 되고,
       다중선택으로 바꿀 때 `if(F.x)` 가 빈 Set 에도 참이 되어 통째로 틀린다.
       고른 게 있을 때만(hasK) 축 판정(axOk)을 지난다. loose 는 axOk 안에 있다. */
    for(let i=0;i<AXES.length;i++){
      const k = AXES[i];
      if(hasK(G, k) && !axOk(G, k, x)) return false;
    }
    const gg = cfgOf(G,'cGet') || {};
    if((F.dtFrom || F.dtTo) && gg.date && !(opt && opt.noDate)){
      const d = dstr(gg.date(x));
      if(!d) return false;                       // 날짜가 없으면 기간 조건을 만족할 수 없다
      if(F.dtFrom && d < F.dtFrom) return false;
      if(F.dtTo   && d > F.dtTo)   return false;
    }
    return true;
  }

  function hitLG(G, k, v){
    if(!hasK(G, k)) return true;              // 고른 게 없으면 전체 — pass() 와 같은 순서
    const s = v==null ? '' : String(v).trim();
    if(!s){ const lo = cfgOf(G,'cLoose'); return !!(lo && lo[k]); }
    return hitK(G, k, s);
  }

  return {
    F: F,          // 설비 기준 (옛 이름 — 여덟 페이지가 이걸 본다)
    H: HR.F,       // 인원 기준
    _on: read,
    /* 공통 블록을 페이지의 .slicers 맨 앞에 끼우고, 원래 있던 항목들은 구분선 아래
       «이 페이지 전용»으로 밀어낸다. 사이드바 이동(autoSidebar)은 그대로 동작한다. */
    mount: function(cfg){
      CFG = cfg || {}; KEY = 'gst_bf_' + (CFG.page||'x');
      load();
      /* 순회가 로딩 중에 보낸 값이 있으면 지금 적용한다 — 기준선도 여기서 잡혀야
         «사람이 걸어 둔 값»이 기준이 된다(위 kioskSet 주석 ②). */
      /* ⚠ KCUR 을 먼저 지운다 — 보류분 재생은 «아직 한 번도 안 걸린» 값이라,
         같은-값-건너뛰기(v135 8단계)에 걸리면 그 탭만 영영 필터가 안 걸린다. */
      if(KPEND){ const kp = KPEND; KPEND = null; KCUR = null; kioskSet(kp.k, kp.v); }
      if(!document.getElementById('gf-css')){
        const st=document.createElement('style'); st.id='gf-css';
        /* 이 화면에 안 걸리는 축은 «잠긴 칸»으로 보인다 — 흐리게 해서 눌러 볼 것이
           아님을 알린다. 칸을 숨기지는 않는다(v91 사용자 확정).
           묶음 머리글은 여기서 한 번만 넣는다 — 여덟 페이지의 <style> 을 각각 고치면
           한 곳이 빠져 그 페이지만 다르게 보인다(제2원칙). */
        st.textContent='.slicer .mselbtn:disabled,.slicer select:disabled{opacity:.45;cursor:not-allowed}'
          +'.gf-grp{margin-top:6px;color:var(--a1,#38bdf8);font-weight:800;'
          +'display:flex;align-items:baseline;gap:6px}'
          +'.gf-grp .gf-note{font-weight:500;font-size:10px;opacity:.65}';
        document.head.appendChild(st);
      }
      const box = document.querySelector('.slicers'); if(!box) return;
      /* ⚠ «이미 만들었나»를 축의 select id 로 확인하면 안 된다. v106 에서 구분이 다중선택이
         되면서 그 id 가 `gf-region` → `gf-regionBtn` 으로 바뀌었고, 검사가 못 찾아
         **mount 를 부를 때마다 공통 블록이 새로 끼워졌다** — 주간현황은 mount 를 5번
         부르므로 사이드바에 「이 페이지 전용」 묶음이 다섯 벌 생겼다.
         markup() 이 «언제나» 내는 껍데기(.gf-base)로 확인한다. */
      if(!box.querySelector('.gf-base')){
        const own = [].slice.call(box.children);
        box.insertAdjacentHTML('afterbegin', markup());
        if(own.length){
          const d=document.createElement('div'); d.className='slicer-div';
          const h=document.createElement('div'); h.className='lbl gf-own'; h.textContent=_T().own;
          box.insertBefore(d, own[0]); box.insertBefore(h, own[0]);
        }
      }
      try{ GST._chipsMount(); }catch(e){}   // 자기 칩 줄이 없는 페이지에만 (v135)
      refresh();
    },
    refresh: refresh,
    /* 언어가 바뀌면 이름표만 다시 쓴다 — 마크업은 mount 가 한 번만 만든다(.gf-base 가드).
       값 목록(refresh)도 다시 내야 「전체」·「이 화면 미적용」 문구가 새 언어로 나온다. */
    relabel: function(){
      const T = _T();
      Object.assign(L, T.axes);
      EQ.title=T.grpEq; EQ.note=T.grpEqNote; HR.title=T.grpHr; HR.note=T.grpHrNote;
      document.querySelectorAll('.gf-base [data-fk]').forEach(function(el){ if(L[el.dataset.fk]) el.textContent = L[el.dataset.fk]; });
      document.querySelectorAll('.gf-base .gf-grp[data-fg]').forEach(function(el){
        const G = el.dataset.fg==='hr' ? HR : EQ;
        el.innerHTML = GST._esc(G.title) + '<span class="gf-note">' + GST._esc(G.note) + '</span>'; });
      document.querySelectorAll('.slicers .gf-own').forEach(function(el){ el.textContent = T.own; });
      if(CFG) refresh();
    },
    /* 칩의 ✕ — 한 축만 푼다. period 는 두 날짜 칸이 한 축이다(clear() 와 같은 규칙). */
    unset: function(k, grp){
      if(k==='period'){
        F.dtFrom=''; F.dtTo='';
        ['gf-from','gf-to'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; });
        save(); refresh(); if(CFG && CFG.onChange) CFG.onChange(); return;
      }
      setK(grp==='hr' ? HR : EQ, k, '');
    },
    /* 한 축의 «자료에 실제로 있는» 값 목록. 자동순회(키오스크)가 단지 목록을 얻는 통로다.
       ⚠ 목록을 셸에 박지 말 것 — 대만 전용 목록으로 국내가 통째로 사라졌던 v89 그대로다.
       종속(narrow)을 걸지 않는다: 지금 걸린 필터와 무관하게 «이 자료에 있는 전부»를 돌아야 한다.
       두 벌을 합쳐 준다 — 순회는 «이 화면에 그 값이 있나»만 알면 된다. */
    options: function(k){
      const a = opts(EQ, k), b = opts(HR, k);
      return [...new Set(a.concat(b))].sort((x,y)=>x.localeCompare(y,'ko'));
    },
    optionsH: function(k){ return opts(HR, k); },
    // 마지막 목록과 «왜 비었나» — {list, hasAny}. hasAny=true 인데 list 가 비면 필터 탓이다.
    lists:  function(k){ return k ? (EQ.LAST[k]||{list:[],hasAny:false}) : EQ.LAST; },
    listsH: function(k){ return k ? (HR.LAST[k]||{list:[],hasAny:false}) : HR.LAST; },
    ready: function(){ return !!CFG; },
    kioskSet: kioskSet, kioskRestore: kioskRestore,
    kioskOn: kioskOn, kioskReapply: kioskReapply,
    /* 기본 필터 술어. 페이지의 filt() 맨 앞에 한 줄로 넣는다.
       pass = 설비 기준 · passH = 인원 기준. 어느 쪽 자료인지에 맞는 것을 쓴다 —
       인원 행을 pass() 로 거르면 설비 축이 걸려 인원이 통째로 사라진다.
       opt.noDate — 기간 조건만 건너뛴다(설치현황의 «미가동 목록» 같은 카드). */
    pass:  function(x, opt){ return passG(EQ, x, opt); },
    passH: function(x, opt){ return passG(HR, x, opt); },
    clear: function(){
      [EQ,HR].forEach(function(G){
        AXES.forEach(function(k){ if(MULTI[k]) G.F[k].clear(); else G.F[k]=''; });
      });
      F.dtFrom=''; F.dtTo='';
      save(); refresh(); if(CFG && CFG.onChange) CFG.onChange();
    },
    /* 축 하나만 끄거나 켠다. 페이지가 `GST.filters.F[k]=''` 를 직접 쓰면 다중 축에서
       Set 이 문자열로 바뀌어 그다음 `.has` 가 TypeError 로 죽는다 — 여기로만 지나가게 한다. */
    set:  function(k, v){ setK(EQ, k, v); },
    setH: function(k, v){ setK(HR, k, v); },
    // 차트 드릴용 — 같은 값을 다시 누르면 해제. 다중 축은 «그 값만» 토글한다.
    toggle:  function(k, v){ tog(EQ, k, v); },
    toggleH: function(k, v){ tog(HR, k, v); },
    // 술어 헬퍼 — 페이지가 자기 F 를 따로 들고 있어도 «걸리나» 판정은 여기 하나를 쓴다
    hit:  function(k, v){ return hitK(EQ, k, v==null?'':String(v).trim()); },
    hitH: function(k, v){ return hitK(HR, k, v==null?'':String(v).trim()); },
    /* loose 축까지 지키는 판정 — pass() 안의 axOk 와 «같은 답»을 낸다.
       ⚠ hit() 만으로는 안 된다. loose 축(사업부)은 «값이 빈 행은 통과»가 규칙인데
         hit('div','') 는 고른 값이 있으면 언제나 false 라, 조인이 안 된 행이 통째로
         사라진다 — 「사업부를 고르면 실적이 반으로 준다」가 바로 그것이다. */
    hitL:  function(k, v){ return hitLG(EQ, k, v); },
    hitLH: function(k, v){ return hitLG(HR, k, v); },
    has:  function(k){ return hasK(EQ, k); },
    hasH: function(k){ return hasK(HR, k); },
    chosen:  function(k){ return listK(EQ, k); },
    chosenH: function(k){ return listK(HR, k); },
    /* 축 목록과 이름표를 내준다 — 손으로 다시 적으면 축이 늘 때 한쪽만 고쳐져 조용히
       갈라진다(filtSummary 가 실제로 자기 사본을 들고 있었다). 배열은 복사해 내보낸다. */
    AXES: AXES.slice(),
    L: L,
    // 활성 필터 칩용 — [{k,label,value}]. 두 벌이므로 인원 쪽은 이름에 «인원» 을 붙인다.
    active: function(){
      const out=[];
      AXES.forEach(function(k){ if(hasK(EQ,k)) out.push({k:k, grp:'eq', label:L[k], value:listK(EQ,k).join(' · ')}); });
      AXES.forEach(function(k){ if(hasK(HR,k)) out.push({k:k, grp:'hr', label:_T().hrPrefix+L[k], value:listK(HR,k).join(' · ')}); });
      if(F.dtFrom||F.dtTo) out.push({k:'period', grp:'eq', label:L.period, value:(F.dtFrom||'…')+' ~ '+(F.dtTo||'…')});
      return out;
    }
  };
  function tog(G, k, v){
    if(!(k in G.F)) return;
    if(MULTI[k]){ if(G.F[k].has(v)) G.F[k].delete(v); else G.F[k].add(v); }
    else G.F[k] = (G.F[k]===v) ? '' : v;
    save(); refresh(); if(CFG && CFG.onChange) CFG.onChange();
  }
})();

GST.autoSidebar = function(){
  if(document.getElementById('gstSidebar')) return;
  /* 순서가 곧 «같은 대시보드로 보이는가»다. 공통 필터(.slicers)가 늘 맨 위에 와야
     페이지를 옮겨도 사이드바 앞부분이 똑같다. 예전에는 .date-panel 을 먼저 밀어 넣어
     설치현황만 「기간·DATE RANGE」가 머리에 붙어 혼자 다르게 보였다. */
  const sections=[];
  const FT=GST._fltT();
  if(document.querySelector('.slicers'))    sections.push({selector:'.slicers',    label:FT.filters,   lbl:'filters'});
  if(document.querySelector('.date-panel')) sections.push({selector:'.date-panel', label:FT.ownPeriod, lbl:'ownPeriod'});
  if(document.querySelector('.filters'))    sections.push({selector:'.filters',    label:FT.own,       lbl:'own'});
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
    try{ window.parent.postMessage({type:'gst-style', style:key}, '*'); }catch(e){ console.warn('[gst] 셸에 style 전파 실패', e); }
  }
  // 차트 색은 생성 시점에 굳으므로 파기 후 재렌더가 필요하다 (테마 전환과 같은 경로)
  const b = document.body ? document.body.className : '';
  const cur = b.indexOf('theme-slate')>-1?'slate' : b.indexOf('theme-light')>-1?'light'
            : b.indexOf('theme-burgundy')>-1?'burgundy' : 'default';
  if(typeof global.changeDashboardTheme==='function'){ try{ global.changeDashboardTheme(cur,cur); }catch(e){} }
  else if(typeof global.render==='function'){ try{ global.render(); }catch(e){ console.warn('[gst] 재렌더 실패', e); } }
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
  h+='<button type="button" class="gb-b'+off(c.style!==false)+'" data-gb="style" title="'+T.sty+'"><span class="gb-sty">'+st.lbl+'</span></button>'
    +'<button type="button" class="gb-b'+off(!!c.ppt)+'" data-gb="ppt" title="'+T.ppt+'"'+dis(!!c.ppt)+'>PPT</button>';
  // 브리핑·피벗 — 페이지가 GST.watch()/GST.pivotReg()로 데이터를 등록하면 자동 활성
  // 배지는 건수가 0이어도 자리를 비워 둔다 — 있고 없고에 따라 바 폭이 달라지면
  // 페이지를 옮길 때마다 툴바가 흔들리고 탭이 밀린다(전 페이지 동일 폭 원칙).
  h+='<button type="button" class="gb-b'+off(!!c.brief)+'" data-gb="brief" title="'+T.brf+'"'+dis(!!c.brief)+'>'+T.brf
    + '<span class="gb-badge"'+(s.briefN?'':' style="visibility:hidden"')+'>'+(s.briefN||0)+'</span></button>'
    +'<button type="button" class="gb-b'+off(!!c.pivot)+'" data-gb="pivot" title="'+T.piv+'"'+dis(!!c.pivot)+'>'+T.piv+'</button>';
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
  if(window.self!==window.top){ try{ window.parent.postMessage(reg,'*'); }catch(e){ console.warn('[gst] 셸에 공통바 등록 실패', e); } }
  else GST._localBar(reg);
};
/* 공통바 버튼 잠금 — 페이지 안에서도, 셸 안에서도 같은 이름으로 부른다.
   iframe 안이면 셸에 알리고, 셸이면 자기 버튼을 직접 잠근다. */
GST._barBusy = function(key, on){
  const b = document.querySelector('[data-gb="'+key+'"]');
  if(b){
    if(on){ if(!b.dataset.old) b.dataset.old = b.textContent;
            b.disabled = true; b.textContent = '⏳ 만드는 중…'; }
    else  { b.disabled = false; if(b.dataset.old){ b.textContent = b.dataset.old; delete b.dataset.old; } }
  }
  if(window.self !== window.top){
    try{ window.parent.postMessage({type:'gst-bar-busy', key:key, on:!!on}, '*'); }catch(e){ console.warn('[gst] 셸에 busy 전파 실패', e); }
  }
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
    else if(typeof global.render==='function'){ try{ global.render(); }catch(e){ console.warn('[gst] 재렌더 실패', e); } }
    else GST.barSync();
    return;
  }
  if(key==='style'){ if(on.style) on.style(); else GST.nextStyle(); return; }
  if(key==='ppt'){
    /* 만드는 데 몇 초가 걸린다(차트 30장을 고배율로 다시 그린다). 그동안 아무 표시가 없으면
       «눌러도 반응이 없다»로 읽히고, 사람은 계속 누른다 — 그러면 동시에 여러 벌이 돈다.
       ⚠ 버튼은 «셸»에 있고 클릭만 이 iframe 으로 전달된다. 여기서 DOM 을 찾아도 없다 —
         그래서 셸에 상태를 알려 셸이 잠근다. */
    GST._barBusy('ppt', true);
    let r; try{ r = on.ppt ? on.ppt() : GST.pptAuto(); }
    catch(e){ GST._barBusy('ppt', false); throw e; }
    Promise.resolve(r).then(function(){ GST._barBusy('ppt', false); },
                           function(e){ GST._barBusy('ppt', false); try{ console.error(e); }catch(x){} });
    return; }
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
      +'#gstLocalBar .gb-b.on{background:var(--accent-1);color:#fff}'
      +'#gstLocalBar .gb-inp{font-family:inherit;background:var(--glass);border:1px solid var(--glass-border);border-radius:8px;'
      +'padding:0 7px;height:27px;color:var(--txt-main);font-size:11px;outline:none;flex:none}'
      +'#gstLocalBar .gb-inp[type=month]{width:118px}'
      +'#gstLocalBar select.gb-inp{width:104px}'
      +'#gstLocalBar .gb-note{font-size:11px;color:var(--txt-muted);font-weight:700;white-space:nowrap;flex:none}'
      +'#gstLocalBar .gb-cut{margin-left:8px}'
      +'#gstLocalBar .off{opacity:.32}'
      +'#gstLocalBar .gb-badge{display:inline-block;margin-left:5px;min-width:15px;padding:0 4px;border-radius:8px;'
      +'background:var(--bad,#D92D20);color:#fff;font-size:9.5px;font-weight:800;line-height:15px;text-align:center}'
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
  const P={tab:(GST.pagePath().replace(/\/index\.html$/,'').split('/').filter(Boolean).pop()||'main'),
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
    return; }

  /* ── 자동순회(키오스크) ── 셸이 단지를 바꿔 가며 페이지를 넘긴다.
     ⚠ 사람이 걸어 둔 필터를 «돌려주지 않으면» 순회 한 번에 화면이 딴 데를 보게 된다.
       페이지는 늦게 뜨기도 하므로(탭 지연 로딩), 셸의 «시작» 신호를 못 받는 경우가 있다.
       그래서 저장은 신호가 아니라 «처음 건드릴 때» 한다 — 그 순간이 곧 손대기 직전이다. */
  if(d.type==='gst-shown'){ try{ GST._arCatchUp(); }catch(x){} return; }   // 셸이 이 iframe 을 보이게 했다 — 건너뛴 자동 새로고침을 이제 한다(v135)
  if(d.type==='gst-kiosk-q'){                   // 이 페이지가 아는 그 축의 값 목록을 알려 준다
    /* 답에 ver 와 page 를 실어 보낸다 — 셸이 «답이 없다»와 «답은 왔는데 목록이 비었다»를
       구분해 사람에게 다른 말을 해줄 수 있어야 한다. 그 둘은 할 일이 완전히 다르다
       (앞은 새로고침, 뒤는 다른 축 고르기). 예전에는 둘 다 «읽는 중…»으로 멈춰 있었다. */
    let list=[]; const ax=d.axis||'campus';
    try{ list=GST.filters.options(ax)||[]; }catch(x){}
    try{ (e.source||window.parent).postMessage(
      {type:'gst-kiosk-a', axis:ax, list:list, ver:GST.VER, page:(GST._pageId||GST.pagePath())}, '*'); }catch(x){}
    return; }
  if(d.type==='gst-kiosk-set'){
    /* 걸었는지를 «반드시» 돌려준다. 그 페이지 자료에 없는 값은 조용히 버려져 «전체»가
       되는데, 셸이 그걸 모르면 하단바가 틀린 사이트 이름을 적극적으로 주장하게 된다. */
    let r = { applied:false, why:'err' };
    try{ r = GST.filters.kioskSet(d.axis||'campus', d.value||''); }catch(x){}
    try{ (e.source||window.parent).postMessage(
      {type:'gst-kiosk-ack', axis:d.axis||'campus', value:d.value||'',
       applied:!!r.applied, why:r.why||''}, '*'); }catch(x){}
    return; }
  if(d.type==='gst-kiosk-restore'){
    try{ GST.filters.kioskRestore(); }catch(x){}
    return; }
});

/* ============================================================
   19. 범용 PPT 내보내기 — 현재 화면의 차트를 슬라이드로
   주간현황은 자체 QBR 양식(downloadPPT)을 쓰고, 나머지 페이지가 이걸 쓴다.
   ============================================================ */
GST._pptP = null;
/* ⚠ 시간 제한이 «반드시» 있어야 한다. 사내망이 CDN 을 «거부»하지 않고 «묵살»하면
   onerror 가 영영 안 오고, await 가 그대로 멈춘다 — 버튼을 눌러도 아무 반응이 없다.
   실제로 그 증상으로 돌아왔다. 에러보다 나쁜 것이 «아무 일도 안 일어나는 것»이다. */
GST.PPT_CDN_MS = 15000;
/* 자체 호스팅 사본 (v134). 사내망이 cdn.jsdelivr.net 을 «묵살»하면 onerror 가 영영 안 오고,
   시간 제한으로 막다른 길은 없앴지만 그 환경에서는 기능 자체를 못 쓴다. 그래서 저장소에 둔다.
   ⚠ 버전을 CDN 폴백과 어긋나게 두지 말 것 — 로더가 둘 중 아무거나 잡으므로, 다르면
     «어떤 사람은 되고 어떤 사람은 안 되는» 상태가 된다(assets/vendor/README.md). */
GST.PPT_VENDOR = '/assets/vendor/pptxgen.bundle.js';                                   // 3.12.0
GST.PPT_CDN    = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
GST.ZIP_VENDOR = '/assets/vendor/jszip.min.js';                                        // 3.10.1
GST.ZIP_CDN    = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
GST.XLSX_VENDOR = '/assets/vendor/xlsx.full.min.js';                                   // 0.18.5 (SheetJS · /upload/)
GST.XLSX_CDN    = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

/* 스크립트 하나를 «시간 제한을 걸고» 싣는다. 자체 사본 → CDN 순으로 본다.
   ⚠ 시간 제한이 이 함수의 존재 이유다. CDN 을 막는 사내망이 «거부»가 아니라 «묵살»을 하면
     onerror 가 안 와서 await 가 영영 멈추고, 버튼을 눌러도 아무 일이 안 일어난다(v105).
   ⚠ ok() 로 «정말 실렸는지»를 본다. 어떤 프록시는 200 에 안내 HTML 을 돌려주는데,
     그때 onload 는 오지만 전역은 없다 — 그걸 성공으로 치면 다음 줄에서 죽는다. */
GST._loadScript = function(urls, ok, ms){
  const list=[].concat(urls).filter(Boolean);
  const one=function(u){
    return new Promise(function(res,rej){
      let done=false;
      const fin=function(good,err){ if(done)return; done=true; clearTimeout(tm);
        good?res():rej(err||new Error('BLOCKED')); };
      const tm=setTimeout(function(){ fin(false, new Error('TIMEOUT')); }, ms||GST.PPT_CDN_MS);
      const s=document.createElement('script');
      s.onload =function(){ ok() ? fin(true) : fin(false, new Error('BLOCKED')); };
      s.onerror=function(){ fin(false, new Error('BLOCKED')); };
      s.src=u; document.head.appendChild(s);
    });
  };
  /* 후보를 차례로 시도한다. ⚠ «어디서 왜» 실패했는지 전부 모아 둔다 —
     자체 사본이 404 인지 CDN 이 막힌 것인지 구별되어야 사람이 무엇을 할지 안다. */
  const errs=[];
  const next=function(i){
    if(ok()) return Promise.resolve();
    if(i>=list.length){
      const e=new Error(errs.join(' ')/*아래 tried 로 본다*/.indexOf('TIMEOUT')>=0?'TIMEOUT':'BLOCKED');
      e.tried=errs.join(' · ');
      return Promise.reject(e);
    }
    return one(list[i]).catch(function(err){
      const host=/^https?:/.test(list[i]) ? list[i].replace(/^https?:\/\/([^/]+).*$/,'$1') : '자체 사본';
      errs.push(host+' '+(err&&err.message||'?'));
      return next(i+1);
    });
  };
  return next(0);
};
GST.pptLoad = function(){
  if(window.PptxGenJS) return Promise.resolve();
  if(GST._pptP) return GST._pptP;
  GST._pptP = GST._loadScript([GST.PPT_VENDOR, GST.PPT_CDN], function(){ return !!window.PptxGenJS; })
    .catch(function(e){ GST._pptP=null; throw e; });
  return GST._pptP;
};
/* JSZip — 양식 수술(주간현황 PPT)이 쓴다. 예전에는 report 안에 시간 제한 «없는» 로더가
   따로 있었다(v105 규율이 그 파일만 안 지켜졌다). 여기 한 곳으로 모은다. */
GST.zipLoad = function(){
  if(window.JSZip) return Promise.resolve();
  if(GST._zipP) return GST._zipP;
  GST._zipP = GST._loadScript([GST.ZIP_VENDOR, GST.ZIP_CDN], function(){ return !!window.JSZip; })
    .catch(function(e){ GST._zipP=null; throw e; });
  return GST._zipP;
};
/* 한 줄 토스트 — 여덟 페이지가 바이트까지 같은 사본을 들고 있었다(v135 · 8단계에 core 로).
   ⚠ 페이지 사본은 지우지 않고 «위임»으로 남긴다 — 호출부가 55곳이라 이름을 없애면
     그 55곳을 한꺼번에 고쳐야 하고, 한 곳만 빠지면 그 화면에서 토스트가 조용히 사라진다. */
GST.capToast = function(msg){
  let el=document.getElementById('capToast');
  if(!el){ el=document.createElement('div'); el.id='capToast'; document.body.appendChild(el); }
  el.textContent=msg; el.style.opacity='1';
  clearTimeout(el._h); el._h=setTimeout(function(){ el.style.opacity='0'; },1600);
};
/* 실패를 «보이게» 알린다. alert 는 브라우저·확장에 따라 안 뜨는 자리가 있어 토스트를 먼저 쓴다.
   ⚠ window.capToast 를 먼저 보는 이유 — 페이지가 자기 토스트(다른 자리·다른 모양)를 갖고
     있을 수 있다. 지금은 전부 GST.capToast 로 위임하지만 그 폴백 방향은 그대로 둔다. */
GST._pptSay = function(msg){
  try{ if(typeof window.capToast==='function'){ window.capToast(msg); return; } }catch(e){}
  try{ GST.capToast(msg); return; }catch(e){}
  try{ alert(msg); }catch(e){}
  try{ console.warn('[PPT] '+msg); }catch(e){}
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
/* 필터 요약 한 줄 — PPT 머리·표 캡션이 «지금 무엇을 걸러 본 숫자인지» 말하게 한다.
   조직 축 이름은 GST.filters 의 L 과 같은 낱말을 쓴다(사람이 사이드바에서 본 그 말). */
GST.filtSummary = function(){
  const F = (GST.filters && GST.filters.F) || {};
  /* ⚠ 여기에 이름표 사본을 두면 축이 늘 때 한쪽만 고쳐진다 — 실제로 라인2 를 더할 때
     사이드바에는 뜨는데 장표 머리에는 안 적히는 상태가 될 뻔했다(제2원칙).
     정본은 GST.filters 다. 옛 배포본(내주기 전 core.js)만 사본으로 되돌아간다. */
  const FL = (GST.filters && GST.filters.L) || {};
  const AX = (GST.filters && GST.filters.AXES)
          || ['region','team','op','customer','div','campus','line','line2'];
  const L = {}; AX.forEach(function(k){ L[k] = FL[k] || k; });
  const out = [];
  Object.keys(L).forEach(function(k){
    const v = F[k];
    /* 축이 전부 Set 이 됐다(v106). 셋을 넘으면 이름을 다 적는 대신 개수로 줄인다 —
       장표 머리가 한 줄을 넘으면 그 줄 자체가 안 읽힌다. */
    if(v instanceof Set){ if(v.size) out.push(L[k]+' '+(v.size>3 ? v.size+'개' : Array.from(v).join('/'))); }
    else if(v) out.push(L[k]+' '+v);
  });
  if(F.dtFrom || F.dtTo) out.push('기간 '+(F.dtFrom||'')+'~'+(F.dtTo||''));
  /* ⚠ 공통 필터만 보면 «페이지 전용» 필터(모델·공정·설비 등)가 빠진다 — 모델 하나만 걸어
     놓고 뽑은 장표에 「전체」라고 적히면 받아 본 사람은 전사 숫자로 읽는다.
     화면의 필터 칩이 그 페이지의 «진짜» 상태이므로, 있으면 그것을 보탠다. */
  try{
    const own = [].slice.call(document.querySelectorAll('#fchips .fchip, #fchipList .fchip'))
      .map(function(c){ return (c.innerText||'').replace(/\s*✕\s*$/,'').trim(); })
      .filter(function(t){ return t && out.indexOf(t)<0 && !out.some(function(o){ return o.indexOf(t)>=0; }); });
    own.forEach(function(t){ out.push(t); });
  }catch(e){}
  return out.length ? out.join(' · ') : '전체';
};

/* 차트를 «흰 바탕 · 어두운 글자»로 잠깐 바꿔 캡처한다 (PPT 양식은 흰 종이다).
   ⚠ 왜 옵션을 복제하지 않고 «제자리에서 바꿨다 되돌리나» — 축 눈금 콜백(날짜 포맷)·
     커스텀 플러그인이 옵션에 함수로 들어 있어 JSON 복제로는 통째로 날아간다. 실제로
     복제 방식을 쓰면 x축이 타임스탬프 숫자로 찍힌다. devicePixelRatio 를 바꿨다 되돌리는
     기존 방식과 같은 규율이다.
   되돌리기는 반드시 finally 로 — 중간에 던지면 화면 차트가 «흰 글자 없는» 상태로 굳는다. */
/* 흰 종이(#FFF)에 얹었을 때 «안 보일 만큼» 밝은 색인가. 상대 광도 0.55 를 경계로 둔다 —
   #E6EDF3(0.85)·흰색은 걸리고, 회색 보조글자 #8B98A9(0.32)·빨강 표식 #fb7185(0.33)는 남는다. */
GST._tooLight = function(c){
  if(typeof c !== 'string') return false;
  let r,g,b;
  const h = c.trim().replace(/^#/,'');
  if(/^[0-9a-f]{6}$/i.test(h)){ r=parseInt(h.slice(0,2),16); g=parseInt(h.slice(2,4),16); b=parseInt(h.slice(4,6),16); }
  else if(/^[0-9a-f]{3}$/i.test(h)){ r=parseInt(h[0]+h[0],16); g=parseInt(h[1]+h[1],16); b=parseInt(h[2]+h[2],16); }
  else { const m=c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i); if(!m) return false; r=+m[1]; g=+m[2]; b=+m[3]; }
  const lin = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  return (0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)) > 0.55;
};
GST._chartLight = function(ch){
  const undo = [];
  /* «없던 키»는 undefined 로 되돌리지 말고 지운다. 값은 같아 보여도 `'color' in o` 가
     달라지고, 그걸로 «넘겼는지»를 판단하는 코드가 생기면 그때부터 조용히 갈린다. */
  const set = function(o,k,v){ if(!o) return; undo.push([o,k,o[k],(k in o)]); o[k]=v; };
  /* ⚠ «읽은 것을 도로 써 넣지» 말 것. Chart.js v4 의 옵션은 프록시라
     `ax.ticks = ax.ticks || {}` 가 프록시를 자기 자신에게 대입하고, 그 뒤 접근이
     무한 재귀로 들어간다(RangeError: Maximum call stack size exceeded).
     그러면 이 함수가 던지고 → chartHiResLight 가 죽고 → **PPT 내보내기가 통째로
     안 된다.** 실측으로 잡았다(고장분석 x·y 축 둘 다). 없을 때만 만든다. */
  const ensure = function(o,k){ if(o && !o[k]) o[k] = {}; return o ? o[k] : null; };
  const sc = ch.options.scales || {};
  Object.keys(sc).forEach(function(k){
    const ax = sc[k]; if(!ax || typeof ax !== 'object') return;
    set(ensure(ax,'ticks'),'color','#333333');
    const g = ensure(ax,'grid'); set(g,'color','#E3E3E3'); set(g,'borderColor','#C9CDD3');
    if(ax.title) set(ax.title,'color','#333333');
    if(ax.pointLabels) set(ax.pointLabels,'color','#333333');
  });
  const pl = ch.options.plugins || {};
  if(pl.legend){ set(ensure(pl.legend,'labels'),'color','#333333'); }
  if(pl.title) set(pl.title,'color','#111111');
  /* 자체 플러그인이 캔버스에 «직접» 찍는 글자(막대 위 값·도넛 가운데 TOTAL)는 색을
     자기 옵션에 들고 있다(valLabel.color · dCenter.color/mut). 어두운 테마 기본값이
     밝은 색이라 흰 종이에 그대로 찍으면 **글자가 통째로 사라진다** — 렌더는 성공하므로
     에러도 경고도 없고, 「숫자 없는 막대」를 받은 사람은 값을 못 읽는다.
     ⚠ 플러그인 이름을 나열하지 않는다. 나열하면 새 플러그인이 생길 때마다 같은 사고가
       난다. 물어야 할 것은 하나다 — «이 색이 흰 종이에서 안 보일 만큼 밝은가».
       그래서 빨강 이상치 표식(#fb7185, 광도 0.33) 같은 «의미 있는 색»은 건드리지 않는다. */
  Object.keys(pl).forEach(function(k){
    const o = pl[k]; if(!o || typeof o !== 'object') return;
    /* 색을 «안 넘긴» 차트도 있다(hr 의 원형 차트 등). 그때는 플러그인이 자기 기본값을
       쓰는데, 이 프로젝트의 플러그인 기본색은 전부 어두운 테마용(#E6EDF3)이다 —
       즉 «없음»도 «밝음»과 같은 뜻이다. 되돌릴 때 undefined 로 돌아가므로 안전하다. */
    ['color','mut','textColor'].forEach(function(f){
      if(!(f in o) || GST._tooLight(o[f])) set(o, f, f === 'mut' ? '#666666' : '#333333');
    });
  });
  if(window.Chart && Chart.defaults) set(Chart.defaults,'color','#333333');
  return function(){ for(let i=undo.length-1;i>=0;i--){
    const u=undo[i]; if(u[3]) u[0][u[1]] = u[2]; else delete u[0][u[1]]; } };
};
/* 차트를 고배율로 다시 그려 캔버스로. light=true 면 흰 종이용(위 _chartLight). */
GST.chartHiResLight = function(id, scale){
  const cv = document.getElementById(id); if(!cv) return null;
  let ch = null;
  try{ ch = (window.Chart && Chart.getChart) ? Chart.getChart(cv) : null; }catch(e){}
  if(!ch && window.CHARTS) ch = window.CHARTS[id];
  if(!ch) return null;
  const w = cv.clientWidth||400, h = cv.clientHeight||300;
  if(!scale) scale = Math.min(6, Math.max(3, Math.round(2400/w)));
  const prev = ch.options.devicePixelRatio;
  const restore = GST._chartLight(ch);
  let oc = null;
  try{
    ch.options.devicePixelRatio = scale; ch.resize(); ch.render();
    oc = document.createElement('canvas');
    oc.width = Math.round(w*scale); oc.height = Math.round(h*scale);
    const g = oc.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0,0,oc.width,oc.height);
    g.drawImage(cv,0,0,oc.width,oc.height);
  } finally {
    restore();
    ch.options.devicePixelRatio = prev; ch.resize(); ch.render();
  }
  return oc;
};

/* 범용 PPT — 주간현황(QBR) 양식과 같은 얼굴로 낸다.
   흰 종이 · 왼쪽 섹션 제목 · 오른쪽 법인 상자 · 굵은 검정 가로줄 · 검정 머리띠를 인 칸.
   한 장에 최대 6개(3×2). 그 이상이면 슬라이드가 늘고 제목에 (2/3)이 붙는다.
   ⚠ 페이지마다 만들지 말 것 — 여기 하나를 6개 페이지(설치·PM·고장·자재·CIP·TCO)가 쓴다.
     예전에는 이 함수가 «어두운 바탕에 차트 한 장씩»이라 양식과 전혀 달랐다. */

/* ============================================================
   Chart.js 차트 → PowerPoint «네이티브» 차트 (v134)

   왜 되살렸나. 이 세 함수는 2026-08-04 에 양식 수술 방식(주간현황 downloadPPT)이
   들어오면서 `_downloadPPT_legacy` 안에 갇혀 «정의만 되고 아무도 안 부르는» 코드가 됐다.
   그 뒤로 나머지 일곱 페이지의 PPT 는 전부 «그림»이었다 — 받아 본 사람이 PPT 안에서
   값을 못 고치고, 색·축·글꼴도 못 바꾼다. 사용자가 「예전에 차트로 나왔던 것 같은데」라고
   한 것이 이것이다.

   ⚠ 브라우저는 클립보드에 파워포인트 «차트 개체»를 올릴 수 없다(형식이 명세로 닫혀 있다).
     그래서 «복사»가 아니라 «파일»이 답이다 — 내려받아 열고 그 차트를 복사해 자기 덱에
     붙이면 편집 가능한 차트가 된다.

   ⚠ 모든 차트가 넘어가지는 않는다. 넘어가는 것은 «막대·꺾은선 + 범주축» 뿐이다.
     도넛(가운데 TOTAL 을 플러그인이 그린다)·산점도·수치축 차트는 네이티브로 옮기면
     화면과 다른 그림이 되므로 **그림으로 남긴다.** 그리고 어느 카드가 그림인지 밝힌다 —
     조용히 떨어뜨리면 「왜 이 차트만 편집이 안 되지」가 된다.
   ============================================================ */
GST.pptHex = function(c){ // Chart.js 색 → PPT 6자리 HEX ('#' 금지) · 알파는 흰 배경 블렌딩(반투명 막대 구분 유지)
  if(Array.isArray(c))c=c.find(v=>typeof v==='string')||c[0];
  if(typeof c!=='string')return '5B9BD5';
  const bl=(r,g,b,a)=>[r,g,b].map(v=>Math.round(v*a+255*(1-a)).toString(16).padStart(2,'0')).join('').toUpperCase();
  if(c[0]==='#'){
    let h=c.slice(1); if(h.length===3||h.length===4)h=h.split('').map(x=>x+x).join('');
    const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    if([r,g,b].some(isNaN))return '5B9BD5';
    const a=h.length>=8?parseInt(h.slice(6,8),16)/255:1;
    return bl(r,g,b,isNaN(a)?1:a);
  }
  const m=c.match(/rgba?\s*\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s\/]+([\d.]+))?/i);
  if(m)return bl(+m[1],+m[2],+m[3],m[4]!==undefined?+m[4]:1);
  return '5B9BD5';
};
GST.pptSrc = function(ch){ // Chart.js 인스턴스 → {labels,bars,lines,stacked} (숨긴 시리즈 제외)
  if(!ch||!ch.data)return null;
  const t0=(ch.config&&ch.config.type)||'';
  if(t0==='doughnut'||t0==='pie'){   // 도넛·파이 — 계열 하나 · 조각마다 색 (v135)
    const ds0=ch.data.datasets[0]||{}; const labels0=(ch.data.labels||[]).map(function(v){ return String(v==null?'':v); });
    const vals=(ds0.data||[]).map(function(v){ return +v||0; });
    const bg=ds0.backgroundColor;
    const cols=labels0.map(function(_,i){ return GST.pptHex(Array.isArray(bg)?bg[i]:bg); });
    /* 가운데 합계는 화면 플러그인(dCenter)과 «같은 식» — datasets[0].data 의 합. 두 벌이면 화면과 다른 숫자가 나간다. */
    return {pie:true, hole:t0==='doughnut', labels:labels0, values:vals, colors:cols, name:String(ds0.label||''),
            total:vals.reduce(function(a,b){ return a+b; },0), bars:[], lines:[]};
  }
  const labels=GST.pptLabels(ch), bars=[], lines=[];
  ch.data.datasets.forEach((ds,i)=>{
    try{ const mt=ch.getDatasetMeta(i); if(mt&&mt.hidden)return; }catch(e){}
    if(ds.hidden)return;
    const isLn=(ds.type||ch.config.type)==='line';
    const vals=(ds.data||[]).map(v=>v==null?0:(typeof v==='object'?+(v.y||0):(+v||0)));
    (isLn?lines:bars).push({name:String(ds.label||''),values:vals,
      color:GST.pptHex(isLn?(ds.borderColor||ds.backgroundColor):(ds.backgroundColor||ds.borderColor)),
      y2:ds.yAxisID==='y2'});
  });
  const sc=(ch.options&&ch.options.scales)||{};
  // 렌더된 실제 축 경계 캡처 → PPT 축이 대시보드와 동일 스케일
  /* ⚠ 가로 막대는 «값축이 x» 다. y 를 읽으면 범주 개수(0~N)가 값 범위로 들어가
     막대가 통째로 찌그러진다. 값축을 골라 읽되 키는 'y'(=값축)로 통일한다. */
  const horiz=GST.pptCatAxis(ch)==='y';
  const bounds={};
  [[horiz?'x':'y','y'],['y2','y2']].forEach(pr=>{const s=ch.scales&&ch.scales[pr[0]];
    if(s&&isFinite(s.min)&&isFinite(s.max))bounds[pr[1]]={min:s.min,max:s.max};});
  /* 화면이 막대 위에 값을 찍고 있으면 PPT 에서도 찍는다 — 안 그러면 같은 차트가
     내보낸 순간 «숫자 없는 그림»이 되어 카드와 다른 말을 한다. */
  const vl=(ch.options&&ch.options.plugins&&ch.options.plugins.valLabel)||null;
  return {labels,bars,lines,stacked:!!((sc.y&&sc.y.stacked)||(sc.x&&sc.x.stacked)),bounds,
          horiz:horiz, showValue:!!(vl&&vl.mode)};
};
GST.pptCombo = function(pres,slide,src,x,y,w,h){ // 막대+꺾은선 네이티브 콤보 차트 (도넛·파이도 여기서 · v135)
  if(!src) return;
  if(src.pie){
    slide.addChart(pres.ChartType[src.hole?'doughnut':'pie'], [{name:src.name||'', labels:src.labels, values:src.values}],
      {x:x,y:y,w:w,h:h, chartColors:src.colors, holeSize:src.hole?58:0, showLegend:true, legendPos:'b', legendFontSize:7.5,
       legendColor:'333333', showTitle:false, showValue:true, showPercent:false, dataLabelColor:'333333', dataLabelFontSize:7.5,
       dataLabelPosition:'bestFit', dataLabelFormatCode:'#,##0'});
    if(src.hole){   // 화면의 가운데 TOTAL 과 같은 숫자를 구멍에 얹는다 — 범례(아래) 높이만큼 위로
      const cx=x+w/2, cy=y+(h-0.35)*0.5;
      slide.addText(String(src.total.toLocaleString()), {x:cx-0.9, y:cy-0.24, w:1.8, h:0.30, align:'center', valign:'middle', fontSize:14, bold:true, color:'111111', margin:0});
      slide.addText('TOTAL', {x:cx-0.9, y:cy+0.06, w:1.8, h:0.20, align:'center', valign:'top', fontSize:7, color:'808080', margin:0});
    }
    return;
  }
  if(!src.bars.length&&!src.lines.length)return;
  const ln1=src.lines.filter(l=>!l.y2), ln2=src.lines.filter(l=>l.y2);
  const useY2=ln2.length>0&&(src.bars.length>0||ln1.length>0);
  const types=[];
  if(src.bars.length)types.push({type:'bar',
    data:src.bars.map(b=>({name:b.name,labels:src.labels,values:b.values})),
    /* barDir: 'bar' = 가로 · 'col' = 세로. 화면이 가로 막대면 PPT 도 가로여야 한다 —
       세로로 내보내면 라벨이 겹쳐 읽을 수 없는 장표가 된다. */
    options:{chartColors:src.bars.map(b=>b.color),barDir:src.horiz?'bar':'col',
             barGrouping:src.stacked?'stacked':'clustered'}});
  const lnOpt=ls=>({chartColors:ls.map(l=>l.color),lineSize:1.5,lineSmooth:false,
    lineDataSymbol:'circle',lineDataSymbolSize:4});
  if(ln1.length)types.push({type:'line',
    data:ln1.map(l=>({name:l.name,labels:src.labels,values:l.values})),options:lnOpt(ln1)});
  if(ln2.length){const o=lnOpt(ln2); if(useY2){o.secondaryValAxis=true;o.secondaryCatAxis=true;}
    types.push({type:'line',data:ln2.map(l=>({name:l.name,labels:src.labels,values:l.values})),options:o});}
  const o={x,y,w,h,chartArea:{fill:{color:'FFFFFF'}},barGapWidthPct:60,
    catAxisLabelColor:'333333',catAxisLabelFontSize:7.5,catAxisLineColor:'BFBFBF',
    valAxisLabelColor:'333333',valAxisLabelFontSize:7.5,valAxisLineColor:'BFBFBF',
    valGridLine:{color:'E8E8E8',size:0.5},catGridLine:{style:'none'},
    /* 이름 없는 계열만 있으면 범례를 끈다. 켜 두면 pptxgenjs 가 «Series1» 이라고 적는데,
       화면에는 없는 글자다 — 장표가 화면과 다른 말을 하게 된다. */
    showLegend:src.bars.concat(src.lines).some(function(d){ return String(d.name||'').trim()!==''; }),
    legendPos:'b',legendFontSize:7.5,legendColor:'333333',showTitle:false,
    showValue:!!src.showValue,dataLabelFontSize:7,dataLabelColor:'333333',dataLabelFormatCode:'#,##0.##'};
  const bd=src.bounds||{};
  if(bd.y){ if(isFinite(bd.y.min))o.valAxisMinVal=bd.y.min; if(isFinite(bd.y.max))o.valAxisMaxVal=bd.y.max; }
  if(useY2){ // 보조축 사용 시 valAxes+catAxes 2쌍 필수 (미지정 시 PPT가 차트 폐기)
    const a1={showValAxisTitle:false,valGridLine:{color:'E8E8E8',size:0.5}};
    const a2={showValAxisTitle:false,valGridLine:{style:'none'}};
    if(bd.y){ if(isFinite(bd.y.min))a1.valAxisMinVal=bd.y.min; if(isFinite(bd.y.max))a1.valAxisMaxVal=bd.y.max; }
    if(bd.y2){ if(isFinite(bd.y2.min))a2.valAxisMinVal=bd.y2.min; if(isFinite(bd.y2.max))a2.valAxisMaxVal=bd.y2.max; }
    o.valAxes=[a1,a2];
    o.catAxes=[{catAxisLabelFontSize:7.5},{catAxisHidden:true}];
  }
  slide.addChart(types,o);
};

/* «이 차트를 네이티브로 옮겨도 화면과 같은 그림인가». 아니면 그림으로 남긴다.
   ⚠ 여기서 «된다»고 잘못 말하면 그 카드는 조용히 다른 그림이 되어 나간다 —
     받아 본 사람은 그것이 화면과 다르다는 것을 알 방법이 없다. 의심스러우면 false 다. */
GST.pptNativeOK = function(ch){
  if(!ch||!ch.data) return '';
  const t=(ch.config&&ch.config.type)||'';
  /* 도넛·파이는 네이티브로 간다(v135) — 가운데 TOTAL 은 pptCombo 가 같은 식(datasets[0] 합)으로 글자로 얹는다.
     v134 가 「도넛은 그림」으로 둔 것은 그 합계 글자 때문이었는데, 글자를 따로 얹으면 화면과 같은 그림이다. */
  if(t==='doughnut'||t==='pie'){
    const ds0=(ch.data.datasets||[])[0]; const n0=(ch.data.labels||[]).length;
    if(!ds0||!n0) return '데이터 없음';
    if((ds0.data||[]).length!==n0) return '계열 길이가 라벨 수와 다름';
    return '';
  }
  if(t!=='bar'&&t!=='line') return '산점도 등은 그림';
  /* ⚠ 가로 막대(indexAxis:'y')는 «범주축이 y» 다. x 만 보면 그 차트들이 전부
     「수치축」으로 잘못 떨어진다 — 실측 설치현황·인원 화면의 막대 상당수가 가로 막대다. */
  const cax=GST.pptCatAxis(ch);
  /* 범주축이 아니면 «칸 하나에 값 하나»가 성립하지 않는다. 이 프로젝트는 날짜 어댑터를
     안 싣고 타임스탬프를 linear 축에 넣어 눈금 콜백으로 날짜를 찍는 차트가 있다
     (CLAUDE.md 코드 관례) — 그런 차트의 labels 를 그대로 쓰면 축에 숫자가 찍힌다. */
  const xs=ch.scales&&ch.scales[cax];
  if(xs&&xs.type&&xs.type!=='category') return '수치축(범주축이 아님)';
  /* 가로 막대에 «꺾은선»이 섞이면 콤보 배치가 성립하지 않는다(값축이 가로다).
     흔치 않으므로 억지로 옮기지 않고 그림으로 남긴다 — 잘못 옮기면 축이 뒤집힌다. */
  if(cax==='y' && (ch.data.datasets||[]).some(function(d){ return (d.type||t)==='line'; }))
    return '가로 막대 + 꺾은선 조합';
  const n=(ch.data.labels||[]).length;
  if(!n) return '범주 라벨 없음';
  /* 데이터셋 길이가 라벨 수와 다르면(꼬리 예측 막대 등) 칸이 어긋난다. */
  const ds=ch.data.datasets||[];
  if(!ds.length) return '데이터 없음';
  for(let i=0;i<ds.length;i++){ const d=ds[i].data||[];
    if(d.length && d.length!==n) return '계열 길이가 라벨 수와 다름';
    if(d.length && typeof d[0]==='object' && d[0]!==null && !('y' in d[0])) return '좌표형 데이터';
  }
  return '';                                   // 빈 문자열 = 넘어간다
};

/* 축에 «화면이 실제로 찍은 글자»를 쓴다. 눈금 콜백이 붙은 축은 data.labels 와 다를 수
   있고(예: 25-08 → '8월'), 그때 labels 를 그대로 쓰면 PPT 만 다른 말을 한다(v125 규약). */
/* 범주축이 어느 쪽인가. 가로 막대(indexAxis:'y')는 y 가 범주축이다.
   ⚠ 이 판정을 함수마다 다시 적으면 「어떤 차트는 축이 뒤집혀 나간다」가 온다. */
GST.pptCatAxis = function(ch){
  return ((ch&&ch.options&&ch.options.indexAxis)==='y') ? 'y' : 'x';
};
GST.pptLabels = function(ch){
  const raw=(ch.data.labels||[]).map(function(v){ return String(v==null?'':v); });
  try{
    const ax=ch.scales&&ch.scales[GST.pptCatAxis(ch)];
    const tk=ax&&ax.ticks;
    if(tk&&tk.length===raw.length){
      const out=tk.map(function(t){ return String(t&&t.label!=null?t.label:''); });
      if(out.every(function(v){ return v!==''; })) return out;
    }
  }catch(e){}
  return raw;
};

/* ============================================================
   카드 하나 → 한 장짜리 PPT (v134 · 사용자 요청)

   「차트에서 바로 PPT 로 따고 싶다」의 답이다. 클립보드로는 «차트 개체»를 못 올리므로
   (브라우저가 쓸 수 있는 형식이 명세로 닫혀 있다) 파일로 준다 —
   내려받아 열고, 그 차트를 복사해 자기 덱에 붙이면 «편집 가능한 차트»가 된다.

   ⚠ 판정·매핑을 여기서 새로 짜지 않는다. pptAuto 와 «같은» pptNativeOK·pptSrc·pptCombo 를
     쓴다(제2원칙). 두 벌이면 「전체 내보내기와 이 버튼이 다른 그림을 낸다」가 온다.
   ⚠ 못 옮기는 차트에는 그림을 내보내지 않는다 — 그러면 「📋 그림」과 똑같아져 버튼이
     둘 있을 이유가 없어진다. 대신 «왜 안 되는지와 무엇을 쓰면 되는지»를 말한다.
   ============================================================ */
GST.pptCard = async function(id){
  const cv=document.getElementById(id);
  const ch=(cv && window.Chart && Chart.getChart) ? Chart.getChart(cv) : null;
  if(!ch){ GST._pptSay('차트를 찾을 수 없습니다'); return; }
  const why=GST.pptNativeOK(ch);
  if(why){ const T=GST._expT(); GST._pptSay(T.img+' ('+why+') — '+T.data+' / '+T.png); return; }
  try{ await GST.pptLoad(); }
  catch(e){
    GST._pptSay('PPT 라이브러리를 불러오지 못했습니다 ('+(e&&e.tried||e&&e.message||'?')+')'
      + ' — assets/vendor/pptxgen.bundle.js 가 배포됐는지 확인하고, 그래도 안 되면 「'+GST._expT().data+'」를 쓰세요.');
    return; }
  /* 흰 종이용 색으로 바꿨다 되돌린다 — pptAuto 와 같은 규율(v103).
     ⚠ 되돌리기는 finally 에 둔다. 중간에 던지면 화면 차트 색이 굳어, 내보내기를 한 번
       눌렀을 뿐인데 어두운 테마에서 글자가 안 보이게 된다. */
  const restore=GST._chartLight(ch);
  let src=null;
  try{ src=GST.pptSrc(ch); }
  finally{ try{ restore&&restore(); }catch(e){} }
  if(!src){ GST._pptSay('차트 데이터를 못 읽었습니다'); return; }
  const cap=GST.cardTitle(id);
  const FONT='맑은 고딕';
  const p=new PptxGenJS(); p.layout='LAYOUT_WIDE';   // 13.33 × 7.5 in — 아래 좌표가 그 전제다
  const s=p.addSlide(); s.background={color:'FFFFFF'};
  s.addText(cap, {x:0.5, y:0.30, w:9.2, h:0.42, fontFace:FONT, fontSize:15, bold:true, color:'111111', margin:0, valign:'middle'});
  s.addText(GST.ymdL()+' 기준 · '+GST.filtSummary(),
    {x:0.5, y:0.72, w:12.3, h:0.24, fontFace:FONT, fontSize:8, color:'808080', margin:0});
  s.addShape(p.ShapeType.rect, {x:9.9, y:0.24, w:2.9, h:0.40, fill:{color:'FFFFFF'}, line:{color:'000000', width:1}});
  s.addText(String(GST.corpLabel()||'').toUpperCase(),
    {x:9.9, y:0.24, w:2.9, h:0.40, fontFace:FONT, fontSize:12, bold:true, color:'111111', align:'center', valign:'middle', margin:0});
  GST.pptCombo(p, s, src, 0.5, 1.10, 12.3, 5.60);
  const fn=cap.replace(/[\\/:*?"<>|]/g,'').slice(0,40)+'_'+GST.ymdL()+'.pptx';
  await p.writeFile({fileName:fn});
  GST._pptSay('⤓ '+fn+' — '+GST._expT().hint);
};
/* ============================================================
   카드 내보내기 한 벌 — 「내보내기 ▾」 (v135 · 3단계 · 사용자 요청)

   사용자: 「이미지로 복사하는 건 필요없고, 개별로 필요할 때 차트를 (수정 가능한) 복사해서 PPT 나
   엑셀에 바로 붙여넣기 할 수 있으면」. 클립보드로 «차트 개체»는 못 올리므로(v133 확정) 답은 파일이다 —
   한 카드에서 «PPT 차트(.pptx)» · «엑셀 차트(.xlsx)» · «데이터 복사(표)» 를 고른다.
   「📋 그림」은 없앴다(사용자 확정). 그림이 유일한 답인 차트(산점도 등)에서만 「PNG 저장」이 뜬다.

   ⚠ 버튼·메뉴·판정은 여기 한 곳이다. 예전에는 여덟 페이지가 addCapBtns 를 각자 짜서 선택자가 넷으로
     갈렸고, fault 3·hr 1·material 1 차트에는 버튼이 아예 안 붙었다(감사 실측). 카드 선택자도
     GST.CARD_SEL 한 벌 — pptAuto·축 편집(axBtns)·스켈레톤이 같은 목록을 본다.
   ⚠ 표 복사 기계(chartGrid·gridHTML·gridTSV·copyChartData)는 report 안에 갇혀 있던 것을 올린 것이다.
     report 는 같은 이름의 얇은 위임만 남긴다(t-abp 가 그 전역 이름을 부른다).
   ============================================================ */
GST.CARD_SEL = '.card,.trend-card,.cross-card,.tablecard';
GST.cardOf = function(el){ return (el && el.closest) ? el.closest(GST.CARD_SEL) : null; };
GST.chartCanvases = function(){
  const sel = GST.CARD_SEL.split(',').map(function(s){ return s+' canvas'; }).join(',');
  return [].slice.call(document.querySelectorAll(sel));
};
GST.chartOf = function(id){
  const cv = (typeof id==='string') ? document.getElementById(id) : id;
  if(!cv) return null;
  try{ const ch = (window.Chart && Chart.getChart) ? Chart.getChart(cv) : null; if(ch) return ch; }catch(e){}
  return (window.CHARTS && cv.id && window.CHARTS[cv.id]) || null;
};
GST.EXP_T = {
  ko:{btn:'내보내기 ▾', ppt:'PPT 차트 (.pptx)', xlsx:'엑셀 차트 (.xlsx)', data:'데이터 복사 (표)', png:'PNG 저장',
      hint:'파일을 열어 차트를 복사(Ctrl+C)하면 PPT·엑셀 어디든 편집 가능한 차트로 붙습니다',
      img:'이 차트는 그림으로만 내보낼 수 있습니다', nochart:'차트를 찾을 수 없습니다',
      copied:'데이터 복사됨 — PPT·엑셀에 붙여넣기(Ctrl+V)', copiedTxt:'데이터(텍스트) 복사됨 — 붙여넣기(Ctrl+V)',
      copyFail:'복사 미지원 브라우저 — 「엑셀 차트」로 내려받으세요', saved:'저장됨', xlsxFail:'엑셀 파일을 만들지 못했습니다'},
  en:{btn:'Export ▾', ppt:'PPT chart (.pptx)', xlsx:'Excel chart (.xlsx)', data:'Copy data (table)', png:'Save PNG',
      hint:'Open the file and copy the chart (Ctrl+C) — it pastes into PPT or Excel as an editable chart',
      img:'This chart can only be exported as a picture', nochart:'Chart not found',
      copied:'Data copied — paste into PPT/Excel (Ctrl+V)', copiedTxt:'Data copied as text — paste (Ctrl+V)',
      copyFail:'Clipboard not supported — download the Excel chart instead', saved:'saved', xlsxFail:'Could not build the Excel file'},
  zh:{btn:'导出 ▾', ppt:'PPT 图表 (.pptx)', xlsx:'Excel 图表 (.xlsx)', data:'复制数据 (表)', png:'保存 PNG',
      hint:'打开文件后复制图表(Ctrl+C)，粘贴到 PPT 或 Excel 即为可编辑图表',
      img:'此图表只能导出为图片', nochart:'找不到图表',
      copied:'数据已复制 — 粘贴到 PPT/Excel (Ctrl+V)', copiedTxt:'数据已复制为文本 — 粘贴 (Ctrl+V)',
      copyFail:'浏览器不支持剪贴板 — 请下载 Excel 图表', saved:'已保存', xlsxFail:'无法生成 Excel 文件'},
  ja:{btn:'エクスポート ▾', ppt:'PPT グラフ (.pptx)', xlsx:'Excel グラフ (.xlsx)', data:'データをコピー (表)', png:'PNG 保存',
      hint:'ファイルを開いてグラフをコピー(Ctrl+C)すれば PPT・Excel に編集可能なグラフとして貼れます',
      img:'このグラフは画像でのみ出力できます', nochart:'グラフが見つかりません',
      copied:'データをコピーしました — PPT/Excel に貼り付け(Ctrl+V)', copiedTxt:'データをテキストでコピーしました — 貼り付け(Ctrl+V)',
      copyFail:'クリップボード非対応 — Excel グラフをダウンロードしてください', saved:'保存しました', xlsxFail:'Excel ファイルを作れませんでした'}
};
GST._expT = function(){ const l=(GST._lang && GST._lang()) || 'ko'; return GST.EXP_T[l] || GST.EXP_T.ko; };
GST.exportBtn = function(id){
  const T=GST._expT();
  return '<button class="capbtn gexp-btn" type="button" data-gexp="'+id+'" title="'+T.hint+'"'
       + ' onclick="GST.exportMenu(this,\''+id+'\')">'+T.btn+'</button>';
};
GST.pptCardBtn = GST.exportBtn;   // 옛 이름 — v134 호출부·검사 보호. 새 코드는 exportBtn/capBtns 를 쓴다.
/* 메뉴는 «열 때» 만든다 — 차트는 자료가 온 뒤에야 생기므로 버튼을 붙일 때는 그림인지 아닌지 모른다. */
GST.exportMenu = function(btn, id){
  const T=GST._expT();
  const card=GST.cardOf(btn); if(!card) return;
  const old=card.querySelector('.gexp-menu');
  document.querySelectorAll('.gexp-menu').forEach(function(m){ m.remove(); });
  if(old) return;                                   // 같은 버튼을 다시 누르면 닫기
  const ch=GST.chartOf(id);
  const why = ch ? GST.pptNativeOK(ch) : T.nochart;
  const items=[];
  const it=function(act,label,dis,title){ items.push('<button type="button" data-act="'+act+'"'+(dis?' disabled':'')+(title?' title="'+title+'"':'')+'>'+label+'</button>'); };
  it('ppt', T.ppt, !!why, why||'');
  it('xlsx', T.xlsx, !!why, why||'');
  it('data', T.data, !ch, ch?'':T.nochart);
  if(why && ch) it('png', T.png, false, T.img);      // 그림이 «유일한» 답일 때만
  const m=document.createElement('div'); m.className='gexp-menu';
  m.innerHTML=items.join('')+'<div class="gexp-hint">'+(why&&ch ? T.img+' — '+why : T.hint)+'</div>';
  const box=btn.closest('.capbtns');
  m.style.top=((box?box.offsetTop+box.offsetHeight:36)+4)+'px';
  m.style.right=(box&&box.style.right)||'14px';
  card.appendChild(m);
  m.addEventListener('click', function(e){
    const b=e.target.closest('[data-act]'); if(!b||b.disabled) return;
    m.remove();
    const act=b.dataset.act;
    if(act==='ppt') GST.pptCard(id);
    else if(act==='xlsx') GST.xlsxCard(id);
    else if(act==='data') GST.copyChartData(id);
    else if(act==='png') GST.savePng(id);
  });
  const off=function(e){ if(!m.isConnected){ document.removeEventListener('click',off,true); return; }
    if(m.contains(e.target)||e.target===btn) return; m.remove(); document.removeEventListener('click',off,true); };
  setTimeout(function(){ document.addEventListener('click',off,true); },0);
  document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ m.remove(); document.removeEventListener('keydown',esc); } });
};
/* 카드마다 버튼 한 벌 — 여덟 페이지의 addCapBtns 가 전부 여기로 온다.
   opts.extra(id) 로 페이지 고유 버튼(report 의 ⚙ 축 편집)을 뒤에 붙인다.
   ⚠ 표 카드의 «표 복사·CSV» 버튼은 페이지가 그대로 둔다 — 그건 캔버스가 아니다. */
GST.capBtns = function(opts){
  opts=opts||{};
  GST.chartCanvases().forEach(function(cv){
    const id=cv.id, card=GST.cardOf(cv);
    if(!id||!card||card.querySelector('.capbtns')) return;
    const box=document.createElement('div'); box.className='capbtns';
    box.innerHTML=GST.exportBtn(id)+(opts.extra?(opts.extra(id)||''):'');
    card.appendChild(box);
    /* 주/월 토글(.mini-per)이 같은 구석을 쓰는 카드에서는 그만큼 왼쪽으로 — report 가 손으로 하던 규칙 */
    const mp=card.querySelector('.mini-per'); if(mp) box.style.right=(mp.offsetWidth+24)+'px';
  });
};
/* ---- 표 복사 (report 에서 올렸다) ---- */
GST.chartGrid = function(ch){
  if(!ch||!ch.data) return null;
  const labs=(ch.data.labels||[]).map(function(v){ return String(v==null?'':v); });
  /* hline·예측 같은 «보조» 데이터셋도 값이므로 그대로 낸다 — 화면에 보이는 것이 곧 자료다. */
  const sers=(ch.data.datasets||[]).map(function(d){ return {name:String(d.label==null?'':d.label),
    vals:labs.map(function(_,i){ const v=(d.data||[])[i];
      return (v==null||v==='')?'':(typeof v==='object'?(v.y!=null?v.y:''):v); })}; });
  return {labs:labs, sers:sers};
};
GST.gridHTML = function(g,title){
  const esc2=function(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  const th='border:1px solid #b8c0cc;padding:3px 8px;background:#eef1f5;font-weight:700;text-align:center;white-space:nowrap;';
  const td='border:1px solid #b8c0cc;padding:3px 8px;text-align:right;white-space:nowrap;';
  let h='<table style="border-collapse:collapse;font-family:\'Malgun Gothic\',sans-serif;font-size:11px;color:#1a2230">';
  h+='<tr><td style="'+th+'"></td>'+g.labs.map(function(l){ return '<td style="'+th+'">'+esc2(l)+'</td>'; }).join('')+'</tr>';
  g.sers.forEach(function(sr){ h+='<tr><td style="'+th+'text-align:left">'+esc2(sr.name)+'</td>'
    +sr.vals.map(function(v){ return '<td style="'+td+'">'+esc2(v)+'</td>'; }).join('')+'</tr>'; });
  h+='</table>';
  return (title?'<div style="font-weight:800;font-family:\'Malgun Gothic\';font-size:13px;margin:0 0 5px">'+esc2(title)+'</div>':'')+h;
};
GST.gridTSV = function(g){
  return [''].concat(g.labs).join('\t')+'\n'
    + g.sers.map(function(sr){ return [sr.name].concat(sr.vals).join('\t'); }).join('\n');
};
GST.cardTitle = function(id){
  const cv=document.getElementById(id), card=cv?GST.cardOf(cv):null;
  const h3=card?card.querySelector('h3'):null;
  return ((h3&&(h3.innerText||h3.textContent)||'').trim()||id).replace(/\s+/g,' ');
};
GST.copyChartData = async function(id){
  const T=GST._expT();
  const g=GST.chartGrid(GST.chartOf(id)); if(!g){ GST._pptSay(T.nochart); return; }
  const html=GST.gridHTML(g, GST.cardTitle(id)), tsv=GST.gridTSV(g);
  try{
    await navigator.clipboard.write([new ClipboardItem({
      'text/html':new Blob([html],{type:'text/html'}),
      'text/plain':new Blob([tsv],{type:'text/plain'})})]);
    GST._pptSay('📊 '+T.copied);
  }catch(e){
    /* HTML 형식을 못 쓰는 브라우저에서도 «아무 일도 안 일어나는» 상태로 두지 않는다 — 탭 구분 텍스트라도 준다 */
    try{ await navigator.clipboard.writeText(tsv); GST._pptSay('📊 '+T.copiedTxt); }
    catch(e2){ GST._pptSay(T.copyFail); }
  }
};
GST._download = function(bytes, name, mime){
  const b=new Blob([bytes],{type:mime||'application/octet-stream'});
  const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=name; a.click();
  setTimeout(function(){ URL.revokeObjectURL(u); },2000);
};
GST.savePng = function(id){
  const T=GST._expT();
  const oc=GST.chartHiResLight(id); if(!oc){ GST._pptSay(T.nochart); return; }
  oc.toBlob(function(b){ if(!b) return; GST._download(b, id+'.png', 'image/png'); GST._pptSay('⤓ '+id+'.png '+T.saved); });
};
/* ---- 엑셀 «차트 개체» (.xlsx) ----
   재료는 PPT 와 같다 — pptSrc 가 낸 계열·라벨을 시트에 적고, 그 시트를 참조하는 DrawingML 차트를 얹는다.
   xlsx 의 차트 XML 은 pptx 와 같은 c:chartSpace 라 «같은 그림»이 나온다. 엑셀에서 그 차트를 복사하면
   PPT 에도 편집 가능한 차트로 붙는다 — 사용자가 원한 «PPT 나 엑셀에 바로»의 엑셀 쪽 답이다.
   ⚠ 부품이 다섯이다: 시트 rels · sheet1 의 <drawing> · [Content_Types] Override 둘 · drawing1 · chart1.
     하나라도 빠지면 엑셀이 «복구» 대화상자를 띄우고 차트를 버린다. t-export 가 다섯을 다 센다. */
GST.xlsxLibLoad = function(){                 // SheetJS — /upload/·/edit/ 가 쓴다(v135 에 자체 사본 규율로 편입)
  if(window.XLSX) return Promise.resolve();
  if(GST._xlsxP) return GST._xlsxP;
  GST._xlsxP = GST._loadScript([GST.XLSX_VENDOR, GST.XLSX_CDN], function(){ return !!window.XLSX; })
    .catch(function(e){ GST._xlsxP=null; throw e; });
  return GST._xlsxP;
};
/* ---- 엑셀 셀 → 문자열 · 워크시트 → 2차원 배열 (v141 · /upload/ 에서 옮겨 왔다) ----
   /upload/ 와 데이터 관리(/edit/)의 엑셀 일괄 수정이 «같은 규칙»으로 엑셀을 읽어야 한다 — 두 벌이면
   «업로드는 되는데 일괄 수정은 날짜가 깨지는» 상태가 온다(제2원칙). 그래서 정본을 여기 둔다(t-xlsx 가 지킨다).

   셀 → 문자열. 날짜는 «현지 시각 구성요소»로 찍는다 — toISOString 을 쓰면 UTC 로 밀려
   자정 근처 행의 날짜가 하루 어긋난다(엑셀은 시각대 개념 없이 저장한다). */
GST.cellStr = function(v){
  if(v==null)return '';
  if(v instanceof Date){
    const p=n=>String(n).padStart(2,'0');
    /* 밀리초는 초 단위로 «반올림» 한다. 엑셀 시리얼을 Date 로 풀면 13:28:32.556 처럼
       찌꺼기가 붙는데, 시트를 CSV 로 내보내면 13:28:33 으로 찍힌다 — 잘라내면 1초 어긋난다. */
    const r=new Date(Math.round(v.getTime()/1000)*1000);
    const d=r.getFullYear()+'-'+p(r.getMonth()+1)+'-'+p(r.getDate());
    const hms=p(r.getHours())+':'+p(r.getMinutes())+':'+p(r.getSeconds());
    /* «시각만» 있는 칸(작업시작시간 15:00)은 엑셀이 1899-12-30 에 얹어 저장한다.
       그대로 찍으면 `1899-12-30 15:00:00` 이 되어 CSV 의 `15:00:00` 과 달라진다. */
    if(r.getFullYear()<1900) return hms;
    /* 자정 정각이면 «날짜만» 찍는다. 시트를 CSV 로 내보내면 날짜 칸은 `2026-08-14` 이지
       `2026-08-14 00:00:00` 이 아니다 — 여기서 갈리면 CSV 로 올린 과거 행과 xlsx 로 올린
       새 행이 «같은 날인데 다른 문자열» 이 되어, 구간 교체·중복 판정이 어긋난다. */
    if(hms==='00:00:00') return d;
    return d+' '+hms;
  }
  if(typeof v==='boolean') return v?'TRUE':'FALSE';   // 시트 CSV 표기와 같게
  if(typeof v==='number'){
    if(!isFinite(v)) return '';
    /* 부동소수 찌꺼기(0.30000000000000004)를 떨어낸다 — CSV 에는 0.3 으로 찍혀 있었다.
       정수는 String() 이 이미 `1` 로 준다(`1.0` 이 아니다). */
    return Number.isInteger(v) ? String(v) : String(Math.round(v*1e10)/1e10);
  }
  return String(v);
};

/* 워크시트 → 2차원 문자열 배열. CSV 경로가 Papa.parse 로 만드는 것과 «같은 모양»이라
   뒤 파이프라인(mirror·import·xlsx)을 한 줄도 안 고친다. 변환 규칙을 여기 한 곳에만 둔다 —
   두 벌이면 «알람은 되는데 실적은 날짜가 깨지는» 상태가 온다(제2원칙). */
GST.sheetRows = function(XLSX, ws){
  return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''})
    .map(function(row){ return (row||[]).map(GST.cellStr); });
};
/* ---------- 열 맵핑 — 한 벌 (v149 업로드 → v151 core · 사용자: 「업로드할 때 맵핑이 잘 되는지 확인도 하고, 안 되는 건 수동으로,
   그리고 본인 PC 에만 할지 대시보드에 저장할지도」) ----------
   사이트마다 양식이 달라 같은 항목이 다른 머리글·다른 열·다른 언어로 온다(대만 근태 시스템은 중문 머리글이다).
   업로드 화면과 데이터 관리의 「엑셀 올리기」가 «같은 이 함수들»을 쓴다 — 두 벌이면 한쪽에서 고른 맵핑이 다른 쪽에서 안 먹는다.
   ⚠ 저장하는 것은 열 번호가 아니라 «머리글 이름»이다(제1원칙) — 열이 끼어들어도 맞는다.
   ⚠ 지정은 별칭 배열의 «맨 앞»에 얹을 뿐이다 — 판정(GST.SM.map · 정규화 정확일치)은 그대로 한 벌이다(제2원칙).
   저장 위치는 둘이다 — «대시보드»(colmap_site · 모든 사람·모든 PC) · «이 PC»(localStorage · 이 브라우저만).
   둘 다 있으면 «이 PC» 가 이긴다(개인이 자기 파일에 맞춰 덮은 것이므로). 표의 상태 칸이 어느 쪽 값인지 적는다.
   특수 열쇠 둘 — `__hi`(머리글 행 · 1부터) · `__sheet`(워크북에서 쓸 시트 이름). 사람이 고른 것을 다음 번에도 쓴다. */
/* 내장 별칭 — Import 표(표의 열 이름이 곧 정본)에 SPEC 이 없어, 다른 언어 양식을 «처음부터» 알아보게 하는 사전.
   ⚠ 정규화 정확일치로만 쓴다(부분일치 금지 — 제1원칙). 여기 없는 머리글은 사람이 한 번 고르면 저장된다.
   휴가(leave) — 대만 근태 시스템(請款) 내보내기. ⚠ 「請假單位」(小時·天·分鐘)는 표의 「비고」로 간다 —
   hr·주간현황이 신청시간의 «단위»를 비고 열에서 읽는다(天 을 시간으로 더하면 12% 과소집계 · hr/index.html LV_HRS_PER_DAY). */
GST.CMAP_ALIAS = {
  leave: { '사원번호':['員工編號','工號','員工代號'], '이름':['姓名','員工姓名'], '소속':['部門','部門名稱'],
    '항목':['假勤項目','假別'], '발생일':['事件發生日'], '휴가시작일':['假勤開始日期','請假開始日期'],
    '휴가시작시간':['假勤開始時間','請假開始時間'], '휴가종료일':['假勤結束日期','請假結束日期'],
    '휴가종료시간':['假勤結束時間','時數結束時間','請假結束時間'], '휴가신청시간':['請假時數'], '비고':['請假單位'] }
};
GST.cmap = {
  _c:{},
  _lk:function(site,tbl){ return 'gst_cmap:'+site+':'+tbl; },
  pc:function(site,tbl){ try{ return JSON.parse(localStorage.getItem(this._lk(site,tbl))||'{}')||{}; }catch(e){ return {}; } },
  /* {ovr, src} — ovr={field:header} · src={field:'pc'|'db'} */
  load:async function(c,site,tbl){
    const k=site+'|'+tbl; if(this._c[k]) return this._c[k];
    const db={};
    if(c) try{ const r=await c.from('colmap_site').select('field,header').eq('site',site).eq('tbl',tbl);
         if(!r.error) (r.data||[]).forEach(function(x){ db[x.field]=x.header; });
         else console.warn('[cmap] 대시보드 맵핑 읽기 실패 (setup-18 미적용?)', r.error.message); }
    catch(e){ console.warn('[cmap] 대시보드 맵핑 읽기 실패', e); }
    const pc=this.pc(site,tbl), ovr={}, src={};
    Object.keys(db).forEach(function(f){ ovr[f]=db[f]; src[f]='db'; });
    Object.keys(pc).forEach(function(f){ if(pc[f]){ ovr[f]=pc[f]; src[f]='pc'; } });
    return this._c[k]={ovr:ovr, src:src};
  },
  /* 저장 — header '' 이면 «그 저장 위치의» 지정을 지운다. 대시보드 쓰기가 RLS 로 막히면 0행이 온다 — 그것을 «실패»로 말한다. */
  save:async function(c,site,tbl,field,header,where){
    delete this._c[site+'|'+tbl];
    if(where==='pc'){
      const o=this.pc(site,tbl); if(header) o[field]=header; else delete o[field];
      try{ localStorage.setItem(this._lk(site,tbl), JSON.stringify(o)); }catch(e){ throw new Error('이 PC 에 저장하지 못했습니다(브라우저 저장소가 막혀 있음)'); }
      return;
    }
    if(!c) throw new Error('로그인이 필요합니다');
    let r;
    if(header) r=await c.from('colmap_site').upsert({site:site,tbl:tbl,field:field,header:header,
              updated_by:(GST._me&&GST._me.email)||null,updated_at:new Date().toISOString()}).select();
    else    r=await c.from('colmap_site').delete().eq('site',site).eq('tbl',tbl).eq('field',field).select();
    if(r.error) throw new Error(r.error.message);
    if(header && !(r.data||[]).length) throw new Error('저장 권한이 없습니다');
    /* 대시보드에 «자동 인식»으로 되돌렸는데 이 PC 에 옛 지정이 남아 있으면 그것이 계속 이긴다 — 같이 지운다 */
    if(!header){ const o=this.pc(site,tbl); if(o[field]){ delete o[field]; try{ localStorage.setItem(this._lk(site,tbl), JSON.stringify(o)); }catch(e){} } }
  },
  where:function(){ try{ return localStorage.getItem('gst_cmap_where')||'db'; }catch(e){ return 'db'; } },
  setWhere:function(w){ try{ localStorage.setItem('gst_cmap_where', w==='pc'?'pc':'db'); }catch(e){} },
  /* SPEC 표 — 지정 머리글을 별칭 «맨 앞»에 얹고, 머리글 행을 찾는 힌트도 지정 이름으로 바꿔 준다
     (힌트 이름 자체가 다른 양식이면 머리글 행을 못 찾는다 · 설치현황의 힌트는 S/N 하나다). */
  spec:function(S0,ovr){
    const fields={}, N=GST.SM.norm;
    Object.keys(S0.fields).forEach(function(k){ const a=[].concat(S0.fields[k]); fields[k]=ovr[k]?[ovr[k]].concat(a):a; });
    const hints=(S0.hints||[]).map(function(h){ const k=Object.keys(ovr).find(function(f){ return S0.fields[f]&&[].concat(S0.fields[f]).some(function(a){ return N(a)===N(h); }); }); return k?ovr[k]:h; });
    return Object.assign({},S0,{fields:fields,hints:hints});
  },
  col:function(i){ let s=''; i++; while(i>0){ const r=(i-1)%26; s=String.fromCharCode(65+r)+s; i=Math.floor((i-1)/26); } return s; },
  /* 머리글 행 후보 — 찾았으면 그 행, 못 찾았으면 앞 15줄 중 «글자가 가장 많이 찬 줄» */
  guessHi:function(rows,hi){ if(hi>=0) return hi; let best=0,bn=-1; (rows||[]).slice(0,15).forEach(function(r,i){ const n=(r||[]).filter(function(v){ return String(v==null?'':v).trim(); }).length; if(n>bn){bn=n;best=i;} }); return best; },
  /* Import 형(표의 열 이름이 정본) 맞추기. 정본 이름 → 내장 별칭 → 지정 순으로 «정규화 정확일치».
     머리글 행: 지정(__hi) → 맞는 열이 가장 많은 줄(앞 15줄 · 동률이면 앞줄) → 없으면 가장 찬 줄(고를 후보용).
     ⚠ 0행부터 보지 않으면 제목 줄(「Update : 2026.10.3」)이 있는 파일에서 머리글을 못 찾는다(사용자 파일 실측). */
  match:function(rows,cols,ovr,alias){
    const N=GST.SM.norm, al=alias||{}, o=ovr||{};
    const names={}; cols.forEach(function(c){ const a=[c].concat(al[c]||[]); if(o[c]) a.unshift(o[c]); names[c]=a.map(N).filter(Boolean); });
    const hitsOf=function(r){ const at={}; (r||[]).forEach(function(x,i){ const h=N(String(x==null?'':x)); if(h&&at[h]==null) at[h]=i; });
      let n=0; cols.forEach(function(c){ if(names[c].some(function(k){ return at[k]!=null; })) n++; }); return n; };
    let hi=-1, found=false;
    const fixed=parseInt(o.__hi,10);
    if(fixed>0 && fixed<=rows.length){ hi=fixed-1; found=hitsOf(rows[hi])>0; }
    else { let bn=0; (rows||[]).slice(0,15).forEach(function(r,k){ const n=hitsOf(r); if(n>bn){ bn=n; hi=k; } }); found=bn>0; if(hi<0) hi=GST.cmap.guessHi(rows,-1); }
    /* 여러 줄 머리글 (v164 · 사용자 파일 실측 — 대만 교육현황). 「No·Site·인원」은 세 줄 세로 병합이고, 그 옆은
       「교육과정 › Basic (Level 1) › 교육완료일」처럼 세 줄로 내려간다. 머리글 «한 줄»만 보면 교육완료일 칸이 그 줄에서
       빈 칸이라 자동 인식도, 사람이 고르는 지정도 불가능했고(고를 이름이 없다), 아래 두 줄이 «데이터»로 읽혔다.
       → 머리글 줄의 «이름이 잡힌 열»(No·Site 처럼 세로 병합된 칸)이 비어 있는 다음 줄은 머리글이 이어지는 것으로 본다(최대 3줄).
       데이터 줄은 그 열들이 차 있다. 이어진 줄이 있으면 hi 는 «마지막 머리글 줄»이 되고(데이터는 그 다음 줄부터), 칸 이름은 위→아래로 잇는다. */
    let top=hi;
    if(found){
      const key=[]; ((rows||[])[top]||[]).forEach(function(x,i){ const h=N(String(x==null?'':x)); if(h && cols.some(function(c){ return names[c].indexOf(h)>=0; })) key.push(i); });
      const ne=function(r,i){ return String(((r||[])[i])==null?'':r[i]).trim()!==''; };
      for(let r=top+1; r<=top+3 && r<(rows||[]).length; r++){
        const R=rows[r]||[], filled=R.filter(function(x){ return String(x==null?'':x).trim(); }).length;
        if(filled<1 || key.some(function(i){ return ne(R,i); })) break;   // 묶음이 하나뿐인 줄(칸 하나)도 머리글이다 — 데이터 줄은 이름 잡힌 열이 차 있다
        hi=r;
      }
    }
    const header=GST.cmap.compose(rows,hi,top);
    const raw=((rows||[])[hi]||[]).map(function(x){ return String(x==null?'':x).trim(); });
    /* 열쇠 셋 — 합친 이름 · 그 이름의 63바이트 자른 판(Postgres 가 표 열 이름을 그 길이에서 자른다) ·
       원래 이름(겹치는 이름이면 첫 칸만 — 예전 동작 그대로라 교육현황 같은 옛 표가 안 움직인다) */
    const at={}, put=function(n,k){ if(n&&at[n]==null) at[n]=k; };
    header.forEach(function(h,k){ put(N(h),k); put(N(GST.cmap.colName(h)),k); });
    /* 여러 줄 머리글이면 «아래쪽 몇 단만» 이은 이름·괄호를 뗀 이름도 열쇠로 둔다 —
       표의 열 이름은 「Basic 교육완료일」인데 파일은 「교육과정 Basic (Level 1) 교육완료일」이다. 정규화 정확일치는 그대로다(부분일치 아님). */
    if(hi>top) GST.cmap.stack(rows,hi,top).forEach(function(st,k){ GST.cmap.variants(st).forEach(function(v){ put(N(v),k); }); });
    raw.forEach(function(h,k){ put(N(h),k); });
    const idx={}, via={}, used={};
    cols.forEach(function(c){
      let i=-1, v='';
      if(o[c]){ const k=at[N(o[c])]; if(k!=null){ i=k; v='ovr'; } else v='ovrmiss'; }
      if(i<0 && at[N(c)]!=null && !used[at[N(c)]]){ i=at[N(c)]; v=v||'auto'; }
      if(i<0) (al[c]||[]).some(function(a){ const k=at[N(a)]; if(k!=null && !used[k]){ i=k; v=v||'alias'; return true; } });
      if(i>=0) used[i]=1; idx[c]=i; via[c]=v||(i>=0?'auto':'');
    });
    const unknown=header.filter(function(h,k){ return h && !used[k]; });
    return {hi:hi, top:top, hiFound:found, header:header, idx:idx, via:via, unknown:unknown};
  },
  /* 표 열 이름으로 쓸 글자 — 줄바꿈·연속 공백을 한 칸으로, 그리고 63바이트(UTF-8)에서 자른다.
     ⚠ Postgres 는 그보다 긴 열 이름을 «조용히» 자른다(NOTICE 뿐). 자른 이름을 모르고 다음 업로드에서 원래 이름으로 찾으면
       «표에 없는 열»로 읽혀 같은 항목을 또 더하려 든다 — match 가 자른 판도 열쇠로 본다. 글자 중간에서 자르지 않는다. */
  colName:function(h){
    let s=String(h==null?'':h).replace(/\s+/g,' ').trim();
    if(typeof TextEncoder==='undefined') return s;
    const enc=new TextEncoder();
    while(s && enc.encode(s).length>63) s=s.slice(0,-1);
    return s.trim();
  },
  /* 머리글 행의 이름 — 한 행 안에서 «겹치는 이름»(Left·Right 처럼 묶음 아래 칸)은 바로 위 행의 묶음 이름을 앞에 붙인다.
     CIP 자체관리 양식(v157 · 사용자 파일 실측): 「Motor scraper (KOXD _ DRAON Model)」 아래 Left·Right, 「Tank Filter …」 아래 Left·Right …
     겹친 채로 두면 서로 다른 점검 항목이 한 이름이 되어 첫 칸만 잡히고 나머지는 조용히 빠진다.
     · 묶음 이름은 병합 칸이라 왼쪽 첫 칸에만 있다 — 왼쪽으로 훑되 «겹치지 않는 머리글»을 만나면 멈춘다(다른 묶음을 빌려 오지 않는다).
     · 겹치지 않는 이름은 손대지 않는다 — 기존 표의 열 이름과 그대로 맞물린다. */
  compose:function(rows,hi,top){
    const N=GST.SM.norm;
    /* 여러 줄 머리글(v164) — 칸마다 위→아래 값을 잇는다(병합 칸은 왼쪽 첫 칸에만 값이 있어 stack 이 오른쪽으로 채운다). */
    if(top!=null && top<hi){
      const st=GST.cmap.stack(rows,hi,top), nm=st.map(function(a){ return GST.cmap.colName(a.join(' ')); });
      const cnt={}; nm.forEach(function(h){ const n=N(h); if(n) cnt[n]=(cnt[n]||0)+1; });
      if(!Object.keys(cnt).some(function(n){ return cnt[n]>1; }) || top<1) return nm;
      const up=(rows||[])[top-1]||[];   // 그래도 겹치면 맨 위 줄 바로 위의 묶음 이름을 붙인다(아래 한 줄 규칙과 같다)
      return nm.map(function(h,k){ if(!h||cnt[N(h)]<2) return h; for(let j=k;j>=0;j--){ const b=String(up[j]==null?'':up[j]).trim(); if(b) return GST.cmap.colName(b+' '+h); } return h; });
    }
    const R=(rows||[])[hi]||[], up=hi>0?((rows||[])[hi-1]||[]):[];
    const raw=R.map(function(x){ return String(x==null?'':x).trim(); });
    const cnt={}; raw.forEach(function(h){ const n=N(h); if(n) cnt[n]=(cnt[n]||0)+1; });
    return raw.map(function(h,k){
      if(!h || cnt[N(h)]<2) return h;
      for(let j=k;j>=0;j--){
        if(j<k && raw[j] && cnt[N(raw[j])]<2) break;
        const b=String(up[j]==null?'':up[j]).trim();
        if(b) return GST.cmap.colName(b+' '+h);
      }
      return h;
    });
  },
  /* 칸마다 [위 단, …, 아래 단] — 가로 병합 칸(묶음 이름)은 왼쪽 첫 칸에만 값이 있으므로 오른쪽으로 채우되,
     ① 그 칸의 «맨 아래 줄»이 빈 열(세로 병합된 No·Site 같은 열)은 묶음 밖이라 채우지 않고 ② 위 단의 묶음이 바뀌는 곳에서 멈춘다
     (Basic 의 이름이 Veteran 칸으로 넘어가지 않게). 같은 값이 위아래로 이어지면(세로 병합) 한 번만 쓴다. */
  stack:function(rows,hi,top){
    const v=function(r,k){ return String((((rows||[])[r]||[])[k])==null?'':rows[r][k]).trim(); };
    let w=0; for(let r=top;r<=hi;r++) w=Math.max(w,((rows||[])[r]||[]).length);
    const F=[];   // F[r-top][k] — 채운 값
    for(let r=top;r<=hi;r++){
      const row=[]; let cur='', curK=-1;
      for(let k=0;k<w;k++){
        const x=v(r,k);
        if(x){ cur=x; curK=k; row.push(x); continue; }
        const leaf=v(hi,k)!=='';
        const sameParent=r===top || (F[r-top-1][k] && F[r-top-1][k]===F[r-top-1][curK] && curK>=0);
        row.push(cur && leaf && r<hi && sameParent && !v(top,k)?cur:'');
      }
      F.push(row);
    }
    const out=[];
    for(let k=0;k<w;k++){ const a=[]; F.forEach(function(row){ const x=row[k]; if(x && a[a.length-1]!==x) a.push(x); }); out.push(a); }
    return out;
  },
  /* 열쇠로 둘 이름들 — 아래쪽 n단만 이은 것 · 괄호 부분을 뗀 것(Basic (Level 1) → Basic) */
  variants:function(a){
    const out=[], strip=function(s){ return String(s).replace(/\s*[(（][^)）]*[)）]\s*/g,' ').replace(/\s+/g,' ').trim(); };
    for(let i=a.length-1;i>=0;i--){ const p=a.slice(i); out.push(p.join(' ')); out.push(p.map(strip).filter(Boolean).join(' ')); }
    return out;
  },
  /* 그 열의 예시 값 — 사람이 «맞게 잡혔나»를 눈으로 확인하는 근거(사용자: 업로더가 맵핑을 검증할 수 있어야) */
  sample:function(rows,hi,i,n){ const out=[]; if(i<0) return out;
    for(let r=hi+1;r<(rows||[]).length&&out.length<(n||2);r++){ const v=String(((rows[r]||[])[i])==null?'':rows[r][i]).trim(); if(v) out.push(v.length>24?v.slice(0,24)+'…':v); }
    return out; },
  css:function(){ if(typeof document==='undefined'||document.getElementById('gstCmapCss')) return;
    const s=document.createElement('style'); s.id='gstCmapCss';
    s.textContent='.gcm{margin:8px 0;padding:10px 12px;border:1px solid rgba(127,127,127,.35);border-radius:10px;background:rgba(127,127,127,.07);color:inherit;font-size:12.5px}'
      +'.gcm summary{cursor:pointer}.gcm select{background:rgba(127,127,127,.1);color:inherit;border:1px solid rgba(127,127,127,.45);border-radius:6px;padding:3px 6px;max-width:300px;font:inherit}'
      +'.gcm select option{color:#111;background:#fff}.gcm table{border-collapse:collapse;width:100%;margin-top:6px}'
      +'.gcm td,.gcm th{padding:4px 10px 4px 0;text-align:left;vertical-align:top;border-top:1px solid rgba(127,127,127,.18)}.gcm th{font-weight:600;opacity:.75;border-top:0}'
      +'.gcm tr.lo td{color:#d97706}.gcm .m{opacity:.7}.gcm .ok{color:#16a34a}.gcm .bad{color:#dc2626}.gcm .ex{opacity:.8;font-size:11.5px;word-break:break-all}'
      +'.gcm .where{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0}.gcm .where label{cursor:pointer}.gcm .warn{color:#d97706}';
    document.head.appendChild(s); },
  /* 표 한 벌 — o: {items:[{k,label,req,idx,via?}], H, rows, hi, hiFound, ovr, src, tbl, title, siteL, canDb, unknown, missTxt, open, hiSel}
     data-cmap(항목)·data-cmhi(머리글 행)·name=cmWhere(저장 위치) 를 GST.cmap.handle 이 받는다. */
  table:function(o){
    GST.cmap.css();
    const E=GST._esc, N=GST.SM.norm, H=o.H||[], ovr=o.ovr||{}, src=o.src||{}, C=GST.cmap.col;
    const w=o.canDb===false?'pc':GST.cmap.where();
    const opts=H.map(function(h,i){ return h?'<option value="'+E(h)+'">'+C(i)+' · '+E(h)+'</option>':''; }).join('');
    let nMiss=0, nOvr=0;
    const tr=o.items.map(function(it){
      const k=it.k, i=it.idx, oh=ovr[k], oHit=oh && H.some(function(h){ return N(h)===N(oh); });
      const where=src[k]==='pc'?'이 PC':'공유';
      let st;
      if(oh&&oHit){ st='<span class="ok">지정 · '+where+'</span>'; nOvr++; }
      else if(oh){ st='<span class="bad">지정('+where+') 머리글이 이 파일에 없음 → 자동</span>'; nOvr++; }
      else if(i>=0) st='<span class="m">'+(it.via==='alias'?'자동(내장 사전)':'자동')+'</span>';
      else if(it.req){ st='<span class="bad">못 찾음</span>'; nMiss++; }
      else st='<span class="m">'+E(o.missTxt||'없음(선택)')+'</span>';
      const got=i>=0?C(i)+' · '+E(H[i]||''):'—';
      const ex=i>=0?GST.cmap.sample(o.rows,o.hi,i,2).map(E).join(' · '):'';
      const sel='<select data-cmap="'+E(k)+'" data-tbl="'+E(o.tbl)+'"><option value="">(자동 인식)</option>'
        +(oh?opts.replace('value="'+E(oh)+'"','value="'+E(oh)+'" selected'):opts)+'</select>';
      return '<tr'+(it.req&&i<0?' class="lo"':'')+'><td>'+E(it.label)+(it.req?' <b class="bad">*</b>':'')+'</td><td>'+got+'</td><td class="ex">'+(ex||'<span class="m">—</span>')+'</td><td>'+st+'</td><td>'+sel+'</td></tr>';
    }).join('');
    let hiSel='';
    if(o.hiSel){
      const cur=parseInt(ovr.__hi,10)||0;
      hiSel=' · 머리글 행 <select data-cmhi="1" data-tbl="'+E(o.tbl)+'"><option value="">자동 ('+(o.hi+1)+'행)</option>'
        +(o.rows||[]).slice(0,15).map(function(r,k){ const t=(r||[]).map(function(x){ return String(x==null?'':x).trim(); }).filter(Boolean).slice(0,3).join(' · ');
          return t?'<option value="'+(k+1)+'"'+(cur===k+1?' selected':'')+'>'+(k+1)+'행 — '+E(t.length>40?t.slice(0,40)+'…':t)+'</option>':''; }).join('')+'</select>';
    }
    const extra=(o.unknown&&o.unknown.length)?'<div class="warn" style="margin-top:6px">⚠ 표에 자리가 없어 <b>올리지 않는</b> 파일 열 '+o.unknown.length+'개: '
        +E(o.unknown.join(', '))+' — 이 중에 위 항목의 값이 있으면 오른쪽에서 그 머리글을 고르세요.</div>':'';
    const whereH='<div class="where"><span class="m">고른 맵핑 저장:</span>'
      +'<label><input type="radio" name="cmWhere" value="db"'+(w==='db'?' checked':'')+(o.canDb===false?' disabled':'')+'> 대시보드에 저장 (모든 사람·모든 PC 가 같이 씀)</label>'
      +'<label><input type="radio" name="cmWhere" value="pc"'+(w==='pc'?' checked':'')+'> 이 PC 에만 (이 브라우저에서만)</label></div>';
    return '<details class="gcm"'+((nMiss||nOvr||o.open)?' open':'')+'><summary><b>열 맵핑'+(o.title?' — '+E(o.title):'')+'</b> <span class="m">— '+E(o.siteL||'')
      +' · 머리글 '+(o.hiFound?(o.hi+1)+'행':'못 찾음 (가장 찬 '+(o.hi+1)+'행을 후보로)')+' · 지정 '+nOvr+'개'+(nMiss?' · 필수 못 찾음 '+nMiss+'개':'')+'</span></summary>'
      +'<div class="m" style="margin:6px 0">«예시 값»을 보고 맞게 잡혔는지 확인하세요. 틀렸거나 못 찾았으면 오른쪽에서 이 파일의 머리글을 고르면 바로 다시 검사합니다 — 열 위치가 아니라 머리글 이름으로 기억합니다.'+hiSel+'</div>'
      +whereH+'<table><tr><th>항목</th><th>잡힌 열</th><th>예시 값</th><th>상태</th><th>지정</th></tr>'+tr+'</table>'+extra+'</details>';
  },
  /* 패널의 change 를 받아 저장한다 — 처리했으면 true(페이지가 다시 검사한다) */
  handle:async function(e,site,c){
    const t=e.target; if(!t||!t.closest) return false;
    if(t.name==='cmWhere'){ GST.cmap.setWhere(t.value); return false; }
    const s=t.closest('select[data-cmap],select[data-cmhi]'); if(!s) return false;
    const box=s.closest('.gcm'), rb=box&&box.querySelector('input[name=cmWhere]:checked');
    const field=s.dataset.cmhi?'__hi':s.dataset.cmap, w=rb?rb.value:GST.cmap.where();   // 패널이 대시보드 저장을 잠갔으면(권한 없음) 그 패널의 선택을 따른다
    s.disabled=true;
    try{ await GST.cmap.save(c,site,s.dataset.tbl,field,s.value,w); }
    catch(err){ s.disabled=false; alert('열 맵핑 저장 실패: '+(err.message||err)); return false; }
    return true;
  }
};
GST._xml = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
GST._colName = function(n){ let s=''; while(n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s; };
GST.xlsxChart = async function(src, cap){
  await GST.zipLoad();
  const X=GST._xml, col=GST._colName;
  const pie=!!(src&&src.pie);
  const labels=(src.labels||[]).map(String);
  const sers = pie ? [{name:src.name||cap||'', values:src.values, color:'', kind:'bar'}]
                   : [].concat((src.bars||[]).map(function(b){ return {name:b.name, values:b.values, color:b.color, kind:'bar'}; }),
                               (src.lines||[]).map(function(l){ return {name:l.name, values:l.values, color:l.color, kind:'line', y2:!!l.y2}; }));
  const n=labels.length, last=col(n+1), nS=sers.length;
  /* 시트 — A1 빈칸 · 1행 라벨 · 2행부터 계열. inlineStr 이라 공유문자열 부품이 없다. */
  const cell=function(c,r,v,num){ const ref=col(c)+r;
    if(v===''||v==null) return '<c r="'+ref+'"/>';
    return num ? '<c r="'+ref+'"><v>'+Number(v)+'</v></c>'
               : '<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+X(v)+'</t></is></c>'; };
  const rows=['<row r="1">'+cell(1,1,'')+labels.map(function(c,i){ return cell(i+2,1,c,false); }).join('')+'</row>'];
  sers.forEach(function(sr,si){ const r=si+2; let out='<row r="'+r+'">'+cell(1,r,sr.name,false);
    for(let i=0;i<n;i++){ const v=sr.values[i]; out+=(v==null||v===''||isNaN(Number(v)))?cell(i+2,r,'',false):cell(i+2,r,v,true); }
    rows.push(out+'</row>'); });
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<dimension ref="A1:'+last+(nS+1)+'"/><sheetData>'+rows.join('')+'</sheetData><drawing r:id="rId1"/></worksheet>';
  /* 차트 — 계열은 시트 «참조»와 캐시를 둘 다 가진다(캐시가 없으면 열자마자 빈 차트로 뜨는 뷰어가 있다) */
  const catRef='Sheet1!$B$1:$'+last+'$1';
  const catXml='<c:cat><c:strRef><c:f>'+catRef+'</c:f><c:strCache><c:ptCount val="'+n+'"/>'
    +labels.map(function(l,i){ return '<c:pt idx="'+i+'"><c:v>'+X(l)+'</c:v></c:pt>'; }).join('')+'</c:strCache></c:strRef></c:cat>';
  const valXml=function(sr,si){ const r=si+2;
    return '<c:val><c:numRef><c:f>Sheet1!$B$'+r+':$'+last+'$'+r+'</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="'+n+'"/>'
      +sr.values.map(function(v,i){ const x=Number(v); return isFinite(x)?'<c:pt idx="'+i+'"><c:v>'+x+'</c:v></c:pt>':''; }).join('')
      +'</c:numCache></c:numRef></c:val>'; };
  const txXml=function(sr,si){ return '<c:tx><c:strRef><c:f>Sheet1!$A$'+(si+2)+'</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>'+X(sr.name)+'</c:v></c:pt></c:strCache></c:strRef></c:tx>'; };
  const fill=function(hex){ return '<a:solidFill><a:srgbClr val="'+(hex||'5B9BD5')+'"/></a:solidFill>'; };
  const dl = src.showValue||pie ? '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>' : '';
  let plot='';
  if(pie){
    const cols=src.colors||[];
    plot='<c:'+(src.hole?'doughnut':'pie')+'Chart><c:varyColors val="1"/>'
      +'<c:ser><c:idx val="0"/><c:order val="0"/>'+txXml(sers[0],0)
      +labels.map(function(_,i){ return '<c:dPt><c:idx val="'+i+'"/><c:bubble3D val="0"/><c:spPr>'+fill(cols[i])+'</c:spPr></c:dPt>'; }).join('')
      +dl+catXml+valXml(sers[0],0)+'</c:ser>'
      +'<c:firstSliceAng val="0"/>'+(src.hole?'<c:holeSize val="55"/>':'')+'</c:'+(src.hole?'doughnut':'pie')+'Chart>';
  }else{
    const bars=sers.map(function(s,i){ return [s,i]; }).filter(function(p){ return p[0].kind==='bar'; });
    const ln1=sers.map(function(s,i){ return [s,i]; }).filter(function(p){ return p[0].kind==='line'&&!p[0].y2; });
    const ln2=sers.map(function(s,i){ return [s,i]; }).filter(function(p){ return p[0].kind==='line'&&p[0].y2; });
    const useY2 = ln2.length>0 && (bars.length>0||ln1.length>0);
    if(bars.length){
      plot+='<c:barChart><c:barDir val="'+(src.horiz?'bar':'col')+'"/><c:grouping val="'+(src.stacked?'stacked':'clustered')+'"/><c:varyColors val="0"/>'
        +bars.map(function(p){ const sr=p[0], si=p[1];
          return '<c:ser><c:idx val="'+si+'"/><c:order val="'+si+'"/>'+txXml(sr,si)+'<c:spPr>'+fill(sr.color)+'</c:spPr><c:invertIfNegative val="0"/>'+dl+catXml+valXml(sr,si)+'</c:ser>'; }).join('')
        +'<c:gapWidth val="60"/>'+(src.stacked?'<c:overlap val="100"/>':'')+'<c:axId val="10"/><c:axId val="20"/></c:barChart>';
    }
    const lineChart=function(list, ax1, ax2){ if(!list.length) return '';
      return '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>'
        +list.map(function(p){ const sr=p[0], si=p[1];
          return '<c:ser><c:idx val="'+si+'"/><c:order val="'+si+'"/>'+txXml(sr,si)
            +'<c:spPr><a:ln w="19050" cap="rnd">'+fill(sr.color)+'<a:round/></a:ln></c:spPr>'
            +'<c:marker><c:symbol val="circle"/><c:size val="4"/><c:spPr>'+fill(sr.color)+'</c:spPr></c:marker>'
            +dl+catXml+valXml(sr,si)+'<c:smooth val="0"/></c:ser>'; }).join('')
        +'<c:marker val="1"/><c:axId val="'+ax1+'"/><c:axId val="'+ax2+'"/></c:lineChart>'; };
    plot+=lineChart(ln1.concat(useY2?[]:ln2), 10, 20);
    if(useY2) plot+=lineChart(ln2, 30, 40);
    const b=(src.bounds&&src.bounds.y)||null, b2=(src.bounds&&src.bounds.y2)||null;
    const scal=function(bd){ return '<c:scaling><c:orientation val="minMax"/>'+(bd&&isFinite(bd.max)?'<c:max val="'+bd.max+'"/>':'')+(bd&&isFinite(bd.min)?'<c:min val="'+bd.min+'"/>':'')+'</c:scaling>'; };
    const catPos=src.horiz?'l':'b', valPos=src.horiz?'b':'l';
    plot+='<c:catAx><c:axId val="10"/>'+scal(null)+'<c:delete val="0"/><c:axPos val="'+catPos+'"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="20"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
      +'<c:valAx><c:axId val="20"/>'+scal(b)+'<c:delete val="0"/><c:axPos val="'+valPos+'"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="10"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>';
    if(useY2) plot+='<c:catAx><c:axId val="30"/>'+scal(null)+'<c:delete val="1"/><c:axPos val="'+catPos+'"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="40"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
      +'<c:valAx><c:axId val="40"/>'+scal(b2)+'<c:delete val="0"/><c:axPos val="'+(src.horiz?'t':'r')+'"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="30"/><c:crosses val="max"/><c:crossBetween val="between"/></c:valAx>';
  }
  const chart='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<c:roundedCorners val="0"/><c:chart>'
    +(cap?'<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="ko-KR" sz="1200" b="1"/><a:t>'+X(cap)+'</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>':'<c:autoTitleDeleted val="1"/>')
    +'<c:plotArea><c:layout/>'+plot+'</c:plotArea>'
    +'<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>'
    +'</c:chart></c:chartSpace>';
  const r0=nS+3;
  const drawing='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    +'<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>'+r0+'</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
    +'<xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>'+(r0+22)+'</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
    +'<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>'
    +'<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
    +'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic>'
    +'</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>';
  const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const rels=function(list){ return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    +list.map(function(r){ return '<Relationship Id="'+r[0]+'" Type="'+REL+r[1]+'" Target="'+r[2]+'"/>'; }).join('')+'</Relationships>'; };
  const z=new JSZip();
  z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    +'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
    +'<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>');
  z.file('_rels/.rels', rels([['rId1','officeDocument','xl/workbook.xml']]));
  z.file('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels', rels([['rId1','worksheet','worksheets/sheet1.xml']]));
  z.file('xl/worksheets/sheet1.xml', sheet);
  z.file('xl/worksheets/_rels/sheet1.xml.rels', rels([['rId1','drawing','../drawings/drawing1.xml']]));
  z.file('xl/drawings/drawing1.xml', drawing);
  z.file('xl/drawings/_rels/drawing1.xml.rels', rels([['rId1','chart','../charts/chart1.xml']]));
  z.file('xl/charts/chart1.xml', chart);
  return z.generateAsync({type:'uint8array', compression:'DEFLATE'});
};
GST.xlsxCard = async function(id){
  const T=GST._expT();
  const ch=GST.chartOf(id); if(!ch){ GST._pptSay(T.nochart); return; }
  const why=GST.pptNativeOK(ch);
  if(why){ GST._pptSay(T.img+' ('+why+') — '+T.data+' / '+T.png); return; }
  const restore=GST._chartLight(ch); let src=null;
  try{ src=GST.pptSrc(ch); } finally{ try{ restore&&restore(); }catch(e){} }
  if(!src){ GST._pptSay(T.nochart); return; }
  const cap=GST.cardTitle(id);
  let bytes=null;
  try{ bytes=await GST.xlsxChart(src, cap); }
  catch(e){ GST._pptSay(T.xlsxFail+' ('+(e&&e.tried||e&&e.message||'?')+')'); return; }
  const fn=cap.replace(/[\\/:*?"<>|]/g,'').slice(0,40)+'_'+GST.ymdL()+'.xlsx';
  GST._download(bytes, fn, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  GST._pptSay('⤓ '+fn+' — '+T.hint);
};

GST.PPT_MAX_PER_SLIDE = 6;
GST.pptAuto = async function(opt){
  opt = opt || {};
  try{ await GST.pptLoad(); }
  catch(e){
    /* «무엇을 해 보았고 무엇이 막혔는지»를 적는다. 자체 사본이 404 인지(배포 누락)
       CDN 이 막힌 것인지(사내망)에 따라 사람이 할 일이 완전히 다르다. */
    GST._pptSay('PPT 라이브러리를 불러오지 못했습니다 ('+(e&&e.tried||e&&e.message||'?')+')'
      + ' — assets/vendor/pptxgen.bundle.js 가 배포됐는지 확인하고, 그래도 안 되면'
      + ' 차트별 「📋 그림」·「📊 데이터」로 PPT 에 붙여넣으세요.');
    return; }

  /* 숨겨진 섹션의 차트도 담는다 — 접어 둔 채 내보내면 «있는 줄 알았던» 장표가 조용히 빠진다. */
  const secs = [].slice.call(document.querySelectorAll('[data-sec]'));
  const hid = secs.filter(function(s){ return s.style.display==='none'; });
  hid.forEach(function(s){ s.style.display=''; });
  if(hid.length){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} await new Promise(function(r){ setTimeout(r,350); }); }

  const FONT='맑은 고딕', INK='111111', MUT='808080', LINE='8C8C8C';
  const X=0.76, W=11.83, COLS=3, GAP=0.16;
  const CW=(W-GAP*(COLS-1))/COLS, BAND=0.30, BODY=2.62, ROWY=[0.98, 4.06];

  /* ⚠ LAYOUT_16x9 는 10 × 5.625 in 이다. 아래 배치(X=0.76 · W=11.83 · ROWY[1]=4.06)는
     13.33 × 7.5 in 을 전제로 잡혀 있어, 16x9 로 두면 오른쪽 칸과 아랫줄이 통째로
     장표 «밖»에 그려진다. 예전 네이티브 내보내기는 LAYOUT_WIDE 를 썼다 — 그 배치가
     여기로 옮겨 오면서 레이아웃만 안 따라온 것이다. 실측(LibreOffice 렌더)으로 잡았다. */
  const p = new PptxGenJS(); p.layout='LAYOUT_WIDE';
  const title = (opt.title || (document.querySelector('.header h1')||{}).textContent || document.title || 'Dashboard').trim();
  const corp  = (opt.corp || GST.corpLabel()).toUpperCase();
  const asOf  = opt.asOf || GST.ymdL();   // ⚠ toISOString 은 UTC — 오전 9시 이전에 어제가 찍힌다
  const meta  = asOf + ' 기준 · ' + GST.filtSummary();

  const header = function(s, sec){
    s.background = {color:'FFFFFF'};
    s.addText(sec, {x:X, y:0.22, w:7.6, h:0.40, fontFace:FONT, fontSize:14, bold:true, color:INK, margin:0, valign:'middle'});
    /* 법인 상자 — 양식의 오른쪽 위 그 상자다. 값은 GST.corpLabel(운영단위를 따라간다). */
    s.addShape(p.ShapeType.rect, {x:9.62, y:0.14, w:2.97, h:0.40, fill:{color:'FFFFFF'}, line:{color:'000000', width:1}});
    s.addText(corp, {x:9.62, y:0.14, w:2.97, h:0.40, fontFace:FONT, fontSize:13, bold:true, color:INK, align:'center', valign:'middle', margin:0});
    s.addText(meta, {x:5.0, y:0.58, w:7.59, h:0.22, fontFace:FONT, fontSize:8, color:MUT, align:'right', margin:0});
    s.addShape(p.ShapeType.line, {x:X, y:0.86, w:W, h:0, line:{color:'000000', width:2.25}});
  };
  /* 칸 하나 — 검정 머리띠 + 흰 몸통. 양식의 «가. 인력현황» 칸과 같은 꼴이다. */
  const slot = function(s, i, it, span){
    const cap=it.cap, oc=it.oc, tb=it.table;
    const c=i%COLS, r=Math.floor(i/COLS);
    const x=X+(CW+GAP)*c, y=ROWY[r], w=CW*span+GAP*(span-1);
    s.addText(cap, {x:x, y:y, w:w, h:BAND, fill:{color:'000000'}, color:'FFFFFF', fontFace:FONT,
                    fontSize:10, bold:true, valign:'middle', align:'center', margin:4,
                    line:{color:'000000', width:0.75}});
    s.addShape(p.ShapeType.rect, {x:x, y:y+BAND, w:w, h:BODY, fill:{color:'FFFFFF'}, line:{color:LINE, width:0.75}});
    if(tb){
      s.addTable(tb.rows, {x:x+0.06, y:y+BAND+0.06, w:w-0.12, colW:tb.colW, fontFace:FONT,
                           fontSize:tb.fontSize||8.5, color:INK, align:'center', valign:'middle',
                           border:{type:'solid', color:LINE, pt:0.5},
                           rowH:Math.max(0.20,(BODY-0.12)/tb.rows.length)});
      return;
    }
    /* 네이티브 차트로 넣을 수 있으면 그렇게 한다 — 받아 본 사람이 PPT 안에서 값·색·축을
       고칠 수 있다. 못 넣는 차트(도넛·산점도·수치축)는 그림으로 남기고, 어느 카드가
       그림인지는 items 를 만들 때 이미 기록해 두었다(아래 notes). */
    if(it.src){
      try{ GST.pptCombo(p, s, it.src, x+0.10, y+BAND+0.08, w-0.20, BODY-0.16); return; }
      catch(e){ /* 네이티브가 실패하면 그림으로 내려간다 — 빈 칸을 내보내지 않는다 */
        it.nativeErr=(e&&e.message)||'실패'; }
    }
    if(!oc) return;
    /* 비율 유지로 칸 안에 «중앙 정렬». 늘려 채우면 막대 굵기가 칸마다 달라 보인다. */
    const mw=w-0.20, mh=BODY-0.16, ar=oc.width/oc.height;
    let iw=mw, ih=iw/ar; if(ih>mh){ ih=mh; iw=ih*ar; }
    s.addImage({data:oc.toDataURL('image/png'), x:x+(w-iw)/2, y:y+BAND+(BODY-ih)/2, w:iw, h:ih});
  };

  /* ⚠ `.cw canvas` 만 보면 안 된다 — 추이(.trend-wrap)·크로스(.cross-wrap) 카드의 차트가
     통째로 빠진다(실측: 설치현황 14개 중 5개 · 고장분석 32개 중 7개가 그 바깥이다).
     카드 안의 캔버스를 전부 보되, Chart 인스턴스가 없는 것은 아래에서 자연히 걸러진다.
     clientWidth 0 은 접힌 카드라 캡처하면 빈 그림이 된다. */
  const cvs = GST.chartCanvases().filter(function(c){ return c.id && c.clientWidth>0; });   // 카드 선택자는 GST.CARD_SEL 한 벌(v135)
  const items = [], imgOnly = [];
  for(const cv of cvs){
    /* 그림은 «언제나» 만들어 둔다 — 네이티브가 도중에 실패해도 빈 칸이 나가지 않게.
       ⚠ 여기서 던지면 내보내기가 통째로 죽는다. 실제로 그랬다 — _chartLight 의 프록시
         자기대입 재귀 하나로 PPT 버튼 전체가 안 됐다. 한 차트의 실패가 전 장표를
         죽이지 않게 감싼다(네이티브만으로도 나갈 수 있다). */
    let oc = null;
    try{ oc = GST.chartHiResLight(cv.id); }catch(e){ oc = null; }
    const cap = GST.cardTitle(cv.id);
    const it = {cap:cap, oc:oc, id:cv.id};
    /* 네이티브로 옮겨도 «화면과 같은 그림»인 차트만 옮긴다(GST.pptNativeOK).
       ⚠ 판정을 여기서 새로 짜지 말 것 — 카드별 버튼(GST.pptCard)도 같은 함수를 본다. */
    try{
      const ch = (window.Chart && Chart.getChart) ? Chart.getChart(cv) : null;
      const why = ch ? GST.pptNativeOK(ch) : '차트 인스턴스 없음';
      if(ch && !why){ it.src = GST.pptSrc(ch); if(!it.src) it.why='데이터를 못 읽음'; }
      else it.why = why;
    }catch(e){ it.why = (e&&e.message)||'판정 실패'; }
    if(!it.src) imgOnly.push(cap + (it.why ? ' ('+it.why+')' : ''));
    if(!it.src && !it.oc) continue;          // 네이티브도 그림도 없으면 담을 것이 없다
    items.push(it);
  }
  /* 표도 «같은 칸»에 담는다. 차트만 담을 수 있으면, 표가 있는 페이지는 자기 덱을 따로
     짤 수밖에 없고 그러면 장표 얼굴이 또 갈라진다(v100 에 hr 이 그랬다).
     opt.tables = [{cap, rows:[[셀…]…], colW?, span?}] — span 은 가로로 차지할 칸 수. */
  (opt.tables||[]).forEach(function(tb){
    if(tb && tb.rows && tb.rows.length) items.push({cap:tb.cap||'', table:tb});
  });
  hid.forEach(function(s){ s.style.display='none'; });
  if(hid.length){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} }
  if(!items.length){ GST._pptSay('내보낼 차트가 없습니다 — 자료가 다 뜬 뒤에 다시 눌러 주세요.'); return; }

  const per = GST.PPT_MAX_PER_SLIDE;
  /* 자리를 «개수»가 아니라 «칸 수»로 센다 — 표가 두 칸을 쓰면 그만큼 자리를 먹는다.
     개수로 세면 인사이트 칸이 표 «위에 겹쳐» 그려지고, 겹친 장표는 아무도 못 읽는다.
     한 줄에 안 들어가는 폭이면 다음 줄로 내린다(줄을 걸쳐 그리면 칸 밖으로 나간다). */
  const span1 = function(it){ return Math.max(1, Math.min((it.table && it.table.span)||1, COLS)); };
  const pagesArr = []; let cur = [], cellIdx = 0;
  items.forEach(function(it){
    const n = span1(it);
    let ci = cellIdx;
    if(ci % COLS + n > COLS) ci += COLS - (ci % COLS);   // 그 줄에 안 들어가면 다음 줄
    if(ci + n > per){ pagesArr.push(cur); cur = []; ci = 0; }
    cur.push({it:it, cell:ci, n:n});
    cellIdx = ci + n;
  });
  if(cur.length) pagesArr.push(cur);

  const pages = pagesArr.length;
  for(let pg=0; pg<pages; pg++){
    const s = p.addSlide();
    header(s, title + (pages>1 ? '  ('+(pg+1)+'/'+pages+')' : ''));
    const part = pagesArr[pg];
    part.forEach(function(e){ slot(s, e.cell, e.it, e.n); });
    /* 마지막 장에 빈 칸이 남으면 인사이트를 거기 담는다 — 버리지 않고, 새 장도 만들지 않는다. */
    const usedCells = part.length ? part[part.length-1].cell + part[part.length-1].n : 0;
    if(pg===pages-1 && usedCells<per){
      const ins = [].slice.call(document.querySelectorAll('#gstInsights .gst-ins'))
                    .map(function(x){ return (x.innerText||'').trim(); }).filter(Boolean);
      if(ins.length){
        const i0=usedCells, c=i0%COLS, r=Math.floor(i0/COLS);
        const x=X+(CW+GAP)*c, y=ROWY[r], span=COLS-c, w=CW*span+GAP*(span-1);
        s.addText(GST.insHead(), {x:x, y:y, w:w, h:BAND, fill:{color:'000000'}, color:'FFFFFF', fontFace:FONT,
                              fontSize:10, bold:true, valign:'middle', align:'center', margin:4,
                              line:{color:'000000', width:0.75}});
        s.addShape(p.ShapeType.rect, {x:x, y:y+BAND, w:w, h:BODY, fill:{color:'FFFFFF'}, line:{color:LINE, width:0.75}});
        s.addText(ins.map(function(t){ return '· '+t; }).join('\n'),
          {x:x+0.12, y:y+BAND+0.10, w:w-0.24, h:BODY-0.20, fontFace:FONT, fontSize:9, color:'333333',
           valign:'top', margin:0, lineSpacingMultiple:1.3});
      }
    }
    /* ⚠ «어느 카드가 그림인지»를 마지막 장에 한 줄로 밝힌다. 조용히 두면 받아 본 사람은
       「왜 이 차트만 편집이 안 되지」로 읽고, 우리는 그걸 결함으로 오해한다.
       장을 새로 만들지 않는다 — 빈 장은 그 자체로 노이즈다. */
    if(pg===pages-1){
      const late = items.filter(function(x){ return x.nativeErr; })
                        .map(function(x){ return x.cap+' ('+x.nativeErr+')'; });
      GST._pptImgOnly = imgOnly.concat(late);          // 검사·진단이 본다
      if(GST._pptImgOnly.length){
        s.addText('※ 다음 차트는 PPT 안에서 편집할 수 없는 «그림»입니다 (그 형태는 네이티브 차트로 옮기면 화면과 달라집니다): '
                  + GST._pptImgOnly.join(' · '),
          {x:X, y:6.86, w:W, h:0.30, fontFace:FONT, fontSize:7.5, color:MUT, valign:'top', margin:0});
      }
    }
  }
  const fn = title.replace(/[\\/:*?"<>|]/g,'').slice(0,40)+'_'+asOf+'.pptx';
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
  const p=(GST.pagePath().match(/\/([a-z]+)\/?(?:index\.html)?$/)||[])[1]||'root';
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
  const card=GST.cardOf(cv); if(!card) return;
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
  GST.chartCanvases().forEach(function(cv){
    const id=cv.id, card=GST.cardOf(cv);
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
// GST.goTab('pm', {sn:'GBWS-0000'}) — 탭 전환과 동시에 그 설비로 필터
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
  /* 표의 클릭이 «자기 일»을 하는 곳은 빠진다 — 데이터 관리 목록은 행을 눌러 «그 행을 연다».
     이 메뉴가 캡처 단계에서 먼저 먹으면 S/N 칸을 누른 사람만 행이 안 열리고 다른 메뉴가 뜬다(v143 · 실제로 그랬다). */
  if(td.closest('[data-gst-nosn]')) return '';
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
  const here=(GST.pagePath().match(/\/([a-z]+)\/?$/)||[])[1]||'';
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
      // 라벨은 함수로도 받는다 — 문자열로 굳혀두면 로드 시점 언어에 갇혀
      // 나중에 언어를 바꿔도 이 항목만 옛 언어로 남는다
      +(typeof x.label==='function'?x.label():x.label)+'</button>';
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
  /* v169 — 기본이 라이트다(v139 · :root 가 라이트). 예전에는 기본값이 어두운 색이라 테마 클래스가 아직 안 붙은 화면
     (셸 밖에서 직접 연 페이지 · 테마 메시지가 오기 전)에서 흰 화면 위에 검은 팝업이 떴다. 다크는 theme-slate 일 때만. */
   '.gov{--gov-bg:#ffffff;--gov-fg:#101828;--gov-mut:#667085;--gov-line:rgba(16,24,40,.12);'
  +'--gov-soft:rgba(16,24,40,.04);--gov-heat:47,111,237;--gov-dim:rgba(16,24,40,.42)}'
  +'body.theme-slate .gov{--gov-bg:#0C1219;--gov-fg:#e2e8f0;--gov-mut:#94a3b8;--gov-line:rgba(151,170,196,.18);--gov-soft:rgba(151,170,196,.08);--gov-heat:45,212,191;--gov-dim:rgba(3,7,18,.72)}'
  +'body.theme-burgundy .gov{--gov-bg:#1f0822;--gov-fg:#fbeaf4;--gov-mut:#b49aa9;--gov-line:rgba(255,240,245,.18);'
  +'--gov-soft:rgba(255,240,245,.08);--gov-heat:244,114,182}'
  +'body.theme-light .gov{--gov-bg:#ffffff;--gov-fg:#0f172a;--gov-mut:#64748b;--gov-line:rgba(15,23,42,.14);'
  +'--gov-soft:rgba(15,23,42,.05);--gov-heat:37,99,235}'
  +'.gov{position:fixed;inset:0;z-index:9000;background:var(--gov-dim,rgba(3,7,18,.72));display:flex;align-items:flex-start;'
  +'justify-content:center;padding:34px 14px;overflow:auto;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}'
  +'.gov-w{position:relative;width:min(780px,100%);background:var(--gov-bg);color:var(--gov-fg);'
  +'border:1px solid var(--gov-line);border-radius:16px;box-shadow:0 24px 60px rgba(16,24,40,.28);overflow:hidden}'
  +'@media (prefers-reduced-motion:no-preference){body.gst-motion .gov{animation:gstDim .18s ease both}body.gst-motion .gov-w{animation:gstPop .22s cubic-bezier(.2,.8,.2,1) both}}'
  +'@keyframes gstDim{from{opacity:0}to{opacity:1}}@keyframes gstPop{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}'
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
  +'.gw5{margin:0 0 14px;padding:12px 14px;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--surface-2,transparent)}'
  +'.gw5-h{font-weight:800;font-size:13px;margin-bottom:6px}.gw5 ol{margin:0;padding-left:20px}.gw5 li{margin:6px 0;font-size:12.5px}'
  +'.gw5 li.bad::marker{color:#dc2626;font-weight:800}.gw5 li.warn::marker{color:#d97706;font-weight:800}.gw5-a{color:var(--gov-mut);font-size:12px}'
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
/* 이번 주 알아야 할 다섯 가지 (v148 · 4단계) — «보러 오지 않아도 가는» 요약의 본문.
   새로 계산하지 않는다 — 이미 화면이 만든 셋을 «할 일» 문장으로 묶을 뿐이다:
     고장 위험 순위(window._RISK · GST.riskRank) · 지표 변화(GST.briefFind) · 자료 결함(GST.dq)
   ⚠ 숫자를 여기서 다시 세면 카드와 다른 말을 한다(제2원칙). 다섯을 못 채우면 있는 만큼만 낸다. */
GST.W5_T={
  ko:{head:'이번 주 알아야 할 다섯 가지', risk:'고장 위험 1순위 {a} ({s}점 · {w})', riskN:' 외 {n}대', riskA:'→ 이번 주 점검 일정에 넣기',
      up:'{l} {d}', upA:'→ 원인 확인(세부내역은 그 차트를 누르면 나옵니다)', dq:'자료 문제: {l}', dqA:'→ ', none:'이번 주는 특별히 알릴 것이 없습니다.'},
  en:{head:'5 things to know this week', risk:'Top risk unit {a} ({s} pts · {w})', riskN:' +{n} more', riskA:'→ add to this week\'s inspection',
      up:'{l} {d}', upA:'→ check the cause (click the chart for details)', dq:'Data issue: {l}', dqA:'→ ', none:'Nothing notable this week.'},
  zh:{head:'本周须知五件事', risk:'故障风险第1位 {a} ({s}分 · {w})', riskN:' 等 {n}台', riskA:'→ 列入本周点检',
      up:'{l} {d}', upA:'→ 确认原因（点击图表查看明细）', dq:'数据问题: {l}', dqA:'→ ', none:'本周无特别事项。'},
  ja:{head:'今週知っておくべき5つ', risk:'故障リスク1位 {a} ({s}点 · {w})', riskN:' 他{n}台', riskA:'→ 今週の点検予定に入れる',
      up:'{l} {d}', upA:'→ 原因確認（チャートを押すと明細）', dq:'データ問題: {l}', dqA:'→ ', none:'今週は特に知らせることはありません。'}
};
GST.weekly5=function(){
  const T=GST.W5_T[GST._lang()]||GST.W5_T.ko, out=[];
  try{
    const R=window._RISK||[];
    if(R.length){ const r=R[0];
      out.push({sev:r.score>=20?'bad':'warn', text:T.risk.replace('{a}',r.label).replace('{s}',r.score).replace('{w}',GST.riskWhy(r))
        +(R.length>1?T.riskN.replace('{n}',R.length-1):''), act:T.riskA}); }
  }catch(e){}
  try{
    (GST.briefFind?GST.briefFind():[]).filter(function(f){ return f.sev==='bad'||f.sev==='warn'; }).slice(0,2).forEach(function(f){
      const small=f.prev!=null&&Math.abs(f.prev)<GST.DELTA_ABS_MAX, dv=f.cur-f.prev;
      const d=GST._num(f.prev)+' → '+GST._num(f.cur)+(f.unit||'')+(small&&isFinite(dv)?' ('+(dv>0?'+':'')+GST._num(dv)+')':(f.pct!=null?' ('+(f.pct>0?'+':'')+f.pct+'%)':''));
      out.push({sev:f.sev, text:T.up.replace('{l}',f.label).replace('{d}',d)
        +(f.why&&f.why.length?' · '+f.why.slice(0,2).map(function(w){ return w.name+' '+(w.own>0?'+':'')+GST._num(w.own); }).join(', '):''), act:T.upA});
    });
  }catch(e){}
  try{
    const adm=!!(GST.isAdmin&&GST.isAdmin()), dqT=GST._dqT?GST._dqT():{tell:''};
    (GST.dq?GST.dq.list():[]).filter(function(d){ return d.sev==='bad'||d.sev==='warn'; }).slice(0,2).forEach(function(d){
      out.push({sev:d.sev, text:T.dq.replace('{l}',d.label)+(d.n!=null?' ('+d.n.toLocaleString()+')':''), act:T.dqA+(adm?d.act:dqT.tell)}); });
  }catch(e){}
  return out.slice(0,5);
};
GST.weekly5Text=function(){
  const T=GST.W5_T[GST._lang()]||GST.W5_T.ko, L=GST.weekly5();
  const ic={bad:'🔴',warn:'🟡',info:'🔵',ok:'🟢'};
  return '['+(document.title||'').split('·')[0].trim()+'] '+T.head+'\n'
    +(L.length?L.map(function(x,i){ return (i+1)+'. '+(ic[x.sev]||'•')+' '+x.text+'\n   '+x.act; }).join('\n'):T.none);
};
GST.briefText=function(){
  const T=GST.BRF_T[GST._lang()]||GST.BRF_T.ko, F=GST.briefFind();
  const head=GST.weekly5Text()+'\n\n'+(document.title||'')+' — '+T.t;
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
GST._w5Html=function(){
  const T=GST.W5_T[GST._lang()]||GST.W5_T.ko, L=GST.weekly5(), E=GST._esc;
  return '<div class="gw5"><div class="gw5-h">'+E(T.head)+'</div>'
    +(L.length?'<ol>'+L.map(function(x){ return '<li class="'+x.sev+'"><div>'+E(x.text)+'</div><div class="gw5-a">'+E(x.act)+'</div></li>'; }).join('')+'</ol>'
              :'<div class="gbf-none">'+E(T.none)+'</div>')+'</div>';
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
    +'<div class="gov-body">'+GST._w5Html()+body+'</div>'
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
  ko:{t:'교차분석',sub:'현재 필터 기준 교차 집계',src:'데이터',per:'기간',row:'행',col:'열',val:'값',swap:'⇄ 전치',
      copy:'복사(TSV)',copied:'복사됨',csv:'CSV',close:'닫기',tot:'합계',sub2:'소계',etc:'기타',
      none:'표시할 데이터가 없습니다.',no:'(없음)',detail:'상세',more:'외 {n}건',pick:'값 고르기',
      all:'전체',clr:'해제',apply:'적용',find:'검색',rows:'{n}행',non:'—',cmp:'Δ 기간비교',cmpA:'기간 A',cmpB:'직전 B',cmpD:'Δ%',cmpHint:'A=기간 필터(비우면 최근 30일) · B=같은 길이의 직전 구간',
      disp:'표시',d_raw:'원값',d_row:'행 대비 %',d_col:'열 대비 %',d_all:'총계 대비 %',d_lift:'집중지수',
      top:'상위',t_all:'전체',sub_on:'소계'},
  en:{t:'Cross Analysis',sub:'Cross-tab on current filters',src:'Data',per:'Period',row:'Rows',col:'Cols',val:'Values',swap:'⇄ Swap',
      copy:'Copy (TSV)',copied:'Copied',csv:'CSV',close:'Close',tot:'Total',sub2:'Subtotal',etc:'Others',
      none:'No data to show.',no:'(none)',detail:'Detail',more:'+{n} more',pick:'Filter',
      all:'All',clr:'Clear',apply:'Apply',find:'Search',rows:'{n} rows',non:'—',cmp:'Δ Compare',cmpA:'Period A',cmpB:'Prev B',cmpD:'Δ%',cmpHint:'A = date filter (last 30d if empty) · B = preceding window of equal length',
      disp:'Show as',d_raw:'Value',d_row:'% of row',d_col:'% of column',d_all:'% of total',d_lift:'Lift',
      top:'Top',t_all:'All',sub_on:'Subtotals'},
  zh:{t:'交叉分析',sub:'按当前筛选交叉汇总',src:'数据',per:'期间',row:'行',col:'列',val:'值',swap:'⇄ 转置',
      copy:'复制(TSV)',copied:'已复制',csv:'CSV',close:'关闭',tot:'合计',sub2:'小计',etc:'其他',
      none:'无数据。',no:'(无)',detail:'明细',more:'其他{n}条',pick:'筛选值',
      all:'全部',clr:'清除',apply:'应用',find:'搜索',rows:'{n}行',non:'—',cmp:'Δ 期间对比',cmpA:'期间A',cmpB:'前一期B',cmpD:'Δ%',cmpHint:'A=所选期间(空则近30天) · B=等长的前一区间',
      disp:'显示方式',d_raw:'数值',d_row:'占行%',d_col:'占列%',d_all:'占总计%',d_lift:'集中指数',
      top:'前',t_all:'全部',sub_on:'小计'},
  ja:{t:'クロス分析',sub:'現在のフィルタで集計',src:'データ',per:'期間',row:'行',col:'列',val:'値',swap:'⇄ 転置',
      copy:'コピー(TSV)',copied:'コピー済',csv:'CSV',close:'閉じる',tot:'合計',sub2:'小計',etc:'その他',
      none:'データがありません。',no:'(なし)',detail:'明細',more:'他{n}件',pick:'値を選ぶ',
      all:'全体',clr:'解除',apply:'適用',find:'検索',rows:'{n}行',non:'—',cmp:'Δ 期間比較',cmpA:'期間A',cmpB:'直前B',cmpD:'Δ%',cmpHint:'A=期間フィルタ(空なら直近30日) · B=同じ長さの直前区間',
      disp:'表示形式',d_raw:'実数',d_row:'行比%',d_col:'列比%',d_all:'総計比%',d_lift:'集中指数',
      top:'上位',t_all:'全体',sub_on:'小計'}
};
GST._pivot=null;
GST.PIV_LV=3;                 // 행 축 중첩 단계 수
GST._PIV_SEP='\x01';
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
  if(a==='med'){                       // 교체 간격처럼 한쪽으로 치우친 값은 평균이 왜곡된다
    // null을 그냥 +로 바꾸면 0이 되고 isFinite(0)은 참이라 '값 없음'이 0으로 섞인다.
    // 재교체 간격은 첫 교체 행이 전부 null이라, 이대로면 중앙값이 0에 붙어버린다.
    const v=[]; recs.forEach(function(r){ const raw=GST._pivGet(r,meas.f);
      if(raw==null||raw==='')return; const x=+raw; if(isFinite(x))v.push(x); });
    if(!v.length) return null; v.sort(function(p,q){return p-q;});
    const h=v.length>>1; return v.length%2?v[h]:Math.round((v[h-1]+v[h])/2*10)/10;
  }
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
GST._pivKey=function(){ return 'gst_piv_'+GST.pagePath().replace(/[^a-z0-9]/gi,''); };
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
        +['raw','row','col','all','lift'].map(function(k){ return '<option value="'+k+'"'+(disp===k?' selected':'')+'>'+T['d_'+k]+'</option>'; }).join('')
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
  /* 집중지수(lift) = 관측 ÷ 기대.  기대 = 행합 × 열합 ÷ 총합.
     "이 조합이 평균보다 몇 배로 몰려 있나"를 표의 주변합만으로 구한다 — 추가 데이터가 필요 없다.
     단순 건수는 흔한 항목이 전부 1등을 차지해 쓸모가 없다(자재는 O-RING이 44%다).
     lift로 보면 'STR 세부공정에서 DRAIN PIPE-E가 229배'처럼 유독 몰린 칸이 드러난다.
     표본이 적으면 배수가 튀므로 관측 3건 미만은 표시하지 않는다. */
  const fmtV=function(v,base,mi){
    if(v==null) return '·';
    if(disp==='raw') return GST._num(v);
    if(disp==='lift'){
      /* 기대 = 행합 × 열합 ÷ 총합은 '더할 수 있는 값'에서만 성립한다.
         중앙값·고유수·평균은 주변합이라는 것 자체가 없어서 배수에 뜻이 없다
         (중앙값끼리 나누면 단위가 1/일이 된다). 그런 측정값은 원값을 그대로 보여준다 —
         화면에서 값을 여러 개 얹은 채로 표시만 집중지수로 바꾸는 게 흔한 조작이라
         '·'로 지워버리면 멀쩡한 열이 통째로 사라진 것처럼 보인다. */
      const ag=(mi!=null&&meas()[mi])?(meas()[mi].agg||'count'):'count';
      if(ag!=='count'&&ag!=='sum') return GST._num(v);
      if(!base) return '·';
      if(v<3) return '·';                       // 표본 부족 — 배수가 튄다
      const x=v/base;
      return GST.xmul(x);
    }
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
      const base = disp==='row'?rowT(rk,m) : disp==='col'?colT(c,m) : disp==='all'?grand(m)
        : disp==='lift'?(grand(m)?rowT(rk,m)*colT(c,m)/grand(m):null) : null;
      const a=(disp==='raw'&&mx>0)?(0.07+0.42*(v/mx)):0;
      return '<td class="gpv-cell" data-r="'+GST._esc(rk)+'" data-c="'+GST._esc(c)+'"'
        +(a?' style="background:rgba(var(--gov-heat),'+a.toFixed(3)+')"':'')+'>'+fmtV(v,base,m)+'</td>';
    };
    let prev=[];
    const subRow=function(g){
      const ks=P.preKeys(g).filter(function(rk){ return keys.indexOf(rk)>=0; });
      if(!ks.length) return '';
      return '<tr class="gpv-tot"><td colspan="'+nLv+'">'+GST._esc(g)+' '+T.sub2+'</td>'
        + cN.map(function(c){ return MS.map(function(m){
            const v=preC(ks,c,m);
            const base= disp==='row'?preT(ks,m) : disp==='col'?colT(c,m) : disp==='all'?grand(m)
              : disp==='lift'?(grand(m)?preT(ks,m)*colT(c,m)/grand(m):null) : null;
            return '<td>'+fmtV(v,base,m)+'</td>'; }).join(''); }).join('')
        + (cmpOn?'<td></td>':'')
        + MS.map(function(m){ const v=preT(ks,m);
            return '<td>'+fmtV(v, disp==='raw'?null:(disp==='all'?grand(m):v), m)+'</td>'; }).join('')
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
              +fmtV(v, disp==='all'?grand(m):(disp==='raw'?null:v), m)+'</td>'; }).join('')
        + '</tr>';
      prev=parts;
    });
    if(showSub && nLv>1 && prev.length) h+=subRow(prev[0]);
    if(etcKeys.length){
      h+='<tr class="gpv-tot"><td'+(nLv>1?' colspan="'+nLv+'"':'')+'>'+T.etc+' ('+etcKeys.length+')</td>'
        + cN.map(function(c){ return MS.map(function(m){ const v=preC(etcKeys,c,m);
            const base= disp==='col'?colT(c,m) : disp==='all'?grand(m) : disp==='row'?preT(etcKeys,m)
              : disp==='lift'?(grand(m)?preT(etcKeys,m)*colT(c,m)/grand(m):null) : null;
            return '<td>'+fmtV(v,base,m)+'</td>'; }).join(''); }).join('')
        + (cmpOn?'<td></td>':'')
        + MS.map(function(m){ const v=preT(etcKeys,m);
            return '<td>'+fmtV(v, disp==='all'?grand(m):(disp==='raw'?null:v), m)+'</td>'; }).join('')+'</tr>';
    }
    h+='</tbody><tfoot><tr class="gpv-tot"><td'+(nLv>1?' colspan="'+nLv+'"':'')+'>'+T.tot+'</td>'
      + cN.map(function(c){ return MS.map(function(m){ const v=colT(c,m);
          const base= disp==='row'?grand(m) : disp==='col'?v : disp==='all'?grand(m) : null;
          return '<td>'+fmtV(v,base,m)+'</td>'; }).join(''); }).join('')
      + (cmpOn?(function(){ const ta=colT(T.cmpA,MS[0])||0, tb=colT(T.cmpB,MS[0]);
          if(tb==null||!tb) return '<td></td>';
          const dpc=Math.round(ta/tb*1000)/10-100;
          const cc=dpc>0?'var(--bad,#fb7185)':(dpc<0?'var(--ok,#4ade80)':'inherit');
          return '<td style="color:'+cc+'">'+(dpc>0?'+':'')+(Math.round(dpc*10)/10)+'%</td>'; })():'')
      + MS.map(function(m){ const v=grand(m); return '<td>'+fmtV(v, disp==='raw'?null:v, m)+'</td>'; }).join('')
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
  /* 10분 → 30분. 한 번의 새로고침이 시트 8개를 통째로 다시 받는다(주간현황 기준).
     10분이면 한 사람이 하루 8시간 열어두는 것만으로 하루 768MB — 무료 5GB가 일주일에 사라진다.
     시트는 그렇게 자주 바뀌지 않고, 미러 자체도 30분 주기로 돈다(sheet-sync/DEPLOY.md).
     ⚠ 위 계산은 «한 페이지» 몫이다. 셸은 여덟 페이지를 iframe 으로 띄우고 한 번 만든 것을 버리지 않으므로,
        안 보이는 iframe 은 startAutoRefresh 가 건너뛴다(v135 · window.frameElement 의 .active). */
  try{ GST.startAutoRefresh(GST.AR_MIN); }catch(e){}
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

/* ============================================================================
   GST v2 — 2단계 «제품화»의 공용 모듈: 목표(SLA) · 운영 지표 · 표준 KPI 카드 · 사람별 첫 화면 설정
   ----------------------------------------------------------------------------
   v172 에 assets/v2.js 에서 core 로 옮겼다 — 따로 두면 ?v= 가 둘이라 «한쪽만 올리는» 사고가 난다(이름은 그대로).

   ⚠ 숫자를 새로 «정의»하지 않는다. 판정은 전부 core 정본을 부른다:
     설비 대수 GST.EQ(GST.ops.isIn/isRun) · 고장 GST.ops.bm(주간현황과 같은 규칙 · 국내 원장/KR_ON) · PM GST.ops.pm(GST.PM.is) ·
     재고장 GST.ops.risk(GST.riskRank) · 워런티 GST.WARR. 이 모듈이 하는 일은 «같은 행을 정해진 창으로 묶어 비율로 나누는 것»뿐이다.
   ⚠ 창(window)은 통합 관제와 같다 — 일요일 시작 주 12개, «최근 4주» = 마지막 네 주(이번 주 포함), «직전 4주» = 그 앞 네 주.
     관제의 「PM 실시율」 게이지(pmN ÷ (pmN + 4주 고장))와 pm_ratio 는 같은 식이다 — 둘이 다른 숫자를 내면 사고다.
   ============================================================================ */
(function(){
var DAY = 864e5;

/* ---------- 공용 문구 (네 언어 · core 의 GST.XXX_T 관례) ---------- */
/* 로그인이 끝난 뒤의 DB 연결 — 페이지는 자료 읽기(fetchCSV · 로그인을 기다린다)와 «동시에» 이 표들을 읽는다.
   GST.db() 는 세션이 없으면 null 이라, 로그인 직후 한순간에 부르면 «표가 없다(no_db)»로 굳는다 — 기다린 뒤 부른다. */
GST._dbAuthed = async function(){ try{ if(GST.authOn&&GST.authOn()) await GST.authReady(); }catch(e){} return GST.db(); };
GST.V2_T = {
  ko:{ m_run_rate:'가동률', m_bm_per100:'설비 100대당 고장', m_pm_ratio:'PM 비율', m_repeat14:'{d}일 이내 재고장 설비', m_act_overdue:'기한 경과 처리 건',
       d_run_rate:'가동(Operation) ÷ 반입 설비 · 기준일 현재', d_bm_per100:'최근 4주 고장 건수 ÷ 반입 설비 × 100', d_pm_ratio:'최근 4주 PM ÷ (PM + 고장)',
       d_repeat14:'고장 위험 순위에서 {d}일 이내 재고장이 발생한 설비', d_act_overdue:'처리함에서 기한이 지났지만 완료되지 않은 건',
       w4:'최근 4주', tgt:'목표 {v}', tgt_le:'이하', tgt_ge:'이상', tgt_none:'목표 미설정', tgt_ok:'달성', tgt_miss:'미달 {g}', tgt_over:'초과 {g}',
       vs:'직전 4주 대비', vs_none:'비교 없음(현재 상태 기준)', den:'분모 {v}', den_units:'반입 {v}대', den_ev:'PM+고장 {v}건',
       st_ok:'정상', st_warn:'주의', st_bad:'위험', st_none:'판정 없음', u_pct:'%', u_ea:'대', u_case:'건', u_pt:'p',
       g_band:'주의 구간 기본값', g_sig:'관제 신호등 기준', g_risk:'고장 위험 점수', gd_band:'목표에 주의 기준을 따로 정하지 않았을 때 쓰는 구간', gd_sig:'운영단위를 위험·주의로 표시하는 기준(이번 주 고장 ÷ 평소)', gd_risk:'고장분석 TOP 20 · 통합 관제 · 내 화면이 함께 쓰는 점수', p_band_run_rate:'가동률', p_band_bm_per100:'설비 100대당 고장', p_band_pm_ratio:'PM 비율', p_band_repeat14:'재고장 설비', p_band_act_overdue:'기한 경과 처리 건', p_sig_bad_x:'위험 — 평소 대비 배수(이상)', p_sig_bad_d:'위험 — 평소보다 늘어난 건수(이상)', p_sig_warn_x:'주의 — 평소 대비 배수(초과)', p_sig_warn_d:'주의 — 평소보다 늘어난 건수(이상)', p_sig_rep_bad:'위험 — 재고장 설비 수(이상)', p_sig_rep_warn:'주의 — 재고장 설비 수(이상)', p_risk_bm:'최근 90일 고장 1건당', p_risk_rep:'재고장 1회당', p_risk_up:'직전 90일 대비 2건 이상 증가 시', p_risk_recent:'최근 고장 발생 시', p_risk_pm:'PM 장기 미실시 시', p_risk_rep_days:'재고장 판단 기간', p_risk_recent_days:'「최근 고장」 판단 기간', p_risk_pm_days:'「PM 장기 미실시」 판단 기간', u_x:'배', u_day:'일', u_pts:'점', u_rel:'%' },
  en:{ m_run_rate:'Running rate', m_bm_per100:'Failures per 100 units', m_pm_ratio:'PM ratio', m_repeat14:'Units with {d}-day repeat', m_act_overdue:'Overdue actions',
       d_run_rate:'Running (Operation) ÷ installed · as of today', d_bm_per100:'Last-4-week failures ÷ installed × 100', d_pm_ratio:'Last-4-week PM ÷ (PM + failures)',
       d_repeat14:'Units in the risk ranking with a repeat failure within {d} days', d_act_overdue:'Open actions past their due date',
       w4:'last 4 wks', tgt:'Target {v}', tgt_le:'or less', tgt_ge:'or more', tgt_none:'No target', tgt_ok:'Met', tgt_miss:'Short {g}', tgt_over:'Over {g}',
       vs:'vs prior 4 wks', vs_none:'No comparison (current state)', den:'Base {v}', den_units:'{v} installed', den_ev:'{v} PM+BM',
       st_ok:'Normal', st_warn:'Watch', st_bad:'Critical', st_none:'No rating', u_pct:'%', u_ea:'', u_case:'', u_pt:'p',
       g_band:'Default watch band', g_sig:'Command signals', g_risk:'Failure risk score', gd_band:'band used when a target has no watch limit', gd_sig:'when a unit turns critical/watch (this week ÷ usual)', gd_risk:'shared by Fault TOP 20 · Command · My view', p_band_run_rate:'Running rate', p_band_bm_per100:'Failures per 100 units', p_band_pm_ratio:'PM ratio', p_band_repeat14:'Repeat-failure units', p_band_act_overdue:'Overdue actions', p_sig_bad_x:'Critical — at least × usual', p_sig_bad_d:'Critical — at least this many more', p_sig_warn_x:'Watch — more than × usual', p_sig_warn_d:'Watch — at least this many more', p_sig_rep_bad:'Critical — repeat-failure units ≥', p_sig_rep_warn:'Watch — repeat-failure units ≥', p_risk_bm:'per failure in 90 days', p_risk_rep:'per repeat failure', p_risk_up:'if up by 2+ vs prior 90 days', p_risk_recent:'if failed recently', p_risk_pm:'if no PM for long', p_risk_rep_days:'gap counted as repeat', p_risk_recent_days:'length of «recent»', p_risk_pm_days:'length of «no PM for long»', u_x:'×', u_day:'d', u_pts:'pts', u_rel:'%' },
  zh:{ m_run_rate:'运行率', m_bm_per100:'每100台故障', m_pm_ratio:'PM比率', m_repeat14:'{d}天内复发设备', m_act_overdue:'逾期待办',
       d_run_rate:'运行(Operation) ÷ 进场设备 · 截至基准日', d_bm_per100:'最近4周故障 ÷ 进场设备 × 100', d_pm_ratio:'最近4周 PM ÷ (PM + 故障)',
       d_repeat14:'故障风险排名中{d}天内复发的设备', d_act_overdue:'待办中已过期限但未关闭的事项',
       w4:'最近4周', tgt:'目标 {v}', tgt_le:'以下', tgt_ge:'以上', tgt_none:'未设定目标', tgt_ok:'达成', tgt_miss:'未达 {g}', tgt_over:'超出 {g}',
       vs:'较前4周', vs_none:'无比较(当前状态)', den:'分母 {v}', den_units:'进场 {v}台', den_ev:'PM+故障 {v}件',
       st_ok:'正常', st_warn:'注意', st_bad:'危险', st_none:'无判定', u_pct:'%', u_ea:'台', u_case:'件', u_pt:'p',
       g_band:'目标的默认注意区间', g_sig:'综合监控信号灯', g_risk:'故障风险分数', gd_band:'目标未填写«注意界限»时使用的区间', gd_sig:'将运营单位标为危险·注意的标准(本周故障 ÷ 平时)', gd_risk:'故障分析 TOP 20 · 综合监控 · 我的画面共用的分数', p_band_run_rate:'运行率', p_band_bm_per100:'每100台故障', p_band_pm_ratio:'PM比率', p_band_repeat14:'复发设备', p_band_act_overdue:'逾期待办', p_sig_bad_x:'危险 — 平时的几倍以上', p_sig_bad_d:'危险 — 比平时多几件以上', p_sig_warn_x:'注意 — 超过平时的几倍', p_sig_warn_d:'注意 — 比平时多几件以上', p_sig_rep_bad:'危险 — 复发设备几台以上', p_sig_rep_warn:'注意 — 复发设备几台以上', p_risk_bm:'近90天每件故障', p_risk_rep:'每次复发', p_risk_up:'较前90天增加2件以上时', p_risk_recent:'近期有故障时', p_risk_pm:'长期未做PM时', p_risk_rep_days:'视为复发的间隔', p_risk_recent_days:'«近期»的长度', p_risk_pm_days:'«长期未PM»的长度', u_x:'倍', u_day:'天', u_pts:'分', u_rel:'%' },
  ja:{ m_run_rate:'稼働率', m_bm_per100:'設備100台あたり故障', m_pm_ratio:'PM比率', m_repeat14:'{d}日以内再故障設備', m_act_overdue:'期限超過の対応',
       d_run_rate:'稼働(Operation) ÷ 搬入設備 · 基準日時点', d_bm_per100:'直近4週の故障 ÷ 搬入設備 × 100', d_pm_ratio:'直近4週の PM ÷ (PM + 故障)',
       d_repeat14:'故障リスク順位で{d}日以内に再故障がある設備', d_act_overdue:'対応のうち期限を過ぎて閉じていないもの',
       w4:'直近4週', tgt:'目標 {v}', tgt_le:'以下', tgt_ge:'以上', tgt_none:'目標未設定', tgt_ok:'達成', tgt_miss:'未達 {g}', tgt_over:'超過 {g}',
       vs:'前4週比', vs_none:'比較なし(現在の状態)', den:'分母 {v}', den_units:'搬入 {v}台', den_ev:'PM+故障 {v}件',
       st_ok:'正常', st_warn:'注意', st_bad:'危険', st_none:'判定なし', u_pct:'%', u_ea:'台', u_case:'件', u_pt:'p',
       g_band:'目標の既定注意帯', g_sig:'統合管制シグナル', g_risk:'故障リスク点数', gd_band:'目標に«注意境界»がないときに使う帯', gd_sig:'運営単位を危険・注意にする基準(今週の故障 ÷ 平常)', gd_risk:'故障分析 TOP 20 · 統合管制 · マイ画面で共通の点数', p_band_run_rate:'稼働率', p_band_bm_per100:'設備100台あたり故障', p_band_pm_ratio:'PM比率', p_band_repeat14:'再故障設備', p_band_act_overdue:'期限超過の対応', p_sig_bad_x:'危険 — 平常の何倍以上', p_sig_bad_d:'危険 — 平常より何件以上多い', p_sig_warn_x:'注意 — 平常の何倍超', p_sig_warn_d:'注意 — 平常より何件以上多い', p_sig_rep_bad:'危険 — 再故障設備何台以上', p_sig_rep_warn:'注意 — 再故障設備何台以上', p_risk_bm:'直近90日の故障1件あたり', p_risk_rep:'再故障1回あたり', p_risk_up:'前90日より2件以上増えたら', p_risk_recent:'最近故障があれば', p_risk_pm:'PMが長くなければ', p_risk_rep_days:'再故障とみなす間隔', p_risk_recent_days:'«最近»の長さ', p_risk_pm_days:'«PMが長くない»の長さ', u_x:'倍', u_day:'日', u_pts:'点', u_rel:'%' }
};
GST.v2t = function(k, o, lang){
  var L=lang||(GST._lang&&GST._lang())||'ko', T=GST.V2_T[L]||GST.V2_T.ko, s=T[k]!=null?T[k]:(GST.V2_T.ko[k]!=null?GST.V2_T.ko[k]:k);
  /* {d} = 재고장 간격(판정 기준 risk_rep_days) — 이름표에 «14일»을 박아 두면 기준을 바꿔도 글자가 안 따라간다 */
  var O=Object.assign({d:GST.RISK_W&&GST.RISK_W.repDays}, o||{});
  return String(s).replace(/\{(\w+)\}/g, function(m,x){ return O[x]!=null?O[x]:m; });
};

/* ---------- 지표 목록 — «무엇을 세나»의 정본 ----------
 * dir   — le: 낮을수록 좋다 · ge: 높을수록 좋다 (목표 표 ops_targets.dir 의 기본값)
 * unit  — pct(%) · rate(배율 없는 수) · ea(대) · case(건)
 * dec   — 화면 소수 자리
 * band  — 목표의 주의 띠(목표 표에 warn 이 없을 때). abs = 절대 폭 · rel = 목표의 비율.
 *         퍼센트 지표에 «목표의 10%»를 쓰면 가동률 93% 의 주의 띠가 83.7% 까지 넓어진다 — 그래서 지표마다 다르다.
 * ⚠ 지표를 더하면 V2_T 네 언어에 m_<id>·d_<id> 를 같이 넣는다(t-v2 가 센다). */
GST.METRICS = {
  run_rate:    { dir:'ge', unit:'pct',  dec:1, band:{abs:3} },
  bm_per100:   { dir:'le', unit:'rate', dec:2, band:{rel:0.15} },
  pm_ratio:    { dir:'ge', unit:'pct',  dec:0, band:{abs:10} },
  repeat14:    { dir:'le', unit:'ea',   dec:0, band:{abs:2} },
  act_overdue: { dir:'le', unit:'case', dec:0, band:{abs:2} }
};
GST.METRIC_ORDER = ['run_rate','bm_per100','pm_ratio','repeat14','act_overdue'];

/* ---------- 창 — 통합 관제 weeksOf 와 같은 규칙(일요일 시작 · 이번 주 포함 12주) ----------
 * ⚠ 관제·사이트 상세가 각자 weeksOf 를 들고 있다. 셸에 거는 날 그 둘이 이 함수를 부르게 한다(PLAN 「통합 순서」). */
function weeks(asOf, n){
  n=n||12;
  var sun=new Date(Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth(),asOf.getUTCDate())); sun.setUTCDate(sun.getUTCDate()-sun.getUTCDay());
  var out=[]; for(var i=n-1;i>=0;i--){ var st=new Date(sun.getTime()-i*7*DAY), en=new Date(st.getTime()+7*DAY);
    var k=GST.isoW?GST.isoW(st):''; out.push({key:k, st:st, en:en, label:'W'+String(k).slice(-2)}); }
  return out;
}

/* ---------- 지표 계산 ----------
 * GST.metrics.by(R, asOf, keyOf, ok, opt) — 한 번 훑어 «열쇠별» 묶음을 만든다(운영단위별 표가 열쇠 수만큼 다시 훑지 않게).
 *   R     — GST.ops.load() 의 결과 {INST, WK, KRA}
 *   keyOf — 행 → 묶음 열쇠 (전사 하나면 function(){return '*';}). 행은 {op, region} 을 갖는다.
 *   ok    — 화면의 거르기(구분·운영단위). GST.ops 의 bm/pm/risk 에 그대로 넘긴다 — 같은 모집단.
 *   opt.actions — 처리함 열린 일 [{op, due, status}] (선택 · act_overdue)
 * 돌려주는 묶음: {k, inN, runN, bm4, bmP, pm4, pmP, bmW[12], pmW[12], rep, risk[], warrSoon[], rows:{bm4, pm4}, m:{지표 → {v, prev, num, den}}} */
function blank(k){ return {k:k, inN:0, runN:0, bm4:0, bmP:0, pm4:0, pmP:0, bmW:[0,0,0,0,0,0,0,0,0,0,0,0], pmW:[0,0,0,0,0,0,0,0,0,0,0,0],
  rep:0, risk:[], warrSoon:[], overdue:0, rows:{bm4:[], pm4:[]}}; }
/* 묶음 → 지표. 분모가 0 이면 값은 null(«0%»가 아니다 — 설비가 없는 곳의 가동률은 0 이 아니라 «모른다»). */
function fin(o, hasAct){
  o.m={
    run_rate:   { v:o.inN?o.runN/o.inN*100:null, prev:null, num:o.runN, den:o.inN },
    bm_per100:  { v:o.inN?o.bm4/o.inN*100:null, prev:o.inN?o.bmP/o.inN*100:null, num:o.bm4, den:o.inN },
    pm_ratio:   { v:(o.pm4+o.bm4)?o.pm4/(o.pm4+o.bm4)*100:null, prev:(o.pmP+o.bmP)?o.pmP/(o.pmP+o.bmP)*100:null, num:o.pm4, den:o.pm4+o.bm4 },
    repeat14:   { v:o.rep, prev:null, num:o.rep, den:o.risk.length },
    act_overdue:{ v:hasAct?o.overdue:null, prev:null, num:o.overdue, den:null }
  };
  return o;
}
GST.metrics = {
  weeks: weeks,
  by: function(R, asOf, keyOf, ok, opt){
    opt=opt||{};
    var W=weeks(asOf,12), t0=asOf.getTime();
    var wIx=function(d){ var v=d.getTime(); for(var i=0;i<W.length;i++) if(v>=W[i].st.getTime()&&v<W[i].en.getTime()) return i; return -1; };
    var G={};
    var g=function(k){ return G[k]||(G[k]=blank(k)); };
    var pass=function(x){ return !ok||ok(x); };
    R.INST.forEach(function(x){ if(!pass(x)||!GST.ops.isIn(x,asOf)) return; var o=g(keyOf(x)); o.inN++; if(GST.ops.isRun(x,asOf)) o.runN++;
      if(x.wd&&x.wd.getTime()>t0&&x.wd.getTime()<=t0+90*DAY) o.warrSoon.push(x); });
    GST.ops.bm(R, ok).forEach(function(x){ var i=wIx(x.d); if(i<0) return; var o=g(keyOf(x)); o.bmW[i]++;
      if(i>=8){ o.bm4++; o.rows.bm4.push(x); } else if(i>=4) o.bmP++; });
    GST.ops.pm(R, ok).forEach(function(x){ var i=wIx(x.d); if(i<0) return; var o=g(keyOf(x)); o.pmW[i]++;
      if(i>=8){ o.pm4++; o.rows.pm4.push(x); } else if(i>=4) o.pmP++; });
    GST.ops.risk(R, asOf, ok).forEach(function(r){ var o=g(keyOf({op:r.site, region:GST.ORG.region(r.site)})); o.risk.push(r); if(r.rep) o.rep++; });
    var today=new Date(); today=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate());
    (opt.actions||[]).forEach(function(a){ if(!a||!a.due||a.status==='done'||a.status==='dismissed') return;
      var x={op:a.op||'', region:GST.ORG.region(a.op||'')}; if(!pass(x)) return;
      var d=GST.toDate?GST.toDate(a.due):new Date(a.due); if(d&&d.getTime()<today) g(keyOf(x)).overdue++; });
    Object.keys(G).forEach(function(k){ fin(G[k], !!opt.actions); });
    return {W:W, G:G};
  },
  /* 범위 하나(전사·구분·운영단위)의 묶음 — by() 를 열쇠 하나로 부른 것과 같다. 자료가 하나도 없으면 빈 묶음(값은 전부 null). */
  one: function(R, asOf, ok, opt){ var r=GST.metrics.by(R, asOf, function(){ return '*'; }, ok, opt);
    return r.G['*']||fin(blank('*'), !!(opt&&opt.actions)); },
  /* 화면 범위 → 거르기. sc = {kind:'all'|'region'|'op', v} */
  okOf: function(sc){
    if(!sc||sc.kind==='all') return null;
    if(sc.kind==='region') return function(x){ return x.region===sc.v; };
    return function(x){ return (x.op||'')===sc.v; };
  }
};

/* ---------- 목표 ----------
 * 표: ops_targets (setup-27). 화면은 «가장 좁은 목표»를 고른다 — 운영단위 > 구분 > 전사.
 * ⚠ 목표를 못 읽어도 화면은 선다(그때 카드는 «목표 미설정»). 왜 못 읽었는지는 GST.targets.why 에 남긴다:
 *   'no_db'(인증 꺼짐·오프라인) · 'no_table'(setup-27 전) · 'read_fail' · ''(정상). */
GST.targets = {
  rows: [], why: 'not_loaded', at: null,
  load: async function(client){
    var C=client; try{ if(!C) C=await GST._dbAuthed(); }catch(e){ C=null; }
    if(!C){ this.rows=[]; this.why='no_db'; return this.rows; }
    try{
      var r=await C.from('ops_targets').select('id,metric,scope_kind,scope,target,warn,dir,note,updated_at,updated_by').is('removed_at',null).limit(5000);
      if(r.error){ var m=String(r.error.message||r.error.code||'');
        this.why=/does not exist|relation|schema cache|42P01|PGRST20[05]/i.test(m)?'no_table':'read_fail'; this.rows=[]; console.warn('[v2] 목표 읽기 실패', r.error); return this.rows; }
      this.rows=(r.data||[]).map(function(x){ return Object.assign({}, x, {target:Number(x.target), warn:x.warn==null?null:Number(x.warn)}); });
      this.why=''; this.at=new Date(); return this.rows;
    }catch(e){ this.rows=[]; this.why='read_fail'; console.warn('[v2] 목표 읽기 실패', e); return this.rows; }
  },
  /* sc = {op, region} — 운영단위 행이면 op·region 둘 다, 구분 범위면 region 만, 전사면 {} */
  pick: function(metric, sc){
    sc=sc||{}; var rs=this.rows.filter(function(t){ return t.metric===metric; });
    var by=function(kind, v){ for(var i=0;i<rs.length;i++) if(rs[i].scope_kind===kind&&(kind==='all'||rs[i].scope===v)) return rs[i]; return null; };
    return (sc.op&&by('op',sc.op)) || (sc.region&&by('region',sc.region)) || by('all','') || null;
  },
  /* 정확히 그 범위의 목표(고치는 화면용 — 위로 거슬러 올라가지 않는다) */
  exact: function(metric, kind, v){ for(var i=0;i<this.rows.length;i++){ var t=this.rows[i];
    if(t.metric===metric&&t.scope_kind===kind&&(kind==='all'||t.scope===v)) return t; } return null; },
  /* 판정 — 'ok' · 'warn' · 'bad' · null(목표 없음 또는 값 없음). 주의 띠는 목표의 warn, 없으면 지표의 band. */
  judge: function(metric, v, t){
    if(v==null||isNaN(v)||!t) return null;
    var M=GST.METRICS[metric]||{}, dir=t.dir||M.dir||'le', b=M.band||{rel:0.1};
    var w=t.warn!=null?t.warn:(dir==='le' ? t.target+(b.abs!=null?b.abs:Math.abs(t.target)*b.rel) : t.target-(b.abs!=null?b.abs:Math.abs(t.target)*b.rel));
    if(dir==='le') return v<=t.target?'ok':(v<=w?'warn':'bad');
    return v>=t.target?'ok':(v>=w?'warn':'bad');
  },
  /* 목표를 바꿀 수 있나 — 서버 _tgt_who 와 같은 규칙(관리자 + 쓰기 권한). 버튼을 보일지 정할 뿐 막는 것은 서버다. */
  can: function(){ return !!(GST._me && GST._me.role==='admin' && GST._me.can_write); },
  save: async function(o, client){
    var C=client||await GST._dbAuthed(); if(!C) return {error:'no_db'};
    var r=await C.rpc('target_save',{p_metric:o.metric,p_scope_kind:o.scope_kind,p_scope:o.scope||'',p_target:o.target,
      p_warn:o.warn==null||o.warn===''?null:o.warn,p_dir:o.dir,p_note:o.note||null,p_at:o.at||null});
    if(r.error) return {error:String(r.error.message||r.error.code||'rpc')};
    return r.data||{error:'empty'};
  },
  remove: async function(id, at, client){
    var C=client||await GST._dbAuthed(); if(!C) return {error:'no_db'};
    var r=await C.rpc('target_remove',{p_id:id,p_at:at}); if(r.error) return {error:String(r.error.message||r.error.code||'rpc')};
    return r.data||{error:'empty'};
  }
};

/* ---------- 판정 기준 — 코드에 박혀 있던 «기준 숫자»를 화면에서 고친다 (setup-27 6절) ----------
 * 사용자 확정(2026-10-10): 기준이 바뀔 때마다 코드를 고치게 두지 않는다. 열쇠·기본값·허용 범위·뜻은 «여기 한 곳»,
 * 바꾼 값은 ops_params 표. 기본값은 지금 코드가 쓰는 값 그대로다 — 표가 비어 있으면 한 자리도 안 바뀐다.
 * g     — band(목표의 기본 주의 띠) · sig(관제 신호등) · risk(고장 위험 점수 — 고장분석 TOP 20 · 관제 · 내 화면 공통)
 * u     — 화면 단위: pt(퍼센트포인트) · pct(%) · x(배) · case(건) · ea(대) · day(일) · pts(점)
 * live  — 지금 이 값을 읽는 화면이 있나. false 면 화면이 «아직 적용 전»이라고 말한다(지금은 전부 true).
 * ⚠ 위험 점수(risk)는 GST.RISK_W 를 «갈아 끼워» 건다 — 고장분석 TOP 20 · 관제 · 사이트 상세 · 내 화면이 같은 riskRank 를 부르므로
 *   어느 화면이든 같은 점수가 나온다. 그 화면들은 계산 전에 GST.params.ready() 를 기다린다(안 기다리면 첫 그림만 기본값이다).
 *   주간현황은 riskRank 를 안 쓴다 — 그래서 이 값을 바꿔도 주간현황 숫자는 그대로다.
 * ⚠ risk_pm_days 는 400 을 넘지 못한다 — 고장분석·관제가 PM 이력을 400일만 본다(그 너머 PM 은 «없음»과 같다). */
GST.PARAMS = {
  band_run_rate:    { g:'band', def:3,   min:0,   max:50,   step:0.5, u:'pt',   live:true },
  band_bm_per100:   { g:'band', def:15,  min:0,   max:100,  step:1,   u:'pct',  live:true },
  band_pm_ratio:    { g:'band', def:10,  min:0,   max:50,   step:1,   u:'pt',   live:true },
  band_repeat14:    { g:'band', def:2,   min:0,   max:100,  step:1,   u:'ea',   live:true },
  band_act_overdue: { g:'band', def:2,   min:0,   max:100,  step:1,   u:'case', live:true },
  sig_bad_x:        { g:'sig',  def:1.5, min:1,   max:10,   step:0.1, u:'x',    live:true },
  sig_bad_d:        { g:'sig',  def:5,   min:0,   max:1000, step:1,   u:'case', live:true },
  sig_warn_x:       { g:'sig',  def:1.2, min:1,   max:10,   step:0.1, u:'x',    live:true },
  sig_warn_d:       { g:'sig',  def:3,   min:0,   max:1000, step:1,   u:'case', live:true },
  sig_rep_bad:      { g:'sig',  def:3,   min:0,   max:1000, step:1,   u:'ea',   live:true },
  sig_rep_warn:     { g:'sig',  def:1,   min:0,   max:1000, step:1,   u:'ea',   live:true },
  risk_bm:          { g:'risk', def:3,   min:0,   max:100,  step:1,   u:'pts',  live:true, w:'bm' },
  risk_rep:         { g:'risk', def:4,   min:0,   max:100,  step:1,   u:'pts',  live:true, w:'rep' },
  risk_up:          { g:'risk', def:3,   min:0,   max:100,  step:1,   u:'pts',  live:true, w:'up' },
  risk_recent:      { g:'risk', def:2,   min:0,   max:100,  step:1,   u:'pts',  live:true, w:'recent' },
  risk_pm:          { g:'risk', def:4,   min:0,   max:100,  step:1,   u:'pts',  live:true, w:'pm' },
  risk_rep_days:    { g:'risk', def:14,  min:1,   max:365,  step:1,   u:'day',  live:true, w:'repDays' },
  risk_recent_days: { g:'risk', def:14,  min:1,   max:365,  step:1,   u:'day',  live:true, w:'recentDays' },
  risk_pm_days:     { g:'risk', def:180, min:1,   max:400,  step:1,   u:'day',  live:true, w:'pmDays' }
};
GST.PARAM_SECTIONS = ['band','sig','risk'];
GST.params = {
  rows: {}, why: 'not_loaded',
  load: async function(client){
    var C=client; try{ if(!C) C=await GST._dbAuthed(); }catch(e){ C=null; }
    this.rows={};
    if(!C){ this.why='no_db'; this.apply(); return this.rows; }
    try{
      var r=await C.from('ops_params').select('key,value,updated_at,updated_by').limit(500);
      if(r.error){ var m=String(r.error.message||r.error.code||''); this.why=/does not exist|relation|schema cache|42P01|PGRST20[05]/i.test(m)?'no_table':'read_fail'; console.warn('[v2] 판정 기준 읽기 실패', r.error); }
      else { var o=this.rows; (r.data||[]).forEach(function(x){ o[x.key]=x; }); this.why=''; }
    }catch(e){ this.why='read_fail'; console.warn('[v2] 판정 기준 읽기 실패', e); }
    this.apply(); return this.rows;
  },
  /* 값 — 바꾼 값이 있고 허용 범위 안이면 그것, 아니면 기본값. 범위 밖 값(옛 화면이 넣은 것 등)은 «조용히» 쓰지 않고 기본값으로 돌아가며 콘솔에 남긴다. */
  get: function(k){
    var P=GST.PARAMS[k]; if(!P) return undefined;
    var r=this.rows[k]; if(!r||r.value==null) return P.def;
    var v=Number(r.value); if(isNaN(v)||v<P.min||v>P.max){ console.warn('[v2] 판정 기준 범위 밖 — 기본값을 쓴다', k, r.value); return P.def; }
    return v;
  },
  changed: function(k){ var r=this.rows[k]; return !!(r&&r.value!=null); },
  /* live 인 값을 화면에 건다 — 주의 띠(GST.METRICS) · 위험 점수(GST.RISK_W). 관제 신호는 관제가 get() 으로 읽는다. */
  apply: function(){
    var self=this, W={}; Object.keys(GST.PARAMS).forEach(function(k){ var P=GST.PARAMS[k]; if(P.w&&P.live) W[P.w]=self.get(k); });
    GST.RISK_W = Object.assign({}, GST.RISK_W, W);
    var g=this.get.bind(this);
    GST.METRICS.run_rate.band    = {abs:g('band_run_rate')};
    GST.METRICS.bm_per100.band   = {rel:g('band_bm_per100')/100};
    GST.METRICS.pm_ratio.band    = {abs:g('band_pm_ratio')};
    GST.METRICS.repeat14.band    = {abs:g('band_repeat14')};
    GST.METRICS.act_overdue.band = {abs:g('band_act_overdue')};
  },
  /* 한 번만 읽는다 — 로그인 직후(GST._authOk) 시작되고, 계산하는 화면이 기다린다. 다시 읽으려면 load() */
  _p: null,
  ready: function(){ return this._p || (this._p = this.load().catch(function(){})); },
  /* 위험 점수 가중치(표의 값 · 없으면 기본값) */
  riskW: function(){ var o={}, self=this; Object.keys(GST.PARAMS).forEach(function(k){ var P=GST.PARAMS[k]; if(P.w) o[P.w]=self.get(k); }); return o; },
  save: async function(k, v, client){
    var C=client||await GST._dbAuthed(); if(!C) return {error:'no_db'};
    var r0=this.rows[k];
    var r=await C.rpc('param_save',{p_key:k, p_value:v==null||v===''?null:v, p_at:r0?r0.updated_at:null});
    if(r.error) return {error:String(r.error.message||r.error.code||'rpc')};
    return r.data||{error:'empty'};
  }
};
/* 기본 RISK_W 를 기억해 둔다 — PARAMS 의 기본값이 이것과 다르면 «표가 비었는데 숫자가 움직이는» 사고다(t-v2 가 대조한다) */
GST._RISK_W0 = Object.assign({}, GST.RISK_W);
GST.params.apply();

/* ---------- 숫자 표기 ---------- */
GST.v2fmt = function(metric, v){
  if(v==null||isNaN(v)) return '—';
  var M=GST.METRICS[metric]||{dec:0}, d=M.dec||0;
  return Number(v).toLocaleString('en-US',{minimumFractionDigits:d, maximumFractionDigits:d});
};
GST.v2unit = function(metric, lang){
  var u=(GST.METRICS[metric]||{}).unit; return u==='pct'?GST.v2t('u_pct',null,lang):u==='ea'?GST.v2t('u_ea',null,lang):u==='case'?GST.v2t('u_case',null,lang):'';
};
/* 목표 대비 차이 — 퍼센트 지표는 «p»(퍼센트포인트) · 나머지는 같은 단위 */
GST.v2gap = function(metric, v, t, lang){
  if(v==null||!t) return '';
  var M=GST.METRICS[metric]||{}, d=Math.abs(v-t.target), s=GST.v2fmt(metric,d)+(M.unit==='pct'?GST.v2t('u_pt',null,lang):GST.v2unit(metric,lang));
  var dir=t.dir||M.dir;
  if(dir==='le') return v<=t.target?GST.v2t('tgt_ok',null,lang):GST.v2t('tgt_over',{g:s},lang);
  return v>=t.target?GST.v2t('tgt_ok',null,lang):GST.v2t('tgt_miss',{g:s},lang);
};

/* ---------- 카드의 «문장» — 화면 카드(GST.kpiCard)와 챗봇 브리핑(brief_snap)이 같은 글을 쓴다 ----------
 * 두 벌로 만들면 같은 숫자를 카톡과 화면이 다른 말로 적는 날이 온다(제2원칙). lang 을 주면 그 언어로(브리핑은 ko). */
GST.kpiText = function(o, lang){
  var mt=o.metric, M=GST.METRICS[mt]||{}, v=o.m?o.m.v:null, t=o.t||null, L=lang;
  var st=GST.targets.judge(mt, v, t)||'none', unit=GST.v2unit(mt,L);
  var tline=t ? GST.v2t('tgt',{v:GST.v2fmt(mt,t.target)+unit+' '+GST.v2t(t.dir==='ge'?'tgt_ge':'tgt_le',null,L)},L)+' · '+GST.v2gap(mt,v,t,L) : GST.v2t('tgt_none',null,L);
  var dv='', dcls='', dvs=GST.v2t('vs_none',null,L);
  if(o.m && o.m.prev!=null && v!=null){
    var d=v-o.m.prev, up=d>0, good=(M.dir==='ge')?up:!up;
    dcls=Math.abs(d)<1e-9?'':(good?'good':'bad');
    dv=(d>0?'▲ ':d<0?'▼ ':'')+(d>=0?'+':'−')+GST.v2fmt(mt,Math.abs(d))+(M.unit==='pct'?GST.v2t('u_pt',null,L):'');
    dvs=GST.v2t('vs',null,L);
  }
  var den='';
  if(o.m && o.m.den!=null){
    if(mt==='run_rate'||mt==='bm_per100') den=GST.v2t('den_units',{v:Number(o.m.den).toLocaleString('en-US')},L);
    else if(mt==='pm_ratio') den=GST.v2t('den_ev',{v:Number(o.m.den).toLocaleString('en-US')},L);
  }
  return { metric:mt, st:st, name:GST.v2t('m_'+mt,null,L), desc:GST.v2t('d_'+mt,null,L), stName:GST.v2t('st_'+st,null,L),
    val:GST.v2fmt(mt,v), unit:v==null?'':unit, tline:tline, hasT:!!t, dv:dv, dcls:dcls, dvs:dvs, den:den };
};

/* ---------- 표준 KPI 카드 ----------
 * 네 줄의 «자리»가 언제나 같다: ① 이름 ② 값 ③ 목표(없으면 «목표 미설정») ④ 직전 대비 · 분모.
 * 카드마다 줄이 있다 없다 하면 사람 눈이 매번 «이 카드는 어디에 뭐가 있나»를 다시 찾는다(PLAN 「KPI 카드 규격」).
 * o = {metric, m:{v,prev,num,den}, t:목표행|null, key, spark:[...], win} → HTML 문자열(button) */
GST.kpiCard = function(o){
  var esc=GST._esc, mt=o.metric, M=GST.METRICS[mt]||{}, v=o.m?o.m.v:null, t=o.t||null, X=GST.kpiText(o), st=X.st;
  var dl=X.dv?'<span class="'+X.dcls+'">'+esc(X.dv)+'</span> '+esc(X.dvs):esc(X.dvs);
  /* 막대 — 목표가 있으면 그 자리에 눈금. 퍼센트는 0~100, 나머지는 max(값, 목표)×1.25 를 끝으로.
     목표가 없는 «개수» 지표(재고장 대수·처리함 건수)는 막대를 채우지 않는다 — 끝값이 없으면 길이에 뜻이 없다.
     자리는 남긴다(빈 홈) — 카드마다 줄이 있다 없다 하면 네 줄의 자리가 흔들린다. */
  var bar='<span class="ds-kpi-bar" aria-hidden="true"></span>';
  if(v!=null && (t || M.unit==='pct' || M.unit==='rate')){
    var max=M.unit==='pct'?100:Math.max(1e-9, v, t?t.target:0)*1.25, pv=Math.max(0,Math.min(100,v/max*100));
    bar='<span class="ds-kpi-bar" aria-hidden="true"><i class="'+st+'" style="width:'+pv.toFixed(1)+'%"></i>'
      +(t?'<b style="left:'+Math.max(0,Math.min(100,t.target/max*100)).toFixed(1)+'%"></b>':'')+'</span>';
  }
  var sp='';
  if(o.spark&&o.spark.length>1){ var a=o.spark, mx=Math.max.apply(null,a.concat([1])), mn=Math.min.apply(null,a);
    sp='<svg class="ds-spark" viewBox="0 0 80 24" aria-hidden="true"><polyline points="'+a.map(function(x,i){ return (i*80/(a.length-1)).toFixed(1)+','+(22-(x-mn)/((mx-mn)||1)*20).toFixed(1); }).join(' ')
      +'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>'; }
  return '<button type="button" class="ds-kpi st-'+st+'" data-k="'+esc(o.key||mt)+'" title="'+esc(X.desc)+'">'
    +'<span class="ds-kpi-l"><i class="ds-dot '+st+'" aria-hidden="true"></i>'+esc(X.name)
      +(o.win?'<em>'+esc(o.win)+'</em>':'')+'<span class="ds-sr">'+esc(X.stName)+'</span></span>'
    +'<span class="ds-kpi-v"><b>'+esc(X.val)+'</b><small>'+esc(X.unit)+'</small>'+sp+'</span>'
    +bar
    +'<span class="ds-kpi-t '+(t?st:'none')+'">'+esc(X.tline)+'</span>'
    +'<span class="ds-kpi-d">'+dl+(X.den?' · '+esc(X.den):'')+'</span>'
    +'</button>';
};

/* ---------- 사람별 첫 화면 설정 (setup-27 4절) ----------
 * 서버(allowed_users.home_view/home_op/lang) → 없으면 이 PC(localStorage). 둘 다 없으면 등급으로 고른다.
 * ⚠ 서버에 열이 없으면(setup-27 전) PC 에 담고 그렇다고 말한다(where='pc'). 조용히 «저장됐다»고 하지 않는다. */
GST.prefs = {
  KEY:'gst_home_pref', v:null, where:'',
  defView: function(){ var r=GST._me&&GST._me.role; return (r==='admin'||r==='legacy'||r==='editor'||r==='kr')?'lead':'exec'; },
  load: async function(client){
    var pc=null; try{ pc=JSON.parse(localStorage.getItem(this.KEY)||'null'); }catch(e){}
    var C=client; try{ if(!C) C=await GST._dbAuthed(); }catch(e){ C=null; }
    var em=GST._me&&GST._me.email;
    if(C&&em){
      try{ var r=await C.from('allowed_users').select('home_view,home_op,lang').eq('email',em).limit(1);
        if(!r.error&&r.data&&r.data[0]){ var d=r.data[0]; if(d.home_view||d.home_op||d.lang){ this.v={view:d.home_view||null, op:d.home_op||'', lang:d.lang||null}; this.where='server'; return this.v; } }
      }catch(e){}
    }
    this.v=pc?{view:pc.view||null, op:pc.op||'', lang:pc.lang||null}:null; this.where=pc?'pc':''; return this.v;
  },
  save: async function(p, client){
    var v={view:p.view||null, op:p.op||'', lang:p.lang||null}; this.v=v;
    try{ localStorage.setItem(this.KEY, JSON.stringify(v)); }catch(e){}
    var C=client; try{ if(!C) C=await GST._dbAuthed(); }catch(e){ C=null; }
    if(!C){ this.where='pc'; return {ok:true, where:'pc'}; }
    try{ var r=await C.rpc('pref_save',{p_view:v.view,p_op:v.op||null,p_lang:v.lang});
      if(r.error||!r.data||!r.data.ok){ this.where='pc'; return {ok:true, where:'pc', why:String((r.error&&(r.error.message||r.error.code))||(r.data&&r.data.error)||'')}; }
      this.where='server'; return {ok:true, where:'server'};
    }catch(e){ this.where='pc'; return {ok:true, where:'pc', why:String(e&&e.message||e)}; }
  }
};
})();

global.GST = GST;
})(window);
