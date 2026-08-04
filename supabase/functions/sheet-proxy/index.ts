// GST 대시보드 시트 프록시 (보안 D안)
// 로그인(JWT) 검증 → allowed_users 확인 → 시트 웹게시 CSV를 대신 받아 반환.
// 시트 URL은 secret(SHEET_PUB_URL)에만 존재 — 클라이언트에 노출되지 않음.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.email) return new Response("unauthorized", { status: 401, headers: CORS });

    const { data: allowed } = await sb.from("allowed_users")
      .select("email").eq("email", user.email.toLowerCase()).maybeSingle();
    if (!allowed) return new Response("forbidden", { status: 403, headers: CORS });

    const gid = new URL(req.url).searchParams.get("gid") ?? "0";
    if (!/^\d+$/.test(gid)) return new Response("bad gid", { status: 400, headers: CORS });

    const base = Deno.env.get("SHEET_PUB_URL"); // .../pub 로 끝나는 웹게시 URL
    if (!base) return new Response("SHEET_PUB_URL not set", { status: 500, headers: CORS });
    const r = await fetch(`${base}?gid=${gid}&single=true&output=csv`);
    if (!r.ok) return new Response("sheet fetch " + r.status, { status: 502, headers: CORS });
    const csv = await r.text();
    return new Response(csv, {
      headers: { ...CORS, "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    return new Response("error: " + (e as Error).message, { status: 500, headers: CORS });
  }
});
