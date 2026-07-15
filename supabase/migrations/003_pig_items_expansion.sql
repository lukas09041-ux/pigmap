-- 내 꿀꿀이 아이템 확장: 레벨당 1개 → 레벨당 여러 개 (총 12종)
-- Lv1 리본 / Lv2 알록달록 목도리 / Lv3 냅킨 두건+모자 3종 /
-- Lv4 선글라스+배낭 / Lv5 셰프복+황금 포크 / Lv6 왕관+반짝이 이펙트
-- (레벨 기준과 "서로 다른 가게" 카운트 규칙은 002와 동일 — 변경 없음)

create or replace function public.pig_unlocked_for_level(lvl int)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(item order by min_level, item), '[]'::jsonb)
  from (
    values
      ('ribbon', 1),
      ('scarf', 2),
      ('napkin', 3), ('hat_cap', 3), ('hat_beret', 3), ('hat_straw', 3),
      ('sunglasses', 4), ('backpack', 4),
      ('chef_outfit', 5), ('golden_fork', 5),
      ('crown', 6), ('sparkle', 6)
  ) as t(item, min_level)
  where min_level <= lvl
$$;

-- 기존 프로필 재백필: 새 아이템 목록으로 해금 갱신,
-- 장착 목록은 (구 아이템 id 제거를 위해) 해금 목록과의 교집합으로 정리
update public.profiles p
set
  unlocked_items = public.pig_unlocked_for_level(p.pig_level),
  equipped_items = coalesce(
    (
      select jsonb_agg(e)
      from jsonb_array_elements_text(p.equipped_items) as e
      where public.pig_unlocked_for_level(p.pig_level) ? e
    ),
    '[]'::jsonb
  );
