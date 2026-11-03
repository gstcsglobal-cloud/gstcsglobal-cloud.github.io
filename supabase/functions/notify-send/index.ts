/* ============================================================================
   notify-send — 알림 발송 (v207 · supabase/setup-33-notify.sql · 관리 화면 /notify/)
   ----------------------------------------------------------------------------
   사용자: 「관리 페이지에서 발송하고자 하는 이메일을 등록하고, 지정된 시각 또는 발송 빈도를 조정 — 막 아무한테나 보내면 안 되니까」
           · 「카톡도 등록 사용자 리스트를 보고 보내는 사람들을 선택해서」.
   길 셋:
     ?op=cron   — 매시 7분 cron(pg_net)이 부른다. sync-kakao-bot 과 같은 비밀(x-sync-secret · SYNC_SECRET)로만 열린다.
     ?op=test   — 관리 화면의 「테스트 · 지금 보내기」. 로그인 토큰 → 허용 사용자 중 관리자 + 쓰기 권한만.
     ?op=event  — 카카오 챗봇 «이벤트 블록»의 스킬. 그 사람의 아직 안 보인 알림(kakao_outbox)을 하나 꺼내 보인다.
   ⚠ kakao-bot 과 따로 둔 이유 — 알림을 챗봇 함수에 넣으면 145KB 를 통째로 다시 배포해야 하고, 카톡 응답 경로까지 함께 바뀐다.
     같은 프로젝트라 비밀(환경 변수)은 함께 쓴다(SYNC_SECRET · KAKAO_SHARED_SECRET · SUPABASE_*).
   ⚠ 판정하지 않는다 — 글은 notify.js 가 «스냅샷(brief_snap) · 조치 사항» 을 옮긴 것뿐이다(brief.js 는 kakao-bot 의 같은 파일 사본 ·
     t-notify 가 바이트 동일을 지킨다).
   ⚠ 비밀(GMAIL_APP_PW · KAKAO_EVENT_KEY)은 로그·응답에 싣지 않는다. 실패는 «까닭 코드»만 남긴다.
   배포: verify_jwt = false (cron · 카카오 · 브라우저를 각자 이 함수가 확인한다).
   ============================================================================ */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isDue, buildMessage, pickSnap } from "./notify.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-kakao-secret, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const KAKAO_MAX = 990;
const clip = (t: string) => (t.length > KAKAO_MAX ? t.slice(0, KAKAO_MAX - 1) + "…" : t);
const quickReply = (text: string, buttons: string[]) => ({
  version: "2.0",
  template: { outputs: [{ simpleText: { text: clip(text) } }],
    quickReplies: buttons.map((b) => ({ label: b, action: "message", messageText: b })) },
});

async function sendMail(to: string, subject: string, text: string, html: string) {
  const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PW");
  if (!user || !pass) throw new Error("no_smtp");
  /* Gmail SMTP 465(SSL) — 엣지펑션은 25·587 을 막는다. 보낼 때만 받는다. */
  const nm: any = await import("npm:nodemailer@6.9.16");
  const tr = (nm.default || nm).createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  await tr.sendMail({ from: `GST CS 대시보드 <${user}>`, to, subject, text, html });
}
/* 카카오 챗봇 이벤트 API — 인증된 사람(bot_user_key)에게 이벤트 블록을 띄운다. 글은 대기함(kakao_outbox)에 넣고,
   블록의 스킬(이 함수 ?op=event)이 꺼내 보인다. 건당 과금(카카오 비즈니스) — 성공 건만. */
