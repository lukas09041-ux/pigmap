-- 카카오맵 리뷰 기반 시딩용 컬럼 (테스트/개발용, 낮은 리스크)
-- 리뷰 "원문"은 저장하지 않는다 — 별점/리뷰수 같은 사실 데이터 + 카카오 강점 태그 +
-- 우리 AI가 리뷰를 읽고 새로 생성한 3줄 특징(kakao_summary)만 저장한다.
-- (앱 런타임엔 카카오 의존성이 없다. scripts/seed-kakao-reviews.mjs로 1회성 배치 시딩.)

alter table public.stores
  add column if not exists kakao_place_id text,
  add column if not exists kakao_rating numeric(2,1),
  add column if not exists kakao_review_count int,
  add column if not exists kakao_strengths jsonb,   -- 예: ["맛","가성비","친절"]
  add column if not exists kakao_summary text,       -- 우리 AI가 생성한 3줄 특징
  add column if not exists kakao_synced_at timestamptz;

-- place_id로 재실행 시 중복 매칭 조회를 빠르게
create index if not exists idx_stores_kakao_place_id on public.stores (kakao_place_id);
