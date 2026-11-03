/* ============================================================================
   알림 발송 — 관리자가 등록한 사람에게만, 정해진 시각에 (v207 · supabase/setup-33-notify.sql)
   ----------------------------------------------------------------------------
   사용자: 「관리 페이지에서 발송하고자 하는 이메일을 등록하고, 지정된 시각 또는 발송 빈도를 조정 — 막 아무한테나 보내면 안 되니까」
           · 「카톡도 등록 사용자 리스트를 보고 보내는 사람들을 선택해서」.
   ⚠ 여기서 판정하지 않는다 — 글은 «글로벌 현황»이 남긴 스냅샷(brief_snap)을 brief.js 의 briefText 로 옮긴 것과
     조치 사항 표(action_items)의 줄을 그대로 적은 것뿐이다(제2원칙 · 판정의 네 번째 사본을 만들지 않는다).
   ⚠ «언제 계산한 글인지»가 brief 머리에 이미 있다 — 오래됐으면 오래됐다고 적힌다.
   순수 JS(타입 없음) — Deno(엣지펑션)와 Node(tests/t-notify.mjs)가 같은 파일을 읽는다.
   ============================================================================ */
import { briefText } from './brief.js';

export const DASH = 'https://gstcsglobal-cloud.github.io/';
export const KAKAO_MAX = 990;          // kakao_outbox.text 상한 1000 보다 짧게

/* 한국 시각의 시·요일·일 — 서버 시계는 UTC 다. KST 는 서머타임이 없어 +9h 로 충분하다. */
export function kst(now) {
  const d = new Date(now.getTime() + 9 * 3600e3);
  return { h: d.getUTCHours(), dow: d.getUTCDay(), dom: d.getUTCDate(), ymd: d.toISOString().slice(0, 10) };
}

/* 이 시각에 보낼 차례인가 — cron 이 매시 한 번 부른다. 같은 시간 안에 두 번 불려도 두 번 안 가게 last_sent_at 을 본다(50분). */
export function isDue(sub, now) {
  if (!sub || !sub.enabled || sub.removed) return false;
  if (!matches(sub, now)) return false;
  if (sub.last_sent_at && now.getTime() - new Date(sub.last_sent_at).getTime() < 50 * 60e3) return false;
  return true;
}

/* ---------- 화면 PPT 정기 발송 (v209 · setup-34) ----------
   PPT 는 GitHub Actions 의 보고서 봇(tools/report-run.mjs)이 만든다. 봇도 «보낼 차례»를 이 파일의 slotOf 로 판정한다 —
   Node 가 같은 파일을 읽으므로 일정 판정의 사본이 생기지 않는다(제2원칙). */
export const PPT_PAGES = { report: '주간 현황', fault: '고장 분석', pm: 'PM 점검', cip: 'CIP 진행',
  scrubber: '설비 현황', material: '자재 사용', tco: 'TCO', hr: '인원·교육' };
export const PPT_WIN_H = 6;            // 봇이 늦게 돌아도(GitHub 예약 실행은 수십 분 밀리기도 한다) 6시간 안이면 그 차례로 만든다
export const hasPages = sub => !!(sub && Array.isArray(sub.pages) && sub.pages.length);

/* 이 시각(KST)이 그 수신자의 일정에 맞는가 — 마지막 발송 시각은 보지 않는다(isDue 와 slotOf 가 함께 쓴다) */
function matches(sub, at) {
  const k = kst(at);
  if (+sub.hour !== k.h) return false;
  if (sub.freq === 'weekdays' && (k.dow === 0 || k.dow === 6)) return false;
  if (sub.freq === 'weekly' && +sub.dow !== k.dow) return false;
  if (sub.freq === 'monthly' && +sub.dom !== k.dom) return false;
  return true;
}
/* 가장 최근의 «보낼 차례»(정시 · winH 시간 안) — 없으면 null. 그 차례 뒤에 이미 보냈으면 null.
   돌려주는 key 는 KST 'YYYY-MM-DD HH' — 같은 차례를 두 번 만들지 않는 열쇠다. */
