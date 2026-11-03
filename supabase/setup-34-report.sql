-- ============================================================================
-- setup-34 · 화면 PPT 정기 발송 (v209)
-- ----------------------------------------------------------------------------
-- 사용자: 「이메일이랑 카톡으로 PPT 보내기 기능도 정기적으로 · 어떤 페이지를 어떤 일정에 보내는 기능」.
--
-- PPT 는 브라우저만 만든다(차트를 그린 뒤 pptxgenjs · v100·v134). 서버(엣지펑션)는 화면을 못 그린다 —
-- 그래서 GitHub Actions(.github/workflows/report.yml)가 «보고서 봇» 계정으로 그 화면을 헤드리스 브라우저로 열어
-- 사람이 누르는 바로 그 「PPT」 단추(GST._barDo('ppt'))로 파일을 만들고, 비공개 저장소(Storage reports)에 올린 뒤
-- notify-send ?op=report 가 메일(첨부)·카톡(로그인해야 열리는 받기 링크)으로 보낸다.
--
-- ⚠ 보고서 봇은 «비밀번호가 없는» 계정이다 — Actions 는 GitHub 가 서명한 OIDC 토큰(이 저장소 · main · report.yml)을
--   notify-send ?op=bot 에 보이고, 엣지펑션이 그 서명을 확인한 뒤에만 봇 세션을 만들어 준다. 사람이 넣을 비밀이 없다.
-- ⚠ 봇은 조회자(viewer · can_write=false)다 — 화면을 조회자가 보는 그대로 찍는다(관리자 메타가 PPT 에 안 섞인다).
-- ⚠ 지우는 문장이 없다 — MCP 로 적용할 수 있다. 오래된 파일 정리는 엣지펑션이 Storage API 로 한다.
-- 선행: setup-27(_tgt_who) · setup-33(notify_subs · notify_log).
-- ============================================================================

/* ---------- 1. 수신자에 «PPT 로 보낼 화면» ---------- */
alter table public.notify_subs add column if not exists pages text[] not null default '{}'::text[];

/* 보고서 봇 — 이 표에 든 이메일만 봇이다. 정책 없음 = 서버 키·definer 함수만 읽는다. */
create table if not exists public.report_bots(email text primary key check (email = lower(email)));
alter table public.report_bots enable row level security;
revoke all on public.report_bots from anon, authenticated;

/* 만든 PPT 기록 — 언제 · 어느 화면 · 어느 범위 · 어디에 올렸나 · 실패면 까닭. 관리 화면이 «마지막으로 만든 시각»을 보인다. */
create table if not exists public.report_files(
  id       bigint generated always as identity primary key,
  page     text not null,
  scope    text not null,
  slot     text,                         -- 그 발송 차례(KST 'YYYY-MM-DD HH') · 테스트·수동은 null
  path     text,                         -- Storage reports 버킷 안의 경로 · 실패면 null
  bytes    int,
  ok       boolean not null,
  error    text,
  made_at  timestamptz not null default now()
);
create index if not exists report_files_pg on public.report_files(page, scope, made_at desc);
alter table public.report_files enable row level security;
revoke all on public.report_files from anon, authenticated;

/* 봇인가 — Storage 정책이 부른다(정책은 부르는 사람의 권한으로 돈다 → definer + 실행 권한). 참/거짓만 돌려준다. */
create or replace function public.is_report_bot() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.report_bots b where b.email = lower(coalesce(auth.jwt()->>'email','')))
$$;
revoke all on function public.is_report_bot() from public, anon;
grant execute on function public.is_report_bot() to authenticated;

/* 봇이 «무엇을 언제 만들지» 고를 때 읽는다 — 일정 칸만(받는 사람 주소·이름은 안 내보낸다: Actions 기록은 공개다). */
create or replace function public.report_subs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_report_bot() and public._tgt_who() is null then return jsonb_build_object('error','forbidden'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'enabled', s.enabled, 'removed', s.removed, 'freq', s.freq,
            'hour', s.hour, 'dow', s.dow, 'dom', s.dom, 'scope', s.scope, 'pages', s.pages, 'last_sent_at', s.last_sent_at) order by s.id)
          from public.notify_subs s where not s.removed and s.enabled and cardinality(s.pages) > 0), '[]'::jsonb);
end $$;
revoke all on function public.report_subs() from public, anon;
grant execute on function public.report_subs() to authenticated;

