/* ============================================================================
   카카오 챗봇 「브리핑」 — 대시보드 «글로벌 현황»(옛 홈 · v178 에 합쳤다)이 남긴 스냅샷(brief_snap)을 글로 옮긴다
   (2단계 «제품화» · supabase/setup-27-targets.sql 7절 · docs/v2/PLAN.md 6절 ①)
   ----------------------------------------------------------------------------
   ⚠ 여기서 판정하지 않는다. 목표 대비·위험 설비·고장을 이 함수(Deno)에서 다시 세면 판정의 «네 번째 사본»이 된다
     (CLAUDE.md v109 — 원장을 챗봇에서 파싱하지 말 것 · 제2원칙). 숫자와 문장은 전부 스냅샷에 든 것 —
     대시보드의 GST.kpiText · decisions() 가 한국어로 만든 그 글 — 을 그대로 쓴다.
   ⚠ «언제 계산한 것인지»를 언제나 적는다. 스냅샷은 사람이 «글로벌 현황»을 열 때 갱신된다 — 오래됐으면 오래됐다고 말한다
     (v128: 읽기는 되는데 값이 옛날 것인 실패가 가장 설명하기 어렵다).
   순수 JS(타입 없음) — Deno(엣지펑션)와 Node(tests/t-brief.mjs)가 같은 파일을 읽는다.
   ============================================================================ */

/* 「브리핑」 · 「이번 주 브리핑」 · 「주간 브리핑」 · 「확인 사항」(옛 이름 「결정할 것」도) — 정확히 그 말일 때만.
   ⚠ 「이번주」 하나만으로는 안 잡는다 — BM 메뉴의 기간 단추(이번주·지난주…)와 겹친다. */
export const BRIEF_RE = /^\s*(?:이번\s*주\s*|주간\s*)?(?:브리핑|확인\s*사항|결정할\s*것)\s*$/;
export const BRIEF_STALE_DAYS = 8;      // 스냅샷이 이보다 오래되면 «오래됐다»고 앞에 적는다
export const BRIEF_MAX = 940;           // index.ts 의 KAKAO_MAX(950) 보다 짧게 — 그쪽 clip 이 문장 중간을 자르지 않게

/* 판정 이름은 화면 카드(core V2_T st_bad·st_warn·st_ok)와 같은 낱말이다 — 갈리면 같은 숫자를 두 말로 부른다 */
const ST = { bad: '점검 권장', warn: '관찰 중', ok: '안정' };

function ageText(made, now) {
  const h = Math.max(0, Math.round((now.getTime() - new Date(made).getTime()) / 3600000));
  if (!isFinite(h)) return '';
  return h < 1 ? '방금' : h < 48 ? h + '시간 전' : Math.round(h / 24) + '일 전';
}

/* row = {scope, as_of, payload, made_at} · note = 맨 앞에 붙일 한 줄(내 운영단위 것이 없어 전사를 보낼 때 등) */
export function briefText(row, now = new Date(), note = '') {
  if (!row || !row.payload || typeof row.payload !== 'object')
    return '아직 브리핑이 없습니다. 대시보드 「글로벌 현황」을 한 번 열면 생성됩니다.';
  const p = row.payload, head = [], kp = [], dec = [], tail = [];
  if (note) head.push(note);
  head.push('이번 주 브리핑 — ' + (p.name || '전사'));
  head.push((p.as_of || row.as_of || '-') + ' 기준 · ' + ageText(row.made_at, now) + ' 집계');
  const days = (now.getTime() - new Date(row.made_at).getTime()) / 864e5;
  if (days > BRIEF_STALE_DAYS) head.push('⚠ ' + Math.round(days) + '일 전 집계된 브리핑입니다 — 대시보드 「글로벌 현황」을 열면 최신 내용으로 갱신됩니다.');
  if (p.kr_fall) head.push('⚠ 국내 알람 원장이 비어 있어 국내 고장은 수선실적 BM으로 집계 중');
  (p.kpis || []).forEach(k => {
    const st = ST[k.st] ? '[' + ST[k.st] + '] ' : '';
    kp.push('· ' + st + k.name + (k.win ? '(' + k.win + ')' : '') + ' ' + k.val + (k.unit || '') + ' — ' + k.tgt + (k.dv ? ' · ' + k.dv + ' ' + (k.dvs || '') : ''));
  });
  (p.dec || []).forEach((d, i) => dec.push((i + 1) + '. [' + d.tag + '] ' + d.title));
  if (!p.tgt_n) tail.push('설정된 목표가 없습니다 — 대시보드 「목표·기준」에서 설정하면 목표 대비로 판정됩니다.');
  tail.push('자세한 내용: 대시보드 「글로벌 현황」');
  const build = (D, cut) => [].concat(head, [''], kp, [''], ['이번 주 확인 사항'], D.length ? D : ['이번 주 확인할 사항이 없습니다'],
    cut ? ['… 외 ' + cut + '건은 대시보드에서 확인하세요'] : [], [''], tail).join('\n');
  /* 길면 «확인 사항»을 뒤에서부터 줄인다 — 머리(기준일·나이)와 숫자는 끝까지 남긴다(그게 이 글의 뜻이다) */
  let D = dec.slice(), out = build(D, 0);
  while (out.length > BRIEF_MAX && D.length) { D.pop(); out = build(D, dec.length - D.length); }
  return out.length > BRIEF_MAX ? out.slice(0, BRIEF_MAX - 1) + '…' : out;
}

const NO_TABLE = /does not exist|relation|schema cache|42P01|PGRST20[05]/i;

/* svc = 서비스 키 클라이언트 · email = 인증된 카카오 사용자의 이메일.
   범위 = 그 사람의 기본 운영단위(allowed_users.home_op — 「글로벌 현황」에서 「기본 화면으로 설정」) · 없으면 전사. */
export async function briefReply(svc, email, now = new Date()) {
  let scope = 'all';
  try {
    if (email) {
      const u = await svc.from('allowed_users').select('home_op').eq('email', String(email).toLowerCase()).maybeSingle();
      const op = u && u.data && u.data.home_op;
      if (op) scope = String(op).startsWith('r:') ? op : 'o:' + op;
    }
  } catch (_) { /* 설정 칸이 없으면(setup-27 전) 전사로 */ }
  let r;
  try { r = await svc.from('brief_snap').select('scope,as_of,payload,made_at').in('scope', scope === 'all' ? ['all'] : [scope, 'all']); }
  catch (e) { r = { error: e }; }
  if (r.error) return NO_TABLE.test(String(r.error.message || r.error.code || r.error))
    ? '브리핑 기능이 아직 준비되지 않았습니다(서버 설정 전). 관리자에게 문의해 주세요.'
    : '브리핑을 불러오지 못했습니다. 잠시 후 다시 보내 주세요.';
  const rows = r.data || [];
  const mine = rows.find(x => x.scope === scope), all = rows.find(x => x.scope === 'all');
  if (mine) return briefText(mine, now);
  return briefText(all, now, scope !== 'all' && all ? '(내 운영단위 브리핑이 아직 없어 전사 기준으로 보내 드립니다)' : '');
}
