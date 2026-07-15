"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { haversineDistanceMeters, formatDistance } from "@/lib/geo";
import { getPigStage } from "@/lib/pig-stage";
import { DEFAULT_MAP_CENTER, FOOD_CATEGORIES } from "@/lib/constants";

// 걸어서 5분 ≈ 400m, 15분 ≈ 1.2km (보행 속도 80m/분 기준)
const WALK_5MIN_M = 400;
const WALK_15MIN_M = 1200;

type NearbyStore = {
  id: string;
  name: string;
  category: string | null;
  menu_name: string | null;
  price: number | null;
  pig_temperature: number;
  kakao_rating: number | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
};

function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(DEFAULT_MAP_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(DEFAULT_MAP_CENTER),
      { timeout: 5000 },
    );
  });
}

function StoreRow({ store, onClick }: { store: NearbyStore; onClick: () => void }) {
  const stage = getPigStage(store.pig_temperature);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-orange-50"
    >
      <span className="text-2xl leading-none">{stage.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-gray-900">{store.name}</p>
        <p className="truncate text-xs text-gray-500">
          {store.category}
          {store.menu_name && ` · ${store.menu_name}`}
          {store.price != null && ` ${store.price.toLocaleString()}원`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-xs font-bold text-orange-500">
          {store.pig_temperature.toFixed(1)}°
        </span>
        <span className="text-[11px] text-gray-400">
          {formatDistance(store.distanceMeters)}
          {store.kakao_rating != null && ` · ★${store.kakao_rating.toFixed(1)}`}
        </span>
      </div>
    </button>
  );
}

// 화면 하단에서 위로 당기면 걸어서 5분/15분 구간별 가게 리스트가 열리는 시트.
// 구간 안에서는 돼지 온도가 높은 순으로 정렬한다.
export default function NearbyListSheet({ foodOnly }: { foodOnly: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<NearbyStore[] | null>(null);
  const touchStartY = useRef<number | null>(null);
  const loadedForFoodOnly = useRef<boolean | null>(null);

  useEffect(() => {
    if (!expanded) return;
    // 이미 같은 필터 상태로 불러온 데이터가 있으면 재사용
    if (stores && loadedForFoodOnly.current === foodOnly) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      const { lat, lng } = await getCurrentPosition();
      if (cancelled) return;

      const latDelta = WALK_15MIN_M / 111_320;
      const lngDelta = WALK_15MIN_M / (111_320 * Math.cos((lat * Math.PI) / 180));

      const supabase = createClient();
      let query = supabase
        .from("stores")
        .select(
          "id, name, category, menu_name, price, pig_temperature, kakao_rating, latitude, longitude",
        )
        .gte("latitude", lat - latDelta)
        .lte("latitude", lat + latDelta)
        .gte("longitude", lng - lngDelta)
        .lte("longitude", lng + lngDelta)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .limit(300);
      if (foodOnly) query = query.in("category", FOOD_CATEGORIES);

      const { data } = await query;
      if (cancelled) return;

      const withDistance = ((data ?? []) as Omit<NearbyStore, "distanceMeters">[])
        .map((s) => ({
          ...s,
          distanceMeters: haversineDistanceMeters(lat, lng, s.latitude, s.longitude),
        }))
        .filter((s) => s.distanceMeters <= WALK_15MIN_M);

      setStores(withDistance);
      loadedForFoodOnly.current = foodOnly;
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [expanded, foodOnly, stores]);

  const byTemp = (a: NearbyStore, b: NearbyStore) => b.pig_temperature - a.pig_temperature;
  const walk5 = (stores ?? []).filter((s) => s.distanceMeters <= WALK_5MIN_M).sort(byTemp);
  const walk15 = (stores ?? [])
    .filter((s) => s.distanceMeters > WALK_5MIN_M)
    .sort(byTemp);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current == null) return;
    const delta = touchStartY.current - e.changedTouches[0].clientY;
    if (delta > 30) setExpanded(true);
    else if (delta < -30) setExpanded(false);
    touchStartY.current = null;
  }

  return (
    <div
      className={`fixed inset-x-0 z-30 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.12)] transition-[height] duration-300 ${
        expanded ? "h-[62vh]" : "h-12"
      }`}
      style={{ bottom: "4rem" }}
    >
      {/* 핸들 — 탭 또는 스와이프로 열고 닫기 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex shrink-0 flex-col items-center gap-1 pb-1 pt-2"
        aria-expanded={expanded}
        aria-label="주변 가게 리스트"
      >
        <span className="h-1 w-10 rounded-full bg-gray-300" />
        <span className="text-xs font-semibold text-gray-600">
          🚶 주변 착한가게 {expanded ? "" : "올려서 보기"}
        </span>
      </button>

      {expanded && (
        <div className="flex-1 overflow-y-auto pb-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <span className="animate-bounce text-2xl">🐷</span>
              <p className="text-sm text-gray-400">주변 가게를 찾는 중...</p>
            </div>
          ) : (
            <>
              <div className="sticky top-0 bg-orange-50 px-4 py-2">
                <p className="text-xs font-bold text-orange-600">🚶 걸어서 5분 (400m)</p>
              </div>
              {walk5.length > 0 ? (
                walk5.map((s) => (
                  <StoreRow key={s.id} store={s} onClick={() => router.push(`/store/${s.id}`)} />
                ))
              ) : (
                <p className="px-4 py-3 text-xs text-gray-400">
                  5분 거리엔 없어요. 조금만 더 걸어볼까요?
                </p>
              )}

              <div className="sticky top-0 bg-orange-50 px-4 py-2">
                <p className="text-xs font-bold text-orange-600">🚶 걸어서 15분 (1.2km)</p>
              </div>
              {walk15.length > 0 ? (
                walk15.map((s) => (
                  <StoreRow key={s.id} store={s} onClick={() => router.push(`/store/${s.id}`)} />
                ))
              ) : (
                <p className="px-4 py-3 text-xs text-gray-400">15분 거리엔 없어요.</p>
              )}

              {walk5.length === 0 && walk15.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  걸어갈 만한 거리에 등록된 착한가게가 없어요 🐽
                  <br />
                  지도를 움직여 다른 동네를 구경해보세요!
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