/* 만든 파일 기록 — 봇만. 화면 이름은 PPT 를 내보내는 여덟 화면만 받는다(엉뚱한 경로를 기록하지 않게). */
create or replace function public.report_file_add(p_page text, p_scope text, p_slot text, p_path text, p_bytes int, p_ok boolean, p_error text)
returns bigint language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  if not public.is_report_bot() then raise exception 'forbidden'; end if;
  if p_page not in ('report','fault','pm','cip','scrubber','material','tco','hr') then raise exception 'bad_page'; end if;
  if coalesce(p_scope,'') !~ '^(all|r:.+|o:.+)$' then raise exception 'bad_scope'; end if;
  if p_path is not null and (p_path !~ '^[A-Za-z0-9_.\-/]+\.pptx$' or position('..' in p_path) > 0) then raise exception 'bad_path'; end if;
  insert into public.report_files(page, scope, slot, path, bytes, ok, error)
  values (p_page, p_scope, nullif(p_slot,''), p_path, p_bytes, coalesce(p_ok,false), left(p_error, 300))
  returning id into nid;
  return nid;
end $$;
revoke all on function public.report_file_add(text,text,text,text,int,boolean,text) from public, anon;
grant execute on function public.report_file_add(text,text,text,text,int,boolean,text) to authenticated;

/* ---------- 2. 비공개 저장소 — 봇만 올리고, 대시보드 허용 사용자만 받는다 ---------- */
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 52428800,
        array['application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='reports bot write') then
    create policy "reports bot write" on storage.objects for insert to authenticated
      with check (bucket_id = 'reports' and public.is_report_bot());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='reports bot update') then
    create policy "reports bot update" on storage.objects for update to authenticated
      using (bucket_id = 'reports' and public.is_report_bot()) with check (bucket_id = 'reports' and public.is_report_bot());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='reports allowed read') then
    create policy "reports allowed read" on storage.objects for select to authenticated
      using (bucket_id = 'reports' and exists (select 1 from public.allowed_users a where lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))));
  end if;
end $$;

