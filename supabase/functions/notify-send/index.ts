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
import { isDue, buildMessage, pickSnap, hasPages, pptOverdue, PPT_PAGES } from "./notify.js";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

/* 화면 PPT 정기 발송(v209 · setup-34) — PPT 는 GitHub Actions 의 보고서 봇이 만든다(tools/report-run.mjs).
   봇은 비밀번호가 없다: GitHub 가 서명한 OIDC 토큰(이 저장소 · main · report.yml)을 ?op=bot 에 보이면 여기서 서명을 확인하고
   봇 세션을 만들어 준다 — 사람이 어디에도 비밀을 넣지 않는다. 다른 저장소·포크·다른 워크플로의 토큰은 거절한다. */
const GH_REPO = "gstcsglobal-cloud/gstcsglobal-cloud.github.io";
const GH_WF = GH_REPO + "/.github/workflows/report.yml@refs/heads/main";
const GH_JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
async function ghOk(tok: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(tok, GH_JWKS, { issuer: "https://token.actions.githubusercontent.com", audience: "gst-report" });
    if (payload.repository !== GH_REPO) return "repo";
    if (payload.ref !== "refs/heads/main") return "ref";
    if (payload.workflow_ref !== GH_WF) return "workflow";
    if (!["schedule", "workflow_dispatch"].includes(String(payload.event_name))) return "event";
    return null;
  } catch (e) { return "verify:" + String((e as Error).message || e).slice(0, 60); }
}
async function isBot(svc: any, email: string | null) {
  if (!email) return false;
  const { data } = await svc.from("report_bots").select("email").eq("email", email.toLowerCase()).maybeSingle();
  return !!data;
}
/* 받는 사람의 PPT — 그 수신자가 고른 화면 중 이번에 만든(또는 가장 최근에 만든) 것. 메일 첨부로 붙일 바이트를 받는다. */
async function pptFiles(svc: any, sub: any, given: any[] | null) {
  const out: any[] = [];
  for (const pg of (sub.pages || [])) {
    if (!(PPT_PAGES as any)[pg]) continue;
    let f = (given || []).find((x: any) => x.page === pg && x.scope === (sub.scope || "all")) || null;
    if (!f && given) f = { page: pg, scope: sub.scope || "all", ok: false, error: "" };   // 봇·cron — 이번 차례에 만든 것만(옛 PPT 를 새것처럼 보내지 않는다)
    if (!f) {   // 테스트·지금 보내기 — 가장 최근에 만든 그 화면·범위의 파일(8일 안)
      const { data } = await svc.from("report_files").select("page,scope,path,ok,error,made_at").eq("page", pg).eq("scope", sub.scope || "all")
        .eq("ok", true).gte("made_at", new Date(Date.now() - 8 * 864e5).toISOString()).order("made_at", { ascending: false }).limit(1);
      f = (data && data[0]) || { page: pg, scope: sub.scope || "all", ok: false, error: "아직 만든 PPT 가 없습니다 — 다음 정기 실행 때 만듭니다" };
    }
    out.push(f);
  }
  return out;
}

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

