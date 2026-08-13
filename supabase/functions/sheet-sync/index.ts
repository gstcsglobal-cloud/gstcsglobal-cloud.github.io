/* sheet-sync — 구글시트를 미러 표(sheet_wk · sheet_mat · sheet_inst)에 적재한다.
 *
 *   POST/GET  ?op=sync&key=wk        헤더 x-sync-secret: <SYNC_SECRET>
 *             ?op=sync&key=all       셋 다 (느리다 — 아래 주석 참조)
 *             ?op=status             마지막 적재 기록만 조회 (시크릿 필요)
 *
 * Secret: SYNC_SECRET · SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 *   (v78부터 SHEET_PUB_URL은 여기에 필요 없다 — 시트는 sheet-proxy가 서비스 계정으로 읽는다)
 *
 * ── 이 함수에 시트 스펙이 없는 이유 ──────────────────────────────
 * 헤더 이름 → 컬럼 대응은 `sheet_spec` · `sheet_colmap` 표에서 **읽는다**.
 * 여기에 적으면 같은 스펙의 네 번째 사본이 된다
 * (assets/core.js · kakao-bot/hr.js · sheet-write · 그리고 여기).
 * 복제된 것은 반드시 갈라진다 — 그래서 t-sync가 있는 것이다.
 * 두 표는 `supabase/gen-ddl.mjs`가 core.js의 GST.SM.SPEC에서 뽑아 채운다.
 * 시트에 열이 늘면 여기를 고치는 게 아니라 core.js를 고치고 생성기를 다시 돌린다.
 * ────────────────────────────────────────────────────────────
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/* 한 번에 보낼 행 수. 크게 잡으면 jsonb 한 덩이가 커져 메모리에 걸리고,
   작게 잡으면 왕복이 늘어 벽시계에 걸린다. 자재실적 29,675행 기준으로 정한 값이다. */
const BATCH = 1500;

/* ---------- CSV (RFC4180 최소 구현 — 따옴표 안의 콤마/개행 처리) ----------
   kakao-bot/hr.js의 parseCSV와 같은 구현이다. 이건 스펙이 아니라 알고리즘이라
   복제해도 갈라질 여지가 없다(시트가 바뀌어도 CSV 문법은 안 바뀐다). */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* 헤더 전용 정규화. 시트 머리글에는 줄바꿈이 들어 있어(`Scrubber⏎S/N`)
   trim().toLowerCase()로는 정확일치가 원리적으로 불가능하다.
   SPEC-SYNC: 정본은 assets/core.js의 GST.SM.norm — 넷이 문자 단위로 같아야 한다. */
const hnorm = (s: unknown) =>
  String(s ?? "").replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, " ").replace(/[\s.·()[\]{}/\\_-]/g, "").toLowerCase();

type ColMap = { col: string; headers: string[]; optional: boolean; idx: number };

/* ---------- 순수 변환부 ----------
   시트를 실제로 읽고 쓰는 것과 분리해 둔다. 여기가 조용히 틀리는 자리이고,
   분리해 두어야 tests/t-mirror.mjs가 이 코드를 **그대로 떼어다** 실 픽스처로 검증할 수 있다
   (t-sync가 sheet-write에 쓰는 방식과 같다). 사본을 만들어 검증하면 사본만 맞을 뿐이다. */
function planSync(
  spec: { hints: unknown[]; scan?: number },
  cmap: ColMap[],
  csvText: string,
): { hi: number; cmap: ColMap[]; data: string[][]; header: string[] } {
  const rows = parseCSV(csvText);

  /* hints는 [["실적코드"],["자재코드","자재명"]] 꼴 — 바깥 AND, 안쪽 OR. */
  const hints: string[][] = (spec.hints ?? []).map((h: any) => ([] as string[]).concat(h));
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, spec.scan ?? 6); i++) {
    const h = (rows[i] ?? []).map(hnorm);
    if (hints.every((alts) => alts.some((x) => h.indexOf(hnorm(x)) >= 0))) { hi = i; break; }
  }
  if (hi < 0) throw new Error(`NO_HEADER: 힌트 ${JSON.stringify(spec.hints)}가 모두 있는 행이 없다`);

  /* 헤더 이름 → 열번호. 정규화 후 정확일치. 부분일치는 쓰지 않는다
     ('입사일'이 '재입사일'을, 'no'가 'note'를 잡던 사고가 실제로 있었다). */
  const at: Record<string, number[]> = {};
  (rows[hi] ?? []).map(hnorm).forEach((h, i) => { if (h) (at[h] ??= []).push(i); });
  const miss: string[] = [];
  for (const c of cmap) {
    c.idx = -1;
    for (const n of c.headers) {
      const hit = at[hnorm(n)];
      if (hit?.length) { c.idx = hit[0]; break; }
    }
    if (c.idx < 0 && !c.optional) miss.push(`${c.col}[${c.headers.join(" / ")}]`);
  }
  /* 못 찾으면 조용히 넘어가지 않는다. 옛 열 번호로 폴백하는 것이 가장 위험하다 —
     에러 없이 틀린 값이 들어가고, 화면은 멀쩡해 보인다. */
  if (miss.length) throw new Error("NO_COL: " + miss.join(", "));

  /* 데이터 행. 전 칸이 빈 행은 구글시트의 빈 격자일 뿐이라 뺀다 —
     이걸 안 빼면 미러가 시트 격자 크기만큼 부풀어 오른다. */
  const data = rows.slice(hi + 1).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  return { hi, cmap, data, header: (rows[hi] ?? []).map((x) => String(x ?? "")) };
}

