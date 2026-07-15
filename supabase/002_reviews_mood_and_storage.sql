-- 인증(리뷰) 작성 플로우: mood(기분 이모지) 컬럼 + 사진용 Storage 버킷
-- supabase/schema.sql 적용 이후, Supabase SQL Editor에서 실행하세요.

alter table reviews add column if not exists mood text;
update reviews set mood = 'neutral' where mood is null;
alter table reviews alter column mood set not null;
alter table reviews alter column mood set default 'neutral';

alter table reviews drop constraint if exists reviews_mood_check;
alter table reviews add constraint reviews_mood_check check (mood in ('good', 'neutral', 'bad'));

insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

-- NOTE: 앱 전체가 아직 무인증(anon key) 상태라 storage.objects도 동일하게 공개 정책을 둔다.
-- 실제 서비스 오픈 전에는 schema.sql의 RLS 안내와 함께 다시 검토해야 한다.
drop policy if exists "review photos are publicly readable" on storage.objects;
create policy "review photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'review-photos');

drop policy if exists "anyone can upload review photos" on storage.objects;
create policy "anyone can upload review photos"
  on storage.objects for insert
  with check (bucket_id = 'review-photos');
