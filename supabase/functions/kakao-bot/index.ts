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
  groupCount, groupAccessor, grpKey,
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
async function fetchCsv(gid: string) {
  const base = Deno.env.get("SHEET_PUB_URL");
  if (!base) throw new Error("CONFIG: SHEET_PUB_URL 미설정");
  const t = Date.now();
  const r = await fetch(`${base}?gid=${gid}&single=true&output=csv`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`SHEET_FETCH ${r.status}`);
  const text = await r.text();
  return { text, bytes: text.length, ms: Date.now() - t };
}

const DIGEST: Record<string, (csv: string, now: Date) => unknown> = {
  roster: (csv) => parseRoster(csv),
  edu: (csv) => parseEdu(csv),
  equipment: (csv) => parseInstall(csv),
  faults: (csv, now) => {
    // ★ v9: 180일 → 730일(2년)로 확대
    const cut = new Date(now); cut.setUTCDate(cut.getUTCDate() - 730);
    return parseFaultRecords(csv).filter((r: any) => r.start && r.start >= cut);
  },
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
  const keys = only?.length ? only : ["roster", "edu", "equipment", "faults", "leave", "cip"];
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
- S/N 목록 나열 금지: 건수/통계/순위로 요약하라. "GBWS-0000, GBWS-5678..." 이런 나열 금지
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
      if (filters?.site) rows = rows.filter((r: any) => grpKey(r) === filters.site || r.fab?.includes(filters.site));
      if (filters?.sn) { const snQ = (filters.sn||'').toUpperCase().replace(/[\s-]/g,''); rows = rows.filter((r: any) => (r.sn||'').toUpperCase().replace(/[\s-]/g,'').includes(snQ) || (r.code||'').toUpperCase().replace(/[\s-]/g,'').includes(snQ)); }
      // 너무 많으면 관련된 것만
      const sample = rows.slice(0, 200);
      parts.push(`[설비 데이터 - ${sample.length}대${rows.length > 200 ? ` (전체 ${rows.length}대 중 200대)` : ""}]\n` +
        sample.map((e: any) =>
          `S/N:${e.sn} CODE:${e.code||"-"} 고객:${e.customer||"-"} FAB:${e.fab||"-"} 층:${e.floor||"-"} Bay:${e.bay||"-"} 공정:${[e.group1,e.group2].filter(Boolean).join("/")||"-"} 모델:${e.model||"-"} Burner:${e.burner||"-"} TurnOn:${fmtDate(e.turnOn)} 워런티:${e.warranty||"-"}`
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
        return `이름:${p.name} 사번:${p.id||"-"} 사이트:${grpKey(p)} 직책:${p.posKo||"-"} 현장:${p.onsite?"O":"-"} 입사:${fmtDate(p.join)} LV1완료:${e.bdate?fmtDate(e.bdate):e.basic||"-"} LV2완료:${e.vdate?fmtDate(e.vdate):e.vet||"-"}`;
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
      return { payload: simpleText("조회할 설비 S/N 또는 CODE를 입력해주세요. 예) GBWS-1536, DBW-0000, TEVNBX100") };
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
    const text = `${site || "전체"} BM 현황 (전체기간) · 총 ${bm.length}건\n\n라인별:\n${topLines || "데이터 없음"}\n${stamp}`;
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
      return json({ ok: true, took_ms: Date.now() - t0, result });
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

      const cache = await loadCache(svc, cacheKeys);
      if (!Object.keys(cache).length || Object.values(cache).every((c) => !c.data)) {
        (globalThis as any).EdgeRuntime?.waitUntil?.(syncAll(svc, now));
        return json({ answer: "데이터를 처음 불러오는 중입니다. 30초쯤 뒤에 다시 물어봐 주세요." });
      }
      const at = stalest(cache);
      if (at && Date.now() - new Date(at).getTime() > FRESH_MS)
        (globalThis as any).EdgeRuntime?.waitUntil?.(syncAll(svc, now, cacheKeys));

      const dataContext = serializeData(datasets, cache, route?.filters ?? {}, now);
      const answer = await analyzeForWeb(q, dataContext, screen, cacheStampStr(cache), history);

      try {
        await svc.from("bot_query_log").insert({
          bot_user_key: "web:" + email, email, utterance: q, intent: route ?? { action }, ok: true,
        });
      } catch (_) { /* 로그 실패는 무시 */ }

      return json({ answer, datasets, took_ms: Date.now() - t0 });
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
        (keys) => loadCache(svc, keys),
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

      const cache = await loadCache(svc, cacheKeys);

      if (!Object.keys(cache).length || Object.values(cache).every((c) => !c.data)) {
        (globalThis as any).EdgeRuntime?.waitUntil?.(syncAll(svc, now));
        return { payload: simpleText("데이터를 처음 불러오는 중입니다. 30초쯤 뒤에 다시 물어봐 주세요.") };
      }

      // 낡으면 백그라운드 갱신
      const at = stalest(cache);
      if (at && Date.now() - new Date(at).getTime() > FRESH_MS)
        (globalThis as any).EdgeRuntime?.waitUntil?.(syncAll(svc, now, cacheKeys));

      // Step 3: 데이터 직렬화
      const dataContext = serializeData(datasets, cache, route.filters ?? {}, now);
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

      return { payload: simpleText(answer) };
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