-- 인증(로그인) 도입: reviews.user_id + RLS
-- Supabase SQL Editor에서 실행하세요.

alter table reviews add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table reviews enable row level security;

-- 읽기: 누구나 (로그인 여부 무관)
drop policy if exists "reviews are publicly readable" on reviews;
create policy "reviews are publicly readable"
  on reviews for select
  using (true);

-- 쓰기(작성): 인증된 유저만(익명 로그인 포함), 자기 user_id로만 작성 가능
drop policy if exists "authenticated users can insert their own reviews" on reviews;
create policy "authenticated users can insert their own reviews"
  on reviews for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 수정: 본인 것만
drop policy if exists "users can update their own reviews" on reviews;
create policy "users can update their own reviews"
  on reviews for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 삭제: 본인 것만
drop policy if exists "users can delete their own reviews" on reviews;
create policy "users can delete their own reviews"
  on reviews for delete
  to authenticated
  using (auth.uid() = user_id);

-- NOTE: stores 테이블은 이번 범위에 포함되지 않아 기존처럼 RLS 비활성 상태로 둔다
-- (돼지 온도 엔진 / AI 요약 / 광고 생성 라우트가 anon key로 stores를 갱신하기 때문).
