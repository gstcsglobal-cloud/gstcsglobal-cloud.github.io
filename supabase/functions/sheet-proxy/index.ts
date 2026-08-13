// GST 대시보드 시트 리더 — 프로젝트에서 구글시트를 읽는 **유일한** 통로.
//
// 로그인(JWT) 검증 → allowed_users 확인 → 서비스 계정으로 시트를 읽어 CSV로 반환.
//
// ⚠ 왜 바뀌었나 (v78).
//   예전에는 **웹게시(publish to web) CSV**를 받아 넘겼다. 그 URL은 secret에만 두었지만
//   **웹게시 자체에 인증이 없다** — URL만 알면 누구나 전량을 받는다(작업자 실명·고객사·설비 S/N).
//   URL을 숨긴 것은 데이터를 보호한 게 아니라 가려둔 것뿐이었다. 대시보드 로그인과 무관한 뒷문이다.
//   이제 sheet-write와 같은 **서비스 계정(Sheets API v4)** 으로 읽는다. 시트를 비공개로 되돌릴 수 있다.
//
// 여기가 유일한 통로인 이유: 구글 자격증명과 읽기 로직을 세 함수에 복제하면 반드시 갈라진다
// (CLAUDE.md 제2원칙). sheet-sync·kakao-bot은 구글이 아니라 **이 함수**를 부른다.
//
// 호출자 둘:
//   · 브라우저 — Authorization: Bearer <user jwt>   → allowed_users 대조
//   · 서버(sheet-sync·kakao-bot) — x-sync-secret 헤더 → 사용자 없이 통과
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const txt = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { ...CORS, ...extra } });

/* ---------- 허용 gid ---------- */
// 예전에는 `/^\d+$/`만 보고 무엇이든 통과시켰다. 시트에는 대시보드가 안 쓰는 탭도 있으므로
// 실제로 읽는 것만 연다. 새 탭을 쓰려면 여기에 먼저 추가해야 한다.
const ALLOW_GID: Record<string, string> = {
  "646668307": "수선실적",
  "31302669": "자재실적",
  "891608329": "설치현황",
  "2123129719": "CIP F11",
  "1999732389": "CIP F16",
  "0": "교육현황",
  "1213453343": "인원명단",
  "262805841": "휴가현황",
  "1263412805": "All By-Pass",
};

/* ==================================================================
   SPEC-SYNC — 아래 「구글 읽기」 블록은 sheet-write/index.ts 의 같은 이름 함수들과 한 벌이다.
   런타임이 갈라 파일 공유가 안 되고(웹 콘솔은 함수 폴더 밖을 못 읽는다) 복제가 불가피하다.
   한 곳을 고치면 나머지도 같이 고친다. 정본은 sheet-write/index.ts:31~170.
   ================================================================== */
const te = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// 주의: btoa()는 한글에서 InvalidCharacterError를 던진다. 반드시 TextEncoder를 거친다.
const b64urlText = (s: string) => b64url(te.encode(s));

// Supabase secret 입력창은 개행을 넣기 어려워 JSON 그대로("\n" 두 글자) 붙여넣게 된다.
// 실제 개행 / 리터럴 \n / 앞뒤 따옴표 / CRLF 를 모두 받아준다.
function normalizePem(raw: string): string {
  let k = (raw ?? "").trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) k = k.slice(1, -1);
  return k.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body); // 키가 깨졌으면 여기서 InvalidCharacterError
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let TOK: { value: string; exp: number } | null = null; // isolate가 살아있는 동안만 재사용
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (TOK && TOK.exp - 60 > now) return TOK.value;

  const email = Deno.env.get("GS_SA_EMAIL");
  const pem = Deno.env.get("GS_SA_KEY");
  if (!email || !pem) throw new Error("CONFIG: GS_SA_EMAIL / GS_SA_KEY 미설정");

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(normalizePem(pem)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, // = RS256
    false,
    ["sign"],
  );
  const claims = {
    iss: email,
    // 읽기 전용이면 충분하다 — 이 함수는 시트를 절대 쓰지 않는다.
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const input = `${b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64urlText(JSON.stringify(claims))}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, te.encode(input)));

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${input}.${b64url(sig)}`,
    }),
  });
  const t = await r.json();
  if (!r.ok) throw new Error(`TOKEN ${r.status}: ${t.error}/${t.error_description ?? ""}`);
  TOK = { value: t.access_token, exp: now + (t.expires_in ?? 3600) };
  return TOK.value;
}