async function sendKakao(svc: any, email: string, text: string, subId: number | null) {
  const bot = Deno.env.get("KAKAO_BOT_ID"), key = Deno.env.get("KAKAO_EVENT_KEY");
  const ev = Deno.env.get("KAKAO_EVENT_NAME") || "gst_notify";
  if (!bot || !key) throw new Error("no_kakao");
  const { data: us, error } = await svc.from("kakao_users").select("bot_user_key").eq("status", "verified").eq("email", email.toLowerCase());
  if (error) throw new Error("kakao_lookup");
  const keys = [...new Set((us || []).map((u: any) => u.bot_user_key).filter(Boolean))].slice(0, 100);
  if (!keys.length) throw new Error("kakao_no_user");
  const ins = await svc.from("kakao_outbox").insert(keys.map((k) => ({ bot_user_key: k, sub_id: subId, text })));
  if (ins.error) throw new Error("kakao_outbox");
  const r = await fetch(`https://bot-api.kakao.com/v2/bots/${encodeURIComponent(bot)}/talk`, {
    method: "POST",
    headers: { Authorization: `KakaoAK ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ event: { name: ev, data: { text } }, user: keys.map((id) => ({ type: "botUserKey", id })) }),
    signal: AbortSignal.timeout(15000),
  });
  const b: any = await r.json().catch(() => ({}));
  if (!r.ok || (b && b.status && b.status !== "SUCCESS")) throw new Error("kakao_" + r.status + (b && b.status ? ":" + String(b.status).slice(0, 40) : ""));
  return b && b.taskId ? String(b.taskId) : "";
}
async function notifyOne(svc: any, sub: any, kind: string, by: string, now: Date) {
  const scopes = sub.scope && sub.scope !== "all" ? [sub.scope, "all"] : ["all"];
  const [sn, it] = await Promise.all([
    svc.from("brief_snap").select("scope,as_of,payload,made_at").in("scope", scopes),
    svc.from("action_items").select("id,title,sev,status,op,assignee,due").in("status", ["open", "ack", "doing"]).limit(500),
  ]);
  const snap = pickSnap(sn.data || [], sub.scope || "all");
  const m = buildMessage({ sub, snap, items: it.data || [], now });
  let ok = true, err: string | null = null, extra = "";
  try {
    if (sub.channel === "email") await sendMail(sub.target, (kind === "test" ? "[테스트] " : "") + m.subject, m.text, m.html);
    else extra = await sendKakao(svc, sub.target, m.kakao, sub.id);
  } catch (e) { ok = false; err = String((e as Error).message || e).slice(0, 120); }
  await svc.from("notify_log").insert({ sub_id: sub.id, channel: sub.channel, target: sub.target, kind, ok, error: err,
    summary: m.subject + (extra ? " · task " + extra : ""), who: by });
  if (ok && kind !== "test") await svc.from("notify_subs").update({ last_sent_at: now.toISOString() }).eq("id", sub.id);
  return { id: sub.id, ok, error: err };
}
/* 로그인 토큰 → 허용 사용자 이메일 (kakao-bot webUser 와 같은 방식) */
async function webUser(req: Request, svc: any): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY")! } });
    if (!r.ok) return null;
    const u = await r.json();
    const email = String(u?.email || "").trim().toLowerCase();
    if (!email) return null;
    const { data } = await svc.from("allowed_users").select("email").eq("email", email).maybeSingle();
    return data ? email : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const url = new URL(req.url), op = url.searchParams.get("op");

    /* 정해진 시각 — 비밀이 없으면 아예 닫는다(메일·카톡이 나가는 호출이다) */
    if (op === "cron") {
      const want = Deno.env.get("SYNC_SECRET");
      if (!want || req.headers.get("x-sync-secret") !== want) return new Response("forbidden", { status: 403, headers: CORS });
      const now = new Date();
      const { data: subs, error } = await svc.from("notify_subs").select("*").eq("enabled", true).eq("removed", false);
      if (error) return json({ ok: false, error: "no_table" });
      const due = (subs || []).filter((s: any) => isDue(s, now));
      const sent = [];
      for (const s of due) sent.push(await notifyOne(svc, s, "sched", "cron", now));
      console.log("notify", JSON.stringify({ due: due.length, ok: sent.filter((x) => x.ok).length }));
      return json({ ok: true, took_ms: Date.now() - t0, due: due.length, sent });
    }

    /* 관리 화면의 「테스트 발송」 · 「지금 보내기」 — 관리자 + 쓰기 권한만 */
    if (op === "test") {
      const email = await webUser(req, svc);
      if (!email) return json({ error: "unauthorized" }, 401);
      const { data: me } = await svc.from("allowed_users").select("role,can_write").eq("email", email).maybeSingle();
      if (!me || me.role !== "admin" || !me.can_write) return json({ ok: false, error: "forbidden" });
      const nb = await req.json().catch(() => ({} as any));
      const id = Number(nb?.id), kind = nb?.mode === "now" ? "now" : "test";
      const { data: sub } = await svc.from("notify_subs").select("*").eq("id", id).eq("removed", false).maybeSingle();
      if (!sub) return json({ ok: false, error: "not_found" });
      return json(await notifyOne(svc, sub, kind, email, new Date()));
    }

    /* 카카오 이벤트 블록의 스킬 — 카톡 챗봇 스킬과 같은 비밀 검사(KAKAO_SHARED_SECRET) */
    if (op === "event") {
      const sharedSecret = Deno.env.get("KAKAO_SHARED_SECRET");
      if (sharedSecret && req.headers.get("x-kakao-secret") !== sharedSecret) return new Response("forbidden", { status: 403, headers: CORS });
      const body = await req.json().catch(() => ({} as any));
      const botUserKey: string = body?.userRequest?.user?.id ?? "";
      if (!botUserKey) return json(quickReply("사용자 식별에 실패했습니다.", ["메뉴"]));
      const since = new Date(Date.now() - 3 * 864e5).toISOString();
      const { data: ob } = await svc.from("kakao_outbox").select("id,text").eq("bot_user_key", botUserKey).is("delivered_at", null)
        .gte("created_at", since).order("created_at", { ascending: true }).limit(1);
      const row = ob && ob[0];
      if (!row) return json(quickReply("새 알림이 없습니다.", ["브리핑", "메뉴"]));
      await svc.from("kakao_outbox").update({ delivered_at: new Date().toISOString() }).eq("id", row.id);
      return json(quickReply(row.text, ["브리핑", "메뉴"]));
    }

    return json({ error: "unknown op" }, 400);
  } catch (e) {
    console.log("notify error", String((e as Error).message || e).slice(0, 200));
    return json({ ok: false, error: "server" }, 500);
  }
});
