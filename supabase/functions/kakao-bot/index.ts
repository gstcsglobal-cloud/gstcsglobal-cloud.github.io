// GST 대시보드 카카오톡 챗봇 (오픈빌더 스킬 웹훅)
//
// FINAL 핵심 변경: Claude가 데이터를 직접 분석해서 자연어로 답변
//   [이전] 코드가 계산 → 고정 포맷 문자열 출력
//   [FINAL] 코드가 관련 데이터 로드 → Claude에게 통째로 줌 → Claude가 분석+계산+자연어 답변
//
//   · 역질문/QuickReply 지원
//   · faults 보관 730일로 확대
//   · 기간 미지정 시 전체 기간 조회
//   · 휴가 사이트 필터: 사원번호 기반 roster 조인
//   · 마크다운 금지 (카카오톡 미지원)
//
// ★ Supabase 마이그레이션 (최초 1회):
//   ALTER TABLE kakao_users ADD COLUMN IF NOT EXISTS conv_state JSONB;

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  isoW, buildEduIndex, eduPlan, parseRoster, parseEdu, parseFaultRecords,
  parseCIP, cipProgress, parseLeave, parseInstall, parsePeriod, reviveDates, SITE_KEYS,
  filterEquipment, filterFaults, filterPeople, filterLeave, filterPeopleByEdu,
  groupCount, groupAccessor, grpKey, FAULT_SPEC, hnorm,
  EQ,
} from "./hr.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-kakao-secret, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const GID = {
  roster: "1213453343",
  edu: "0",
  leave: "262805841",
  faults: "646668307",
  cipF11: "2123129719",
  cipF16: "1999732389",
  equipment: "891608329",
};

const MODEL_ROUTE = "claude-haiku-4-5-20251001";  // 라우팅용 (저렴)
const MODEL_FAST  = "claude-sonnet-5";              // 분석용
const MODEL_SMART = "claude-sonnet-5";              // Opus 제거
let smartBroken = false;
const FRESH_MS = 10 * 60 * 1000;

/* ============================================================
   카카오 응답 포맷
   ============================================================ */
const KAKAO_MAX = 950;
const clip = (s: string) => s.length > KAKAO_MAX ? s.slice(0, KAKAO_MAX - 1) + "…" : s;

const simpleText = (text: string) => ({
  version: "2.0",
  template: { outputs: [{ simpleText: { text: clip(text) } }] },
});

const quickReply = (text: string, buttons: string[]) => ({
  version: "2.0",
  template: {
    outputs: [{ simpleText: { text: clip(text) } }],
    quickReplies: buttons.slice(0, 6).map((b) => ({
      action: "message", label: b, messageText: b,
    })),
  },
});

const useCallbackBody = () => ({
  version: "2.0", useCallback: true, data: { text: "잠시만 기다려주세요." },
});

async function postCallback(callbackUrl: string, payload: unknown) {
  try {
    await fetch(callbackUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    });
  } catch (e) { console.error("callback post failed", (e as Error).message); }
}

/* ============================================================
   1. 동기화 — 구글 시트 → bot_cache
   ============================================================ */
/* v82 — 구글시트 은퇴. 데이터는 이제 CSV 업로드로 Supabase 에 들어온다(/upload/).
   여기서도 시트(sheet-proxy)가 아니라 **같은 Supabase 표를 읽는다** — 안 옮기면 봇은
   마지막 시트 상태에서 영원히 멈춘 답을 한다.

   파서(hr.js)는 CSV 텍스트를 받으므로, 표를 «시트 모양 CSV»로 되살려 돌려준다.
   그래서 파서·bot_cache·라우팅·분석은 한 줄도 안 바뀐다 — 대시보드 이관과 같은 수법이다.

   표가 두 종류다 (CLAUDE.md 「데이터 출처가 둘이다」):
     mirror — sheet_wk·sheet_inst. 컬럼이 snake_case 라 시트 머리글을 모른다.
              머리글은 sheet_colmap(tbl·col·headers·ord)에서 되살린다 — 여기 적으면
              스펙의 네 번째 사본이 된다(제2원칙). 행 순서는 src_row.
     import — 교육·인원·휴가·CIP. 컬럼 이름이 시트 머리글 그대로라 그대로 내보낸다.
              정렬 열 이름에 점·공백이 들면 PostgREST order= 구문이 깨진다(core.js 와
              같은 규칙 — «No.» 실사고). tests/t-botdb.mjs 가 이 복원이 원본 CSV 와
              같은 파싱 결과를 내는지 대조한다. */
/* ---------- 순수 복원부 ---------- */
const CSV_SKIP = new Set(["id", "created_at", "imported_at", "src_row", "synced_at", "extra"]);
const DB_OF_GID: Record<string, { tbl: string; kind: "mirror" | "import" }> = {
  "646668307":  { tbl: "sheet_wk",      kind: "mirror" },
  "891608329":  { tbl: "sheet_inst",    kind: "mirror" },
  "0":          { tbl: "sheet_edu",     kind: "import" },
  "1213453343": { tbl: "sheet_roster",  kind: "import" },
  "262805841":  { tbl: "sheet_leave",   kind: "import" },
  "2123129719": { tbl: "sheet_cip_f11", kind: "import" },
  "1999732389": { tbl: "sheet_cip_f16", kind: "import" },
};
function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// 표 행(객체 배열) → 시트 모양 CSV. head = 머리글 행, cols = 각 머리글이 읽을 컬럼.
function rowsToCsv(head: string[], cols: string[], rows: Record<string, unknown>[]) {
  const out = [head.map(csvCell).join(",")];
  for (const o of rows) out.push(cols.map((c) => csvCell(o[c])).join(","));
  return out.join("\n");
}
function importOrderCol(keys: string[]) {
  const safe = keys.filter((k) => /^[A-Za-z0-9_가-힣]+$/.test(k));
  return ["id", "src_row", "No", "no", "NO"].find((p) => safe.includes(p)) ?? safe[0] ?? null;
}
/* ---------- 순수 복원부 끝 ---------- */

async function fetchCsv(gid: string) {
  const t = Date.now();
  const D = DB_OF_GID[gid];
  if (!D) throw new Error("NO_TABLE gid=" + gid);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let head: string[], cols: string[], ord: string | null;
  if (D.kind === "mirror") {
    const cm = await svc.from("sheet_colmap").select("col,headers,ord")
      .eq("tbl", D.tbl.replace("sheet_", "")).order("ord", { ascending: true });
    if (cm.error) throw new Error("COLMAP " + cm.error.message);
    if (!cm.data?.length) throw new Error("COLMAP_MISSING " + D.tbl);
    cols = cm.data.map((c: any) => c.col);
    head = cm.data.map((c: any) => (c.headers ?? [])[0] ?? c.col);   // 머리글 = 첫 별칭 (core.js dbRows 와 동일)
    ord = "src_row";
  } else {
    const probe = await svc.from(D.tbl).select("*").limit(1);
    if (probe.error) throw new Error("READ " + probe.error.message);
    if (!probe.data?.length) throw new Error("EMPTY " + D.tbl);
    cols = Object.keys(probe.data[0]).filter((k) => !CSV_SKIP.has(k));
    head = cols;
    ord = importOrderCol(Object.keys(probe.data[0]));
  }

  /* 페이지네이션 — 「요청한 만큼 안 오면 끝」으로 판정하지 않는다. PostgREST 행수 상한은
     프로젝트 설정이라, 상한에 걸린 것을 완료로 착각하면 잘린 데이터로 답하게 된다. */
  const all: Record<string, unknown>[] = [];
  const STEP = 5000;
  for (let from = 0, guard = 0; guard < 400; guard++) {
    let q = svc.from(D.tbl).select("*");
    if (ord) q = q.order(ord, { ascending: true });
    const r = await q.range(from, from + STEP - 1);
    if (r.error) throw new Error("READ " + r.error.message);
    const n = r.data?.length ?? 0;
    if (!n) break;
    for (const o of r.data) all.push(o);
    from += n;
  }
  if (!all.length) throw new Error("EMPTY " + D.tbl);
  const text = rowsToCsv(head, cols, all);
  return { text, bytes: text.length, ms: Date.now() - t };
}