// GS_SHEET_ID는 편집 주소의 /d/<여기>/edit 부분이다.
// SHEET_PUB_URL의 /d/e/2PACX-... 는 웹게시 토큰이라 API에서 404가 난다 — 가장 흔한 설정 실수.
const API = "https://sheets.googleapis.com/v4/spreadsheets";
async function gs(path: string): Promise<any> {
  const id = Deno.env.get("GS_SHEET_ID");
  if (!id) throw new Error("CONFIG: GS_SHEET_ID 미설정");
  const tok = await accessToken();
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${API}/${id}${path}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (r.status === 429 || r.status === 503) { // 쿼터/일시장애만 재시도
      if (attempt >= 3) throw new Error(`SHEETS ${r.status} quota`);
      await new Promise((s) => setTimeout(s, (2 ** attempt) * 500 + Math.random() * 400));
      continue;
    }
    const body = await r.text();
    if (!r.ok) throw new Error(`SHEETS ${r.status}: ${body.slice(0, 300)}`);
    return body ? JSON.parse(body) : {};
  }
}
// A1 표기: 탭 이름은 항상 홑따옴표로 감싸고 내부 '는 ''로 이스케이프 → 한글·공백·숫자 이름 안전
const a1 = (title: string, range?: string) => `'${title.replace(/'/g, "''")}'` + (range ? `!${range}` : "");
const enc = (r: string) => encodeURIComponent(r);

/* gid → 탭 이름 (values.* 는 gid를 못 받고 탭 제목만 받는다) */
type TabInfo = { title: string; sheetId: number };
let TABS: { at: number; byGid: Record<string, TabInfo> } | null = null;
const TABS_TTL = 10 * 60 * 1000;
async function tabs(force = false): Promise<Record<string, TabInfo>> {
  if (!force && TABS && Date.now() - TABS.at < TABS_TTL) return TABS.byGid;
  // fields 마스크 필수 — 없으면 시트 전체 구조(수십 KB~MB)가 돌아온다
  const meta = await gs("?fields=" + enc("sheets.properties(sheetId,title)"));
  const byGid: Record<string, TabInfo> = {};
  for (const s of meta.sheets ?? []) {
    const p = s.properties;
    byGid[String(p.sheetId)] = { title: p.title, sheetId: p.sheetId };
  }
  TABS = { at: Date.now(), byGid };
  return byGid;
}
async function tabByGid(gid: string): Promise<TabInfo> {
  let t = (await tabs())[gid];
  if (!t) t = (await tabs(true))[gid]; // 탭 이름이 방금 바뀐 경우 1회 강제 갱신
  if (!t) throw new Error(`BAD_GID: ${gid}`);
  return t;
}

