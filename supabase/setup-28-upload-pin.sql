-- setup-28-upload-pin.sql — «통째 교체» 업로드는 비밀번호로 승인한다 (v184 · 사용자 요청)
-- 사용자: 「다른 사람이 내 계정 쓸 건데 통째 교체 못 하게 · 디폴트는 통째 교체로 하지 말고 ·
--          통째 교체하려면 팝업 창 띄워서 비번 누르면 승인되게 · 비번은 나만 알고 있을 거야」
--
-- 왜 서버인가 — 저장소가 «공개»다. 비밀번호(또는 그 해시)를 화면 코드에 두면 누구나 읽는다.
--   4자리 숫자의 해시는 만 번이면 풀린다. 그래서 해시는 이 표에만 두고, 표는 아무도 못 읽게 막는다
--   (RLS 켜고 정책 없음 + 권한 회수). 맞는지는 upload_pin_check 가 «서버에서» 본다.
-- ⚠ 비밀번호 값은 이 파일·저장소·마이그레이션 이력 어디에도 두지 않는다. 정하거나 바꾸는 한 줄(맨 아래 주석)은
--   SQL Editor 에서 사람이 돌리거나, 마이그레이션 이력에 안 남는 execute_sql 로 넣는다.
--
-- 흐름
--   ① 화면에서 «통째 교체»를 고르면(또는 올리기 직전) 비밀번호 창 → upload_pin_check(번호)
--   ② 맞으면 그 계정에 «승인표»(30분 · 한 번 쓰면 끝)를 남긴다
--   ③ 실제로 표를 비우는 csv_upload_full(표) 가 승인표를 «쓰고» csv_upload_begin 을 부른다
--   ④ csv_upload_begin 은 authenticated 가 직접 못 부르게 실행 권한을 회수한다 — 화면을 우회해 콘솔에서
--      부르는 길도 막힌다. (같은 계정을 쓰는 사람이 막혀야 하므로 «화면만» 막으면 반쪽이다.)
--
-- ⚠ 4자리라 강한 보안은 아니다 — 실수·무단 «통째 교체»를 막는 문이다. 틀리면 5번까지, 그 뒤 15분 잠긴다
--   (같은 계정을 쓰면 잠금도 같이 걸린다). 성공·실패는 sheet_edits 에 남는다(tbl 'upload_pin' — 「변경 이력」에서 보인다).
-- ⚠ 지우는 문장이 없다 — MCP 로 적용 가능. 다시 Run 해도 안전하다.
-- ⚠ setup-8·10·17·23 을 다시 Run 하면 그 파일들이 csv_upload_begin 실행 권한을 authenticated 에 «다시» 준다 —
--   그 뒤에 이 파일을 한 번 더 Run 한다(화면의 비밀번호 창은 그대로 돌지만, 콘솔 우회가 다시 열린다).

/* ---------- 1. 비밀번호 해시 (한 행) · 실패 횟수 · 승인표 ---------- */
create table if not exists public.upload_guard (
  id         int primary key default 1 check (id = 1),
  pin_hash   text,
  updated_at timestamptz not null default now()
);
insert into public.upload_guard(id) values (1) on conflict (id) do nothing;

create table if not exists public.upload_pin_fail (
  email      text primary key,
  n          int not null default 0,
  last_at    timestamptz,
  lock_until timestamptz
);
create table if not exists public.upload_pin_tok (
  email      text primary key,
  until      timestamptz,
  issued_at  timestamptz
);

alter table public.upload_guard    enable row level security;
alter table public.upload_pin_fail enable row level security;
alter table public.upload_pin_tok  enable row level security;
revoke all on public.upload_guard, public.upload_pin_fail, public.upload_pin_tok from public, anon, authenticated;

/* ---------- 2. 확인 ----------
 * 돌려주는 것: {ok:true, until} | {ok:false, err:'login'|'forbidden'|'no_pin'|'locked'|'wrong', left?, until?}
 * 쓰기 권한(can_write)이 있는 계정만 묻는다 — 통째 교체 자체가 쓰기 권한을 요구한다. */