const DIGEST: Record<string, (csv: string, now: Date) => unknown> = {
  roster: (csv) => parseRoster(csv),
  edu: (csv) => parseEdu(csv),
  equipment: (csv) => parseInstall(csv),
  /* faults 는 여기 없다 — v97 부터 캐시하지 않고 질문할 때 queryFaults 로 직접 읽는다.
     되살리지 말 것: 수선실적 257,606행을 통째로 담다가 워커가 메모리 한도로 죽었고,
     sync 순서상 뒤였던 leave·cip 까지 3일간 같이 멈췄다. */
  leave: (csv) => parseLeave(csv),  // 전체 저장 — 날짜 필터는 조회 시 Claude가 판단
};

async function syncOne(svc: any, key: string, now: Date) {
  try {
    if (key === "cip") {
      const [a, b] = await Promise.all([fetchCsv(GID.cipF11), fetchCsv(GID.cipF16)]);
      const r11 = parseCIP(a.text, "F11"), r16 = parseCIP(b.text, "F16");
      const remain = [...r11, ...r16].filter((r: any) => !r.done);
      const data = {
        F11: cipProgress(r11), F16: cipProgress(r16), 전체: cipProgress([...r11, ...r16]),
        remainTop: groupCount(remain, (r: any) => r.item, 20),
      };
      await svc.from("bot_cache").upsert({
        key, data, rows: r11.length + r16.length, bytes: a.bytes + b.bytes,
        ms: a.ms + b.ms, error: null, fetched_at: new Date().toISOString(),
      });
      return { key, ok: true, rows: r11.length + r16.length };
    }
    const { text, bytes, ms } = await fetchCsv(GID[key as keyof typeof GID]);
    const data = DIGEST[key](text, now) as unknown[];
    await svc.from("bot_cache").upsert({
      key, data, rows: data.length, bytes, ms, error: null, fetched_at: new Date().toISOString(),
    });
    console.log("sync", key, bytes, ms, data.length);
    return { key, ok: true, rows: data.length, bytes, ms };
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 200);
    console.error("sync fail", key, msg);
    await svc.from("bot_cache").update({ error: msg }).eq("key", key);
    return { key, ok: false, error: msg };
  }
}

async function syncAll(svc: any, now: Date, only?: string[]) {
  /* faults 를 빼는 것이 핵심이다(v97). 넣어 두면 워커가 거기서 죽고, 뒤에 오는
     leave·cip 은 «시도조차 안 된 채» 옛 시각으로 남는다 — 에러도 안 남는다. */
  const keys = (only?.length ? only : ["roster", "edu", "equipment", "leave", "cip"])
    .filter((k) => k !== "faults");
  const out = [];
  for (const k of keys) out.push(await syncOne(svc, k, now));
  return out;
}

/* ============================================================
   2. 캐시 읽기
   ============================================================ */
type Cache = { data: any; fetched_at: string };

async function loadCache(svc: any, keys: string[]): Promise<Record<string, Cache>> {
  const { data, error } = await svc.from("bot_cache").select("key,data,fetched_at").in("key", keys);
  if (error) throw new Error("CACHE_READ: " + error.message);
  const m: Record<string, Cache> = {};
  for (const row of data ?? []) m[row.key] = { data: row.data, fetched_at: row.fetched_at };
  return m;
}

const rowsOf = (c: Record<string, Cache>, key: string) =>
  reviveDates((c[key]?.data ?? []) as any[], key);

const stalest = (c: Record<string, Cache>) =>
  Object.values(c).map((x) => x.fetched_at).sort()[0] ?? null;

/* ============================================================
   2-b. 고장 실적은 «캐시하지 않는다» — 질문할 때 표에서 필요한 행만 읽는다 (v97)

   왜. bot_cache 는 «표 전체를 JSON 덩어리로» 담는 구조다. 수선실적이 17,091행에서
   257,606행으로 늘자(2025 156,297 · 2026 100,806) 워커가 메모리 한도에 걸려 죽었다 —
   실측 응답코드 546. 그리고 faults 는 sync 순서상 leave·cip «앞»이라, 죽으면 뒤의 둘도
   같이 안 갱신된다. 워커가 죽으면 catch 가 못 도니 bot_cache.error 는 비어 있고,
   fetched_at 만 3일 전에 멈춘다 — 화면에는 아무 단서가 없다(실제로 그렇게 지냈다).

   기간을 자르는 것으로는 못 막는다: 올해만 100,806건이다. 규모가 또 늘면 같은 벽이다.

   ⚠ 컬럼 이름을 여기 적지 않는다 — 스펙의 «네 번째 사본»이 된다(CLAUDE.md 제2원칙).
      sheet_colmap 이 «시트 머리글 → DB 컬럼»을 주고, 어떤 머리글이 필요한지는
      hr.js 의 FAULT_SPEC 이 정한다.
   ⚠ 레코드를 여기서 다시 만들지도 않는다 — 받은 행을 «시트 모양 CSV»로 되살려
      parseFaultRecords 에 그대로 먹인다. 두 벌이면 캐시 시절과 숫자가 갈린다.
   ============================================================ */
const FAULT_CAP = 40000;        // 이 이상은 자르고 «잘랐다»고 답변에 밝힌다
const FAULT_DEFAULT_DAYS = 90;  // 질문이 기간을 안 밝혔을 때의 기본 창

type FaultQ = {
  rows: any[]; total: number; used: number; truncated: boolean;
  from: string; to: string; spoken: boolean; ms: number;
};

async function queryFaults(svc: any, filters: any, now: Date): Promise<FaultQ> {
  const t = Date.now();
  const cm = await svc.from("sheet_colmap").select("col,headers").eq("tbl", "wk");
  if (cm.error) throw new Error("COLMAP " + cm.error.message);
  if (!cm.data?.length) throw new Error("COLMAP_MISSING wk");
  const colOf = new Map<string, string>();
  for (const r of cm.data) for (const h of (r.headers ?? [])) colOf.set(hnorm(h), r.col);

  const heads: string[] = [], cols: string[] = [], miss: string[] = [];
  for (const head of Object.values(FAULT_SPEC) as string[]) {
    const c = colOf.get(hnorm(head));
    if (!c) { miss.push(head); continue; }
    heads.push(head); cols.push(c);
  }
  /* 못 찾은 열을 조용히 넘기지 않는다. parseFaultRecords 의 행 게이트(작업단계·작업시작일)에
     걸려 «0건»이 되는데, 그것은 화면에서 «고장이 없다»로 읽힌다. */
  if (miss.length) throw new Error("NO_COL wk: " + miss.join(","));

  const dCol = colOf.get(hnorm(FAULT_SPEC.dStart))!;
  const stCol = colOf.get(hnorm(FAULT_SPEC.stage))!;
  const snCol = colOf.get(hnorm(FAULT_SPEC.sn))!;

  let from: Date, to: Date, spoken = false;
  const p = filters?.periodText ? parsePeriod(filters.periodText, now) : null;
  if (p) { from = p.from; to = p.to; spoken = true; }
  else { to = now; from = new Date(now.getTime() - FAULT_DEFAULT_DAYS * 86400000); }
  const d10 = (d: Date) => d.toISOString().slice(0, 10);

  /* 날짜 컬럼은 text 다(미러는 전부 text 로 시작한다 — 값 하나가 이상해도 적재가 안 죽게).
     값이 'YYYY-MM-DD' 로 시작하므로 사전순 비교가 곧 날짜 비교다. to 쪽에 '~' 를 붙이는 것은
     시각이 붙은 행('2026-08-14 13:28:32')도 그 날에 포함시키기 위해서다 — '~' 는 아스키에서
     숫자·공백·콜론보다 크다. */
  const cond = (q: any) => {
    q = q.gte(dCol, d10(from)).lte(dCol, d10(to) + "~");
    if (filters?.category) q = q.eq(stCol, filters.category);
    if (filters?.sn) q = q.ilike(snCol, "%" + filters.sn + "%");
    return q;
  };

  const cnt = await cond(svc.from("sheet_wk").select(dCol, { count: "exact", head: true }));
  if (cnt.error) throw new Error("COUNT " + cnt.error.message);
  const total = cnt.count ?? 0;
  const take = Math.min(total, FAULT_CAP);

  const all: Record<string, unknown>[] = [];
  const STEP = 5000;
  for (let f = 0; f < take; f += STEP) {
    const r = await cond(svc.from("sheet_wk").select(cols.join(",")))
      .order(dCol, { ascending: false })            // 잘릴 때 «최근»이 남아야 한다
      .range(f, Math.min(f + STEP, take) - 1);
    if (r.error) throw new Error("READ " + r.error.message);
    if (!r.data?.length) break;
    for (const o of r.data) all.push(o);
  }
  const rows = parseFaultRecords(rowsToCsv(heads, cols, all));
  return { rows, total, used: rows.length, truncated: total > FAULT_CAP,
           from: d10(from), to: d10(to), spoken, ms: Date.now() - t };
}