async function sendMail(to: string, subject: string, text: string, html: string, attach?: any[]) {
  const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PW");
  if (!user || !pass) throw new Error("no_smtp");
  /* Gmail SMTP 465(SSL) — 엣지펑션은 25·587 을 막는다. 보낼 때만 받는다. */
  const nm: any = await import("npm:nodemailer@6.9.16");
  const tr = (nm.default || nm).createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  await tr.sendMail({ from: `GST CS 대시보드 <${user}>`, to, subject, text, html, attachments: attach && attach.length ? attach : undefined });
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
async function notifyOne(svc: any, sub: any, kind: string, by: string, now: Date, given: any[] | null = null, note = "") {
  const scopes = sub.scope && sub.scope !== "all" ? [sub.scope, "all"] : ["all"];
  const [sn, it] = await Promise.all([
    svc.from("brief_snap").select("scope,as_of,payload,made_at").in("scope", scopes),
    svc.from("action_items").select("id,title,sev,status,op,assignee,due").in("status", ["open", "ack", "doing"]).limit(500),
  ]);
  const snap = pickSnap(sn.data || [], sub.scope || "all");
  const files = hasPages(sub) ? await pptFiles(svc, sub, given) : [];
  files.forEach((f: any) => { if (!f.ok && !f.error) f.error = note || "이번 차례에 만들지 못했습니다"; });
  const m = buildMessage({ sub, snap, items: it.data || [], now, files });
  let ok = true, err: string | null = null, extra = "";
  try {
    if (sub.channel === "email") {
      const att: any[] = [];
      for (const f of files) {
        if (!f.ok || !f.path) continue;
        const dl = await svc.storage.from("reports").download(f.path);
        if (dl.error || !dl.data) { f.ok = false; f.error = "파일을 읽지 못했습니다"; continue; }
        const name = (PPT_PAGES as any)[f.page] + "_" + new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10) + ".pptx";
        att.push({ filename: name, content: new Uint8Array(await dl.data.arrayBuffer()),
          contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      }
      await sendMail(sub.target, (kind === "test" ? "[테스트] " : "") + m.subject, m.text, m.html, att);
      if (files.length) extra = "ppt " + att.length + "/" + files.length;
    }
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
      /* PPT 를 받는 수신자는 봇(report.yml)이 보낸다 — 여기서 먼저 보내면 PPT 없는 메일이 간다.
         봇이 창(6시간) 안에 못 보냈을 때만 글이라도 보내고 «PPT 를 만들지 못했다»고 적는다(조용히 빠지지 않게). */
      const due = (subs || []).filter((s: any) => hasPages(s) ? pptOverdue(s, now) : isDue(s, now));
      const sent = [];
      for (const s of due) sent.push(await notifyOne(svc, s, "sched", "cron", now, [],
        hasPages(s) ? "정해진 시각에 PPT 를 만들지 못했습니다 — 관리자에게 알려 주세요" : ""));
      console.log("notify", JSON.stringify({ due: due.length, ok: sent.filter((x) => x.ok).length }));
      return json({ ok: true, took_ms: Date.now() - t0, due: due.length, sent });
    }

    /* 보고서 봇 세션 — GitHub OIDC 서명 확인 뒤에만. 응답은 세션(그 봇 계정의 토큰)뿐이고 Actions 는 그것을 기록에 찍지 않는다. */
    if (op === "bot") {
      const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const why = tok ? await ghOk(tok) : "no_token";
      if (why) { console.log("bot denied", why); return json({ ok: false, error: "forbidden" }, 403); }
      const { data: b } = await svc.from("report_bots").select("email").order("email").limit(1).maybeSingle();
      if (!b) return json({ ok: false, error: "no_bot" }, 500);
      const gl = await svc.auth.admin.generateLink({ type: "magiclink", email: b.email });
      const th = gl.data?.properties?.hashed_token;
      if (gl.error || !th) return json({ ok: false, error: "link" }, 500);
      const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
      const v = await anon.auth.verifyOtp({ token_hash: th, type: "magiclink" });
      if (v.error || !v.data?.session) return json({ ok: false, error: "session" }, 500);
      return json({ ok: true, session: v.data.session });
    }

    /* 봇이 PPT 를 만든 뒤 — 그 차례의 수신자에게 보낸다. 봇 토큰만(관리자 화면이 부르는 길이 아니다).
       body: { files:[{page,scope,path,ok,error}], subs:[id…], test?:bool } — test 면 마지막 발송 시각을 안 바꾼다. */
    if (op === "report") {
      const email = await webUser(req, svc);
      if (!email || !(await isBot(svc, email))) return json({ error: "unauthorized" }, 401);
      const nb = await req.json().catch(() => ({} as any));
      const ids = (Array.isArray(nb?.subs) ? nb.subs : []).map(Number).filter((x: number) => x > 0).slice(0, 200);
      const files = Array.isArray(nb?.files) ? nb.files.filter((f: any) => f && (PPT_PAGES as any)[f.page]).slice(0, 50) : [];
      if (!ids.length) return json({ ok: true, sent: [] });
      const { data: subs } = await svc.from("notify_subs").select("*").in("id", ids).eq("removed", false).eq("enabled", true);
      const now = new Date(), sent = [];
      for (const s of (subs || [])) sent.push(await notifyOne(svc, s, nb?.test ? "test" : "sched", "report-bot", now, files));
      /* 오래된 PPT 정리(40일) — 저장소가 끝없이 늘지 않게. Storage API 로 지운다(SQL 이 아니다). 실패해도 발송은 그대로다. */
      try {
        const old = new Date(Date.now() - 40 * 864e5).toISOString();
        const { data: ol } = await svc.from("report_files").select("path").lt("made_at", old).not("path", "is", null).limit(200);
        const paths = (ol || []).map((x: any) => x.path).filter(Boolean);
        if (paths.length) await svc.storage.from("reports").remove(paths);
      } catch (_e) { /* 다음 번에 다시 */ }
      console.log("report", JSON.stringify({ subs: sent.length, ok: sent.filter((x) => x.ok).length, files: files.length }));
      return json({ ok: true, sent: sent.map((x) => ({ id: x.id, ok: x.ok, error: x.error })) });
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