export function slotOf(sub, now, winH) {
  if (!sub || !sub.enabled || sub.removed) return null;
  const w = winH || PPT_WIN_H;
  for (let h = 0; h < w; h++) {
    const at = new Date(now.getTime() - h * 3600e3);
    if (!matches(sub, at)) continue;
    const k = kst(at);
    const start = new Date(Date.UTC(+k.ymd.slice(0, 4), +k.ymd.slice(5, 7) - 1, +k.ymd.slice(8, 10), k.h) - 9 * 3600e3);
    if (sub.last_sent_at && new Date(sub.last_sent_at).getTime() >= start.getTime()) return null;
    return { key: k.ymd + ' ' + String(k.h).padStart(2, '0'), start: start.toISOString() };
  }
  return null;
}
/* 봇이 만들 일 — (화면 · 범위)마다 한 번. 같은 화면을 여러 사람이 받아도 한 번만 만든다. */
export function reportJobs(subs, now, winH) {
  const jobs = new Map();
  (subs || []).forEach(s => {
    if (!hasPages(s)) return;
    const sl = slotOf(s, now, winH); if (!sl) return;
    s.pages.forEach(pg => {
      if (!PPT_PAGES[pg]) return;
      const key = pg + '|' + (s.scope || 'all');
      const j = jobs.get(key) || { page: pg, scope: s.scope || 'all', slot: sl.key, subs: [] };
      if (j.subs.indexOf(s.id) < 0) j.subs.push(s.id);
      if (sl.key > j.slot) j.slot = sl.key;
      jobs.set(key, j);
    });
  });
  return Array.from(jobs.values());
}
/* 매시 cron 이 PPT 수신자를 «대신» 보낼 때 — 봇이 창(winH) 안에 못 보냈을 때만(그때 PPT 없이 글만 · 까닭을 적는다).
   창 안이면 봇의 몫이라 cron 은 건드리지 않는다(PPT 없는 메일이 먼저 가면 안 된다). */
export function pptOverdue(sub, now, winH) {
  if (!hasPages(sub)) return false;
  const w = winH || PPT_WIN_H;
  if (slotOf(sub, now, w)) return false;                 // 아직 봇의 창 안
  const late = slotOf(sub, now, w + 2);                  // 창은 지났는데 그 차례에 아직 안 보냈다
  return !!late;
}
/* 저장소 경로 — 화면 · 범위 · 차례 · 만든 시각. 범위의 한글·괄호는 경로에 못 넣으므로 안전한 열쇠로 바꾼다 */
export function reportPath(page, scope, slot, stamp) {
  const sc = String(scope || 'all').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';
  const h = Array.from(String(scope || 'all')).reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7).toString(36);
  const sl = String(slot || 'manual').replace(/[^0-9]/g, '') || 'manual';
  return page + '/' + sc.slice(0, 24) + '-' + h + '/' + sl + '-' + String(stamp || Date.now()) + '.pptx';
}