/* 조회 범위를 «답변이 서는 근거»로 남긴다. 조용히 자르면 그 답은 거짓말이 된다 —
   그리고 무엇을 하면 되는지(기간을 좁혀라)까지 적는다. */
function faultNote(f: FaultQ | null, err: string | null) {
  if (err) return `[고장 실적] 조회 실패: ${err}\n이 답에 고장 데이터는 반영되지 않았습니다.`;
  if (!f) return "";
  const win = `[고장 실적 조회 범위] ${f.from} ~ ${f.to}`
    + (f.spoken ? "" : ` (질문에 기간이 없어 최근 ${FAULT_DEFAULT_DAYS}일)`);
  return f.truncated
    ? `${win} · 조건에 맞는 ${f.total.toLocaleString()}건 중 최근 ${f.used.toLocaleString()}건만 사용했습니다.`
      + ` 이 답의 건수는 실제보다 적습니다 — 기간을 좁혀 다시 물어봐 주세요.`
    : `${win} · ${f.used.toLocaleString()}건 전부 사용`;
}

/* loadCache 를 감싼다 — faults 만 표에서 직접 읽어 끼워 넣는다.
   두 입구(카톡·웹)와 메뉴가 «같은 함수»를 쓰게 해 둔다. 한쪽만 고치면
   「카톡은 되는데 웹은 옛 데이터」가 된다(제2원칙). */
async function loadCacheLive(svc: any, keys: string[], filters: any, now: Date) {
  const want = keys.includes("faults");
  const cache = await loadCache(svc, keys.filter((k) => k !== "faults"));
  if (!want) return cache;
  try {
    const f = await queryFaults(svc, filters ?? {}, now);
    cache["faults"] = { data: f.rows, fetched_at: new Date().toISOString(), note: faultNote(f, null) } as any;
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 200);
    console.error("queryFaults", msg);
    cache["faults"] = { data: [], fetched_at: new Date().toISOString(), note: faultNote(null, msg) } as any;
  }
  return cache;
}
const faultsNoteOf = (c: Record<string, Cache>) => (c["faults"] as any)?.note ?? "";
/* 조회 범위를 «답변에» 직접 붙인다. 모델에게만 주면 안 적을 수 있고, 그러면 잘렸다는
   사실이 사라진다 — 조용한 자르기를 막으려고 만든 문장인데 조용히 없어지는 셈이다.
   카톡은 950자 제한이 있어 꼬리말을 먼저 확보하고 본문을 줄인다. */
function withFaultNote(answer: string, cache: Record<string, Cache>, limit?: number) {
  const n = faultsNoteOf(cache);
  if (!n) return answer;
  const tail = "\n\n" + n;
  if (!limit) return answer + tail;
  const room = limit - tail.length;
  return (answer.length > room ? answer.slice(0, Math.max(0, room - 1)) + "…" : answer) + tail;
}

/* ============================================================
   3. 인증
   ============================================================ */
async function findLink(svc: any, botUserKey: string) {
  const { data, error } = await svc.from("kakao_users").select("*").eq("bot_user_key", botUserKey).maybeSingle();
  if (error) throw new Error("DB_LOOKUP");
  return data;
}

const authClient = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

async function sendOtpFor(svc: any, botUserKey: string, email: string): Promise<string | null> {
  const norm = email.trim().toLowerCase();
  const { data: allowed } = await svc.from("allowed_users").select("email").eq("email", norm).maybeSingle();
  if (!allowed) return "등록되지 않은 이메일입니다. 관리자에게 이메일 등록을 요청하세요.";
  const { error } = await authClient().auth.signInWithOtp({ email: norm, options: { shouldCreateUser: false } });
  if (error) return "등록되지 않은 이메일이거나 전송에 실패했습니다.";
  await svc.from("kakao_users").upsert({
    bot_user_key: botUserKey, email: norm, status: "awaiting_otp", otp_requested_at: new Date().toISOString(),
  });
  return null;
}

async function verifyOtpFor(svc: any, botUserKey: string, email: string, code: string): Promise<boolean> {
  const { error } = await authClient().auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return false;
  await svc.from("kakao_users").update({ status: "verified", verified_at: new Date().toISOString() })
    .eq("bot_user_key", botUserKey);
  return true;
}

/* ============================================================
   4. 대화 상태 (역질문)
   ============================================================ */
type ConvState = {
  phase: "clarify";
  partial_utterance: string;
  clarify_question: string;
  clarify_options: string[];
  created_at: string;
} | null;

async function loadConvState(svc: any, botUserKey: string): Promise<ConvState> {
  const { data } = await svc.from("kakao_users").select("conv_state").eq("bot_user_key", botUserKey).maybeSingle();
  if (!data?.conv_state) return null;
  const age = Date.now() - new Date(data.conv_state.created_at ?? 0).getTime();
  if (age > 5 * 60 * 1000) return null;
  return data.conv_state as ConvState;
}

async function saveConvState(svc: any, botUserKey: string, state: ConvState) {
  await svc.from("kakao_users").update({ conv_state: state }).eq("bot_user_key", botUserKey);
}

/* ============================================================
   5. ★ 핵심: Claude가 데이터를 직접 분석해서 자연어 답변
   ============================================================ */

// 어떤 데이터셋이 필요한지 먼저 파악 (가볍게)
const ROUTE_TOOL = {
  name: "route",
  description: "질문에 답하기 위해 어떤 데이터가 필요한지, 또는 역질문이 필요한지 결정한다",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["load_data", "clarify", "chat"],
        description: "load_data=데이터 로드 후 분석, clarify=정보 부족해서 역질문, chat=데이터 불필요한 대화",
      },
      datasets: {
        type: "array",
        items: { type: "string", enum: ["roster", "edu", "equipment", "faults", "leave", "cip"] },
        description: "action=load_data일 때 필요한 데이터셋 목록",
      },
      filters: {
        type: "object",
        description: "데이터 필터링 힌트 (Claude 분석 시 참고용)",
        properties: {
          site: { type: "string" },
          sn: { type: "string" },
          periodText: { type: "string", description: "기간 원문 그대로 (예: '2025년', '올해', '지난달')" },
          category: { type: "string" },
          group: { type: "string" },
        },
      },
      clarify_question: { type: "string" },
      clarify_options: { type: "array", items: { type: "string" }, maxItems: 5 },
      chat_reply: { type: "string" },
    },
    required: ["action"],
  },
};

