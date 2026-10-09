-- setup-19-admin-pw.sql — 관리자 «아이디 계정» 비밀번호 변경 (v150 · 사용자 요청)
-- 흐름: 로그인 화면 「관리자 비밀번호 변경」 → 관리자 이메일로 인증코드 받기 → 코드로 로그인 → 새 비밀번호.
-- 이 함수가 서버에서 «다시» 확인하는 것 넷 (화면은 길 안내일 뿐이다):
--   ① 호출자가 allowed_users 의 admin + can_write
--   ② 호출자의 토큰이 «최근 15분 안 이메일 인증코드(otp)»로 받은 것 — 비밀번호로 들어온 세션으로는 못 바꾼다.
--      (그래야 «비밀번호를 아는 사람»이 아니라 «관리자 메일함을 가진 사람»만 바꾼다 — 사용자 확정 보안 기준)
--   ③ 대상은 아이디 계정(@gstcs.view)뿐 — 이메일 계정은 비밀번호가 없다(OTP 로만 들어온다).
--   ④ 대상이 allowed_users 에 있는 계정 — 등록 안 된 계정을 만들거나 건드리지 않는다.
-- 변경 사실(누가·언제·어느 계정)은 sheet_edits 에 남긴다 — 비밀번호 값은 어디에도 남기지 않는다.
-- ⚠ 지우는 문장이 없다 — MCP 로 적용 가능. 다시 Run 해도 안전하다(create or replace).
-- ⚠ 바꾼 계정의 «이미 열린 세션»은 그대로 남는다(토큰 만료까지). 세션까지 끊으려면 Supabase → Authentication →
--    그 사용자 → Sign out(사람이 콘솔에서) — 세션 삭제는 지우는 문장이라 여기 넣지 않았다(v140 확인 창 규약).
create or replace function public.admin_set_pw(p_login text, p_pw text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, auth, pg_temp as $$
declare
  v_me  text := lower(coalesce(auth.jwt()->>'email',''));
  v_amr jsonb := coalesce(auth.jwt()->'amr','[]'::jsonb);
  v_em  text;
  v_uid uuid;
  v_ok  boolean;
begin
  if v_me = '' then return jsonb_build_object('ok',false,'err','login'); end if;
  if not exists (select 1 from public.allowed_users a where lower(a.email)=v_me and a.role='admin' and a.can_write) then
    return jsonb_build_object('ok',false,'err','forbidden');
  end if;
  select exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_amr)='array' then v_amr else '[]'::jsonb end) e
                 where e->>'method' in ('otp','magiclink')
                   and coalesce((e->>'timestamp')::bigint,0) > extract(epoch from now())::bigint - 900)
    into v_ok;
  if not v_ok then return jsonb_build_object('ok',false,'err','need_otp'); end if;
  if p_pw is null or length(p_pw) < 8 then return jsonb_build_object('ok',false,'err','weak'); end if;
  v_em := lower(trim(coalesce(p_login,'')));
  if v_em = '' then return jsonb_build_object('ok',false,'err','not_found'); end if;
  if position('@' in v_em) = 0 then v_em := v_em || '@gstcs.view'; end if;
  if v_em not like '%@gstcs.view' then return jsonb_build_object('ok',false,'err','not_id_account'); end if;
  if not exists (select 1 from public.allowed_users a where lower(a.email)=v_em) then
    return jsonb_build_object('ok',false,'err','not_found');
  end if;
  select u.id into v_uid from auth.users u where lower(u.email)=v_em limit 1;
  if v_uid is null then return jsonb_build_object('ok',false,'err','not_found'); end if;
  update auth.users set encrypted_password = extensions.crypt(p_pw, extensions.gen_salt('bf',10)),
                        updated_at = now()
   where id = v_uid;
  insert into public.sheet_edits(gid,row_key,op,before,after,edited_by,edited_at,tbl)
  values ('auth', v_em, 'pw_change', null, jsonb_build_object('target',v_em), v_me, now(), 'auth.users');
  return jsonb_build_object('ok',true,'login',v_em);
end $$;
revoke all on function public.admin_set_pw(text,text) from public, anon;
grant execute on function public.admin_set_pw(text,text) to authenticated;
