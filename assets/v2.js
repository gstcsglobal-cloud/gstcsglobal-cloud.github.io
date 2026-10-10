/* ============================================================================
   GST v2 — 2단계 «제품화»의 공용 모듈: 목표(SLA) · 운영 지표 · 표준 KPI 카드 · 사람별 첫 화면 설정
   ----------------------------------------------------------------------------
   core.js 바로 뒤에 싣는다(<script src=".../assets/v2.js?v=1">). core 가 없으면 아무것도 안 한다.

   왜 core.js 가 아니라 따로인가 — 이 모듈을 쓰는 화면(/home/ · /targets/)이 아직 셸에 걸리지 않은 «밑바탕»이고,
   그동안 core.js 는 다른 작업이 계속 고치고 있다. 섞으면 서로의 변경이 부딪친다. 셸에 거는 날 core 로 옮길지 정한다
   (옮겨도 이름은 그대로 — 부르는 쪽은 한 줄도 안 바뀐다). docs/v2/PLAN.md 「통합 순서」.

   ⚠ 숫자를 새로 «정의»하지 않는다. 판정은 전부 core 정본을 부른다:
     설비 대수 GST.EQ(GST.ops.isIn/isRun) · 고장 GST.ops.bm(주간현황과 같은 규칙 · 국내 원장/KR_ON) · PM GST.ops.pm(GST.PM.is) ·
     재고장 GST.ops.risk(GST.riskRank) · 워런티 GST.WARR. 이 모듈이 하는 일은 «같은 행을 정해진 창으로 묶어 비율로 나누는 것»뿐이다.
   ⚠ 창(window)은 통합 관제와 같다 — 일요일 시작 주 12개, «최근 4주» = 마지막 네 주(이번 주 포함), «직전 4주» = 그 앞 네 주.
     관제의 「PM 실시율」 게이지(pmN ÷ (pmN + 4주 고장))와 pm_ratio 는 같은 식이다 — 둘이 다른 숫자를 내면 사고다.
   ============================================================================ */
