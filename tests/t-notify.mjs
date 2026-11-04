// 알림 발송 (v207 · 엣지펑션 notify-send — notify.js · index.ts ?op=cron · test · event)
// 지키는 것:
//   ① 보낼 차례 판정(isDue) — 한국 시각 · 매일/평일/매주/매월 · 같은 시간 두 번 안 보냄(50분) · 꺼진/빠진 수신자 안 보냄
//   ② 본문(buildMessage) — 브리핑은 스냅샷 글 그대로(briefText) · 기한 경과/열린/내가 맡은 조치 사항 · 범위(운영단위) · 대시보드 단추 · 카톡 길이
//   ③ 배선 — 정기 발송은 비밀이 «설정돼 있을 때만» · 테스트 발송은 관리자+쓰기만 · 이벤트 블록은 대기함에서 꺼내고 «보였다»고 표시
//      · 비밀(GMAIL_APP_PW · KAKAO_EVENT_KEY)을 응답·로그에 싣지 않는다 · 엣지펑션이 막는 포트(587)를 안 쓴다
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const N = await import(path.join(ROOT, 'supabase/functions/notify-send/notify.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

console.log('[1] 보낼 차례 판정 — 한국 시각');
/* 2026-11-02 (월) 08:07 KST = 2026-11-01 23:07 UTC */
const MON8 = new Date(Date.UTC(2026, 10, 1, 23, 7));
const base = { enabled: true, removed: false, hour: 8, dow: 1, dom: 2, freq: 'weekly' };
ok(N.kst(MON8).h === 8 && N.kst(MON8).dow === 1 && N.kst(MON8).dom === 2, 'UTC 23시 = 한국 08시 · 월요일 · 2일');
ok(N.isDue(base, MON8), '매주 월 08시 — 지금 보낸다');
ok(!N.isDue({ ...base, hour: 9 }, MON8), '다른 시각이면 안 보낸다');
ok(!N.isDue({ ...base, dow: 2 }, MON8), '매주 화요일이면 오늘(월)은 안 보낸다');
ok(N.isDue({ ...base, freq: 'daily', dow: 5 }, MON8), '매일 — 요일과 무관');
ok(N.isDue({ ...base, freq: 'weekdays' }, MON8), '평일 — 월요일은 보낸다');
const SUN8 = new Date(Date.UTC(2026, 10, 7, 23, 7));   // 11-08 (일) 08:07 KST
ok(!N.isDue({ ...base, freq: 'weekdays' }, SUN8), '평일 — 일요일은 안 보낸다');
ok(N.isDue({ ...base, freq: 'monthly', dom: 2 }, MON8) && !N.isDue({ ...base, freq: 'monthly', dom: 3 }, MON8), '매월 — 그 날짜만');
ok(!N.isDue({ ...base, last_sent_at: new Date(MON8.getTime() - 20 * 60e3).toISOString() }, MON8), '20분 전에 보냈으면 같은 시간에 또 안 보낸다');
ok(N.isDue({ ...base, last_sent_at: new Date(MON8.getTime() - 7 * 864e5).toISOString() }, MON8), '지난주에 보낸 것은 막지 않는다');
ok(!N.isDue({ ...base, enabled: false }, MON8) && !N.isDue({ ...base, removed: true }, MON8), '꺼진 · 빠진 수신자는 안 보낸다');

console.log('[2] 본문 — 스냅샷 글 그대로 · 조치 사항 · 범위');
const snap = { scope: 'all', as_of: '2026-11-01', made_at: new Date(MON8.getTime() - 3600e3).toISOString(),
  payload: { name: '전사', kpis: [{ name: '가동률', val: '96', unit: '%', tgt: '목표 95% 이상', st: 'ok' }], dec: [{ tag: '위험', title: '설비 TWC1 재고장' }], tgt_n: 1 } };
const items = [
  { id: 1, title: '펌프 점검', sev: 'bad', status: 'open', op: 'GST TAIWAN SCRUBBER', assignee: 'a@test.local', due: '2026-10-30' },
  { id: 2, title: '버너 교체 검토', sev: 'warn', status: 'doing', op: 'GST TAIWAN SCRUBBER', assignee: null, due: '2026-11-20' },
  { id: 3, title: '우한 자료 보완', sev: 'info', status: 'ack', op: 'GST CHINA(WUHAN) SCRUBBER', assignee: 'a@test.local', due: null },
  { id: 4, title: '닫힌 일', sev: 'info', status: 'done', op: 'GST TAIWAN SCRUBBER', assignee: 'a@test.local', due: null }];
const subA = { channel: 'email', target: 'a@test.local', scope: 'all', kinds: ['brief', 'actions', 'mine'] };
const m = N.buildMessage({ sub: subA, snap, items, now: MON8 });
ok(/이번 주 브리핑 — 전사/.test(m.text) && /가동률/.test(m.text) && /설비 TWC1 재고장/.test(m.text), '브리핑은 스냅샷의 문장 그대로(briefText)');
ok(/기한 경과 조치 사항 1건/.test(m.text) && /펌프 점검/.test(m.text), '기한이 지난 일은 «기한 경과»로');
ok(/열린 조치 사항 2건/.test(m.text), '열린 일(새로·확인·진행)만 — 닫힌 일은 빼고');
ok(/내가 맡은 조치 사항 2건/.test(m.text) && !/닫힌 일/.test(m.text), '내가 맡은 일 — 받는 사람이 담당인 열린 일');
ok(m.subject.indexOf('[GST CS]') === 0 && /2026-11-02/.test(m.subject), '제목 = [GST CS] 범위 · 한국 날짜');
ok(/#tab=action/.test(m.html) && /조치 사항 처리하기/.test(m.html), '메일에 «조치 사항 처리하기» 단추(대시보드로 바로)');
ok(!/<script/i.test(m.html) && N.buildMessage({ sub: subA, snap: { ...snap, payload: { ...snap.payload, name: '<b>x</b>' } }, items: [], now: MON8 }).html.indexOf('<b>x</b>') < 0, 'HTML 은 글자를 이스케이프한다');
const subO = { channel: 'email', target: 'b@test.local', scope: 'o:GST TAIWAN SCRUBBER', kinds: ['actions'] };
const mo = N.buildMessage({ sub: subO, snap: null, items, now: MON8 });
ok(/펌프 점검/.test(mo.text) && !/우한 자료 보완/.test(mo.text), '운영단위 범위 — 그 운영단위의 조치 사항만');
ok(!/이번 주 브리핑/.test(mo.text), '브리핑을 고르지 않았으면 브리핑을 싣지 않는다');
const mr = N.buildMessage({ sub: { ...subO, scope: 'r:국내' }, snap: null, items, now: MON8 });
ok(/구분으로 나누지 않고/.test(mr.text), '구분 범위 — 조치 사항을 구분으로 판정하지 않는다고 적는다(판정 사본 금지)');
const big = N.buildMessage({ sub: { ...subA, channel: 'kakao' }, snap, items: Array.from({ length: 60 }, (_, i) => ({ id: i, title: '긴 제목 '.repeat(8) + i, sev: 'warn', status: 'open', op: 'X', due: null })), now: MON8 });
ok(big.kakao.length <= N.KAKAO_MAX && /… 외 48건/.test(big.text), '카톡은 1,000자 안 · 목록은 12건 + «외 N건»');
ok(N.pickSnap([{ scope: 'all', x: 1 }, { scope: 'o:A', x: 2 }], 'o:A').x === 2 && N.pickSnap([{ scope: 'all', x: 1 }], 'o:B').x === 1, '범위 스냅샷이 없으면 전사 스냅샷');
ok(/아직 브리핑이 없습니다/.test(N.buildMessage({ sub: subA, snap: null, items: [], now: MON8 }).text), '스냅샷이 없으면 없다고 말한다(지어내지 않는다)');

console.log('[3] 배선 — notify-send/index.ts');
const IX = fs.readFileSync(path.join(ROOT, 'supabase/functions/notify-send/index.ts'), 'utf8');
const blk = (op) => { const i = IX.indexOf('op === "' + op + '"'); return i < 0 ? '' : IX.slice(i, i + 1500); };
ok(/import \{ isDue, buildMessage, pickSnap[^}]*\} from "\.\/notify\.js"/.test(IX), 'notify.js 를 그대로 부른다(판정·글을 index.ts 에 다시 짜지 않는다)');
ok(/if \(!want \|\| req\.headers\.get\("x-sync-secret"\) !== want\)/.test(blk('cron')), '정기 발송 — 비밀이 없으면 아예 닫는다(돈·메일이 나가는 호출)');
ok(/role !== "admin" \|\| !me\.can_write/.test(blk('test')), '테스트 발송 — 관리자 + 쓰기 권한만');
const ev = blk('event');
ok(/KAKAO_SHARED_SECRET/.test(ev) && /is\("delivered_at", null\)/.test(ev) && /update\(\{ delivered_at/.test(ev), '이벤트 블록 — 카카오 비밀 검사 · 안 보인 알림을 꺼내고 «보였다»고 표시');
ok(!/console\.log\([^)]*(GMAIL_APP_PW|KAKAO_EVENT_KEY|pass\b|key\b)/.test(IX) && !/json\(\{[^}]*(pass|key)\s*[:,}]/.test(blk('test')), '비밀을 로그·응답에 싣지 않는다');
ok(/port: 465, secure: true/.test(IX) && !/port:\s*587/.test(IX), 'Gmail SMTP 465(SSL) — 엣지펑션이 막는 587 을 안 쓴다');
ok(/bot-api\.kakao\.com\/v2\/bots\//.test(IX) && /type: "botUserKey"/.test(IX), '카톡 = 챗봇 이벤트 API · 인증된 사람의 bot_user_key 로');
ok(/kind !== "test"/.test(IX), '테스트 발송은 마지막 발송 시각을 바꾸지 않는다');
const B1 = fs.readFileSync(path.join(ROOT, 'supabase/functions/notify-send/brief.js')), B0 = fs.readFileSync(path.join(ROOT, 'supabase/functions/kakao-bot/brief.js'));
ok(Buffer.compare(B0, B1) === 0, 'notify-send/brief.js = kakao-bot/brief.js (바이트 동일 사본 — 챗봇 브리핑과 메일이 같은 글)');
ok(!/notify|kakao_outbox/.test(fs.readFileSync(path.join(ROOT, 'supabase/functions/kakao-bot/index.ts'), 'utf8')), 'kakao-bot 은 손대지 않았다(알림은 별도 함수)');

console.log('[4] 관리 화면 — /notify/');
const NP = fs.readFileSync(path.join(ROOT, 'notify/index.html'), 'utf8');
ok(/GST\._me\.role==='admin' && GST\._me\.can_write/.test(NP), '관리자 + 쓰기 권한이 아니면 화면을 잠근다(막는 것은 서버)');
ok(/notify_save/.test(NP) && /notify_remove/.test(NP) && /notify_admin/.test(NP), '쓰기·읽기는 setup-33 RPC 만');
ok(!/bot_user_key/.test(NP), '카톡 식별자(bot_user_key)를 화면에 쓰지 않는다');
const SH = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/#mNotify\{display:none\}/.test(SH) && /openNotify\(\)\{ window\.open\('\/notify\/','gstNotify'\)/.test(SH), '셸 더보기 «알림 발송» — 관리자만 · 새 창');

console.log('[5] 화면 PPT 정기 발송 (v209) — 차례 · 봇 · 발송');
/* 2026-11-03 (화) 08:30 KST = 2026-11-02 23:30 UTC */
const TUE830 = new Date(Date.UTC(2026, 10, 2, 23, 30));
const ps = { id: 7, enabled: true, removed: false, freq: 'daily', hour: 8, dow: 1, dom: 1, scope: 'all', pages: ['fault', 'report'], last_sent_at: null };
const sl = N.slotOf(ps, TUE830);
ok(sl && sl.key === '2026-11-03 08' && sl.start === '2026-11-02T23:00:00.000Z', '차례 = 한국 08시 · 시작 시각(UTC)');
ok(N.slotOf({ ...ps, last_sent_at: '2026-11-02T23:05:00Z' }, TUE830) === null, '그 차례에 이미 보냈으면 다시 안 만든다');
ok(N.slotOf({ ...ps, last_sent_at: '2026-11-01T23:05:00Z' }, TUE830) !== null, '어제 보낸 것은 오늘 차례를 막지 않는다');
const T14 = new Date(TUE830.getTime() + 6 * 3600e3);   // 14:30 KST — 창(6시간) 밖
ok(N.slotOf(ps, T14) === null && N.pptOverdue(ps, T14), '6시간 안에 못 보냈으면 cron 이 글이라도 보낸다(pptOverdue)');
ok(!N.pptOverdue(ps, TUE830), '창 안이면 cron 은 PPT 수신자를 건드리지 않는다(PPT 없는 메일이 먼저 가지 않게)');
ok(!N.pptOverdue(ps, new Date(TUE830.getTime() + 12 * 3600e3)), '한참 지난 차례는 다시 꺼내지 않는다');
ok(!N.pptOverdue({ ...ps, pages: [] }, T14) && !N.hasPages({ ...ps, pages: [] }), 'PPT 를 안 고른 수신자는 해당 없음');
const jb = N.reportJobs([ps, { ...ps, id: 8, pages: ['fault'] }, { ...ps, id: 9, scope: 'o:A', pages: ['fault', 'hub'] }, { ...ps, id: 10, enabled: false }], TUE830);
const jf = jb.find(j => j.page === 'fault' && j.scope === 'all');
ok(jb.length === 3 && jf && jf.subs.join() === '7,8', '(화면 · 범위)마다 한 번만 만든다 — 같은 화면을 여러 사람이 받아도 한 벌');
ok(!jb.some(j => j.page === 'hub') && !jb.some(j => j.subs.includes(10)), 'PPT 로 못 내는 화면·꺼진 수신자는 빠진다');
ok(N.reportJobs([ps], new Date(Date.UTC(2026, 10, 2, 21, 0))).length === 0, '정한 시각 전에는 일이 없다');
const rp = N.reportPath('fault', 'o:GST CHINA(WUHAN) SCRUBBER', '2026-11-03 08', 123);
ok(/^fault\/[A-Za-z0-9_]+-[0-9a-z]+\/2026110308-123\.pptx$/.test(rp), '저장 경로 — 범위의 한글·괄호·공백 없이 · 서버 정규식과 같은 글자');
ok(N.reportPath('fault', 'o:가', 's', 1) !== N.reportPath('fault', 'o:나', 's', 1), '이름이 다른 범위는 경로가 다르다(한글만 다른 범위도)');
const pf = [{ page: 'fault', ok: true, path: 'fault/all-x/2026110308-1.pptx' }, { page: 'report', ok: false, error: '이번 차례에 만들지 못했습니다' }];
const mpE = N.buildMessage({ sub: { channel: 'email', target: 'a@test.local', scope: 'all', kinds: [], pages: ['fault', 'report'] }, snap: null, items: [], now: MON8, files: pf });
ok(/화면 보고서/.test(mpE.subject) && /고장 분석/.test(mpE.html) && /첨부/.test(mpE.html) && /만들지 못했습니다/.test(mpE.text), '메일 — PPT 는 첨부 · 못 만든 화면은 못 만들었다고 적는다');
ok(!/아직 브리핑이 없습니다/.test(mpE.text), 'PPT 만 받는 사람에게 «브리핑이 없다»고 하지 않는다');
const mpK = N.buildMessage({ sub: { channel: 'kakao', target: 'a@test.local', scope: 'all', kinds: [], pages: ['fault'] }, snap: null, items: [], now: MON8, files: pf.slice(0, 1) });
ok(/files\/\?p=fault%2Fall-x%2F2026110308-1\.pptx/.test(mpK.kakao), '카톡 — 받는 링크(로그인해야 열리는 /files/)');
const okRe = /^[A-Za-z0-9_.\-/]+\.pptx$/;
ok(okRe.test(rp) && okRe.test(N.reportPath('hr', 'r:국내', 'manual', 9)), '경로가 서버 report_file_add 의 정규식을 통과한다');
const IX2 = fs.readFileSync(path.join(ROOT, 'supabase/functions/notify-send/index.ts'), 'utf8');
const RY = fs.readFileSync(path.join(ROOT, '.github/workflows/report.yml'), 'utf8');
const RR = fs.readFileSync(path.join(ROOT, 'tools/report-run.mjs'), 'utf8');
const wf = (IX2.match(/const GH_WF = GH_REPO \+ "([^"]+)"/) || [])[1];
ok(wf === '/.github/workflows/report.yml@refs/heads/main' && fs.existsSync(path.join(ROOT, '.github/workflows/report.yml')), '봇 세션은 «이 저장소 · main · report.yml» 토큰만 — 그 파일이 실제로 있다');
ok(/audience: "gst-report"/.test(IX2) && /audience=gst-report/.test(RR), 'OIDC audience 가 양쪽에서 같다');
ok(/issuer: "https:\/\/token\.actions\.githubusercontent\.com"/.test(IX2) && /payload\.repository !== GH_REPO/.test(IX2) && /payload\.ref !== "refs\/heads\/main"/.test(IX2), '봇 — GitHub 서명 · 저장소 · 브랜치를 확인한다(포크·다른 브랜치 거절)');
ok(/id-token: write/.test(RY) && /contents: read/.test(RY) && !/secrets\./.test(RY), 'report.yml — OIDC 만 · 비밀을 쓰지 않는다');
ok(/schedule:/.test(RY) && /workflow_dispatch:/.test(RY) && /report-run\.mjs --check/.test(RY), '매시 정기 + 수동 실행 · 차례가 없으면 브라우저를 깔지 않는다');
const rb = blk('report');
ok(/isBot\(svc, email\)/.test(rb) && /notifyOne\(/.test(rb), '발송(op=report)은 봇 토큰만');
ok(/hasPages\(s\) \? pptOverdue\(s, now\) : isDue\(s, now\)/.test(IX2), 'cron — PPT 수신자는 봇 몫(창이 지나야 글만)');
ok(/import \{ reportJobs, reportPath, PPT_PAGES, splitScope \} from '\.\.\/supabase\/functions\/notify-send\/notify\.js'/.test(RR), '봇이 notify.js 의 같은 함수로 차례를 고른다(판정 사본 없음)');
ok(!/console\.log\([^)]*(target|email|label|access_token|session)/.test(RR) && !/log\([^)]*(\.scope|target|email)/.test(RR), '봇 기록(공개)에 주소·범위·토큰을 찍지 않는다');
ok(RR.includes('GST\\.SB_URL\\s*=') && RR.includes('GST\\.SB_ANON\\s*=') && !/eyJhbGci/.test(RR), '주소·공개 키는 core.js 에서 읽는다(사본 없음)');
const NP2 = fs.readFileSync(path.join(ROOT, 'notify/index.html'), 'utf8'), FP = fs.readFileSync(path.join(ROOT, 'files/index.html'), 'utf8');
const pk = o => Object.keys(o).sort().join();
const pagesOf = src => { const m = src.match(/(?:PAGES|PPT_PAGES)\s*=\s*\{([^}]+)\}/); return m ? m[1].match(/(\w+)\s*:/g).map(x => x.replace(/\W/g, '')).sort().join() : ''; };
const SQ = fs.readFileSync(path.join(ROOT, 'supabase/setup-34-report.sql'), 'utf8');
const sqlPages = (SQ.match(/p_page not in \(([^)]+)\)/) || [])[1].match(/'(\w+)'/g).map(x => x.replace(/'/g, '')).sort().join();
ok(pagesOf(NP2) === pk(N.PPT_PAGES) && pagesOf(FP) === pk(N.PPT_PAGES) && sqlPages === pk(N.PPT_PAGES), '화면 목록이 notify.js · 관리 화면 · 받기 화면 · 서버 넷에서 같다');
ok(/C\.storage\.from\('reports'\)\.download\(P\)/.test(FP) && /authGate/.test(FP), '받기 화면 — 로그인 뒤 비공개 저장소에서(링크만으로는 못 받는다)');

console.log('[6] 범위 + 사이트 (v210) — 운영단위·단지로 좁혀 보내기');
const sp = N.splitScope('o:SEC Scrubber|s:P2|P1');
ok(sp.base === 'o:SEC Scrubber' && sp.sites.join() === 'P2,P1' && N.splitScope('all').base === 'all' && !N.splitScope('r:국내').sites.length, 'splitScope — 범위와 사이트를 가른다');
ok(N.joinScope('o:SEC Scrubber', ['P2', 'P1', 'P1', ' ']) === 'o:SEC Scrubber|s:P1|P2' && N.joinScope('all', ['P1']) === 'all' && N.joinScope('r:해외', []) === 'r:해외', 'joinScope — 정렬·중복 제거 · 전사에는 사이트를 붙이지 않는다');
ok(/^(all|r:.+|o:.+)$/.test(N.joinScope('o:X', ['F16'])) && /^(all|r:.+|o:.+)$/.test(N.joinScope('r:국내', ['P1'])), '사이트를 붙여도 서버 검사(notify_save · report_file_add)를 통과한다 — SQL 무변경');
ok(N.scopeLabel('o:SEC Scrubber|s:P1|P2') === 'SEC Scrubber · P1, P2' && N.scopeLabel('r:국내') === '국내 전체' && /외 2$/.test(N.scopeLabel('o:X|s:a|b|c|d|e')), 'scopeLabel — 사람이 읽는 이름');
const itS = [{ status: 'open', title: 'A', op: 'SEC Scrubber', sev: 'bad' }, { status: 'open', title: 'B', op: 'GST TAIWAN SCRUBBER', sev: 'warn' }];
ok(N.pickItems(itS, { scope: 'o:SEC Scrubber|s:P1', kinds: ['actions'] }, '2026-11-04').open.map(x => x.title).join() === 'A', '조치 사항은 사이트가 붙어도 운영단위로 고른다');
const snaps = [{ scope: 'all', made_at: MON8.toISOString(), payload: { name: '전사' } }, { scope: 'o:SEC Scrubber', made_at: MON8.toISOString(), payload: { name: 'SEC Scrubber' } }];
ok(N.pickSnap(snaps, 'o:SEC Scrubber|s:P1').scope === 'o:SEC Scrubber' && N.pickSnap(snaps, 'o:없는곳').scope === 'all', 'pickSnap — 사이트를 떼고 운영단위 스냅샷 · 없으면 전사');
const mS = N.buildMessage({ sub: { channel: 'email', target: 'a@test.local', scope: 'o:SEC Scrubber|s:P1', kinds: ['brief'], pages: ['report'] }, snap: snaps[1], items: [], now: MON8,
  files: [{ page: 'report', ok: true, path: 'report/x-1/1.pptx' }] });
ok(/SEC Scrubber · P1 화면 보고서/.test(mS.subject) && /사이트\(P1\)는 화면 PPT 에만/.test(mS.text), '제목에 사이트 · 브리핑은 운영단위 기준이라고 적는다');
const mF = N.buildMessage({ sub: { channel: 'email', target: 'a@test.local', scope: 'o:없는곳', kinds: ['brief'] }, snap: snaps[0], items: [], now: MON8 });
ok(/없는곳 운영 알림/.test(mF.subject) && /브리핑이 아직 없어 전사 브리핑을 실었습니다/.test(mF.text), '그 운영단위 브리핑이 없으면 전사 것을 싣되 «조용히» 바꾸지 않는다(제목은 고른 범위)');
const N0 = N.buildMessage({ sub: { channel: 'email', target: 'a@test.local', scope: 'all', kinds: ['brief'] }, snap: snaps[0], items: [], now: MON8 });
ok(!/※/.test(N0.text) && /전사 운영 알림/.test(N0.subject), '전사는 예전 그대로(덧붙임 없음)');
ok(N.reportPath('report', 'o:X|s:P1', '2026110408', 1) !== N.reportPath('report', 'o:X|s:P2', '2026110408', 1), 'PPT 파일 경로가 사이트마다 갈린다(같은 운영단위 다른 사이트를 섞지 않는다)');
const jS = N.reportJobs([{ id: 1, enabled: true, freq: 'daily', hour: 8, scope: 'o:X|s:P1', pages: ['report'] }, { id: 2, enabled: true, freq: 'daily', hour: 8, scope: 'o:X|s:P2', pages: ['report'] },
  { id: 3, enabled: true, freq: 'daily', hour: 8, scope: 'o:X|s:P1', pages: ['report'] }], MON8);
ok(jS.length === 2 && jS.find(j => j.scope === 'o:X|s:P1').subs.join() === '1,3', '봇 — (화면 · 범위 · 사이트)마다 한 번 만든다');
ok(/splitScope\(scope\)/.test(RR) && /o\.campus = a\.s/.test(RR) && /restore\(\{ eq: o, hr: o \}\)/.test(RR), '봇 — 사이트를 «단지» 축으로 상세 필터 두 벌에 건다');
ok(/splitScope\(sub\.scope\)\.base/.test(IX2), '발송 — 브리핑 스냅샷은 사이트를 뗀 범위로 찾는다');
const sepUi = (NP2.match(/const SITE_SEP='([^']+)'/) || [])[1], sepN = N.SITE_SEP;
ok(sepUi && sepUi === sepN, '관리 화면과 notify.js 의 구분자가 같다 (' + sepUi + ')');
ok(/value_groups/.test(NP2) && /GST\.ORG\.campus\(/.test(NP2) && /GST\.ORG\.region\(/.test(NP2) && /GST\.vmap\.apply/.test(NP2), '관리 화면 — 운영단위·사이트 목록은 설비·실적 값에서 화면과 같은 판정으로(기준 정보 규칙 포함)');

console.log(`\n${fail ? '❌' : '✅'} t-notify: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
