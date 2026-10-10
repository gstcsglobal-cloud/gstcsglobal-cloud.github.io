/* t-brief — 카카오 챗봇 「브리핑」(supabase/functions/kakao-bot/brief.js) · 지어낸 자료만.
   지키는 것:
   ① 정확히 그 말일 때만 잡는다 — 「이번주」 단독은 BM 메뉴의 기간 단추라 안 잡는다
   ② 스냅샷의 숫자·문장을 그대로 옮긴다(판정하지 않는다) · 언제 계산한 것인지 언제나 적는다 · 오래되면 오래됐다고
   ③ 카톡 한도 안 — 길면 «확인 사항»을 뒤에서 줄이고 머리(기준일·나이)와 숫자는 남긴다
   ④ 범위 — 그 사람의 기본 운영단위 → 없으면 전사(그렇다고 말한다) · 표가 없으면 «준비 전»
   ⑤ index.ts 에 «메뉴보다 먼저» 걸려 있고 TypeScript 구문이 멀쩡하다
     실행: node t-brief.mjs */
import fs from 'fs';
import path from 'path';
import module from 'module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BRIEF = path.join(ROOT, 'supabase/functions/kakao-bot/brief.js');
const IDX = path.join(ROOT, 'supabase/functions/kakao-bot/index.ts');
const { BRIEF_RE, briefText, briefReply, BRIEF_MAX, BRIEF_STALE_DAYS } = await import(BRIEF);
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

console.log('[1] 어떤 말에 답하나');
const yes = ['브리핑', '이번 주 브리핑', '이번주 브리핑', '주간 브리핑', '주간브리핑', '확인 사항', '이번 주 확인 사항', '결정할 것', '  브리핑  '];
const no = ['이번주', '지난주', 'BM', '브리핑 해줘', '오늘 브리핑 몇시', '메뉴', '이번 주'];
is(yes.every(s => BRIEF_RE.test(s)), '「브리핑」·「이번 주 브리핑」·「주간 브리핑」·「확인 사항」(옛 「결정할 것」)을 잡는다');
is(no.every(s => !BRIEF_RE.test(s)), '「이번주」(BM 메뉴 단추)·문장 속 「브리핑」은 안 잡는다 — 자유 질문은 그대로 AI 로');

console.log('[2] 스냅샷을 글로');
const NOW = new Date('2026-10-10T09:00:00Z');
const P = { v:1, scope:'all', name:'전사', as_of:'2026-10-09', w4:'W38~W41', kr_fall:true, tgt_n:3,
  kpis:[ { k:'run_rate', name:'가동률', win:'', val:'96.0', unit:'%', st:'ok', tgt:'목표 93.0% 이상 · 달성', dv:'', dvs:'' },
         { k:'bm_per100', name:'설비 100대당 고장', win:'최근 4주', val:'46.00', unit:'', st:'bad', tgt:'목표 30.00 이하 · 초과 16.00', dv:'▲ +30.00', dvs:'직전 4주 대비' },
         { k:'pm_ratio', name:'PM 비율', win:'최근 4주', val:'18', unit:'%', st:'none', tgt:'목표 미설정', dv:'▲ +18p', dvs:'직전 4주 대비' } ],
  dec:[ { sev:'bad', tag:'목표', title:'GST TAIWAN — 설비 100대당 고장 50.00 · 초과 20.00' }, { sev:'warn', tag:'재고장', title:'EQ-0000 · GST CHINA(WUHAN) — 14일 이내 재고장 1회' } ] };
