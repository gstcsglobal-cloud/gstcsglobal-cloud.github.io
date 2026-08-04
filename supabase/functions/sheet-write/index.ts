// GST 대시보드 시트 쓰기 (sheet-proxy의 짝) — 서비스 계정 + Google Sheets API v4
// v2: 인원명단 + 교육현황 두 탭 · append(신규 인원) · delete(오입력 정리) · 캐스케이드(사번/이름 두 시트 동시 수정)
//
// 읽기는 sheet-proxy(웹게시 CSV, 쿼터 0)가 계속 담당하고, 이 함수는
//   (1) 저장/추가/삭제 — 대시보드에서 고친 값을 실제 구글시트에 반영
//   (2) 재조회        — 저장 직후 최신 값 (웹게시 CSV는 수 분 지연되므로 우회)
// 만 담당한다. 시트 ID와 서비스 계정 키는 secret에만 존재하며 클라이언트로 나가지 않는다.
//
// 안전장치 (인사 데이터를 다루므로 조용한 손상이 가장 위험하다):
//   · 클라이언트는 행 번호를 보내지 못한다 — 서버가 매 요청 키(사번)로 행을 다시 찾는다
//   · 컬럼 문자(A/B/C)를 하드코딩하지 않는다 — 명단은 헤더 텍스트 매칭, 교육현황은
//     3단 헤더라 라벨 행이 없어 고정 인덱스를 쓴다(이 시트의 열 삽입·삭제 금지는
//     이미 전체 시스템의 전제 — 모든 페이지가 위치로 파싱한다)
//   · 행 지문(hash)이 다르면 저장/삭제를 거부한다 — 사람이 시트에서 직접 고친 변경을 덮지 않는다
//   · 사번이 중복이면 추측하지 않고 중단한다 (추가 시에도 중복 사번 거부)
//   · 두 탭을 함께 만지는 동작은 잠금을 사전순으로 선획득한다 — 데드락 불가
//   · valueInputOption은 RAW 고정 — 앞자리 0 소실·로케일 날짜 오해석·수식 인젝션 방지
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS", // sheet-proxy와 달리 POST 필요
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

/* ---------- 1. 서비스 계정 인증 (Web Crypto, 외부 의존성 0) ---------- */
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
    scope: "https://www.googleapis.com/auth/spreadsheets",
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