async function routeQuery(
  utterance: string,
  convState: ConvState,
  lastRoute: any,
  currentWeek: string,
  allowSlow: boolean,
): Promise<any | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;

  const ctx = lastRoute
    ? `\n[직전 질의 맥락] ${JSON.stringify(lastRoute)}\n후속 질문이면 이어받아라.`
    : "";

  const clarifyCtx = convState?.phase === "clarify"
    ? `\n[역질문 중] 원래 질문: "${convState.partial_utterance}"\n사용자가 방금 선택/답변했다. 이제 load_data로 분석하라.`
    : "";

  const sys = `너는 CS Global Team 사내 데이터 조회 AI다.
사용자 질문을 보고 route 도구를 호출해 어떤 데이터가 필요한지 결정하라.

데이터셋:
- roster: 인원 명단 (이름, 사이트, 직책, 입사일 등)
- edu: 교육 이수 현황 (LV1 Basic / LV2 Veteran)
- equipment: 설치 스크러버 (S/N, CODE, 고객사, FAB, 층, Bay, 공정, 모델, 워런티 등)
- faults: 작업 실적 (S/N, 작업단계, 알람유형, 원인, 조치, 공수, 작업일) — 최근 2년치
- leave: 휴가 기록
- cip: CIP 개조 진행률 (F11/F16)

사이트 키: ${SITE_KEYS.join(", ")}
오늘: ${currentWeek} 주차

업무 용어 정의:
- BM = Break/Maintenance = 고장수리. faults에서 stage에 "BM"/"고장"/"긴급" 포함된 것
- PM = Preventive Maintenance = 예방점검. stage에 "PM"/"점검" 포함
- TBM = Time Based Maintenance = 정기점검
- ALARM = 알람 유형 (alarm 필드). BM 실적의 발생 원인 코드
- W30, W31 등 = 주차 번호. periodText로 전달
- F16, F11, PSMC, TSMC = 사이트(FAB)

역질문(clarify) 기준:
- S/N만 입력 → 뭐가 궁금한지 모름 → clarify
- 사이트만 입력 → 인원/설비/고장 중 모름 → clarify
- "BM"만 입력 → 기간/사이트 모름 → clarify
- 그 외엔 추론해서 load_data 우선. BM/ALARM/PM 등 업무 용어는 위 정의 참고${ctx}${clarifyCtx}`;

  const model = MODEL_ROUTE;  // 라우팅은 항상 Haiku
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 400, system: sys,
      messages: [{ role: "user", content: utterance }],
      tools: [ROUTE_TOOL], tool_choice: { type: "tool", name: "route" },
    }),
    signal: AbortSignal.timeout(allowSlow ? 20000 : 3000),
  });

  if (!r.ok) {
    if (r.status === 404 || r.status === 400) { smartBroken = true; }
    console.error("route error", r.status);
    return null;
  }
  const body = await r.json();
  const use = (body.content ?? []).find((c: any) => c.type === "tool_use");
  return use?.input ?? null;
}

// Claude가 데이터를 받아서 자연어로 분석+답변
async function analyzeAndAnswer(
  utterance: string,
  dataContext: string,
  cacheStamp: string,
  allowSlow: boolean,
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return "API 키가 설정되지 않았습니다.";

  const sys = `CS Global Team 사내 데이터 분석 AI. 데이터를 직접 계산해 질문에만 간결히 답하라.
규칙:
- 추측 금지·정확한 숫자·친근한 말투·500자 이내·데이터 없으면 솔직히 말하기
- 카카오톡이라 마크다운 절대 금지: **굵게**, |표|, --- 전부 사용 금지. 일반 텍스트만
- S/N 목록 나열 금지: 건수/통계/순위로 요약하라. "GBWS-0000, DBW-0000..." 이런 나열 금지
- BM/고장 현황 질문 → 알람유형(alarm 필드) TOP3 우선 표시, 그 다음 라인별 건수
- 원인 질문 → 알람유형으로 서머리 (alarm 필드 기준)
업무 용어: BM=고장수리(stage에 BM/고장/긴급), PM=예방점검, TBM=정기점검, ALARM=alarm 필드값, W30등=주차.
마지막 줄: "${cacheStamp}"`;

  const model = allowSlow && !smartBroken ? MODEL_SMART : MODEL_FAST;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 800, system: sys,
      messages: [{
        role: "user",
        content: `[데이터]\n${dataContext}\n\n[질문]\n${utterance}`,
      }],
    }),
    signal: AbortSignal.timeout(allowSlow ? 45000 : 4000),
  });

  if (!r.ok) {
    console.error("analyze error", r.status);
    return "데이터 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }
  const body = await r.json();
  return (body.content ?? []).map((c: any) => c.text ?? "").join("").trim();
}

// ── 웹(대시보드) 전용 ────────────────────────────────────────────────
// 카카오는 950자·마크다운 금지·QuickReply라는 제약이 있지만 웹은 없다.
// 데이터 파이프라인(routeQuery→loadCache→serializeData)은 똑같이 쓰고 답변 규칙만 바꾼다.
async function analyzeForWeb(
  utterance: string,
  dataContext: string,
  screenContext: string,
  cacheStamp: string,
  history: { role: string; content: string }[],
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return "API 키가 설정되지 않았습니다.";

  const sys = `CS Global Team 사내 데이터 분석 AI. 사용자는 웹 대시보드에서 질문하고 있다.
[데이터]는 구글시트 원본(캐시)이고, [화면]은 사용자가 지금 보고 있는 대시보드가 계산한 값이다.

규칙:
- 데이터를 직접 계산해 질문에만 답하라. 추측 금지. 없으면 없다고 말하라.
- 숫자가 [화면]에도 있으면 그 값을 우선 쓴다(사용자가 보고 있는 것과 어긋나면 안 된다).
- 800자 이내. 핵심 숫자는 **굵게**. 목록은 짧게. 표는 쓰지 마라.
- S/N을 길게 나열하지 말고 건수·순위로 요약하라. 단, 특정 설비 1~2대를 물으면 상세히 답하라.
- 근거가 된 기간·사이트 조건을 한 줄로 밝혀라.
업무 용어: BM=고장수리(작업단계 BM), PM=예방점검, TBM=정기점검, ALARM=알람유형, W30 등=주차.
마지막 줄에 "${cacheStamp}"를 붙여라.`;

  const msgs = [
    ...history.slice(-6).map((m) => ({ role: m.role, content: String(m.content).slice(0, 1200) })),
    { role: "user", content: `[데이터]\n${dataContext}\n\n[화면]\n${screenContext}\n\n[질문]\n${utterance}` },
  ];

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL_FAST, max_tokens: 1200, system: sys, messages: msgs }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) { console.error("web analyze error", r.status); return "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."; }
  const body = await r.json();
  return (body.content ?? []).map((c: any) => c.text ?? "").join("").trim();
}

// 브라우저가 보낸 화면 집계(fact pack)를 요약 — 원문 JSON을 통째로 넣으면 토큰만 먹는다
function screenBrief(facts: any[]): string {
  if (!Array.isArray(facts) || !facts.length) return "(없음)";
  const out: string[] = [];
  for (const p of facts.slice(0, 4)) {
    const kpi = (p.kpi ?? []).map((k: any) => `${k.name} ${k.value}${k.sub ? ` (${k.sub})` : ""}`).join(" · ");
    out.push(`${p.title || p.tab}: ${kpi || "-"}${p.filters?.length ? ` | 필터 ${p.filters[0]}` : ""}`);
  }
  return out.join("\n").slice(0, 2000);
}

// 웹 사용자 인증 — 대시보드 로그인(allowed_users 통과자)만
async function webUser(req: Request, svc: any): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
    });
    if (!r.ok) return null;
    const u = await r.json();
    const email = String(u?.email || "").trim().toLowerCase();
    if (!email) return null;
    const { data } = await svc.from("allowed_users").select("email").eq("email", email).maybeSingle();
    return data ? email : null;
  } catch { return null; }
}