const row = { scope:'all', as_of:'2026-10-09', payload:P, made_at:'2026-10-10T06:00:00Z' };
const tx = briefText(row, NOW);
is(/^이번 주 브리핑 — 전사/.test(tx), '머리 — 범위 이름');
is(/^2026-10-09 기준 · 3시간 전 집계$/m.test(tx), '기준일 · «언제 집계했나»(3시간 전) — 설명 없이 짧게');
is(/\[점검 권장\] 설비 100대당 고장\(최근 4주\) 46\.00 — 목표 30\.00 이하 · 초과 16\.00 · ▲ \+30\.00 직전 4주 대비/.test(tx), '카드 문장을 그대로 — 판정 이름·값·목표·직전 대비');
is(/· PM 비율\(최근 4주\) 18% — 목표 미설정/.test(tx) && !/\[\] PM/.test(tx), '판정 없는 지표는 [ ] 없이');
is(/이번 주 확인 사항\n1\. \[목표\] GST TAIWAN/.test(tx) && /2\. \[재고장\] EQ-0000/.test(tx), '확인 사항 — 번호와 꼬리표');
is(/⚠ 국내 알람 원장이 비어 있어/.test(tx), '국내 원장이 비면 그 사실을 맨 앞쪽에(숫자의 뜻이 바뀐다 · v92)');
is(!/설정된 목표가 없습니다/.test(tx), '목표가 있으면 «목표 없음» 안내는 없다');
is(/설정된 목표가 없습니다/.test(briefText(Object.assign({}, row, { payload:Object.assign({}, P, { tgt_n:0 }) }), NOW)), '목표가 하나도 없으면 그렇다고 말한다');
const old = briefText(Object.assign({}, row, { made_at:'2026-09-20T00:00:00Z' }), NOW);
is(/⚠ 20일 전 집계된 브리핑입니다/.test(old) && /20일 전 집계/.test(old), BRIEF_STALE_DAYS + '일보다 오래되면 «오래됐다»고 앞에 적는다');
is(/아직 브리핑이 없습니다/.test(briefText(null, NOW)), '스냅샷이 없으면 «홈을 열면 만들어진다»');
const many = Object.assign({}, P, { dec: Array.from({ length:30 }, (_, i) => ({ sev:'warn', tag:'목표', title:'운영단위 ' + i + ' — 설비 100대당 고장이 목표를 넘었습니다 · 초과 ' + i + '.00 · 같은 길이를 맞추려는 긴 문장' })) });
const tm = briefText(Object.assign({}, row, { payload:many }), NOW);
is(tm.length <= BRIEF_MAX, '길어도 ' + BRIEF_MAX + '자 안 (' + tm.length + ')');
is(/2026-10-09 기준/.test(tm) && /46\.00/.test(tm) && /… 외 \d+건은 대시보드에서 확인하세요/.test(tm), '줄일 때 머리·숫자는 남기고 «확인 사항»을 뒤에서 줄이며 몇 건을 뺐는지 적는다');

console.log('[3] 범위 — 그 사람의 기본 운영단위');
const svcOf = (home_op, snaps, err) => ({ from(t) { const q = { _t:t, _f:{},
  select() { return q; }, eq(c, v) { q._f[c] = v; return q; },
  async maybeSingle() { return { data: t === 'allowed_users' ? { home_op } : null, error:null }; },
  async in(c, vs) { if (err) return { data:null, error:err }; return { data: snaps.filter(s => vs.includes(s.scope)), error:null }; } }; return q; } });
