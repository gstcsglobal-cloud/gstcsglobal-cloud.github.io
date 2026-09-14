-- v135 · 화면 등급(role). 쓰기 권한(can_write)과 «별개의 축»이다 — 쓰기 정책은 한 줄도 안 바뀐다.
--   viewer : 지표만 (기본값 — 모르면 못 보게, 이 저장소의 fail-closed 태도 그대로)
--   editor : + 편집·업로드 버튼 (can_write 인 사람을 한 번 옮겨 준다)
--   admin  : + 출처 배지 상세(표 이름·행수·캐시) · 미러 실패 배너 원문 · 열 인식 패널 · /diag/ · 카드 노트의 운영 지시
-- ⚠ 이것은 보안이 아니라 «화면 정리»다(사용자 확정: 메타정보만). 지표 값 자체는 RLS 가 정한다.
-- ⚠ 이 SQL 을 실행하기 전에는 core.js 가 role 열 부재를 감지해 'legacy'(전원이 다 본다)로 돈다 —
--    잠그지 않는 이유: 잠그면 이 SQL 을 돌리기 전까지 관리자도 업로드 버튼을 잃는다.
-- 선행: setup.sql(allowed_users) · setup-3(can_write) · setup-7("self read" — 자기 행을 읽어야 등급을 안다)

alter table public.allowed_users add column if not exists role text not null default 'viewer';
alter table public.allowed_users drop constraint if exists allowed_users_role_chk;
alter table public.allowed_users add constraint allowed_users_role_chk check (role in ('viewer','editor','admin'));

-- 부트스트랩 — 지금 쓰기가 되는 사람은 editor, 관리자는 admin
update public.allowed_users set role = 'editor' where can_write and role = 'viewer';
update public.allowed_users set role = 'admin'  where lower(email) = 'gstcsglobal@gmail.com';

-- 확인 — self read 정책이 켜져 있어야 화면이 자기 등급을 읽는다(꺼져 있으면 «남의 등급을 다 본다»가 아니라 «자기 것도 못 본다»)
select email, can_write, role from public.allowed_users order by role desc, email;
select polname from pg_policy where polrelid = 'public.allowed_users'::regclass;