// 데이터를 Claude가 읽기 좋게 직렬화
function serializeData(
  datasets: string[],
  cache: Record<string, Cache>,
  filters: any,
  now: Date,
): string {
  const parts: string[] = [];
  const fmtDate = (d: Date | null) => d ? d.toISOString().slice(0, 10) : "-";

  for (const ds of datasets) {
    if (ds === "equipment") {
      let rows = rowsOf(cache, "equipment");
      /* 설비 대수는 「설비상태」로 센다 (v99 · assets/core.js 의 GST.EQ 와 같은 낱말).
         반납·반출대기·반출완료·출하대기는 «아예 안 센다» — 예전에는 그 설비까지 세어
         같은 질문에 챗봇과 대시보드가 다른 숫자를 답했다.
         상태 열이 없는 옛 추출본은 그대로 둔다(업로드 전후로 답이 죽는 구간을 안 만든다). */
      const _hasState = rows.some((r: any) => r.state);
      const _before = rows.length;
      if (_hasState) rows = rows.filter((r: any) => EQ.cls(r.state) !== "out");
      const _dropped = _before - rows.length;
      if (filters?.site) rows = rows.filter((r: any) => grpKey(r) === filters.site || r.fab?.includes(filters.site));
      if (filters?.sn) { const snQ = (filters.sn||'').toUpperCase().replace(/[\s-]/g,''); rows = rows.filter((r: any) => (r.sn||'').toUpperCase().replace(/[\s-]/g,'').includes(snQ) || (r.code||'').toUpperCase().replace(/[\s-]/g,'').includes(snQ)); }
      // 너무 많으면 관련된 것만
      const sample = rows.slice(0, 200);
      parts.push(`[설비 데이터 - ${sample.length}대${rows.length > 200 ? ` (전체 ${rows.length}대 중 200대)` : ""}` +
        (_dropped ? ` · 반출·반납 ${_dropped}대 제외(설비상태 기준)` : _hasState ? "" : " · 설비상태 열 없음(옛 추출본)") + `]\n` +
        sample.map((e: any) =>
          `S/N:${e.sn} CODE:${e.code||"-"} 고객:${e.customer||"-"} FAB:${e.fab||"-"} 층:${e.floor||"-"} Bay:${e.bay||"-"} 공정:${[e.group1,e.group2].filter(Boolean).join("/")||"-"} 상태:${e.state||"-"} 모델:${e.model||"-"} Burner:${e.burner||"-"} TurnOn:${fmtDate(e.turnOn)} 워런티:${e.warranty||"-"}`
        ).join("\n"));
    }

    if (ds === "faults") {
      let rows = rowsOf(cache, "faults");
      // 기간 필터
      if (filters?.periodText) {
        const period = parsePeriod(filters.periodText, now);
        if (period) rows = rows.filter((r: any) => r.start && r.start >= period.from && r.start <= period.to);
      }
      // 사이트 필터: faults에 site/fab 없음 → equipment의 sn→fab 매핑으로 조인
      if (filters?.site && cache["equipment"]) {
        const equip = rowsOf(cache, "equipment");
        const site = filters.site;
        const siteSNs = new Set(
          equip
            .filter((e: any) => (e.fab || "").toUpperCase().startsWith(site.toUpperCase()))
            .map((e: any) => e.sn)
            .filter(Boolean)
        );
        rows = rows.filter((r: any) => siteSNs.has(r.sn));
      }
      if (filters?.sn) rows = rows.filter((r: any) => (r.sn||'').toUpperCase().includes((filters.sn||'').toUpperCase()));
      if (filters?.category) rows = rows.filter((r: any) => r.stage === filters.category || r.category === filters.category);
      if (filters?.group) rows = rows.filter((r: any) => r.group?.includes(filters.group));
      // equipment에서 sn → fab/floor/bay 매핑 (라인 정보 enriching)
      const snToLine: Record<string, {fab:string, floor:string, bay:string}> = {};
      if (cache["equipment"]) {
        for (const e of rowsOf(cache, "equipment")) {
          if (e.sn) snToLine[e.sn] = { fab: e.fab||"", floor: e.floor||"", bay: e.bay||"" };
        }
      }

      // 집계 (라인 정보 포함)
      const snCount: Record<string, number> = {};
      const stageCount: Record<string, number> = {};
      const causeCount: Record<string, number> = {};
      const fabCount: Record<string, number> = {};
      const lineCount: Record<string, number> = {};
      for (const r of rows) {
        if (r.sn) snCount[r.sn] = (snCount[r.sn] || 0) + 1;
        if (r.stage) stageCount[r.stage] = (stageCount[r.stage] || 0) + 1;
        if (r.cause) causeCount[r.cause] = (causeCount[r.cause] || 0) + 1;
        const line = snToLine[r.sn];
        if (line?.fab) fabCount[line.fab] = (fabCount[line.fab] || 0) + 1;
        if (line?.fab && line?.floor) {
          const k = `${line.fab} ${line.floor}층`;
          lineCount[k] = (lineCount[k] || 0) + 1;
        }
      }
      const top = (obj: Record<string,number>, n: number) =>
        Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0,n).map(([k,v]) => `${k}:${v}건`).join(", ");

      const sample = rows.slice(0, 80);
      parts.push(
        `[실적 집계 - 총 ${rows.length}건]\n` +
        `FAB별: ${top(fabCount, 10)}\n` +
        `라인(FAB+층)별: ${top(lineCount, 20)}\n` +
        `S/N별 TOP20: ${top(snCount, 20)}\n` +
        `단계별: ${top(stageCount, 10)}\n` +
        `원인별 TOP20: ${top(causeCount, 20)}\n\n` +
        `[실적 상세 - 최근 ${sample.length}건]\n` +
        sample.map((r: any) => {
          const line = snToLine[r.sn] ?? {};
          return `날짜:${fmtDate(r.start)} S/N:${r.sn||"-"} FAB:${line.fab||"-"} 층:${line.floor||"-"} Bay:${line.bay||"-"} 단계:${r.stage||"-"} 원인:${r.cause||"-"} 공수:${r.manhour||0}h`;
        }).join("\n")
      );
    }

    if (ds === "roster" || ds === "edu") {
      const roster = rowsOf(cache, "roster");
      const idx = buildEduIndex(rowsOf(cache, "edu"));

      const siteFilter = (rows: any[]) =>
        filters?.site ? rows.filter((p: any) => grpKey(p) === filters.site || p.fab === filters.site) : rows;

      // 현장 인원(onsite=true): 라인별 인원수 집계 기준
      const onsite = siteFilter(filterPeople(roster, { ...(filters ?? {}), onsite: true }, now));
      // 전체 인원(onsite=false): 이름/사번 개인 조회 기준
      const allPeople = siteFilter(filterPeople(roster, { ...(filters ?? {}), onsite: false }, now));

      const fmt = (p: any) => {
        const e = idx.of(p) ?? {};
        return `이름:${p.name} 사번:${p.id||"-"} 사이트:${grpKey(p)} 직책:${p.posKo||"-"} 현장:${p.onsite?"O":"-"} 입사:${fmtDate(p.join)} LV1완료:${e.bdate?fmtDate(e.bdate):"-"} LV2완료:${e.vdate?fmtDate(e.vdate):"-"}`;
      };

      parts.push(
        `[현장 인원 - ${onsite.length}명] ← 인원수 집계·라인별 현황은 이 기준\n` +
        onsite.slice(0, 300).map(fmt).join("\n") +
        `\n\n[전체 인원 - ${allPeople.length}명] ← 이름/사번 개인 조회는 여기서\n` +
        allPeople.slice(0, 300).map(fmt).join("\n")
      );
    }

    if (ds === "leave") {
      let rows = rowsOf(cache, "leave");
      // 기간 필터
      if (filters?.periodText) {
        const period = parsePeriod(filters.periodText, now);
        if (period) rows = rows.filter((r: any) => r.start && r.start >= period.from && r.start <= period.to);
      }
      // 사이트 필터: 사원번호로 roster와 조인
      if (filters?.site && cache["roster"]) {
        const roster = rowsOf(cache, "roster");
        const siteEmpIds = new Set(
          roster
            .filter((p: any) => grpKey(p) === filters.site || p.fab === filters.site)
            .map((p: any) => String(p.id || "").trim())
            .filter(Boolean)
        );
        rows = rows.filter((r: any) => siteEmpIds.has(String(r.empId || "").trim()));
      }
      // 사원번호 → 이름 매핑 (표시용)
      const empIdToName: Record<string, string> = {};
      if (cache["roster"]) {
        rowsOf(cache, "roster").forEach((p: any) => {
          if (p.id) empIdToName[String(p.id).trim()] = p.name;
        });
      }
      // 집계 요약
      const leaveByName: Record<string, number> = {};
      const leaveByType: Record<string, number> = {};
      for (const r of rows) {
        const name = empIdToName[String(r.empId||"").trim()] || r.name || "-";
        leaveByName[name] = (leaveByName[name] || 0) + (r.amt || 1);
        if (r.type) leaveByType[r.type] = (leaveByType[r.type] || 0) + 1;
      }
      const topLeave = (obj: Record<string,number>, n: number) =>
        Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0,n).map(([k,v]) => `${k}:${v}일`).join(", ");
      const topType = (obj: Record<string,number>, n: number) =>
        Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0,n).map(([k,v]) => `${k}:${v}건`).join(", ");

      const sample = rows.slice(0, 100);
      parts.push(
        `[휴가 집계 - 총 ${rows.length}건]\n` +
        `인원별 TOP20(일수): ${topLeave(leaveByName, 20)}\n` +
        `유형별: ${topType(leaveByType, 10)}\n\n` +
        `[휴가 상세 - 최근 ${sample.length}건]\n` +
        sample.map((r: any) => {
          const name = empIdToName[String(r.empId||"").trim()] || r.name || "-";
          return `이름:${name} 유형:${r.type||"-"} 시작:${fmtDate(r.start)} 종료:${fmtDate(r.end)} 일수:${r.amt||"-"}`;
        }).join("\n")
      );
    }

    if (ds === "cip") {
      const d = cache.cip?.data ?? {};
      parts.push(`[CIP 데이터]\nF11: ${JSON.stringify(d.F11)}\nF16: ${JSON.stringify(d.F16)}\n전체: ${JSON.stringify(d.전체)}\n잔여TOP: ${JSON.stringify(d.remainTop)}`);
    }
  }

  return parts.join("\n\n");
}

