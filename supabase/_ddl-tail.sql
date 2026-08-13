
/* ---------- 동기화 기록 ---------- */
-- 마지막 적재가 언제·몇 행이었는지. t-mirror가 시트와 대조할 때 기준으로 쓴다.
-- 이게 없으면 "DB가 비었는가, 아니면 시트가 원래 비었는가"를 구분할 수 없다.
create table if not exists public.sheet_sync_log (
  tbl        text primary key,          -- 'wk' · 'mat' · 'inst'
  gid        text not null,
  rows       int  not null,             -- 적재 후 테이블 행수
  sheet_rows int,                       -- 시트에서 읽은 데이터 행수 (같아야 정상)
  ms         int,                       -- 소요 시간
  err        text,                      -- 실패 사유. 성공 시 null
  synced_at  timestamptz not null default now()
);

/* ============================================================
   컬럼 매핑을 왜 표에 담는가 — 제2원칙(스펙 복제) 때문이다
   ------------------------------------------------------------
   시트 헤더 → 컬럼 대응을 sheet-sync 엣지펑션 안에 적으면, 같은 스펙의
   **네 번째 사본**이 생긴다(core.js · hr.js · sheet-write · sync).
   복제된 것은 반드시 갈라진다 — 그래서 t-sync가 있는 것이다.

   그래서 적지 않는다. `GST.SM.SPEC`에서 뽑아 아래 두 표에 넣고,
   엣지펑션은 **표를 읽어서** 헤더를 해석한다. 스펙은 여전히 한 곳(core.js)이고
   sync는 사본이 아니라 소비자가 된다.

   재생성: `node supabase/gen-ddl.mjs` → 나온 SQL을 다시 Run.
   ============================================================ */
create table if not exists public.sheet_spec (
  tbl   text primary key,                -- 'wk' · 'mat' · 'inst'
  gid   text not null,
  -- 헤더 행 찾기 힌트. `[["실적코드"],["자재코드","자재명"]]` 꼴 — 바깥은 AND, 안쪽은 OR.
  -- text[]가 아니라 jsonb인 이유: 힌트 하나가 별칭 여럿을 가질 수 있어 중첩이 필요한데
  -- text[]에 넣으면 ['자재코드','자재명']이 문자열 하나로 눌려 헤더를 영영 못 찾는다.
  -- 실제로 그렇게 눌려서 자재실적이 통째로 안 붙었다.
  hints jsonb not null,
  scan  int  not null default 6          -- 위에서 몇 줄까지 헤더를 찾아볼지
);
create table if not exists public.sheet_colmap (
  tbl      text not null references public.sheet_spec(tbl) on delete cascade,
  col      text not null,                -- DB 컬럼명 (snake_case)
  headers  text[] not null,              -- 시트 헤더 후보. 앞선 것이 우선
  optional boolean not null default false,  -- SPEC의 opt — 없어도 실패로 치지 않는다
  ord      int not null,                 -- SPEC에 적힌 순서
  primary key (tbl, col)
);

/* ---------- RLS ---------- */
-- 읽기: allowed_users에 있는 로그인 사용자만 (pm_adjust와 같은 규약)
-- 쓰기: 정책을 만들지 않는다 = anon/authenticated 전면 차단.
--       sheet-sync 엣지펑션의 service_role만 쓴다 (sheet_locks와 같은 규약).
--       브라우저가 미러를 고칠 수 있으면 그건 미러가 아니다.
do $$
declare t text;
begin
  foreach t in array array['sheet_wk','sheet_mat','sheet_inst',
                           'sheet_sync_log','sheet_spec','sheet_colmap'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allowed read" on public.%I', t);
    execute format($f$create policy "allowed read" on public.%I
        for select to authenticated
        using ( exists (select 1 from public.allowed_users a
                        where lower(a.email) = lower(auth.jwt()->>'email')) )$f$, t);
  end loop;
end $$;
