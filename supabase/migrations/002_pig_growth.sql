-- 유저 돼지 성장 시스템 "내 꿀꿀이"
-- profiles 테이블 + 인증 카운트 트리거 (같은 가게 재인증은 카운트 제외)

-- ── 1. profiles 테이블 ──────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pig_level int not null default 0,
  cert_count int not null default 0,
  equipped_items jsonb not null default '[]'::jsonb,
  unlocked_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 읽기는 모두 허용 (리뷰 카드 옆에 다른 유저의 아바타를 그려야 함)
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

-- 생성/수정은 본인 것만 (익명 유저 포함 authenticated 롤)
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- ── 2. 레벨/아이템 계산 함수 ────────────────────────────────────
-- 레벨 기준: 1개→Lv1 / 3개→Lv2 / 10개→Lv3 / 20개→Lv4 / 50개→Lv5 / 100개→Lv6
create or replace function public.pig_level_for_certs(certs int)
returns int
language sql
immutable
as $$
  select case
    when certs >= 100 then 6
    when certs >= 50 then 5
    when certs >= 20 then 4
    when certs >= 10 then 3
    when certs >= 3 then 2
    when certs >= 1 then 1
    else 0
  end
$$;

-- 레벨 N까지 해금된 아이템 목록 (레벨당 1개씩 순서대로 해금)
create or replace function public.pig_unlocked_for_level(lvl int)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  from unnest(
    (array['ribbon','scarf','hat','sunglasses','chef_hat','crown'])[1:greatest(lvl, 0)]
  ) as item
$$;

-- ── 3. 리뷰 등록 시 인증 카운트 트리거 ──────────────────────────
-- 해당 유저가 이 가게를 처음 인증하는 경우에만 cert_count +1.
-- 같은 가게 재인증은 카운트 제외 (가게 온도에는 별도 로직으로 정상 반영됨).
create or replace function public.handle_review_cert_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_time boolean;
begin
  if new.user_id is null then
    return new;
  end if;

  select not exists (
    select 1 from public.reviews r
    where r.user_id = new.user_id
      and r.store_id = new.store_id
      and r.id <> new.id
  ) into first_time;

  insert into public.profiles (id) values (new.user_id)
  on conflict (id) do nothing;

  if first_time then
    update public.profiles
      set cert_count = cert_count + 1,
          pig_level = public.pig_level_for_certs(cert_count + 1),
          unlocked_items = public.pig_unlocked_for_level(
            public.pig_level_for_certs(cert_count + 1)
          )
    where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_review_cert_count on public.reviews;
create trigger trg_review_cert_count
  after insert on public.reviews
  for each row
  execute function public.handle_review_cert_count();

-- ── 4. 신규 가입 시 프로필 자동 생성 ────────────────────────────
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_profile on auth.users;
create trigger trg_create_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

-- ── 5. 기존 유저 백필 ───────────────────────────────────────────
-- 이미 남긴 리뷰 기준으로 서로 다른 가게 수를 계산해 프로필을 채운다.
insert into public.profiles (id, cert_count, pig_level, unlocked_items)
select
  r.user_id,
  count(distinct r.store_id)::int,
  public.pig_level_for_certs(count(distinct r.store_id)::int),
  public.pig_unlocked_for_level(
    public.pig_level_for_certs(count(distinct r.store_id)::int)
  )
from public.reviews r
where r.user_id is not null
group by r.user_id
on conflict (id) do update set
  cert_count = excluded.cert_count,
  pig_level = excluded.pig_level,
  unlocked_items = excluded.unlocked_items;

-- 리뷰가 없는 기존 가입자도 프로필 생성
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;