const tw = { scope:'o:GST TAIWAN SCRUBBER', as_of:'2026-10-09', made_at:'2026-10-10T08:00:00Z', payload:Object.assign({}, P, { name:'GST TAIWAN', scope:'o:GST TAIWAN SCRUBBER' }) };
let a = await briefReply(svcOf('GST TAIWAN SCRUBBER', [row, tw]), 'kim@x', NOW);
is(/브리핑 — GST TAIWAN/.test(a) && !/전사 브리핑을 보냅니다/.test(a), '기본 운영단위가 있으면 그 운영단위 브리핑');
a = await briefReply(svcOf('GST CHINA(WUHAN) SCRUBBER', [row, tw]), 'kim@x', NOW);
is(/^\(내 운영단위 브리핑이 아직 없어 전사 기준으로 보내 드립니다\)\n이번 주 브리핑 — 전사/.test(a), '그 운영단위 것이 없으면 전사로 — 그렇다고 맨 앞에 말한다');
a = await briefReply(svcOf(null, [row, tw]), 'kim@x', NOW);
is(/브리핑 — 전사/.test(a) && !/내 운영단위/.test(a), '기본 운영단위가 없으면 전사');
a = await briefReply(svcOf('r:국내', [Object.assign({}, row, { scope:'r:국내', payload:Object.assign({}, P, { name:'국내 전체' }) })]), 'kim@x', NOW);
is(/브리핑 — 국내 전체/.test(a), '구분 범위(r:국내)도 그대로');
a = await briefReply(svcOf(null, [], { message:'relation "public.brief_snap" does not exist', code:'42P01' }), 'kim@x', NOW);
is(/기능이 아직 준비되지 않았습니다/.test(a), '표가 없으면(setup-27 전) «준비 전 · 관리자에게»');
a = await briefReply(svcOf(null, [], { message:'timeout' }), 'kim@x', NOW);
is(/불러오지 못했습니다/.test(a), '그 밖의 실패는 «다시 보내 주세요»');

console.log('[4] 판정을 하지 않는다 · index.ts 배선');
const B = fs.readFileSync(BRIEF, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
is(!/riskRank|judge|stage|Operation|TBM|sheet_wk|sheet_alarm|target\s*[<>]=?/.test(B), 'brief.js 는 판정·원장을 안 본다 — 스냅샷만 읽는다');
const I = fs.readFileSync(IDX, 'utf8');
is(/import \{ BRIEF_RE, briefReply \} from "\.\/brief\.js";/.test(I), 'index.ts 가 brief.js 를 부른다');
const iB = I.indexOf('BRIEF_RE.test(utterance)'), iM = I.indexOf('const menuResult = await handleMenu(');
is(iB > 0 && iM > iB, '「브리핑」은 메뉴 처리보다 먼저 — 메뉴 상태에서도 답한다');
is(/briefReply\(svc, link\.email, now\)/.test(I), '인증된 사람의 이메일로 범위를 고른다');
let tsOk = true, tsErr = '';
try { const js = module.stripTypeScriptTypes(I); const f = path.join(ROOT, 'tests', '.t-brief-idx.mjs'); fs.writeFileSync(f, js);
  const { spawnSync } = await import('child_process'); const r = spawnSync(process.execPath, ['--check', f], { encoding:'utf8' }); fs.unlinkSync(f);
  tsOk = r.status === 0; tsErr = (r.stderr || '').split('\n').find(l => /Error/.test(l)) || ''; }
catch (e) { tsOk = false; tsErr = String(e && e.message || e).split('\n')[0]; }
is(tsOk, 'index.ts 구문이 멀쩡하다(타입을 걷어 낸 뒤 node --check)' + (tsOk ? '' : ' → ' + tsErr));

/* 판정 이름 — 화면 카드(core V2_T ko)와 같은 낱말인가. 갈리면 같은 숫자를 대시보드와 챗봇이 다른 말로 부른다(v175 에 실제로 갈렸다) */
const CORE = fs.readFileSync(path.join(ROOT, 'assets/core.js'), 'utf8');
const cm = CORE.match(/st_ok:'([^']+)', st_warn:'([^']+)', st_bad:'([^']+)'/);
const bm = B.match(/const ST = \{ bad: '([^']+)', warn: '([^']+)', ok: '([^']+)' \}/);
is(!!(cm && bm && cm[1] === bm[3] && cm[2] === bm[2] && cm[3] === bm[1]), '판정 이름이 화면 카드와 같다(' + (bm ? bm.slice(1).join('·') : '?') + ' ↔ ' + (cm ? cm.slice(1).join('·') : '?') + ')');

console.log((fail ? '❌' : '✅') + ` t-brief ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
