-- 광고 자동 생성 (킬러 피처): AI 생성 홍보 카피 캐싱 컬럼
-- Supabase SQL Editor에서 실행하세요.

alter table stores add column if not exists ad_headline text;
alter table stores add column if not exists ad_body_line1 text;
alter table stores add column if not exists ad_body_line2 text;
alter table stores add column if not exists ad_hashtags text[];
alter table stores add column if not exists ad_generated_at timestamptz;
