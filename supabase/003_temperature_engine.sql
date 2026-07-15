-- 돼지 온도 엔진: 리뷰별 AI 분석 결과 컬럼 추가
-- Supabase SQL Editor에서 실행하세요.

alter table reviews add column if not exists sentiment numeric;
alter table reviews add column if not exists specificity numeric;
alter table reviews add column if not exists mentions text[];