(function(){
'use strict';
if(typeof window==='undefined' || !window.GST) return;
var GST=window.GST;
GST.V2_VER = 1;
var DAY = 864e5;

/* ---------- 공용 문구 (네 언어 · core 의 GST.XXX_T 관례) ---------- */
GST.V2_T = {
  ko:{ m_run_rate:'가동률', m_bm_per100:'설비 100대당 고장', m_pm_ratio:'PM 비율', m_repeat14:'14일 안 재고장 설비', m_act_overdue:'기한 넘은 처리함 일',
       d_run_rate:'가동(Operation) ÷ 반입 설비 · 기준일 현재', d_bm_per100:'최근 4주 고장 ÷ 반입 설비 × 100', d_pm_ratio:'최근 4주 PM ÷ (PM + 고장)',
       d_repeat14:'고장 위험 순위에서 14일 안 재고장이 있는 설비', d_act_overdue:'처리함에서 기한이 지났는데 안 닫힌 일',
       w4:'최근 4주', tgt:'목표 {v}', tgt_le:'이하', tgt_ge:'이상', tgt_none:'목표 미설정', tgt_ok:'달성', tgt_miss:'미달 {g}', tgt_over:'초과 {g}',
       vs:'직전 4주 대비', vs_none:'비교 없음(현재 상태)', den:'분모 {v}', den_units:'반입 {v}대', den_ev:'PM+고장 {v}건',
       st_ok:'정상', st_warn:'주의', st_bad:'위험', st_none:'판정 없음', u_pct:'%', u_ea:'대', u_case:'건', u_pt:'p' },
  en:{ m_run_rate:'Running rate', m_bm_per100:'Failures per 100 units', m_pm_ratio:'PM ratio', m_repeat14:'Units with 14-day repeat', m_act_overdue:'Overdue actions',
       d_run_rate:'Running (Operation) ÷ installed · as of today', d_bm_per100:'Last-4-week failures ÷ installed × 100', d_pm_ratio:'Last-4-week PM ÷ (PM + failures)',
       d_repeat14:'Units in the risk ranking with a repeat failure within 14 days', d_act_overdue:'Open actions past their due date',
       w4:'last 4 wks', tgt:'Target {v}', tgt_le:'or less', tgt_ge:'or more', tgt_none:'No target', tgt_ok:'Met', tgt_miss:'Short {g}', tgt_over:'Over {g}',
       vs:'vs prior 4 wks', vs_none:'No comparison (current state)', den:'Base {v}', den_units:'{v} installed', den_ev:'{v} PM+BM',
       st_ok:'Normal', st_warn:'Watch', st_bad:'Critical', st_none:'No rating', u_pct:'%', u_ea:'', u_case:'', u_pt:'p' },
  zh:{ m_run_rate:'运行率', m_bm_per100:'每100台故障', m_pm_ratio:'PM比率', m_repeat14:'14天内复发设备', m_act_overdue:'逾期待办',
       d_run_rate:'运行(Operation) ÷ 进场设备 · 截至基准日', d_bm_per100:'最近4周故障 ÷ 进场设备 × 100', d_pm_ratio:'最近4周 PM ÷ (PM + 故障)',
       d_repeat14:'故障风险排名中14天内复发的设备', d_act_overdue:'待办中已过期限但未关闭的事项',
       w4:'最近4周', tgt:'目标 {v}', tgt_le:'以下', tgt_ge:'以上', tgt_none:'未设定目标', tgt_ok:'达成', tgt_miss:'未达 {g}', tgt_over:'超出 {g}',
       vs:'较前4周', vs_none:'无比较(当前状态)', den:'分母 {v}', den_units:'进场 {v}台', den_ev:'PM+故障 {v}件',
       st_ok:'正常', st_warn:'注意', st_bad:'危险', st_none:'无判定', u_pct:'%', u_ea:'台', u_case:'件', u_pt:'p' },
  ja:{ m_run_rate:'稼働率', m_bm_per100:'設備100台あたり故障', m_pm_ratio:'PM比率', m_repeat14:'14日以内再故障設備', m_act_overdue:'期限超過の対応',
       d_run_rate:'稼働(Operation) ÷ 搬入設備 · 基準日時点', d_bm_per100:'直近4週の故障 ÷ 搬入設備 × 100', d_pm_ratio:'直近4週の PM ÷ (PM + 故障)',
       d_repeat14:'故障リスク順位で14日以内に再故障がある設備', d_act_overdue:'対応のうち期限を過ぎて閉じていないもの',
       w4:'直近4週', tgt:'目標 {v}', tgt_le:'以下', tgt_ge:'以上', tgt_none:'目標未設定', tgt_ok:'達成', tgt_miss:'未達 {g}', tgt_over:'超過 {g}',
       vs:'前4週比', vs_none:'比較なし(現在の状態)', den:'分母 {v}', den_units:'搬入 {v}台', den_ev:'PM+故障 {v}件',
       st_ok:'正常', st_warn:'注意', st_bad:'危険', st_none:'判定なし', u_pct:'%', u_ea:'台', u_case:'件', u_pt:'p' }
};
GST.v2t = function(k, o, lang){
  var L=lang||(GST._lang&&GST._lang())||'ko', T=GST.V2_T[L]||GST.V2_T.ko, s=T[k]!=null?T[k]:(GST.V2_T.ko[k]!=null?GST.V2_T.ko[k]:k);
  return o ? String(s).replace(/\{(\w+)\}/g, function(m,x){ return o[x]!=null?o[x]:m; }) : s;
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
 * 표: ops_targets (setup-26). 화면은 «가장 좁은 목표»를 고른다 — 운영단위 > 구분 > 전사.
 * ⚠ 목표를 못 읽어도 화면은 선다(그때 카드는 «목표 미설정»). 왜 못 읽었는지는 GST.targets.why 에 남긴다:
 *   'no_db'(인증 꺼짐·오프라인) · 'no_table'(setup-26 전) · 'read_fail' · ''(정상). */
GST.targets = {
  rows: [], why: 'not_loaded', at: null,
  load: async function(client){
    var C=client; try{ if(!C) C=await GST.db(); }catch(e){ C=null; }
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
    var C=client||await GST.db(); if(!C) return {error:'no_db'};
    var r=await C.rpc('target_save',{p_metric:o.metric,p_scope_kind:o.scope_kind,p_scope:o.scope||'',p_target:o.target,
      p_warn:o.warn==null||o.warn===''?null:o.warn,p_dir:o.dir,p_note:o.note||null,p_at:o.at||null});
    if(r.error) return {error:String(r.error.message||r.error.code||'rpc')};
    return r.data||{error:'empty'};
  },
  remove: async function(id, at, client){
    var C=client||await GST.db(); if(!C) return {error:'no_db'};
    var r=await C.rpc('target_remove',{p_id:id,p_at:at}); if(r.error) return {error:String(r.error.message||r.error.code||'rpc')};
    return r.data||{error:'empty'};
  }
};

/* ---------- 숫자 표기 ---------- */
GST.v2fmt = function(metric, v){
  if(v==null||isNaN(v)) return '—';
  var M=GST.METRICS[metric]||{dec:0}, d=M.dec||0;
  return Number(v).toLocaleString('en-US',{minimumFractionDigits:d, maximumFractionDigits:d});
};
GST.v2unit = function(metric){
  var u=(GST.METRICS[metric]||{}).unit; return u==='pct'?GST.v2t('u_pct'):u==='ea'?GST.v2t('u_ea'):u==='case'?GST.v2t('u_case'):'';
};
/* 목표 대비 차이 — 퍼센트 지표는 «p»(퍼센트포인트) · 나머지는 같은 단위 */
GST.v2gap = function(metric, v, t){
  if(v==null||!t) return '';
  var M=GST.METRICS[metric]||{}, d=Math.abs(v-t.target), s=GST.v2fmt(metric,d)+(M.unit==='pct'?GST.v2t('u_pt'):GST.v2unit(metric));
  var dir=t.dir||M.dir;
  if(dir==='le') return v<=t.target?GST.v2t('tgt_ok'):GST.v2t('tgt_over',{g:s});
  return v>=t.target?GST.v2t('tgt_ok'):GST.v2t('tgt_miss',{g:s});
};

/* ---------- 표준 KPI 카드 ----------
 * 네 줄의 «자리»가 언제나 같다: ① 이름 ② 값 ③ 목표(없으면 «목표 미설정») ④ 직전 대비 · 분모.
 * 카드마다 줄이 있다 없다 하면 사람 눈이 매번 «이 카드는 어디에 뭐가 있나»를 다시 찾는다(PLAN 「KPI 카드 규격」).
 * o = {metric, m:{v,prev,num,den}, t:목표행|null, sc:{op,region}, key, spark:[...]} → HTML 문자열(button) */
GST.kpiCard = function(o){
  var esc=GST._esc, mt=o.metric, M=GST.METRICS[mt]||{}, v=o.m?o.m.v:null, t=o.t||null;
  var st=GST.targets.judge(mt, v, t)||'none';
  var unit=GST.v2unit(mt);
  var tline=t ? GST.v2t('tgt',{v:GST.v2fmt(mt,t.target)+unit+' '+GST.v2t(t.dir==='ge'?'tgt_ge':'tgt_le')})+' · '+GST.v2gap(mt,v,t) : GST.v2t('tgt_none');
  var dl='';
  if(o.m && o.m.prev!=null && v!=null){
    var d=v-o.m.prev, up=d>0, good=(M.dir==='ge')?up:!up, cls=Math.abs(d)<1e-9?'':(good?'good':'bad');
    dl='<span class="'+cls+'">'+(d>0?'▲ ':d<0?'▼ ':'')+(d>=0?'+':'−')+GST.v2fmt(mt,Math.abs(d))+(M.unit==='pct'?GST.v2t('u_pt'):'')+'</span> '+esc(GST.v2t('vs'));
  } else dl=esc(GST.v2t('vs_none'));
  var den='';
  if(o.m && o.m.den!=null){
    if(mt==='run_rate'||mt==='bm_per100') den=GST.v2t('den_units',{v:Number(o.m.den).toLocaleString('en-US')});
    else if(mt==='pm_ratio') den=GST.v2t('den_ev',{v:Number(o.m.den).toLocaleString('en-US')});
  }
  /* 막대 — 목표가 있으면 그 자리에 눈금. 퍼센트는 0~100, 나머지는 max(값, 목표)×1.25 를 끝으로 */
  /* 목표가 없는 «개수» 지표(재고장 대수·처리함 건수)는 막대를 채우지 않는다 — 끝값이 없으면 길이에 뜻이 없다.
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
  return '<button type="button" class="ds-kpi st-'+st+'" data-k="'+esc(o.key||mt)+'" title="'+esc(GST.v2t('d_'+mt))+'">'
    +'<span class="ds-kpi-l"><i class="ds-dot '+st+'" aria-hidden="true"></i>'+esc(GST.v2t('m_'+mt))
      +(o.win?'<em>'+esc(o.win)+'</em>':'')+'<span class="ds-sr">'+esc(GST.v2t('st_'+st))+'</span></span>'
    +'<span class="ds-kpi-v"><b>'+esc(GST.v2fmt(mt,v))+'</b><small>'+esc(v==null?'':unit)+'</small>'+sp+'</span>'
    +bar
    +'<span class="ds-kpi-t '+(t?st:'none')+'">'+esc(tline)+'</span>'
    +'<span class="ds-kpi-d">'+dl+(den?' · '+esc(den):'')+'</span>'
    +'</button>';
};

/* ---------- 사람별 첫 화면 설정 (setup-26 4절) ----------
 * 서버(allowed_users.home_view/home_op/lang) → 없으면 이 PC(localStorage). 둘 다 없으면 등급으로 고른다.
 * ⚠ 서버에 열이 없으면(setup-26 전) PC 에 담고 그렇다고 말한다(where='pc'). 조용히 «저장됐다»고 하지 않는다. */
GST.prefs = {
  KEY:'gst_home_pref', v:null, where:'',
  defView: function(){ var r=GST._me&&GST._me.role; return (r==='admin'||r==='legacy'||r==='editor'||r==='kr')?'lead':'exec'; },
  load: async function(client){
    var pc=null; try{ pc=JSON.parse(localStorage.getItem(this.KEY)||'null'); }catch(e){}
    var C=client; try{ if(!C) C=await GST.db(); }catch(e){ C=null; }
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
    var C=client; try{ if(!C) C=await GST.db(); }catch(e){ C=null; }
    if(!C){ this.where='pc'; return {ok:true, where:'pc'}; }
    try{ var r=await C.rpc('pref_save',{p_view:v.view,p_op:v.op||null,p_lang:v.lang});
      if(r.error||!r.data||!r.data.ok){ this.where='pc'; return {ok:true, where:'pc', why:String((r.error&&(r.error.message||r.error.code))||(r.data&&r.data.error)||'')}; }
      this.where='server'; return {ok:true, where:'server'};
    }catch(e){ this.where='pc'; return {ok:true, where:'pc', why:String(e&&e.message||e)}; }
  }
};
})();
