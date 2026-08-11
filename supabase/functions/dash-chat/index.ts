// ============================================================
// dash-chat — 대시보드 챗봇 (웹)
//
// 브라우저가 "지금 화면이 계산한 값"(facts)을 함께 보내오면, 그 안에서만 답한다.
// 시트를 다시 읽지 않으므로 답이 대시보드 화면과 어긋날 수 없고, 함수도 가볍다.
//
// 배포:
//   Supabase 대시보드 → Edge Functions → Deploy a new function → 이름 dash-chat
//   아래 내용을 그대로 붙여넣고 Deploy.
// 필요한 Secret:
//   ANTHROPIC_API_KEY  (필수)
//   DASH_CHAT_MODEL    (선택, 기본 claude-sonnet-5)
// SUPABASE_URL / SUPABASE_ANON_KEY 는 플랫폼이 자동 주입한다.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MODEL = Deno.env.get("DASH_CHAT_MODEL") || "claude-sonnet-5";
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";

// 로그인한 사용자만 — 대시보드 로그인 자체가 allowed_users 화이트리스트를 통과한 사람이다.
async function whoami(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || !SB_URL) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SB_ANON } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.email || u?.id || null;
  } catch { return null; }
}

const SYS = `당신은 GST CS Global 반도체 서비스 대시보드의 데이터 어시스턴트입니다.

[절대 규칙]
- 아래 <facts>는 사용자가 지금 보고 있는 대시보드가 방금 계산해 낸 값입니다. 오직 이 안의 숫자만 사용하세요.
- facts에 없는 값은 절대 지어내지 말고 "그 값은 대시보드에 없습니다"라고 말한 뒤,
  어느 탭을 열면 볼 수 있을지 안내하세요(예: 설치 현황 탭).
- 숫자를 임의로 재계산하지 마세요. 합계·비율이 필요하면 facts 안의 값으로만 계산하고, 계산했다면 근거를 한 줄로 밝히세요.
- kpi = 화면의 KPI 카드, series = 최근 구간 추이, groups = 차원별 집계(top은 상위 N개뿐이며 전체가 아님).
- groups의 top은 잘린 목록입니다. "전부"를 물으면 상위 N개만 있다고 밝히세요.

[답변 형식]
- 한국어로, 2~5문장. 표가 필요하면 짧은 목록으로.
- 핵심 숫자는 **굵게**. 어느 탭에서 온 값인지 끝에 짧게 덧붙이세요.
- 사용자가 영어/중국어/일본어로 물으면 그 언어로 답하세요.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!KEY) return json({ error: "ANTHROPIC_API_KEY 미설정" }, 500);

  const user = await whoami(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const q = String(body.q || "").trim();
  if (!q) return json({ error: "empty question" }, 400);

  // 컨텍스트 폭주 방지 — fact 묶음이 커지면 상위 탭만 남긴다
  let facts = Array.isArray(body.facts) ? body.facts : [];
  let packed = JSON.stringify(facts);
  while (packed.length > 90_000 && facts.length > 1) { facts = facts.slice(0, -1); packed = JSON.stringify(facts); }

  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-6)
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 1500) }));

  const messages = [
    ...history,
    { role: "user", content: `<facts>\n${packed}\n</facts>\n\n질문: ${q}` },
  ];

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, system: SYS, messages }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data?.error?.message || `anthropic ${r.status}` }, 502);
    const answer = (data?.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    return json({ answer: answer || "답을 만들지 못했습니다. 다시 물어봐 주세요." });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 502);
  }
});
