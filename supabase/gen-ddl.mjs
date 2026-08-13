/* setup-4-tables.sql 재생성기 — `node supabase/gen-ddl.mjs` (저장소 루트에서)
 *
 * 왜 손으로 안 쓰는가. 표 세 개에 컬럼이 102개다. 손으로 옮기면 오타 하나가
 * 조용한 버그가 된다 — 컬럼 이름이 한 글자 다르면 적재는 성공하고 그 열만 빈다.
 * 정본은 assets/core.js의 `GST.SM.SPEC`이므로 거기서 기계적으로 뽑는다.
 *
 * SPEC에 열이 늘면 이걸 다시 돌리고, 나온 SQL을 Supabase SQL Editor에 붙여 Run한다.
 * (`create table if not exists`라 기존 표는 안 건드린다 — 열 추가는 별도
 *  `alter table ... add column if not exists`가 필요하다. 아래 ALTER 절이 그걸 같이 뽑는다.)
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* core.js는 브라우저 전용이라 Node에서 그냥 import할 수 없다. DOM을 흉내내 통째로
   실행시키고 GST만 꺼낸다. 렌더 코드가 중간에 죽어도 SPEC은 이미 붙어 있으므로 무해하다. */
global.window = {};
global.document = { createElement: () => ({ style: {} }), getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  body: {}, documentElement: {}, head: {}, readyState: 'complete' };
global.window.addEventListener = () => {};
global.window.location = { href: '', search: '' };
global.window.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window.matchMedia = () => ({ matches: false, addEventListener() {} });
global.window.self = global.window.top = global.window;
global.localStorage = global.window.localStorage;
global.location = global.window.location;
try { new Function(fs.readFileSync(ROOT + '/assets/core.js', 'utf8'))(); } catch (e) {}
const G = global.window.GST || global.GST;
if (!G || !G.SM) { console.error('core.js에서 GST.SM을 못 찾았다.'); process.exit(1); }

/* 논리키(camelCase) → snake_case.
   시트 헤더를 그대로 쓰지 않는 이유: 한국어·줄바꿈(`Scrubber⏎S/N`)·괄호(`총 이동시간(분)`)·
   슬래시(`유/무상`)가 섞여 SQL 식별자로 못 쓴다. 논리키는 이미 대시보드 전체가 쓰는 이름이다. */
const snake = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/* 예약어를 컬럼명으로 쓰면 따옴표가 필요해지고, 따옴표를 쓰면 PostgREST에서 대소문자가
   고정돼 다루기 번거로워진다. 걸리면 조용히 넘어가지 말고 멈춘다. */
const RESERVED = new Set(('all,analyse,analyze,and,any,array,as,asc,asymmetric,both,case,cast,check,collate,column,' +
  'constraint,create,current_catalog,current_date,current_role,current_time,current_timestamp,current_user,default,' +
  'deferrable,desc,distinct,do,else,end,except,false,fetch,for,foreign,from,grant,group,having,in,initially,intersect,' +
  'into,lateral,leading,limit,localtime,localtimestamp,not,null,offset,on,only,or,order,placing,primary,references,' +
  'returning,select,session_user,some,symmetric,table,then,to,trailing,true,union,unique,user,using,variadic,when,' +
  'where,window,with').split(','));

/* 인덱스는 인색하게 준다 — 하나하나가 upsert 비용이다.
   고른 기준: 화면이 거르는 축(기간·조직·공정·모델)과 조인 키(rs_code·sn·code). */
const T = {
  wk:   { label: '수선실적', idx: ['d_start', 'eq_no', 'rs_code', 'line', 'customer', 'proc', 'subproc', 'stage', 'model'] },
  mat:  { label: '자재실적', idx: ['work_date', 'eq', 'rs_code', 'line', 'customer', 'proc', 'detail', 'mat_name', 'model'] },
  inst: { label: '설치현황', idx: ['sn', 'code', 'fab', 'customer', 'model'] },
};

// SQL 문자열 리터럴. 시트 헤더에 홑따옴표가 들어올 수 있다.
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const arr = a => 'array[' + a.map(q).join(',') + ']';

const W = 26;
let tables = '', alters = '';
/* ALTER는 표를 새로 만든 직후엔 전부 "already exists"라 NOTICE가 100줄 쏟아진다.
   진짜 경고가 그 속에 묻히므로 이 구간만 조용히 시킨다. */
let alterHead = '\n/* ---------- 열 추가용 (이미 만든 표에 SPEC이 늘었을 때) ---------- */\n' +
  'set local client_min_messages = warning;\n';