/* ---------- 3. 수신자 저장 — pages(PPT 로 보낼 화면)를 받는다 · PPT 만 보내는 수신자는 kinds 가 비어도 된다 ---------- */
create or replace function public.notify_save(p_id bigint, p_set jsonb, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := public._tgt_who(); cur public.notify_subs; v_ch text; v_tg text; v_now timestamptz := now(); nid bigint; k text;
        v_kinds text[]; v_pages text[];
begin
  if me is null then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' then return jsonb_build_object('ok',false,'error','bad_set'); end if;
  if p_id is not null then
    select * into cur from public.notify_subs where id = p_id and not removed for update;
    if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
    if p_at is null or cur.updated_at <> p_at then return jsonb_build_object('ok',false,'error','conflict','at',cur.updated_at); end if;
  end if;
  v_ch := coalesce(p_set->>'channel', cur.channel);
  v_tg := lower(btrim(coalesce(p_set->>'target', cur.target, '')));
  if v_ch is null or v_ch not in ('email','kakao') then return jsonb_build_object('ok',false,'error','bad_channel'); end if;
  if v_tg !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok',false,'error','bad_target'); end if;
  if v_ch = 'kakao' and not exists (select 1 from public.kakao_users u where lower(u.email) = v_tg and u.status = 'verified') then
    return jsonb_build_object('ok',false,'error','kakao_not_verified'); end if;
  if p_set ? 'freq' and coalesce(p_set->>'freq','') not in ('daily','weekdays','weekly','monthly') then return jsonb_build_object('ok',false,'error','bad_freq'); end if;
  if p_set ? 'hour' and ((p_set->>'hour') !~ '^\d{1,2}$' or (p_set->>'hour')::int > 23) then return jsonb_build_object('ok',false,'error','bad_hour'); end if;
  if p_set ? 'dow' and ((p_set->>'dow') !~ '^\d$' or (p_set->>'dow')::int > 6) then return jsonb_build_object('ok',false,'error','bad_dow'); end if;
  if p_set ? 'dom' and ((p_set->>'dom') !~ '^\d{1,2}$' or (p_set->>'dom')::int not between 1 and 28) then return jsonb_build_object('ok',false,'error','bad_dom'); end if;
  if p_set ? 'scope' and coalesce(p_set->>'scope','') !~ '^(all|r:.+|o:.+)$' then return jsonb_build_object('ok',false,'error','bad_scope'); end if;
  if p_set ? 'kinds' then
    if jsonb_typeof(p_set->'kinds') <> 'array' then return jsonb_build_object('ok',false,'error','bad_kinds'); end if;
    for k in select jsonb_array_elements_text(p_set->'kinds') loop
      if k not in ('brief','actions','mine') then return jsonb_build_object('ok',false,'error','bad_kinds'); end if;
    end loop;
  end if;
  if p_set ? 'pages' then
    if jsonb_typeof(p_set->'pages') <> 'array' then return jsonb_build_object('ok',false,'error','bad_pages'); end if;
    for k in select jsonb_array_elements_text(p_set->'pages') loop
      if k not in ('report','fault','pm','cip','scrubber','material','tco','hr') then return jsonb_build_object('ok',false,'error','bad_pages'); end if;
    end loop;
  end if;
  v_kinds := case when p_set ? 'kinds' then coalesce((select array_agg(distinct x) from jsonb_array_elements_text(p_set->'kinds') x), '{}'::text[])
                  else coalesce(cur.kinds, array['brief','actions']::text[]) end;
  v_pages := case when p_set ? 'pages' then coalesce((select array_agg(distinct x) from jsonb_array_elements_text(p_set->'pages') x), '{}'::text[])
                  else coalesce(cur.pages, '{}'::text[]) end;
  -- 보낼 것이 하나는 있어야 한다(글 · PPT 중 하나)
  if cardinality(v_kinds) = 0 and cardinality(v_pages) = 0 then return jsonb_build_object('ok',false,'error','bad_kinds'); end if;
  begin
    if p_id is null then
      insert into public.notify_subs(channel, target, label, enabled, freq, hour, dow, dom, scope, kinds, pages, created_by, updated_by, updated_at)
      values (v_ch, v_tg, nullif(btrim(coalesce(p_set->>'label','')),''), coalesce((p_set->>'enabled')::boolean, true),
              coalesce(p_set->>'freq','weekly'), coalesce((p_set->>'hour')::int, 8), coalesce((p_set->>'dow')::int, 1), coalesce((p_set->>'dom')::int, 1),
              coalesce(p_set->>'scope','all'), v_kinds, v_pages, lower(me), lower(me), v_now)
      returning id into nid;
    else
      update public.notify_subs set channel = v_ch, target = v_tg,
        label = case when p_set ? 'label' then nullif(btrim(coalesce(p_set->>'label','')),'') else label end,
        enabled = coalesce((p_set->>'enabled')::boolean, enabled),
        freq = coalesce(p_set->>'freq', freq), hour = coalesce((p_set->>'hour')::int, hour),
        dow = coalesce((p_set->>'dow')::int, dow), dom = coalesce((p_set->>'dom')::int, dom),
        scope = coalesce(p_set->>'scope', scope), kinds = v_kinds, pages = v_pages,
        updated_by = lower(me), updated_at = v_now
       where id = p_id;
      nid := p_id;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok',false,'error','duplicate');
  end;
  insert into public.sheet_edits(gid,row_key,op,before,after,edited_by,edited_at,tbl)
  values ('notify', nid::text, case when p_id is null then 'notify_add' else 'notify_set' end,
          case when p_id is null then null else to_jsonb(cur) end, p_set, lower(me), v_now, 'notify_subs');
  return jsonb_build_object('ok',true,'id',nid,'at',v_now);
end $$;
revoke all on function public.notify_save(bigint, jsonb, timestamptz) from public, anon;
grant execute on function public.notify_save(bigint, jsonb, timestamptz) to authenticated;

/* ---------- 4. 관리 화면 — 최근에 만든 PPT 30줄을 더한다(«PPT 자동 생성이 돌고 있나»를 화면이 말한다) ---------- */
create or replace function public.notify_admin() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me text := public._tgt_who();
begin
  if me is null then return jsonb_build_object('error','forbidden'); end if;
  return jsonb_build_object(
    'subs', coalesce((select jsonb_agg(to_jsonb(s) order by s.channel, lower(s.target), s.id) from public.notify_subs s where not s.removed), '[]'::jsonb),
    'kakao', coalesce((select jsonb_agg(jsonb_build_object('email', lower(k.email), 'verified_at', max_v, 'n', n,
                         'allowed', exists(select 1 from public.allowed_users a where lower(a.email) = lower(k.email))) order by lower(k.email))
                       from (select lower(email) email, max(verified_at) max_v, count(*) n from public.kakao_users
                              where status = 'verified' and email is not null group by lower(email)) k), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('email', lower(a.email), 'role', a.role, 'note', a.note) order by lower(a.email))
                         from public.allowed_users a where not exists (select 1 from public.report_bots b where b.email = lower(a.email))), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc) from (select * from public.notify_log order by at desc limit 60) l), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(to_jsonb(r) order by r.made_at desc) from (select * from public.report_files order by made_at desc limit 30) r), '[]'::jsonb),
    'bot', exists(select 1 from public.report_bots));
end $$;
revoke all on function public.notify_admin() from public, anon;
grant execute on function public.notify_admin() to authenticated;

/* ---------- 5. 보고서 봇 계정 ----------
   계정(auth.users · 이메일 gstreport@gstcs.view · 비밀번호 없음 — 무작위 해시)과 allowed_users(viewer · 쓰기 없음),
   report_bots 한 줄은 운영 DB 에 execute_sql 로 넣었다(2026-11-03). 다른 프로젝트에 새로 깔 때만 아래를 참고한다 —
   auth.users 의 모양은 기존 아이디 계정(@gstcs.view)과 같게 만든다(v146 krdemo 와 같은 꼴).
     insert into public.allowed_users(email, can_write, role, note) values ('gstreport@gstcs.view', false, 'viewer', '보고서 봇 — PPT 정기 발송') on conflict do nothing;
     insert into public.report_bots(email) values ('gstreport@gstcs.view') on conflict do nothing;
*/