create or replace function public.upload_pin_check(p_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_me   text := lower(coalesce(auth.jwt()->>'email',''));
  v_h    text;
  v_f    public.upload_pin_fail%rowtype;
  v_n    int;
  v_lock timestamptz;
  v_had  boolean;
  v_max  constant int := 5;
  v_ttl  constant interval := interval '30 minutes';
begin
  if v_me = '' then return jsonb_build_object('ok',false,'err','login'); end if;
  if not exists (select 1 from public.allowed_users a where lower(a.email)=v_me and a.can_write) then
    return jsonb_build_object('ok',false,'err','forbidden');
  end if;
  select pin_hash into v_h from public.upload_guard where id = 1;
  if v_h is null or v_h = '' then return jsonb_build_object('ok',false,'err','no_pin'); end if;

  select * into v_f from public.upload_pin_fail where email = v_me for update;
  v_had := found;
  if v_had and v_f.lock_until is not null and v_f.lock_until > now() then
    return jsonb_build_object('ok',false,'err','locked','until',v_f.lock_until);
  end if;

  if extensions.crypt(coalesce(p_pin,''), v_h) = v_h then
    insert into public.upload_pin_fail(email,n,last_at,lock_until) values (v_me,0,now(),null)
      on conflict (email) do update set n = 0, last_at = now(), lock_until = null;
    insert into public.upload_pin_tok(email,until,issued_at) values (v_me, now() + v_ttl, now())
      on conflict (email) do update set until = now() + v_ttl, issued_at = now();
    insert into public.sheet_edits(gid,row_key,op,before,after,edited_by,edited_at,tbl)
    values ('auth', v_me, 'upload_pin', null, jsonb_build_object('ok',true), v_me, now(), 'upload_pin');
    return jsonb_build_object('ok',true,'until',now() + v_ttl);
  end if;

  -- 틀림 — 잠금이 풀린 뒤의 첫 실패는 1부터 다시 센다
  v_n := case when v_had and v_f.lock_until is null then coalesce(v_f.n,0) + 1 else 1 end;
  v_lock := case when v_n >= v_max then now() + interval '15 minutes' else null end;
  insert into public.upload_pin_fail(email,n,last_at,lock_until) values (v_me, v_n, now(), v_lock)
    on conflict (email) do update set n = v_n, last_at = now(), lock_until = v_lock;
  insert into public.sheet_edits(gid,row_key,op,before,after,edited_by,edited_at,tbl)
  values ('auth', v_me, 'upload_pin', null, jsonb_build_object('ok',false,'n',v_n), v_me, now(), 'upload_pin');
  if v_lock is not null then
    return jsonb_build_object('ok',false,'err','locked','until',v_lock);
  end if;
  return jsonb_build_object('ok',false,'err','wrong','left',v_max - v_n);
end $$;
revoke all on function public.upload_pin_check(text) from public, anon;
grant execute on function public.upload_pin_check(text) to authenticated;

/* ---------- 3. 통째 교체 — 승인표를 «쓰고» 비운다 ----------
 * 표를 비우는 일 자체는 csv_upload_begin 그대로다(허용 표·쓰기 권한 판정을 여기 다시 적지 않는다 — 사본 금지).
 * 승인표는 한 번 쓰면 끝이다(until 을 비운다) — 다음 통째 교체는 다시 묻는다.
 * ⚠ 승인표를 쓴 «뒤»에 begin 이 실패하면(권한·허용 표) 트랜잭션째 되돌아가 승인표도 그대로 남는다. */
create or replace function public.csv_upload_full(p_tbl text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_me text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if v_me = '' then raise exception 'login'; end if;
  update public.upload_pin_tok set until = null
   where email = v_me and until is not null and until > now();
  if not found then raise exception 'pin_required'; end if;
  perform public.csv_upload_begin(p_tbl);
end $$;
revoke all on function public.csv_upload_full(text) from public, anon;
grant execute on function public.csv_upload_full(text) to authenticated;

/* ---------- 4. 직접 비우기는 막는다 ----------
 * 화면은 이제 csv_upload_full 만 부른다. 옛 화면(캐시)이 csv_upload_begin 을 직접 부르면 «권한 없음»으로
 * 비우기 «전에» 멈춘다 — 표는 그대로다(새로고침하면 새 화면이 비밀번호를 묻는다). */
revoke execute on function public.csv_upload_begin(text) from public, anon, authenticated;

/* ---------- 비밀번호를 정하거나 바꾸는 한 줄 (값은 저장소에 두지 않는다) ----------
 * update public.upload_guard set pin_hash = extensions.crypt('<새 번호>', extensions.gen_salt('bf',10)), updated_at = now() where id = 1;
 * 잠금을 바로 풀려면:  update public.upload_pin_fail set n = 0, lock_until = null;
 */