/* 한 배치를 DB 행 객체로. 빈 문자열은 null로 눕힌다 — 시트의 빈 칸과 '' 를
   DB에서 구분할 방법이 없고, 구분해봐야 화면이 둘을 똑같이 취급한다.

   `extra` — **SPEC이 모르는 열을 통째로 담는다.** 미러는 원래 «대시보드가 쓰는 열»만
   복사했다(설치현황 111열 중 25열). 시트를 지울 생각이라면 그건 손실이다.
   전체를 다시 담으면 적재 페이로드가 두 배가 되어 자재실적이 타임아웃에 걸리므로,
   **매핑되지 않은 열만** 헤더 이름을 키로 담는다. 손실은 0, 크기는 최소.
   나중에 필요해지면 `extra->>'열이름'`으로 꺼내 정식 열로 승격하면 된다. */
function toRows(data: string[][], cmap: ColMap[], off: number, header: string[] = []) {
  const mapped = new Set(cmap.map((c) => c.idx).filter((i) => i >= 0));
  // 헤더가 빈 열은 담을 이름이 없다 — 값이 있어도 키를 못 만든다. 담지 않고 세어만 둔다.
  const extraCols = header.map((h, i) => ({ i, h: String(h ?? "").trim() }))
    .filter((x) => !mapped.has(x.i) && x.h !== "");
  return data.map((r, i) => {
    const o: Record<string, unknown> = { src_row: off + i };
    for (const c of cmap) {
      const v = c.idx >= 0 ? String(r[c.idx] ?? "") : "";
      o[c.col] = v === "" ? null : v;
    }
    const ex: Record<string, string> = {};
    for (const x of extraCols) {
      const v = String(r[x.i] ?? "").trim();
      if (v !== "") ex[x.h] = v;           // 빈 칸은 넣지 않는다 — jsonb 가 공허하게 커진다
    }
    o.extra = Object.keys(ex).length ? ex : null;
    return o;
  });
}
/* ---------- 순수 변환부 끝 ---------- */

/* 시트는 sheet-proxy를 통해서만 읽는다 (v78).
   예전에는 웹게시 CSV를 직접 받았는데, 웹게시는 인증이 없어 URL만 알면 누구나 전량을 받는다.
   지금은 sheet-proxy가 서비스 계정으로 읽어 준다 — 구글 자격증명이 이 함수에는 없다.
   자격증명과 읽기 로직을 여러 함수에 복제하면 반드시 갈라진다(CLAUDE.md 제2원칙). */
/* 함수 «슬러그»는 표시 이름과 다를 수 있다. 콘솔에서 Deploy a new function 으로 만들면
   quick-responder 같은 기본 이름이 붙고, 나중에 표시 이름만 sheet-proxy 로 바꿔도
   URL 은 그대로다. 실제로 이 프로젝트가 그 상태다 — assets/core.js:163 도 같은 이유로
   두 슬러그를 시도한다. 하나로 박아두면 404 로 적재가 통째로 멎는다. */
const PROXY_SLUGS = (Deno.env.get("SHEET_PROXY_SLUG") ?? "sheet-proxy,quick-responder")
  .split(",").map((s) => s.trim()).filter(Boolean);
let PROXY_OK: string | null = null;   // 한 번 통한 슬러그는 isolate 가 사는 동안 재사용

