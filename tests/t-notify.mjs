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
ok(/import \{ isDue, buildMessage, pickSnap \} from "\.\/notify\.js"/.test(IX), 'notify.js 를 그대로 부른다(판정·글을 index.ts 에 다시 짜지 않는다)');
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

console.log(`\n${fail ? '❌' : '✅'} t-notify: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
