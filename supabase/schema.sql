-- 피그맵 초기 스키마: stores, reviews
-- Supabase SQL Editor에서 실행하거나 `supabase db push`로 적용하세요.

create extension if not exists "pgcrypto";

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,               -- 업소명
  category text,                    -- 업종
  address text not null,            -- 주소
  latitude double precision,        -- 위도
  longitude double precision,       -- 경도
  menu_name text,                   -- 대표메뉴
  price integer,                    -- 가격
  phone text,                       -- 전화번호
  pig_temperature numeric(4, 1) not null default 36.5, -- 돼지 온도
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  photo_url text,                   -- 인증 사진 URL
  content text,                     -- 리뷰 텍스트
  created_at timestamptz not null default now()
);

create index if not exists reviews_store_id_idx on reviews(store_id);

-- NOTE: 현재 RLS는 비활성 상태로 anon key로도 자유롭게 읽고 쓸 수 있습니다.
-- 실제 서비스 오픈 전에 아래처럼 RLS를 켜고 용도에 맞는 정책을 추가하세요.
-- alter table stores enable row level security;
-- alter table reviews enable row level security;
-- create policy "stores are publicly readable" on stores for select using (true);
-- create policy "reviews are publicly readable" on reviews for select using (true);