async function fetchCsv(gid: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const sec = Deno.env.get("SYNC_SECRET");
  if (!url) throw new Error("CONFIG: SUPABASE_URL 미설정");
  if (!sec) throw new Error("CONFIG: SYNC_SECRET 미설정 — sheet-proxy 서버 호출에 필요하다");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let last = "";
  for (const slug of (PROXY_OK ? [PROXY_OK] : PROXY_SLUGS)) {
    const r = await fetch(`${url}/functions/v1/${slug}?gid=${gid}`, {
      // Authorization은 플랫폼 JWT 게이트용이고, 실제 권한 판정은 x-sync-secret이 한다.
      headers: { Authorization: `Bearer ${key}`, "x-sync-secret": sec },
      signal: AbortSignal.timeout(90000), // API 읽기는 웹게시 CSV보다 느리다 (자재실적 3만행)
    });
    if (r.status === 404) { last = `404 ${slug}`; continue; }   // 그 이름의 함수가 없다 → 다음 후보
    if (!r.ok) throw new Error(`SHEET_FETCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
    PROXY_OK = slug;
    return await r.text();
  }
  throw new Error(`SHEET_PROXY_NOT_FOUND: ${PROXY_SLUGS.join("/")} 중 어느 것도 없다 (${last})`);
}

async function syncOne(svc: any, tbl: string) {
  const t0 = Date.now();
  let gid = "";
  try {
    /* 1. 스펙을 표에서 읽는다 */
    const { data: spec, error: e1 } = await svc.from("sheet_spec")
      .select("gid,hints,scan").eq("tbl", tbl).maybeSingle();
    if (e1) throw new Error("SPEC_READ: " + e1.message);
    if (!spec) throw new Error(`SPEC_MISSING: sheet_spec에 '${tbl}'이 없다 — setup-4-tables.sql을 Run했는가`);
    gid = spec.gid;

    const { data: cmRaw, error: e2 } = await svc.from("sheet_colmap")
      .select("col,headers,optional").eq("tbl", tbl).order("ord");
    if (e2) throw new Error("COLMAP_READ: " + e2.message);
    if (!cmRaw?.length) throw new Error(`COLMAP_MISSING: '${tbl}'의 컬럼 매핑이 비었다`);
    const cmap: ColMap[] = cmRaw.map((c: any) => ({ ...c, idx: -1 }));

    /* 2~4. 시트를 받아 헤더를 해석하고 데이터 행을 고른다 (순수 변환부) */
    const { hi, data, header } = planSync(spec, cmap, await fetchCsv(gid));

    /* 5. 배치 upsert. 키는 시트 행번호(src_row)다 — 실적코드·CODE는 실측상
          빈값과 중복이 있어 키로 못 쓴다(setup-4-tables.sql 상단 주석 참조). */
    for (let off = 0; off < data.length; off += BATCH) {
      const chunk = toRows(data.slice(off, off + BATCH), cmap, off, header);
      const { error } = await svc.rpc("sheet_sync_upsert", { p_tbl: tbl, p_rows: chunk });
      if (error) throw new Error(`UPSERT@${off}: ${error.message}`);
    }

    /* 6. 꼬리 자르기 + 기록. 시트에서 끝 행이 지워지면 미러에는 남아 있다. */
    const { data: fin, error: e3 } = await svc.rpc("sheet_sync_finish", {
      p_tbl: tbl, p_gid: gid, p_sheet_rows: data.length, p_ms: Date.now() - t0, p_err: null,
    });
    if (e3) throw new Error("FINISH: " + e3.message);

    console.log("sync", tbl, JSON.stringify(fin), Date.now() - t0 + "ms");
    return { tbl, ok: true, headerRow: hi, ...(fin as Record<string, unknown>), ms: Date.now() - t0 };
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error("sync fail", tbl, msg);
    /* 실패도 남긴다. 남기지 않으면 "DB가 비었는가, 시트가 비었는가"를 구분할 수 없다.
       실패 시 finish는 꼬리를 자르지 않는다 — 멀쩡한 행이 날아간다. */
    await svc.rpc("sheet_sync_finish", {
      p_tbl: tbl, p_gid: gid, p_sheet_rows: 0, p_ms: Date.now() - t0, p_err: msg,
    }).catch(() => {});
    return { tbl, ok: false, error: msg, ms: Date.now() - t0 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 1),
      { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

  /* 인증은 시크릿 헤더 하나다. 이 함수는 사람이 아니라 pg_cron이 부른다.
     SYNC_SECRET을 안 걸어두면 누구나 적재를 돌릴 수 있으므로 미설정이면 거부한다. */
  const want = Deno.env.get("SYNC_SECRET");
  if (!want) return json({ error: "SYNC_SECRET 미설정" }, 500);
  if (req.headers.get("x-sync-secret") !== want) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const op = url.searchParams.get("op") ?? "sync";
  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (op === "status") {
    const { data, error } = await svc.from("sheet_sync_log").select("*").order("tbl");
    return error ? json({ error: error.message }, 500) : json({ log: data });
  }
  if (op !== "sync") return json({ error: "unknown op: " + op }, 400);

  const key = url.searchParams.get("key") ?? "";
  const ALL = ["wk", "mat", "inst"];
  /* key=all은 셋을 이어서 돈다. 자재실적만 9MB라 무료 요금제 벽시계에 걸릴 수 있으므로
     pg_cron은 표마다 따로, 시각을 어긋나게 걸어 두는 것을 권한다(DEPLOY.md). */
  const keys = key === "all" ? ALL : key.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = keys.filter((k) => !ALL.includes(k));
  if (!keys.length || bad.length) return json({ error: `key는 ${ALL.join("|")}|all — 받은 값: ${key}` }, 400);

  const out = [];
  for (const k of keys) out.push(await syncOne(svc, k));
  return json({ ok: out.every((r: any) => r.ok), result: out }, out.every((r: any) => r.ok) ? 200 : 500);
});