let seed = '\n/* ---------- 컬럼 매핑 시드 (GST.SM.SPEC에서 자동 생성 · 손으로 고치지 말 것) ---------- */\n' +
  '-- 통째로 갈아끼운다. SPEC에서 열이 빠졌으면 여기서도 사라져야 하기 때문이다.\n' +
  `delete from public.sheet_colmap where tbl in (${Object.keys(T).map(q).join(',')});\n` +
  `delete from public.sheet_spec   where tbl in (${Object.keys(T).map(q).join(',')});\n`;

for (const k of Object.keys(T)) {
  const S = G.SM.SPEC[k];
  if (!S) throw new Error(`GST.SM.SPEC.${k}가 없다`);
  const cols = Object.entries(S.fields).map(([f, h]) => [snake(f), Array.isArray(h) ? h[0] : h]);

  const names = cols.map(c => c[0]);
  const dup = names.filter((c, i) => names.indexOf(c) !== i);
  if (dup.length) throw new Error(`${k}: snake_case 충돌 ${dup.join(',')}`);
  const res = names.filter(c => RESERVED.has(c));
  if (res.length) throw new Error(`${k}: 예약어 ${res.join(',')} — 논리키 이름을 바꿔라`);

  tables += `\n/* ---------- ${k} — ${T[k].label} (gid ${S.gid} · ${cols.length}열) ---------- */\n`;
  tables += `create table if not exists public.sheet_${k} (\n`;
  tables += `  src_row    int primary key,      -- 시트 데이터 행번호(0부터). 파일 상단 주석 참조\n`;
  cols.forEach(([c, h]) => {
    tables += `  ${c.padEnd(W)} text,${h ? '   -- ' + String(h).replace(/\n/g, '⏎') : ''}\n`;
  });
  tables += `  synced_at  timestamptz not null default now()\n);\n`;
  tables += `comment on table public.sheet_${k} is '구글시트 «${T[k].label}» 미러 (gid ${S.gid}). 원장은 아직 시트다.';\n`;
  T[k].idx.forEach(c => {
    if (!names.includes(c)) throw new Error(`${k}: 인덱스 대상 ${c}가 SPEC에 없다`);
    tables += `create index if not exists sheet_${k}_${c}_idx on public.sheet_${k} (${c});\n`;
  });

  alters += `alter table public.sheet_${k}\n` +
    cols.map(([c]) => `  add column if not exists ${c} text`).join(',\n') + ';\n';

  /* 스펙을 표로. 엣지펑션은 이걸 읽어 헤더를 해석한다 — 스펙을 다시 적지 않는다. */
  const opt = new Set(S.opt || []);
  /* 힌트는 [[별칭…], [별칭…]] 로 정규화한다 — 바깥 AND, 안쪽 OR.
     SPEC은 'A' 와 ['A','B'] 를 섞어 쓰므로 여기서 모양을 하나로 맞춘다.
     평평하게 눌러 담으면 별칭 그룹이 문자열 하나가 되어 헤더를 못 찾는다(실제로 겪었다). */
  const hints = (S.hints || []).map(h => [].concat(h).map(String));
  if (hints.some(g => !g.length)) throw new Error(`${k}: 빈 힌트 그룹`);
  seed += `\ninsert into public.sheet_spec(tbl, gid, hints, scan) values\n` +
    `  (${q(k)}, ${q(S.gid)}, ${q(JSON.stringify(hints))}::jsonb, ${S.scan || 6});\n`;
  seed += `insert into public.sheet_colmap(tbl, col, headers, optional, ord) values\n` +
    Object.keys(S.fields).map((f, i) =>
      `  (${q(k)}, ${q(snake(f))}, ${arr([].concat(S.fields[f]))}, ${opt.has(f)}, ${i})`
    ).join(',\n') + ';\n';
}

const HEAD = fs.readFileSync(ROOT + '/supabase/_ddl-head.sql', 'utf8');
const TAIL = fs.readFileSync(ROOT + '/supabase/_ddl-tail.sql', 'utf8');
// 시드는 TAIL 뒤 — sheet_spec·sheet_colmap 표가 만들어진 다음이라야 넣을 수 있다.
fs.writeFileSync(ROOT + '/supabase/setup-4-tables.sql',
  HEAD + tables + 'begin;\n' + alterHead + alters + 'commit;\n' + TAIL + seed);
console.log('supabase/setup-4-tables.sql 재생성 완료 — ' +
  Object.keys(T).map(k => `${k} ${Object.keys(G.SM.SPEC[k].fields).length}열`).join(' · '));