// FORMATTED_VALUE = CSV 내보내기와 같은 문자열이라 대시보드의 기존 파싱 로직이 그대로 동작한다.
// UNFORMATTED_VALUE로 바꾸면 날짜가 시리얼 숫자(45000)로 와서 모든 날짜 컬럼이 조용히 깨진다.
async function readTabRows(gid: string): Promise<string[][]> {
  const tab = await tabByGid(gid);
  const r = await gs(
    `/values/${enc(a1(tab.title))}?majorDimension=ROWS` +
      `&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  const raw: string[][] = r.values ?? [];
  const w = raw.reduce((m: number, row: string[]) => Math.max(m, row.length), 0);
  // values.get은 끝쪽 빈 칸을 생략해 행 길이가 들쭉날쭉하다 → CSV처럼 직사각형으로 패딩
  return raw.map((row) => Array.from({ length: w }, (_, i) => (row[i] ?? "").toString()));
}
const toCSV = (rows: string[][]) =>
  rows.map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
/* ================= SPEC-SYNC 끝 ================= */

/* ---------- 폐기 예정 경로 — 웹게시 ----------
   `?via=pub`으로만 탄다. 웹게시를 끄기 전에 두 경로가 같은 값을 내는지 대조하려고 남겨둔 것이다
   (op=selfcheck). 웹게시를 끄면 이 경로는 502를 내고, 그때 이 블록과 SHEET_PUB_URL을 지운다. */
async function readPubCSV(gid: string): Promise<string> {
  const base = Deno.env.get("SHEET_PUB_URL");
  if (!base) throw new Error("SHEET_PUB_URL 미설정 (웹게시를 이미 껐다면 정상이다)");
  const r = await fetch(`${base}?gid=${gid}&single=true&output=csv`);
  if (!r.ok) throw new Error(`SHEET_FETCH ${r.status}`);
  return await r.text();
}

/* ---------- 자기점검 — 웹게시를 끄기 «전에» 두 경로가 같은지 증명한다 ----------
   값은 절대 돌려주지 않는다(실데이터). 열별 SHA-256과 행수만 낸다.
   행수만 맞춰서는 아무것도 증명되지 않는다 — 열이 한 칸 밀려도 행수는 그대로다. */
async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", te.encode(s));
  return b64url(new Uint8Array(d)).slice(0, 12);
}
function parseCSV(text: string): string[][] {
  // 큰따옴표 안의 쉼표·개행을 살리는 최소 파서. sheet-sync의 것과 같은 규약.
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
async function colSums(rows: string[][]): Promise<string[]> {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const out: string[] = [];
  for (let c = 0; c < w; c++) out.push(await sha(rows.map((r) => r[c] ?? "").join("")));
  return out;
}
async function selfcheckOne(gid: string) {
  const t0 = Date.now();
  const [apiRows, pubText] = await Promise.all([readTabRows(gid), readPubCSV(gid)]);
  const pubRows = parseCSV(pubText);
  const [ca, cp] = await Promise.all([colSums(apiRows), colSums(pubRows)]);
  const diff: number[] = [];
  for (let i = 0; i < Math.max(ca.length, cp.length); i++) if (ca[i] !== cp[i]) diff.push(i);
  return {
    gid,
    name: ALLOW_GID[gid],
    api: { rows: apiRows.length, cols: ca.length },
    pub: { rows: pubRows.length, cols: cp.length },
    same: diff.length === 0 && apiRows.length === pubRows.length,
    diff_cols: diff.slice(0, 20), // 열 번호만 — 값은 내보내지 않는다
    ms: Date.now() - t0,
  };
}
/* gid를 안 주면 «전부» 돈다. 아홉 개를 사람이 외워 하나씩 넣게 두면 반드시 빠뜨린다.
   한 gid씩 순차로 — 자재실적 3만 행을 두 경로로 동시에 들면 메모리에 걸린다.
   하나가 실패해도 나머지는 계속 본다(전체가 죽으면 어디가 문제인지 못 가른다). */
async function selfcheck(gidParam: string | null) {
  const list = (!gidParam || gidParam === "all")
    ? Object.keys(ALLOW_GID)
    : gidParam.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((g) => !(g in ALLOW_GID));
  if (bad.length) return { error: `gid not allowed: ${bad.join(",")}` };

  const results: unknown[] = [];
  for (const g of list) {
    try { results.push(await selfcheckOne(g)); }
    catch (e) { results.push({ gid: g, name: ALLOW_GID[g], error: String((e as Error).message).slice(0, 160) }); }
  }
  const same = results.filter((r: any) => r.same).length;
  return {
    checked: results.length,
    same_count: same,
    all_same: same === results.length,
    // 한눈에 볼 줄 — 여기만 보고도 판정된다
    summary: results.map((r: any) => `${r.same ? "OK  " : r.error ? "ERR " : "DIFF"} ${r.gid} ${r.name}`),
    results,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);

    /* ---- 인증. 서버 호출(sheet-sync·kakao-bot)은 x-sync-secret 으로 통과 ---- */
    const want = Deno.env.get("SYNC_SECRET");
    const isServer = !!want && req.headers.get("x-sync-secret") === want;
    if (!isServer) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await sb.auth.getUser();
      if (!user?.email) return txt("unauthorized", 401);
      const { data: allowed } = await sb.from("allowed_users")
        .select("email").eq("email", user.email.toLowerCase()).maybeSingle();
      if (!allowed) return txt("forbidden", 403);
    }

    const gidParam = url.searchParams.get("gid");

    // gid를 안 주면 아홉 개 전부 — 사람이 목록을 외우게 두지 않는다
    if (url.searchParams.get("op") === "selfcheck") {
      const out = await selfcheck(gidParam);
      return new Response(JSON.stringify(out, null, 1), {
        status: (out as any).error ? 400 : 200,
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const gid = gidParam ?? "0";
    if (!(gid in ALLOW_GID)) return txt(`gid not allowed: ${gid}`, 400);

    const csv = url.searchParams.get("via") === "pub"
      ? await readPubCSV(gid)
      : toCSV(await readTabRows(gid));

    // private — 인증을 통과한 사람에게만 준 응답이므로 공유 캐시에 남기지 않는다.
    return txt(csv, 200, { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, max-age=300" });
  } catch (e) {
    return txt("error: " + (e as Error).message, 500);
  }
});