function cacheStampStr(cache: Record<string, Cache>): string {
  const at = stalest(cache);
  if (!at) return "";
  const d = new Date(at);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0"), dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String((d.getUTCHours() + 9) % 24).padStart(2, "0"), mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `· 데이터 ${mm}-${dd} ${hh}:${mi} 기준`;
}

function helpText(): string {
  return "이렇게 물어보세요 😊\n" +
    "· \"DBW-0000\" → 설비 상세 안내\n" +
    "· \"2025년 F16 고장 TOP3 설비는?\"\n" +
    "· \"올해 원인별 고장 분석해줘\"\n" +
    "· \"W30 기준 LV1 미이수자 알려줘\"\n" +
    "· \"F11 CIP 진행률 어때?\"";
}


/* ============================================================
   메뉴 시스템 — API 호출 없이 버튼으로 탐색
   ============================================================ */
type MenuState = {
  phase: "menu";
  step: string;   // "root" | "bm" | "bm_site" | "work" | "cip" | "people"
  filters: Record<string, string>;
  created_at: string;
} | null;

// MenuState는 ConvState와 같은 conv_state 컬럼 사용
// phase로 구분: "clarify" vs "menu"

const SITES = ["F16", "F11", "PSMC", "TSMC", "전체"];

// API 없이 즉시 계산해서 반환
async function handleMenu(
  svc: any,
  botUserKey: string,
  utterance: string,
  menuState: any,
  cache_fn: (keys: string[]) => Promise<Record<string, Cache>>,
  now: Date,
  stamp_fn: (c: Record<string, Cache>) => string,
): Promise<{ payload: unknown } | null> {

  const u = utterance.trim();

  // 루트 메뉴 진입
  const menuEnabled = Deno.env.get("MENU_ENABLED") !== "false";
  if (menuEnabled && (u === "메뉴" || u === "홈" || u === "처음")) {
    await svc.from("kakao_users").update({ conv_state: { phase: "menu", step: "root", filters: {}, created_at: new Date().toISOString() } }).eq("bot_user_key", botUserKey);
    return { payload: quickReply("무엇을 조회할까요?", ["설비정보", "BM", "실적", "CIP", "인원", "직접입력"]) };
  }

  if (!menuState || menuState.phase !== "menu") return null;
  const step = menuState.step;
  const filters = menuState.filters ?? {};

  const saveMenu = async (newStep: string, newFilters: Record<string, string>) => {
    await svc.from("kakao_users").update({
      conv_state: { phase: "menu", step: newStep, filters: newFilters, created_at: new Date().toISOString() }
    }).eq("bot_user_key", botUserKey);
  };
  const clearMenu = async () => {
    await svc.from("kakao_users").update({ conv_state: null }).eq("bot_user_key", botUserKey);
  };

  // ── 루트 메뉴 ──
  if (step === "root") {
    if (u === "설비정보") {
      await saveMenu("equip_sn", {});
      return { payload: simpleText("조회할 설비 S/N 또는 CODE를 입력해주세요. 예) GBWS-0000, DBW-0000, TEVNBX100") };
    }
    if (u === "BM") {
      await saveMenu("bm", {});
      return { payload: quickReply("BM 기간을 선택해주세요.", ["이번주", "지난주", "이번달", "올해", "사이트별", "직접입력"]) };
    }
    if (u === "실적") {
      await saveMenu("work", {});
      return { payload: quickReply("실적 유형을 선택해주세요.", ["PM점검", "설치", "서비스", "전체", "직접입력"]) };
    }
    if (u === "CIP") {
      await saveMenu("cip", {});
      return { payload: quickReply("CIP 사이트를 선택해주세요.", ["F16", "F11", "전체"]) };
    }
    if (u === "인원") {
      await saveMenu("people", {});
      return { payload: quickReply("사이트를 선택해주세요.", ["F16", "F11", "PSMC", "TSMC", "전체"]) };
    }
    if (u === "직접입력") {
      await clearMenu();
      return { payload: simpleText("질문을 자유롭게 입력해주세요.") };
    }
    // 루트에서 알 수 없는 입력 → 메뉴 다시 보여줌
    return { payload: quickReply("무엇을 조회할까요?", ["설비정보", "BM", "실적", "CIP", "인원", "직접입력"]) };
  }

  // ── 설비 S/N 조회 (API 없음) ──
  if (step === "equip_sn") {
    await clearMenu();
    const cache = await cache_fn(["equipment"]);
    const equip = rowsOf(cache, "equipment");
    const q = u.toUpperCase().replace(/[\s-]/g, "");
    const found = equip.filter((e: any) =>
      (e.sn || "").toUpperCase().replace(/[\s-]/g, "").includes(q) ||
      (e.code || "").toUpperCase().replace(/[\s-]/g, "").includes(q)
    );
    const stamp = stamp_fn(cache);
    if (!found.length) return { payload: simpleText(`"${u}" 설비를 찾지 못했어요. S/N 또는 CODE를 다시 확인해주세요.
${stamp}`) };
    const e = found[0];
    const loc = [e.fab, e.floor ? e.floor + "F" : "", e.bay ? "Bay " + e.bay : ""].filter(Boolean).join(" ");
    const proc = [e.group1, e.group2, e.detail1].filter(Boolean).filter((v: any, i: number, a: any[]) => a.indexOf(v) === i).join("/");
    const text = `${e.sn}${e.code ? " (" + e.code + ")" : ""}
위치: ${loc || "-"}${e.location ? " (" + e.location + ")" : ""}
공정: ${proc || "-"}
모델: ${e.model || "-"}${e.burner ? " · Burner " + e.burner : ""} · 챔버 ${e.chambers || "-"}
고객: ${e.customer || "-"} / ${e.country || "-"}
Turn On: ${e.turnOn ? new Date(e.turnOn).toISOString().slice(0,10) : "-"} · 워런티: ${e.warranty || "-"}
${stamp}`;
    return { payload: quickReply(text, ["BM", "메뉴", "직접입력"]) };
  }

  // ── BM 메뉴 ──
  if (step === "bm") {
    if (u === "직접입력") { await clearMenu(); return { payload: simpleText("BM 조회 조건을 자유롭게 입력해주세요.") }; }
    if (u === "사이트별") {
      await saveMenu("bm_site", filters);
      return { payload: quickReply("사이트를 선택해주세요.", ["F16", "F11", "PSMC", "TSMC", "전체"]) };
    }
    // 기간 선택 → 바로 계산
    const periodMap: Record<string, string> = { "이번주": "이번주", "지난주": "지난주", "이번달": "이번달", "올해": "올해" };
    if (periodMap[u]) {
      await clearMenu();
      return null; // Claude에게 넘김 (기간+BM 쿼리)
    }
    return { payload: quickReply("BM 기간을 선택해주세요.", ["이번주", "지난주", "이번달", "올해", "사이트별", "직접입력"]) };
  }

  // ── BM 사이트별 (API 없음) ──
  if (step === "bm_site") {
    await clearMenu();
    const site = u === "전체" ? null : u;
    const cache = await cache_fn(["faults", "equipment"]);
    const equip = (cache.equipment?.data ?? []) as any[];
    const siteSNs = site ? new Set(equip.filter((e: any) => (e.fab || "").toUpperCase().startsWith(site.toUpperCase())).map((e: any) => e.sn)) : null;
    const faults = (cache.faults?.data ?? []) as any[];
    const bm = faults.filter((r: any) => {
      const isBM = ["BM", "고장", "긴급"].some(k => (r.stage || "").includes(k));
      if (!isBM) return false;
      if (siteSNs) return siteSNs.has(r.sn);
      return true;
    });
    // 라인별 집계
    const snToFab: Record<string, string> = {};
    const snToFloor: Record<string, string> = {};
    for (const e of equip) { if (e.sn) { snToFab[e.sn] = e.fab || ""; snToFloor[e.sn] = e.floor || ""; } }
    const lineCount: Record<string, number> = {};
    for (const r of bm) {
      const fab = snToFab[r.sn] || "-";
      const floor = snToFloor[r.sn] || "-";
      const k = `${fab} ${floor}F`;
      lineCount[k] = (lineCount[k] || 0) + 1;
    }
    const topLines = Object.entries(lineCount).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([k,v]) => `${k}: ${v}건`).join("\n");
    const stamp = stamp_fn(cache);
    /* 예전 라벨은 «전체기간»이었다. v97 부터 고장은 캐시가 아니라 조회라 그 말이
       사실이 아니게 됐다 — 실제 범위를 그대로 적는다(조용히 좁아지는 것이 가장 나쁘다). */
    const span = faultsNoteOf(cache).replace(/^\[고장 실적 조회 범위\]\s*/, "") || "전체기간";
    const text = `${site || "전체"} BM 현황 · 총 ${bm.length}건\n(${span})\n\n라인별:\n${topLines || "데이터 없음"}\n${stamp}`;
    return { payload: quickReply(text, ["이번주", "이번달", "올해", "메뉴"]) };
  }

  // ── 실적 메뉴 ──
  if (step === "work") {
    if (u === "직접입력") { await clearMenu(); return { payload: simpleText("실적 조회 조건을 자유롭게 입력해주세요.") }; }
    await clearMenu();
    return null; // Claude에게 넘김
  }

  // ── CIP (API 없음) ──
  if (step === "cip") {
    await clearMenu();
    const cache = await cache_fn(["cip"]);
    const d = cache.cip?.data ?? {};
    const want = u === "F11" ? "F11" : u === "F16" ? "F16" : "전체";
    const p = d[want];
    const stamp = stamp_fn(cache);
    if (!p) return { payload: simpleText(`CIP 데이터가 없어요.\n${stamp}`) };
    const top = (d.remainTop ?? []) as {key:string,n:number}[];
    const topStr = top.slice(0,5).map((x: any) => `${x.key}: ${x.n}건`).join("\n");
    const text = `${want} CIP 진행률: ${p.rate}%\n완료 ${p.done} / 대상 ${p.total} / 잔여 ${p.remain}\n\n잔여 TOP5:\n${topStr}\n${stamp}`;
    return { payload: quickReply(text, ["F16", "F11", "전체", "메뉴"]) };
  }

  // ── 인원 (API 없음) ──
  if (step === "people") {
    await clearMenu();
    const cache = await cache_fn(["roster", "edu"]);
    const roster = (cache.roster?.data ?? []) as any[];
    const site = u === "전체" ? null : u;
    const people = roster.filter((p: any) => {
      if (!p.onsite) return false;
      if (site) return (p.fab || "").toUpperCase().startsWith(site.toUpperCase());
      return true;
    });
    const roleCount: Record<string, number> = {};
    for (const p of people) {
      const r = p.role || p.posKo || "기타";
      roleCount[r] = (roleCount[r] || 0) + 1;
    }
    const roleStr = Object.entries(roleCount).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}: ${v}명`).join("\n");
    const stamp = stamp_fn(cache);
    const text = `${site || "전체"} 현장 인원 ${people.length}명\n\n${roleStr}\n${stamp}`;
    return { payload: quickReply(text, ["F16", "F11", "PSMC", "TSMC", "전체", "메뉴"]) };
  }

  return null;
}

/* ============================================================
   6. 라우팅
   ============================================================ */
Deno.serve(async (req) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json" } });
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const url = new URL(req.url);

    // 동기화
    if (url.searchParams.get("op") === "sync") {
      const want = Deno.env.get("SYNC_SECRET");
      if (want && req.headers.get("x-sync-secret") !== want)
        return new Response("forbidden", { status: 403, headers: CORS });
      const only = (url.searchParams.get("key") || "").split(",").map((s) => s.trim()).filter(Boolean);
      const result = await syncAll(svc, new Date(), only);
      /* key=faults 로 불렀는데 조용히 빈 결과를 주면 «돌았는데 안 들어갔다»로 읽힌다.
         왜 안 도는지를 응답에 적는다(v97 — 고장은 캐시하지 않는다). */
      const note = only.includes("faults")
        ? "faults 는 캐시하지 않습니다(v97) — 질문할 때 sheet_wk 를 직접 읽습니다." : undefined;
      return json({ ok: true, took_ms: Date.now() - t0, result, note });
    }

    // ── 웹 대시보드 챗봇 ─────────────────────────────────────────────
    // 카카오와 같은 엔진(bot_cache + routeQuery + serializeData)을 쓰고 출력 형식만 다르다.
    // 카카오 시크릿 검사 앞에 둔다 — 웹은 그 헤더를 갖고 있지 않다.
    if (url.searchParams.get("op") === "web") {
      const email = await webUser(req, svc);
      if (!email) return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

      const wb = await req.json().catch(() => ({} as any));
      const q = String(wb?.q ?? "").trim();
      if (!q) return json({ error: "empty question" });
      const history = Array.isArray(wb?.history)
        ? wb.history.filter((m: any) => m && (m.role === "user" || m.role === "assistant") && m.content) : [];
      const screen = screenBrief(wb?.facts);
      const now = new Date();

      // 1) 어떤 데이터가 필요한지 (웹은 5초 제약이 없어 allowSlow=true)
      const route = await routeQuery(q, null, null, "W" + isoW(now).slice(-2), true);
      // 라우팅이 실패해도 답은 해야 한다 — 실적+설비를 기본으로 깔고 진행
      const action = route?.action ?? "load_data";

      if (action === "chat" && route?.chat_reply) return json({ answer: route.chat_reply });
      // 웹에선 QuickReply가 없으니 역질문도 그냥 문장으로 되묻는다
      if (action === "clarify" && route?.clarify_question) {
        const opts = (route.clarify_options ?? []).filter(Boolean);
        return json({ answer: route.clarify_question + (opts.length ? `\n\n예: ${opts.join(" / ")}` : "") });
      }

      const datasets: string[] = route?.datasets?.length ? route.datasets : ["faults"];
      const cacheKeys = [...new Set([
        ...datasets,
        ...(datasets.includes("edu") || datasets.includes("roster") || datasets.includes("leave") ? ["roster"] : []),
        ...(datasets.includes("faults") ? ["equipment"] : []),
      ])];

      const cache = await loadCacheLive(svc, cacheKeys, route?.filters ?? {}, now);
      if (!Object.keys(cache).length || Object.values(cache).every((c) => !c.data)) {
        (globalThis as any).EdgeRuntime?.waitUntil?.(syncAll(svc, now));
        return json({ answer: "데이터를 처음 불러오는 중입니다. 30초쯤 뒤에 다시 물어봐 주세요." });
      }
      const at = stalest(cache);
      if (at && Date.now() - new Date(at).getTime() > FRESH_MS)
        (globalThis as any).EdgeRuntime?.waitUntil?.(syncAll(svc, now, cacheKeys));

      // 고장 조회 범위(또는 잘림·실패)를 맨 앞에 붙인다 — 근거 없는 숫자를 만들지 않게
      const _fn = faultsNoteOf(cache);
      const dataContext = (_fn ? _fn + "\n\n" : "") + serializeData(datasets, cache, route?.filters ?? {}, now);
      const answer = await analyzeForWeb(q, dataContext, screen, cacheStampStr(cache), history);

      try {
        await svc.from("bot_query_log").insert({
          bot_user_key: "web:" + email, email, utterance: q, intent: route ?? { action }, ok: true,
        });
      } catch (_) { /* 로그 실패는 무시 */ }

      return json({ answer: withFaultNote(answer, cache), datasets, took_ms: Date.now() - t0 });
    }

    // 카카오 웹훅
    const sharedSecret = Deno.env.get("KAKAO_SHARED_SECRET");
    if (sharedSecret && req.headers.get("x-kakao-secret") !== sharedSecret)
      return new Response("forbidden", { status: 403, headers: CORS });

    const body = await req.json().catch(() => ({}));
    const utterance: string = body?.userRequest?.utterance ?? "";
    const botUserKey: string = body?.userRequest?.user?.id ?? "";
    const callbackUrl: string | undefined = body?.userRequest?.callbackUrl;
    if (!botUserKey) return json(simpleText("사용자 식별에 실패했습니다."));

    const link = await findLink(svc, botUserKey);

    // 인증
    if (!link || link.status !== "verified") {
      const emailMatch = utterance.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      const digits = utterance.replace(/[\s-]/g, "");
      const codeMatch = /^\d{4,10}$/.test(digits) ? digits : null;
      if (link?.status === "awaiting_otp" && codeMatch) {
        const ok = await verifyOtpFor(svc, botUserKey, link.email, codeMatch);
        return json(ok
          ? quickReply("인증 완료! 아래 메뉴에서 선택하거나 직접 입력하세요 😊", ["설비정보", "BM", "실적", "CIP", "인원", "직접입력"])
          : simpleText("코드가 올바르지 않거나 만료되었습니다. 이메일을 다시 보내 새 코드를 받아주세요."));
      }
      if (emailMatch) {
        const err = await sendOtpFor(svc, botUserKey, emailMatch[0]);
        return json(simpleText(err ?? "인증코드를 이메일로 보내드렸습니다. 받은 코드를 그대로 보내주세요."));
      }
      return json(simpleText(link?.status === "awaiting_otp"
        ? "이메일로 받은 인증코드를 그대로 보내주세요."
        : "먼저 본인 확인이 필요합니다. 대시보드 로그인에 쓰시는 이메일을 보내주세요."));
    }

    // 맥락
    const CTX_TTL = 30 * 60 * 1000;
    const fresh = link.last_intent_at && (Date.now() - new Date(link.last_intent_at).getTime() < CTX_TTL);
    const lastRoute = fresh && link.last_intent ? link.last_intent : null;
    const convState = await loadConvState(svc, botUserKey);

    const now = new Date();
    const currentWeek = "W" + isoW(now).slice(-2);

    // 역질문 상태에서 사용자 응답 → 원래 발화 복원
    const effectiveUtterance = convState?.phase === "clarify"
      ? `${convState.partial_utterance} / ${utterance}`
      : utterance;

    const respond = async (): Promise<{ payload: unknown }> => {
      // ── 메뉴 시스템 처리 (MENU_ENABLED=true일 때만) ──
      const menuEnabled = Deno.env.get("MENU_ENABLED") !== "false";
      const menuState = menuEnabled && convState?.phase === "menu" ? convState : null;
      const menuResult = await handleMenu(
        svc, botUserKey, utterance, menuState,
        /* 메뉴도 같은 경로를 쓴다 — 여기만 loadCache 로 두면 「BM 사이트별」 만 옛 캐시를
           보게 되고, 그 캐시는 v97 부터 아예 갱신되지 않는다. 메뉴에는 기간 개념이 없어
           기본 창(최근 90일)으로 조회되며, 그 사실은 답변 머리에 붙는다. */
        (keys) => loadCacheLive(svc, keys, {}, now),
        now, cacheStampStr
      );
      if (menuResult) return menuResult;

      // Step 1: 라우팅 (어떤 데이터 필요한지)
      const route = await routeQuery(effectiveUtterance, convState?.phase === "clarify" ? convState : null, lastRoute, currentWeek, !!callbackUrl);

      if (!route) {
        await saveConvState(svc, botUserKey, null);
        return { payload: simpleText("질문 해석에 잠시 실패했습니다. 다시 보내주세요.") };
      }

      // 잡담
      if (route.action === "chat") {
        await saveConvState(svc, botUserKey, null);
        const reply = route.chat_reply ?? "안녕하세요! 아래 메뉴에서 선택하거나 직접 입력해주세요 😊";
        return { payload: quickReply(reply, ["설비정보", "BM", "실적", "CIP", "인원", "직접입력"]) };
      }

      // 역질문
      if (route.action === "clarify") {
        const newState: ConvState = {
          phase: "clarify",
          partial_utterance: utterance,
          clarify_question: route.clarify_question,
          clarify_options: route.clarify_options ?? [],
          created_at: new Date().toISOString(),
        };
        await saveConvState(svc, botUserKey, newState);
        return { payload: quickReply(route.clarify_question, route.clarify_options ?? []) };
      }

      // Step 2: 데이터 로드
      await saveConvState(svc, botUserKey, null);
      const datasets: string[] = route.datasets ?? ["faults"];
      // roster+edu는 항상 같이 로드, leave도 roster 필요 (사이트 필터용)
      const cacheKeys = [...new Set([
        ...datasets,
        ...(datasets.includes("edu") || datasets.includes("roster") || datasets.includes("leave") ? ["roster"] : []),
        ...(datasets.includes("faults") ? ["equipment"] : []),
      ])];

      const cache = await loadCacheLive(svc, cacheKeys, route.filters ?? {}, now);

      if (!Object.keys(cache).length || Object.values(cache).every((c) => !c.data)) {
        (globalThis as any).EdgeRuntime?.waitUntil?.(syncAll(svc, now));
        return { payload: simpleText("데이터를 처음 불러오는 중입니다. 30초쯤 뒤에 다시 물어봐 주세요.") };
      }

      // 낡으면 백그라운드 갱신
      const at = stalest(cache);
      if (at && Date.now() - new Date(at).getTime() > FRESH_MS)
        (globalThis as any).EdgeRuntime?.waitUntil?.(syncAll(svc, now, cacheKeys));

      // Step 3: 데이터 직렬화 (고장 조회 범위를 맨 앞에)
      const _fn = faultsNoteOf(cache);
      const dataContext = (_fn ? _fn + "\n\n" : "") + serializeData(datasets, cache, route.filters ?? {}, now);
      const stamp = cacheStampStr(cache);

      // Step 4: Claude가 직접 분석+답변
      const answer = await analyzeAndAnswer(effectiveUtterance, dataContext, stamp, !!callbackUrl);

      // 맥락 저장
      await svc.from("kakao_users").update({
        last_intent: route, last_intent_at: new Date().toISOString(),
      }).eq("bot_user_key", botUserKey);

      try {
        await svc.from("bot_query_log").insert({
          bot_user_key: botUserKey, email: link.email,
          utterance: effectiveUtterance, intent: route, ok: true,
        });
      } catch (_) { /* 로그 실패는 무시 */ }

      return { payload: simpleText(withFaultNote(answer, cache, KAKAO_MAX)) };
    };

    const pending = respond();
    if (!callbackUrl) {
      const { payload } = await pending;
      return json(payload);
    }

    const left = Math.max(800, 4300 - (Date.now() - t0));
    const budget = new Promise<null>((r) => setTimeout(() => r(null), left));
    const raced = await Promise.race([pending.catch(() => null), budget]);

    if (raced !== null) return json((raced as any).payload);

    (globalThis as any).EdgeRuntime?.waitUntil?.(
      pending
        .then(({ payload }) => postCallback(callbackUrl, payload))
        .catch((e) => postCallback(callbackUrl, simpleText("조회 실패: " + String((e as Error).message).slice(0, 80)))),
    );
    return json(useCallbackBody());

  } catch (e) {
    const m = (e as Error).message ?? "";
    console.error("kakao-bot", m);
    const msg = /abort|timeout/i.test(m) ? "조회가 오래 걸려 중단했습니다. 잠시 후 다시 시도해주세요."
      : /CACHE_READ/.test(m) ? "데이터 저장소를 읽지 못했습니다. 관리자에게 문의해주세요."
      : "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    return new Response(JSON.stringify(simpleText(msg)), { headers: { ...CORS, "Content-Type": "application/json" } });
  }
});