const ST = { open: '새로', ack: '확인', doing: '진행' };
const SEV = { bad: '높음', warn: '보통', info: '참고' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 이 범위의 열린 조치 사항 — 범위 열쇠는 brief_snap 과 같다(all · r:국내/해외 · o:운영단위). 구분 판정은 하지 않는다 —
   r: 범위는 조치 사항의 운영단위가 그 구분에 드는지 모르므로(판정 사본 금지) 전부 싣고 그렇다고 적는다. */
export function pickItems(items, sub, today) {
  const sc = sub.scope || 'all', me = String(sub.target || '').toLowerCase();
  const inScope = x => sc === 'all' || sc.startsWith('r:') || (sc.startsWith('o:') && x.op === sc.slice(2));
  const open = (items || []).filter(x => ['open', 'ack', 'doing'].includes(x.status));
  const kinds = sub.kinds || [];
  const out = { overdue: [], open: [], mine: [] };
  if (kinds.includes('actions')) {
    open.filter(inScope).forEach(x => { (x.due && x.due < today ? out.overdue : out.open).push(x); });
  }
  if (kinds.includes('mine')) out.mine = open.filter(x => String(x.assignee || '').toLowerCase() === me);
  return out;
}

function itemLine(x, today) {
  const d = x.due ? (x.due < today ? ' · 기한 경과(' + x.due + ')' : ' · 기한 ' + x.due) : '';
  return '[' + (SEV[x.sev] || '보통') + '] ' + x.title + (x.op ? ' · ' + x.op : '') + ' · ' + (ST[x.status] || x.status) + d;
}

/* 보낼 글 — {subject, text(카톡·메일 본문 텍스트), html} */
export function buildMessage({ sub, snap, items, now, files }) {
  const k = kst(now), today = k.ymd;
  const kinds = sub.kinds || [];
  const parts = [], hparts = [];
  const scopeName = (snap && snap.payload && snap.payload.name) || (sub.scope === 'all' ? '전사' : String(sub.scope).replace(/^[ro]:/, ''));
  const fl = (files || []).filter(f => f && PPT_PAGES[f.page]);
  const subject = '[GST CS] ' + scopeName + (fl.length ? ' 화면 보고서' : ' 운영 알림') + ' — ' + today;
  /* PPT — 메일은 첨부(받는 쪽이 index.ts 에서 붙인다), 카톡은 «로그인해야 열리는» 받기 링크.
     ⚠ 링크는 비공개 저장소를 가리킨다 — 받는 사람도 대시보드에 로그인해야 받는다(링크만으로는 안 열린다). */
  if (fl.length) {
    const okF = fl.filter(f => f.ok && f.path), bad = fl.filter(f => !(f.ok && f.path));
    const pl = okF.map(f => '· ' + PPT_PAGES[f.page] + ' PPT — ' + DASH + 'files/?p=' + encodeURIComponent(f.path));
    const ml = okF.map(f => '· ' + PPT_PAGES[f.page] + ' PPT (첨부)');
    bad.forEach(f => { pl.push('· ' + PPT_PAGES[f.page] + ' PPT — 만들지 못했습니다' + (f.error ? ' (' + f.error + ')' : '')); ml.push(pl[pl.length - 1]); });
    parts.push('화면 보고서\n' + pl.join('\n'));
    hparts.push('<h3 style="font:600 15px sans-serif;margin:0 0 6px">화면 보고서</h3><ul style="margin:0 0 14px;padding-left:18px">' +
      ml.map(s => '<li style="font:14px/1.6 sans-serif">' + esc(s.replace(/^· /, '')) + '</li>').join('') + '</ul>');
  }
  if (kinds.includes('brief')) {
    const b = briefText(snap, now);
    parts.push(b);
    hparts.push('<pre style="font:14px/1.6 \'Malgun Gothic\',sans-serif;white-space:pre-wrap;margin:0">' + esc(b) + '</pre>');
  }
  const P = pickItems(items, sub, today);
  const block = (title, arr) => {
    if (!arr.length) return;
    const lines = arr.slice(0, 12).map(x => itemLine(x, today));
    if (arr.length > 12) lines.push('… 외 ' + (arr.length - 12) + '건');
    parts.push(title + ' ' + arr.length + '건\n' + lines.map(s => '· ' + s).join('\n'));
    hparts.push('<h3 style="font:600 15px sans-serif;margin:18px 0 6px">' + esc(title) + ' ' + arr.length + '건</h3><ul style="margin:0;padding-left:18px">' +
      lines.map(s => '<li style="font:14px/1.6 sans-serif">' + esc(s) + '</li>').join('') + '</ul>');
  };
  block('기한 경과 조치 사항', P.overdue);
  block('열린 조치 사항', P.open);
  block('내가 맡은 조치 사항', P.mine);
  if ((kinds.includes('actions') || kinds.includes('mine')) && !P.overdue.length && !P.open.length && !P.mine.length) {
    parts.push('열린 조치 사항이 없습니다.'); hparts.push('<p style="font:14px sans-serif">열린 조치 사항이 없습니다.</p>');
  }
  if (String(sub.scope || '').startsWith('r:') && kinds.includes('actions')) {
    parts.push('(조치 사항은 구분으로 나누지 않고 전부 실었습니다)');
  }
  const links = '대시보드: ' + DASH + '#tab=hub\n조치 사항: ' + DASH + '#tab=action';
  parts.push(links);
  const btn = (href, t) => '<a href="' + href + '" style="display:inline-block;margin:4px 8px 0 0;padding:9px 16px;border-radius:8px;background:#1d4ed8;color:#fff;text-decoration:none;font:600 14px sans-serif">' + t + '</a>';
  hparts.push('<p style="margin:20px 0 0">' + btn(DASH + '#tab=hub', '글로벌 현황 열기') + btn(DASH + '#tab=action', '조치 사항 처리하기') + '</p>' +
    '<p style="font:12px sans-serif;color:#64748b;margin-top:18px">관리자가 등록한 수신자에게만 보내는 메일입니다 · 받지 않으려면 관리자에게 알려 주세요.</p>');
  const text = parts.join('\n\n');
  const html = '<div style="max-width:680px;margin:0 auto;padding:20px;color:#0f172a">' + hparts.join('') + '</div>';
  const kakao = text.length > KAKAO_MAX ? text.slice(0, KAKAO_MAX - 1) + '…' : text;
  return { subject, text, html, kakao };
}

/* 이 수신자의 범위 스냅샷 — 없으면 전사(그 사실을 brief 머리에 적는다 — briefText 의 note) */
export function pickSnap(snaps, scope) {
  const rows = snaps || [];
  return rows.find(x => x.scope === scope) || rows.find(x => x.scope === 'all') || null;
}