/* ---------- 2. Sheets API 얇은 래퍼 ---------- */
// GS_SHEET_ID는 편집 주소의 /d/<여기>/edit 부분이다.
// SHEET_PUB_URL의 /d/e/2PACX-... 는 웹게시 토큰이라 API에서 404가 난다 — 가장 흔한 설정 실수.
const API = "https://sheets.googleapis.com/v4/spreadsheets";
async function gs(path: string, init?: RequestInit): Promise<any> {
  const id = Deno.env.get("GS_SHEET_ID");
  if (!id) throw new Error("CONFIG: GS_SHEET_ID 미설정");
  const tok = await accessToken();
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${API}/${id}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
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
const colLetter = (i: number) => { // 0 → A, 25 → Z, 26 → AA
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
};

/* ---------- 3. gid → 탭 이름 (values.* 는 gid를 못 받고 탭 제목만 받는다) ---------- */
type TabInfo = { title: string; sheetId: number; frozenRowCount: number };
let TABS: { at: number; byGid: Record<string, TabInfo> } | null = null;
const TABS_TTL = 10 * 60 * 1000;
async function tabs(force = false): Promise<Record<string, TabInfo>> {
  if (!force && TABS && Date.now() - TABS.at < TABS_TTL) return TABS.byGid;
  // fields 마스크 필수 — 없으면 시트 전체 구조(수십 KB~MB)가 돌아온다
  const meta = await gs("?fields=" + enc("sheets.properties(sheetId,title,gridProperties(frozenRowCount))"));
  const byGid: Record<string, TabInfo> = {};
  for (const s of meta.sheets ?? []) {
    const p = s.properties;
    byGid[String(p.sheetId)] = { title: p.title, sheetId: p.sheetId, frozenRowCount: p.gridProperties?.frozenRowCount ?? 0 };
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

/* ---------- 4. 읽기 (라이브 시트 — 웹게시 지연 없음) ---------- */
// FORMATTED_VALUE = CSV 내보내기와 같은 문자열이라 대시보드의 기존 파싱 로직이 그대로 동작한다.
// UNFORMATTED_VALUE로 바꾸면 날짜가 시리얼 숫자(45000)로 와서 모든 날짜 컬럼이 조용히 깨진다.
async function readTab(gid: string): Promise<{ tab: TabInfo; rows: string[][] }> {
  const tab = await tabByGid(gid);
  const r = await gs(
    `/values/${enc(a1(tab.title))}?majorDimension=ROWS` +
      `&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  const raw: string[][] = r.values ?? [];
  const w = raw.reduce((m: number, row: string[]) => Math.max(m, row.length), 0);
  // values.get은 끝쪽 빈 칸을 생략해 행 길이가 들쭉날쭉하다 → CSV처럼 직사각형으로 패딩
  return { tab, rows: raw.map((row) => Array.from({ length: w }, (_, i) => (row[i] ?? "").toString())) };
}
const toCSV = (rows: string[][]) =>
  rows.map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");

/* ---------- 5. 시트별 스키마 (여기 없는 gid·필드는 아예 쓸 수 없다) ---------- */
// 클라이언트는 논리 필드명(cn/posKo/basic/...)만 보내고, 실제 컬럼 위치는 서버가 정한다:
//   · {match} — 매 요청 헤더 행을 읽어 텍스트로 찾는다 (인원명단: 열 추가·이동에 안전)
//   · {col}   — 고정 인덱스 (교육현황: 3단 헤더라 라벨 행이 없다. 대시보드 parseEdu와 동일 규약)
type Matcher = (h: string) => boolean;
type ColRef = { match: Matcher } | { col: number };
type FieldDef = ColRef & {
  max: number;
  enum?: string[];     // 허용 값 목록 — 대시보드가 정확한 문자열을 요구하는 상태값
  date?: boolean;      // '' 또는 YYYY-MM-DD (실존하는 날짜만)
  notBlank?: boolean;  // ''로 지우기 금지 — 지우면 그 사람이 대시보드에서 사라지는 컬럼
  pattern?: RegExp;    // 사번 형식 등
};
type SheetSchema = {
  ops: string[];                    // 이 탭에서 허용되는 동작
  headerHint: Matcher[];            // 헤더 행을 알아보는 조건 (대시보드 파서와 동일 규칙)
  dataOffset: number;               // 헤더 행 + dataOffset = 첫 데이터 행 (명단 1 · 교육 3: 병합띠 2행)
  // 키 정규화: 시트 사번은 "10908059.0"처럼 저장돼 있고 대시보드는 ".0"을 뗀 값을 보낸다.
  // 양쪽에 같은 정규화를 걸지 않으면 전부 NOT_FOUND가 난다 (hr/index.html normId와 동일).
  normKey: (s: string) => string;
  key: { field: string } & ColRef;
  // 이름 컬럼 — 캐스케이드의 이름 폴백 탐색·이름 전파에 사용.
  // 선택: 실적현황처럼 이름 열이 없고 캐스케이드도 없는 시트가 있다.
  nameRef?: ColRef;
  fields: Record<string, FieldDef>;
  requiredOnAppend?: string[];      // 신규 행에 반드시 있어야 하는 논리 필드 (append를 쓰는 시트만)
  noCol?: ColRef;                   // 'No' 표시열 — 아무 페이지도 읽지 않는다. 사람 가독용으로 max+1 채움
  cascadeTo?: string;               // 이 탭의 사번/이름 변경·추가·삭제를 전파할 상대 gid
  allowDup?: boolean;               // 같은 키가 여러 행일 수 있는 시트(휴가) — append 중복검사 생략
  dateRange?: { start: string; end: string };  // 종료일 >= 시작일 검사 (append)
};
const lc = (s: string) => String(s ?? "").trim().toLowerCase();
// ref가 없으면 -1 — 선택 필드(nameRef)를 가진 스키마에서 TypeError로 죽지 않게 한다.
// (실적현황에 nameRef를 빠뜨려 op=row가 전부 500이 됐던 실제 사고)
const colIdx = (header: string[], ref?: ColRef): number =>
  !ref ? -1 : ("col" in ref ? ref.col : header.map(lc).findIndex(ref.match));

const SCHEMAS: Record<string, SheetSchema> = {
  // 인원명단(인력현황). v2: 차트가 쓰는 컬럼 전부 편집 허용.
  // 사번·이름은 조인 키 — 바꾸면 교육현황 행도 캐스케이드로 함께 고친다(7-5 update 참조).
  // report/index.html은 normId 없이 raw 문자열로 조인하므로 두 시트에 항상 같은
  // 문자열이 쓰여야 한다 → id의 pattern이 공백·".0" 표기를 입구에서 차단한다.
  "1213453343": {
    ops: ["perm", "fresh", "row", "update", "append", "delete"],
    headerHint: [(h) => h === "id", (h) => h.includes("work place")],
    dataOffset: 1,
    normKey: (s) => String(s ?? "").trim().replace(/\.0+$/, ""),
    key: { field: "id", match: (h) => h === "id" },
    nameRef: { match: (h) => h.includes("name") && h.includes("영문") },
    noCol: { match: (h) => h.startsWith("no") },
    cascadeTo: "0",
    requiredOnAppend: ["id", "name", "join"],
    fields: {
      id:     { match: (h) => h === "id", max: 20, notBlank: true, pattern: /^[A-Za-z0-9-]+$/ },
      name:   { match: (h) => h.includes("name") && h.includes("영문"), max: 40, notBlank: true },
      cn:     { match: (h) => h.includes("name") && h.includes("중문"), max: 40 },
      dept:   { match: (h) => h.startsWith("dept"), max: 40 },
      level:  { match: (h) => h.includes("position level"), max: 40 },
      wp:     { match: (h) => h === "work place", max: 60 },
      role:   { match: (h) => h.includes("position role"), max: 60 },
      // 입사일을 비우면 그 사람이 모든 페이지에서 사라진다(파서가 행을 버림) → notBlank
      join:   { match: (h) => h.startsWith("date of entry"), max: 10, date: true, notBlank: true },
      quit:   { match: (h) => h.startsWith("resignation"), max: 10, date: true }, // 비우기 허용 = 퇴사 취소
      org:    { match: (h) => h.includes("조직도"), max: 60 },
      posKo:  { match: (h) => h === "직급", max: 40 },
      duty:   { match: (h) => h.includes("업무"), max: 60 },
      onsite: { match: (h) => h.includes("현장"), max: 1, enum: ["O", ""] },
    },
  },
  // 교육현황. 3단 헤더: 헤더행(hi) → Basic/Veteran 병합띠(hi+1) → 이수여부/시작일/완료일/시간(hi+2) → 데이터(hi+3).
  // 사번(col 3)은 fields에 없다 — 교육 시트의 사번은 캐스케이드 전용이라
  // 클라이언트가 gid 0 update로 두 시트의 조인을 깨뜨릴 수 없다.
  // 상태값 enum은 hr 페이지가 요구하는 정확한 문자열 — 다른 값은 조용히 '미이수'가 되므로 서버에서 거부.
  "0": {
    ops: ["perm", "fresh", "row", "update", "append", "delete"],
    headerHint: [(h) => h === "교육과정", (h) => h === "인원"],
    dataOffset: 3,
    normKey: (s) => String(s ?? "").trim().replace(/\.0+$/, ""),
    key: { field: "id", col: 3 },
    nameRef: { col: 2 },
    noCol: { col: 0 },
    requiredOnAppend: ["name"],
    fields: {
      site:   { col: 1,  max: 40 },
      name:   { col: 2,  max: 40, notBlank: true },
      join:   { col: 4,  max: 10, date: true },
      posKo:  { col: 6,  max: 40 },
      role:   { col: 7,  max: 60 },
      basic:  { col: 8,  max: 10, enum: ["이수완료", "진행중", "비대상", ""] },
      bsdate: { col: 9,  max: 10, date: true },
      bdate:  { col: 10, max: 10, date: true },
      vet:    { col: 12, max: 10, enum: ["이수완료", "진행중", "비대상", ""] },
      vsdate: { col: 13, max: 10, date: true },
      vdate:  { col: 14, max: 10, date: true },
      note:   { col: 16, max: 200 },
    },
  },
  // 휴가현황. 같은 사람이 여러 건을 갖는 시트라 고유 키가 없다 → 입력(append) 전용.
  // 수정·삭제는 구글 시트에서 직접 한다. 대시보드는 시작~종료 구간의 평일을 1일씩 센다.
  "262805841": {
    ops: ["perm", "fresh", "append"],
    headerHint: [(h) => h === "사원번호", (h) => h === "휴가시작일"],
    dataOffset: 1,
    normKey: (s) => String(s ?? "").trim().replace(/\.0+$/, ""),
    key: { field: "empId", match: (h) => h === "사원번호" },
    nameRef: { match: (h) => h === "이름" },
    allowDup: true,
    dateRange: { start: "start", end: "end" },
    requiredOnAppend: ["name", "type", "start", "end"],
    fields: {
      name:  { match: (h) => h === "이름", max: 60, notBlank: true },
      site:  { match: (h) => h === "소속", max: 40 },
      type:  { match: (h) => h === "항목", max: 40, notBlank: true },
      occur: { match: (h) => h === "발생일", max: 10, date: true },
      start: { match: (h) => h === "휴가시작일", max: 10, date: true, notBlank: true },
      stime: { match: (h) => h === "휴가시작시간", max: 8, pattern: /^\d{1,2}:\d{2}(:\d{2})?$/ },
      end:   { match: (h) => h === "휴가종료일", max: 10, date: true, notBlank: true },
      etime: { match: (h) => h === "휴가종료시간", max: 8, pattern: /^\d{1,2}:\d{2}(:\d{2})?$/ },
      amt:   { match: (h) => h === "휴가신청시간", max: 10, pattern: /^\d+(\.\d+)?$/ },
      note:  { match: (h) => h === "비고", max: 100 },
    },
  },
  // 실적현황(작업 실적). 고장 분석의 알람유형(Z)·현상(AA)·원인(AB)·조치(AC) 4개 열만
  // 대시보드에서 채울 수 있게 한다 — 실측 입력률 2%대라 분석이 막혀 있는 열들이다.
  // 키는 실적코드(고유 16,156/16,156 확인). 다른 열은 절대 건드리지 않는다(update 전용,
  // append/delete 불가 — 실적 자체는 기존 시스템에서 생성).
  "646668307": {
    ops: ["perm", "fresh", "row", "update"],
    headerHint: [(h) => h === "실적코드", (h) => h === "작업단계"],
    dataOffset: 1,
    normKey: (s) => String(s ?? "").trim().replace(/\.0+$/, ""),
    key: { field: "rs", match: (h) => h === "실적코드" },
    // nameRef 없음 — 이름 열이 없고 캐스케이드도 없다. scanTab/colIdx가 이 경우를 -1로 처리한다.
    fields: {
      alarm:  { match: (h) => h === "알람유형", max: 80 },
      phenom: { match: (h) => h === "현상",     max: 120 },
      cause:  { match: (h) => h === "원인",     max: 120 },
      action: { match: (h) => h === "조치",     max: 120 },
    },
  },
};

/* ---------- 6. 값 검증 · 행 찾기 · 지문 ---------- */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 값 검증 — 클라이언트를 신뢰하지 않는다. 반환값은 에러 코드(정상이면 null).
function checkVal(def: FieldDef, val: unknown): string | null {
  if (typeof val !== "string") return "bad_value";
  if (def.notBlank && val.trim() === "") return "bad_value";
  if (val.length > def.max) return "too_long";
  if (def.enum && !def.enum.includes(val)) return "bad_value";
  if (def.date && val !== "") {
    if (!DATE_RE.test(val)) return "bad_date";
    const [y, mo, d] = val.split("-").map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d)); // 2026-02-31 같은 비실존일 거부
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "bad_date";
  }
  if (def.pattern && val !== "" && !def.pattern.test(val)) return "bad_value";
  // RAW로 쓰므로 수식이 되진 않지만, 시트를 사람이 열었을 때의 혼동과
  // 나중에 USER_ENTERED로 바뀔 가능성까지 감안해 여기서도 막는다
  if (/^[=+\-@]/.test(val)) return "bad_value";
  return null;
}
// 키 필드가 fields에 없는 스키마(교육현황)에서도 append 시 키 값은 검증해야 한다
const KEY_DEF: FieldDef = { col: -1, max: 20, pattern: /^[A-Za-z0-9-]+$/ };
function defFor(sc: SheetSchema, name: string): FieldDef | null {
  return sc.fields[name] ?? (name === sc.key.field ? KEY_DEF : null);
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", te.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// 구분자를 넣어야 ["A","BC"]와 ["AB","C"]가 다른 지문이 된다
const rowHash = (row: string[]) => sha256hex(row.join(" "));

function headerRowOf(rows: string[][], sc: SheetSchema): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const h = (rows[i] ?? []).map(lc);
    if (sc.headerHint.every((m) => h.some(m))) return i;   // 0-base
  }
  throw new Error("NO_HEADER: 헤더 행을 찾지 못했습니다");
}

// 한 탭을 한 번 읽고 필요한 좌표를 전부 계산한다 — update/append/delete/캐스케이드가 공유
type Scan = { tab: TabInfo; rows: string[][]; header: string[]; hIdx: number; kc: number; nc: number; dataStart: number };
async function scanTab(gid: string, sc: SheetSchema): Promise<Scan> {
  const { tab, rows } = await readTab(gid);
  const hIdx = headerRowOf(rows, sc);
  const header = rows[hIdx] ?? [];
  const kc = colIdx(header, sc.key);
  if (kc < 0) throw new Error("NO_KEY_COL: 키 컬럼을 찾지 못했습니다");
  return { tab, rows, header, hIdx, kc, nc: colIdx(header, sc.nameRef), dataStart: hIdx + sc.dataOffset };
}
function keyHits(s: Scan, sc: SheetSchema, key: string): number[] {
  const want = sc.normKey(key);
  const hits: number[] = [];
  for (let i = s.dataStart; i < s.rows.length; i++) if (sc.normKey(s.rows[i][s.kc] ?? "") === want) hits.push(i);
  return hits;
}
function nameHits(s: Scan, name: string): number[] {
  const want = String(name ?? "").trim().toUpperCase();
  const hits: number[] = [];
  if (!want || s.nc < 0) return hits;
  for (let i = s.dataStart; i < s.rows.length; i++)
    if (String(s.rows[i][s.nc] ?? "").trim().toUpperCase() === want) hits.push(i);
  return hits;
}
type Located = { tab: TabInfo; header: string[]; hIdx: number; rowNo: number; row: string[] };
const atRow = (s: Scan, i: number): Located =>
  ({ tab: s.tab, header: s.header, hIdx: s.hIdx, rowNo: i + 1 /* A1은 1-base */, row: s.rows[i] });
function pick(s: Scan, sc: SheetSchema, key: string): Located {
  const hits = keyHits(s, sc, key);
  if (hits.length === 0) throw new Error(`NOT_FOUND: ${key}`);
  if (hits.length > 1) throw new Error(`DUP_KEY: ${key}`); // 중복 키는 추측하지 않고 중단
  return atRow(s, hits[0]);
}
async function locate(gid: string, sc: SheetSchema, key: string): Promise<Located> {
  return pick(await scanTab(gid, sc), sc, key);
}
// 이름 폴백 탐색 (캐스케이드·교육행 프리필용) — 대시보드 buildPeople의 이름 매칭과 동일 규칙.
// 동명이인(2건 이상)이면 추측하지 않고 null.
function pickByName(s: Scan, name: string): Located | null {
  const hits = nameHits(s, name);
  return hits.length === 1 ? atRow(s, hits[0]) : null;
}
// 상대 탭에서 짝 행 찾기: 키 우선, 없으면 이름 폴백 (hr buildPeople과 동일 순서)
function pickPeer(s: Scan, sc: SheetSchema, key: string, name: string): Located | null {
  const hits = keyHits(s, sc, key);
  if (hits.length === 1) return atRow(s, hits[0]);
  if (hits.length > 1) return null;          // 중복이면 손대지 않는다
  return pickByName(s, name);
}
// 쓰기용 행 찾기: 키 우선, 키가 없으면 이름 폴백 허용 — 교육현황에는 사번이 빈 행이 있을 수 있다
function pickForWrite(s: Scan, sc: SheetSchema, key: string, altName?: string): Located {
  const hits = keyHits(s, sc, key);
  if (hits.length > 1) throw new Error(`DUP_KEY: ${key}`);
  if (hits.length === 1) return atRow(s, hits[0]);
  if (altName) { const p = pickByName(s, altName); if (p) return p; }
  throw new Error(`NOT_FOUND: ${key}`);
}

// 편집 폼에 채울 값 (논리 필드명 → 현재 값)
function fieldsOf(header: string[], row: string[], sc: SheetSchema): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [name, def] of Object.entries(sc.fields)) {
    const ci = colIdx(header, def);
    if (ci >= 0) o[name] = (row[ci] ?? "").trim();
  }
  // 키는 정규화해서 돌려준다 — 대시보드가 화면 전체에서 쓰는 표기와 맞춘다
  const kc = colIdx(header, sc.key);
  if (kc >= 0) o[sc.key.field] = sc.normKey(row[kc] ?? "");
  return o;
}

/* ---------- 7. 쓰기 보조 (append 행 구성 · 삭제 · 잠금 · 감사) ---------- */
// append용 행 구성 — 패딩 폭과 정확히 같은 길이로 만든다.
// 더 넓은 행을 붙이면 readTab의 패딩 폭이 늘어나 기존 모든 행의 지문이 바뀌고,
// 열려 있는 다른 편집 폼들이 전부 가짜 conflict를 맞는다.
function buildRow(s: Scan, sc: SheetSchema, vals: Record<string, string>): string[] {
  const w = s.header.length; // readTab이 전 행을 같은 폭으로 패딩 → 헤더 길이 = 시트 폭
  const row = Array.from({ length: w }, () => "");
  if (sc.noCol) {
    const ni = colIdx(s.header, sc.noCol);
    if (ni >= 0) {
      let mx = 0;
      for (let i = s.dataStart; i < s.rows.length; i++) {
        const n = parseFloat(s.rows[i][ni] ?? "");
        if (isFinite(n) && n > mx) mx = n;
      }
      row[ni] = String(Math.floor(mx) + 1);
    }
  }
  if (vals[sc.key.field] != null && s.kc < w) row[s.kc] = vals[sc.key.field];
  for (const [name, val] of Object.entries(vals)) {
    if (name === sc.key.field) continue;
    const def = sc.fields[name];
    if (!def) continue; // 검증 단계에서 이미 걸렀지만 방어
    const ci = colIdx(s.header, def);
    if (ci >= 0 && ci < w) row[ci] = val;
  }
  return row;
}
// 한 탭에 새 행 추가: 잠금 안에서 중복 검사 → append → 재탐색으로 정본 확보
async function appendOne(gid: string, sc: SheetSchema, vals: Record<string, string>):
  Promise<{ hash: string; fields: Record<string, string>; row: string[] }> {
  const s = await scanTab(gid, sc);
  const keyVal = (vals[sc.key.field] ?? "").trim();
  if (!sc.allowDup) {
    if (keyVal) {
      if (keyHits(s, sc, keyVal).length > 0) throw new Error(`DUP_KEY: ${keyVal}`);
    } else {
      // 사번 없는 추가(드묾)는 이름이 유일해야 한다 — 아니면 나중에 행을 다시 찾을 수 없다
      if (nameHits(s, vals.name ?? "").length > 0) throw new Error(`DUP_KEY: ${vals.name}`);
    }
  }
  const row = buildRow(s, sc, vals);
  await gs(`/values/${enc(a1(s.tab.title))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
  if (sc.allowDup) {
    // 같은 사람이 여러 행일 수 있는 시트는 재탐색으로 특정할 수 없다 —
    // 방금 쓴 행을 그대로 정본으로 돌려준다 (지문 없음: 이 시트는 행 수정 자체가 없다)
    return { hash: "", fields: { ...vals }, row };
  }
  const s2 = await scanTab(gid, sc);
  const after = keyVal ? pick(s2, sc, keyVal) : pickByName(s2, vals.name ?? "");
  if (!after) throw new Error(`NOT_FOUND: ${keyVal || vals.name}`);
  return { hash: await rowHash(after.row), fields: fieldsOf(after.header, after.row, sc), row: after.row };
}
// 행 삭제 — 아래 행들은 시트가 자동으로 위로 당긴다. 모든 동작이 매번 키로 행을
// 다시 찾으므로(행 번호를 기억하지 않으므로) 이후 요청은 영향받지 않는다.
async function deleteRow(loc: Located): Promise<void> {
  await gs(`:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId: loc.tab.sheetId, dimension: "ROWS", startIndex: loc.rowNo - 1, endIndex: loc.rowNo },
        },
      }],
    }),
  });
}
// 두 탭을 함께 만지는 동작은 잠금을 사전순으로 선획득 — 어떤 두 요청도 서로 반대
// 순서로 기다릴 수 없으므로 데드락이 불가능하다. 실패 시 이미 쥔 잠금을 풀고 503.
async function acquireLocks(svc: any, gids: string[], email: string, ttl: number): Promise<string[]> {
  const rs = [...new Set(gids)].map((g) => `gid:${g}`).sort();
  const held: string[] = [];
  for (const r of rs) {
    const { data: got } = await svc.rpc("acquire_sheet_lock", { p_resource: r, p_holder: email, p_ttl_sec: ttl });
    if (!got) {
      for (const h of held) {
        try { await svc.rpc("release_sheet_lock", { p_resource: h, p_holder: email }); } catch { /* TTL이 안전망 */ }
      }
      throw new Error("LOCKED");
    }
    held.push(r);
  }
  return held;
}
// 감사 로그 — 실패해도 사용자 응답은 성공으로 둔다(저장은 이미 끝났다)
async function audit(svc: any, gid: string, key: string, op: string,
  before: string[] | null, after: string[] | null, email: string): Promise<void> {
  try {
    await svc.from("sheet_edits").insert({ gid, row_key: key, op, before, after, edited_by: email });
  } catch (e) { console.error("audit", (e as Error).message); }
}
// 내부 에러 → 브라우저용 짧은 코드 (구글 원문에는 시트 ID·SA 이메일이 들어 있어 로그에만 남긴다)
function errCode(e: unknown): { code: string; status: number } {
  const m = (e as Error).message ?? "";
  if (m === "LOCKED") return { code: "locked", status: 503 };
  const known = /^(NOT_FOUND|DUP_KEY|NO_COL|NO_KEY_COL|NO_HEADER|BAD_GID)/.exec(m);
  return known ? { code: known[1].toLowerCase(), status: 400 } : { code: "sheets_error", status: 500 };
}

/* ---------- 8. 라우팅 ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let locks: string[] = [];
  let holder = "";
  let svc: any = null;
  try {
    // 8-1. 인증 3단: 로그인 → 허용목록 → 편집권한
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.email) return json({ error: "unauthorized" }, 401);
    const email = user.email.toLowerCase();
    holder = email;
    const { data: allowed } = await sb.from("allowed_users").select("email,can_write").eq("email", email).maybeSingle();
    if (!allowed) return json({ error: "forbidden" }, 403);

    const url = new URL(req.url);
    const op = url.searchParams.get("op") ?? "perm";
    const gid = url.searchParams.get("gid") ?? "";
    if (!/^\d+$/.test(gid)) return json({ error: "bad_gid" }, 400);
    const sc = SCHEMAS[gid];
    if (!sc || !sc.ops.includes(op)) return json({ error: "op_disabled" }, 400);

    // 8-2. 권한 조회 — Sheets API를 부르지 않으므로 쿼터 0. 편집 버튼 노출 여부 판단용.
    if (op === "perm") return json({ ok: true, email, can_write: !!allowed.can_write });

    // 8-3. 최신 읽기 — 저장 직후 화면 갱신용 (웹게시 CSV 지연 우회)
    if (op === "fresh") {
      const { rows } = await readTab(gid);
      return new Response(toCSV(rows), {
        headers: { ...CORS, "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    // 8-4. 편집 폼 프리필 — 현재 값 + 지문(저장 시 되돌려받아 충돌 판정에 쓴다).
    //      &with=edu 를 붙이면 교육현황의 짝 행도 함께 돌려준다(미등록이면 edu:null).
    if (op === "row") {
      const key = url.searchParams.get("key") ?? "";
      if (!key) return json({ error: "no_key" }, 400);
      const loc = await locate(gid, sc, key);
      const res: Record<string, unknown> = {
        ok: true, hash: await rowHash(loc.row), fields: fieldsOf(loc.header, loc.row, sc),
      };
      if (url.searchParams.get("with") === "edu" && sc.cascadeTo) {
        res.edu = null;
        try {
          const csc = SCHEMAS[sc.cascadeTo];
          const cs = await scanTab(sc.cascadeTo, csc);
          const name = loc.row[colIdx(loc.header, sc.nameRef)] ?? "";
          const eloc = pickPeer(cs, csc, key, name);
          if (eloc) res.edu = { hash: await rowHash(eloc.row), fields: fieldsOf(eloc.header, eloc.row, csc) };
        } catch (e) { console.error("row edu", (e as Error).message); }
      }
      return json(res);
    }

    // 여기서부터는 쓰기 — 편집 권한이 필요하다.
    // 'forbidden'(허용목록에 없음)과 'read_only'(조회만 가능)를 반드시 구분한다.
    // 클라이언트가 read_only에 로그인 만료 화면을 띄우면 조회 사용자의 화면이 통째로 잠긴다.
    if (!allowed.can_write) return json({ error: "read_only" }, 403);
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const body = await req.json().catch(() => ({}));
    svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 공용 검증기: 알 수 없는 필드/형식 오류를 응답으로 바꾼다 (정상이면 null)
    const validateSet = (schema: SheetSchema, vals: Record<string, unknown>, forAppend: boolean): Response | null => {
      for (const [name, val] of Object.entries(vals)) {
        const def = defFor(schema, name);
        if (!def) return json({ error: "field_locked", field: name }, 400);
        const err = checkVal(def, val);
        if (err) return json({ error: err, field: name }, 400);
      }
      if (forAppend) {
        for (const rq of schema.requiredOnAppend ?? []) {
          if (!String((vals as Record<string, string>)[rq] ?? "").trim()) {
            return json({ error: "missing_field", field: rq }, 400);
          }
        }
      }
      return null;
    };

    // 8-5. 저장 — 읽고→검사하고→쓰는 사이를 락으로 막는다.
    //      사번/이름 변경 시 교육현황의 짝 행도 같은 문자열로 캐스케이드한다.
    if (op === "update") {
      // name은 선택 — 사번이 빈 교육현황 행을 고칠 때의 이름 폴백 키
      const { key, name: altName, baseHash, changes } =
        body as { key: string; name?: string; baseHash?: string; changes: Record<string, string> };
      if (!key) return json({ error: "no_key" }, 400);
      if (!changes || typeof changes !== "object" || !Object.keys(changes).length) {
        return json({ error: "no_changes" }, 400);
      }
      for (const name of Object.keys(changes)) {
        if (!sc.fields[name]) return json({ error: "field_locked", field: name }, 400);
      }
      const bad = validateSet(sc, changes, false);
      if (bad) return bad;

      const willCascade = !!sc.cascadeTo && (changes.id != null || changes.name != null);
      locks = await acquireLocks(svc, willCascade ? [gid, sc.cascadeTo!] : [gid], email, willCascade ? 30 : 15);

      const s = await scanTab(gid, sc);
      const loc = pickForWrite(s, sc, key, altName);
      const cur = await rowHash(loc.row);
      // 지문 불일치 = 내가 폼을 연 뒤 누군가(대시보드든 구글시트 UI든) 이 행을 고쳤다.
      // 락으로는 잡을 수 없는 유일한 경로라서 이 검사가 반드시 필요하다.
      if (baseHash && baseHash !== cur) {
        return json({ error: "conflict", hash: cur, fields: fieldsOf(loc.header, loc.row, sc) }, 409);
      }
      // 사번을 바꾼다면 잠금 안에서 중복 검사 (자기 행 제외)
      if (changes.id != null) {
        const dups = keyHits(s, sc, changes.id).filter((i) => i + 1 !== loc.rowNo);
        if (dups.length) return json({ error: "dup_key", field: "id" }, 400);
      }

      const data = Object.entries(changes).map(([name, val]) => {
        const ci = colIdx(loc.header, sc.fields[name]);
        if (ci < 0) throw new Error(`NO_COL: ${name}`);
        return { range: a1(loc.tab.title, `${colLetter(ci)}${loc.rowNo}`), values: [[val]] };
      });
      await gs(`/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data }), // RAW 고정
      });

      const newKey = changes[sc.key.field] ?? key;
      const s2 = await scanTab(gid, sc);
      const after = pickForWrite(s2, sc, newKey, changes.name ?? altName);
      await audit(svc, gid, newKey, "update", loc.row, after.row, email);

      // 캐스케이드 — 교육현황의 사번/이름을 같은 문자열로 맞춘다.
      // cascade.hash가 핵심: 캐스케이드가 교육 행을 바꾸므로 클라이언트가 모달을 열 때 받은
      // 교육 baseHash는 낡아진다. 이 해시가 없으면 사번 변경+교육 수정 동시 저장이 항상 409.
      let cascade: Record<string, unknown> | undefined;
      if (willCascade) {
        cascade = { done: false };
        try {
          const csc = SCHEMAS[sc.cascadeTo!];
          const cs = await scanTab(sc.cascadeTo!, csc);
          const oldName = loc.row[colIdx(loc.header, sc.nameRef)] ?? "";
          const eloc = pickPeer(cs, csc, key /* 구 키로 찾는다 */, oldName);
          if (eloc) {
            const cdata: { range: string; values: string[][] }[] = [];
            if (changes.id != null && cs.kc >= 0) {
              cdata.push({ range: a1(cs.tab.title, `${colLetter(cs.kc)}${eloc.rowNo}`), values: [[changes.id]] });
            }
            if (changes.name != null && cs.nc >= 0) {
              cdata.push({ range: a1(cs.tab.title, `${colLetter(cs.nc)}${eloc.rowNo}`), values: [[changes.name]] });
            }
            if (cdata.length) {
              await gs(`/values:batchUpdate`, {
                method: "POST",
                body: JSON.stringify({ valueInputOption: "RAW", data: cdata }),
              });
              // 잠금을 쥔 채 방금 쓴 값이므로 재조회 없이 로컬 재구성 — API 1회 절약
              const newRow = eloc.row.slice();
              if (changes.id != null && cs.kc >= 0) newRow[cs.kc] = changes.id;
              if (changes.name != null && cs.nc >= 0) newRow[cs.nc] = changes.name;
              await audit(svc, sc.cascadeTo!, newKey, "update", eloc.row, newRow, email);
              cascade = {
                done: true, hash: await rowHash(newRow), fields: fieldsOf(cs.header, newRow, csc),
              };
            } else cascade = { done: true };
          }
          // eloc 없음(미등록/동명중복) → done:false 그대로 — 클라이언트가 안내 표시
        } catch (e) { console.error("cascade", (e as Error).message); }
      }

      return json({
        ok: true, hash: await rowHash(after.row), fields: fieldsOf(after.header, after.row, sc), cascade,
      });
    }

    // 8-6. 신규 행 추가 — 명단 append는 교육현황에도 짝 행을 만든다(같은 사번/이름 문자열).
    //      교육 쪽이 실패해도 명단 행은 되돌리지 않는다(방금 쓴 행을 지우는 쪽이 더 위험).
    //      그 사람은 '미등록'으로 보이고, 편집 모달에서 교육 행을 나중에 만들 수 있다.
    if (op === "append") {
      const flds = (body.fields ?? {}) as Record<string, string>;
      if (!Object.keys(flds).length) return json({ error: "no_changes" }, 400);
      const bad = validateSet(sc, flds, true);
      if (bad) return bad;
      // 기간 검사: 종료일이 시작일보다 앞설 수 없다 (YYYY-MM-DD는 문자열 비교 = 날짜 비교)
      if (sc.dateRange) {
        const d0 = flds[sc.dateRange.start], d1 = flds[sc.dateRange.end];
        if (d0 && d1 && d1 < d0) return json({ error: "bad_value", field: sc.dateRange.end }, 400);
      }

      const toEdu = !!sc.cascadeTo;
      let eduVals: Record<string, string> | null = null;
      if (toEdu) {
        const csc = SCHEMAS[sc.cascadeTo!];
        eduVals = { ...((body.edu ?? {}) as Record<string, string>) };
        eduVals.id = flds.id ?? "";
        eduVals.name = flds.name ?? "";
        if (!eduVals.site) eduVals.site = flds.wp ?? "";
        if (!eduVals.join) eduVals.join = flds.join ?? "";
        if (!eduVals.posKo) eduVals.posKo = flds.posKo ?? "";
        if (!eduVals.role) eduVals.role = flds.role ?? "";
        const bad2 = validateSet(csc, eduVals, true);
        if (bad2) return bad2;
      }

      locks = await acquireLocks(svc, toEdu ? [gid, sc.cascadeTo!] : [gid], email, 30);
      const main = await appendOne(gid, sc, flds);
      await audit(svc, gid, flds[sc.key.field] || flds.name || "", "append", null, main.row, email);

      let edu: Record<string, unknown> | null = null;
      if (toEdu && eduVals) {
        try {
          const e = await appendOne(sc.cascadeTo!, SCHEMAS[sc.cascadeTo!], eduVals);
          await audit(svc, sc.cascadeTo!, eduVals.id || eduVals.name, "append", null, e.row, email);
          edu = { ok: true, hash: e.hash, fields: e.fields };
        } catch (e) {
          console.error("append edu", (e as Error).message);
          edu = { error: errCode(e).code };
        }
      }
      return json({ ok: true, hash: main.hash, fields: main.fields, edu });
    }

    // 8-7. 행 삭제 (오입력 정리용) — baseHash 필수: 마지막으로 본 행과 다르면 지우지 않는다.
    //      명단 삭제는 교육현황의 짝 행도 함께 지운다(cascade:false로 끌 수 있음).
    if (op === "delete") {
      const { key, baseHash, cascade: casc } = body as { key: string; baseHash?: string; cascade?: boolean };
      if (!key) return json({ error: "no_key" }, 400);
      if (!baseHash) return json({ error: "no_hash" }, 400);
      const doCasc = !!sc.cascadeTo && casc !== false;

      locks = await acquireLocks(svc, doCasc ? [gid, sc.cascadeTo!] : [gid], email, 30);
      const s = await scanTab(gid, sc);
      const loc = pick(s, sc, key);
      const cur = await rowHash(loc.row);
      if (baseHash !== cur) {
        return json({ error: "conflict", hash: cur, fields: fieldsOf(loc.header, loc.row, sc) }, 409);
      }
      if (loc.rowNo - 1 < s.dataStart) return json({ error: "bad_value" }, 400); // 헤더 3단 보호(방어)
      await deleteRow(loc);
      await audit(svc, gid, key, "delete", loc.row, null, email);

      const deleted = { main: true, edu: false };
      if (doCasc) {
        try {
          const csc = SCHEMAS[sc.cascadeTo!];
          const cs = await scanTab(sc.cascadeTo!, csc);
          const name = loc.row[colIdx(loc.header, sc.nameRef)] ?? "";
          const eloc = pickPeer(cs, csc, key, name);
          if (eloc && eloc.rowNo - 1 >= cs.dataStart) {
            await deleteRow(eloc);
            await audit(svc, sc.cascadeTo!, key, "delete", eloc.row, null, email);
            deleted.edu = true;
          }
        } catch (e) { console.error("delete cascade", (e as Error).message); }
      }
      return json({ ok: true, deleted });
    }

    return json({ error: "op_disabled" }, 400);
  } catch (e) {
    const m = (e as Error).message ?? "";
    // 구글 원문에는 시트 ID·서비스계정 이메일·range가 들어 있다 → 로그에만 남기고
    // 브라우저에는 짧은 코드만 보낸다.
    console.error("sheet-write", m);
    const { code, status } = errCode(e);
    return json({ error: code }, status);
  } finally {
    if (locks.length && svc) {
      for (const r of locks) {
        try { await svc.rpc("release_sheet_lock", { p_resource: r, p_holder: holder }); }
        catch (e) { console.error("unlock", (e as Error).message); } // TTL이 안전망
      }
    }
  }
});
