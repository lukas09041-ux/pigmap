-- 핵심 3줄 요약 캐싱 컬럼
-- Supabase SQL Editor에서 실행하세요.

alter table stores add column if not exists ai_summary text;
alter table stores add column if not exists ai_summary_updated_at timestamptz;
