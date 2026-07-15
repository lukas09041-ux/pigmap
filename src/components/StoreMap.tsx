"use client";

import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPigStage } from "@/lib/pig-stage";
import { DEFAULT_MAP_CENTER, FOOD_CATEGORIES } from "@/lib/constants";
import JommechuSheet from "./JommechuSheet";
import NearbyListSheet from "./NearbyListSheet";

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

// 전국 1.2만 가게를 전부 그리면 모바일이 버티지 못하므로,
// 지도가 멈출 때(idle)마다 화면 영역 안의 가게만 불러와 그린다.
const MAX_VISIBLE_MARKERS = 250;

type MapStore = {
  id: string;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  pig_temperature: number;
};

export default function StoreMap() {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const fetchNonceRef = useRef(0);
  const foodOnlyRef = useRef(false);

  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [foodOnly, setFoodOnly] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateNotice, setLocateNotice] = useState<string | null>(null);

  // 현재 지도 화면 영역의 가게를 불러와 마커를 다시 그린다.
  const refreshVisibleStores = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const nonce = ++fetchNonceRef.current;
    setError(false);

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const supabase = createClient();
    let query = supabase
      .from("stores")
      .select("id, name, category, latitude, longitude, pig_temperature")
      .gte("latitude", sw.getLat())
      .lte("latitude", ne.getLat())
      .gte("longitude", sw.getLng())
      .lte("longitude", ne.getLng())
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("pig_temperature", { ascending: false })
      .limit(MAX_VISIBLE_MARKERS);

    if (foodOnlyRef.current) {
      query = query.in("category", FOOD_CATEGORIES);
    }

    const { data, error: fetchError } = await query;

    // 더 새로운 요청이 이미 나갔으면 이 결과는 버린다
    if (nonce !== fetchNonceRef.current || !mapRef.current) return;

    if (fetchError) {
      setError(true);
      setLoading(false);
      return;
    }

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    for (const store of (data ?? []) as MapStore[]) {
      const position = new window.kakao.maps.LatLng(store.latitude, store.longitude);
      const stage = getPigStage(store.pig_temperature);
      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-full border border-black/5 bg-white/95 px-2 py-1 shadow-md";
      el.innerHTML = `
        <span class="${stage.emojiSizeClass} leading-none">${stage.emoji}</span>
        <span class="whitespace-nowrap text-[10px] font-semibold text-gray-700">${store.name}</span>
      `;
      el.addEventListener("click", () => router.push(`/store/${store.id}`));

      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content: el,
        yAnchor: 1,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    setLoading(false);
  }, [router]);

  // 최초 진입: 위치 권한이 있으면 내 주변, 없으면 사당역 기준으로 지도를 만든다.
  useEffect(() => {
    if (!sdkReady || !mapContainerRef.current || mapRef.current) return;

    function createMap(center: { lat: number; lng: number }, level: number) {
      window.kakao.maps.load(() => {
        if (!mapContainerRef.current || mapRef.current) return;
        const map = new window.kakao.maps.Map(mapContainerRef.current, {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level,
        });
        mapRef.current = map;

        let debounce: ReturnType<typeof setTimeout> | null = null;
        window.kakao.maps.event.addListener(map, "idle", () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(refreshVisibleStores, 250);
        });

        refreshVisibleStores();
      });
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => createMap({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 5),
        () => createMap(DEFAULT_MAP_CENTER, 6),
        { timeout: 3000 },
      );
    } else {
      createMap(DEFAULT_MAP_CENTER, 6);
    }
  }, [sdkReady, refreshVisibleStores]);

  // 🐽 음식점만 보기 토글
  function toggleFoodOnly() {
    const next = !foodOnly;
    setFoodOnly(next);
    foodOnlyRef.current = next;
    setLocateNotice(next ? "🐽 음식점만 보여드려요!" : "전체 가게를 보여드려요");
    refreshVisibleStores();
  }

  // "내 위치" 버튼 — 권한 거부/미지원이어도 앱이 멈추지 않게 안내만 띄운다.
  function handleLocate() {
    const map = mapRef.current;
    if (!map) return;

    if (!("geolocation" in navigator)) {
      setLocateNotice("이 브라우저는 위치를 지원하지 않아요. 사당역 기준으로 보여드려요.");
      map.setCenter(new window.kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng));
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        map.setCenter(new window.kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
        map.setLevel(5);
      },
      () => {
        setLocating(false);
        setLocateNotice("위치 권한이 없어 사당역 기준으로 보여드려요.");
        map.setCenter(new window.kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng));
        map.setLevel(6);
      },
      { timeout: 5000 },
    );
  }

  useEffect(() => {
    if (!locateNotice) return;
    const t = setTimeout(() => setLocateNotice(null), 3000);
    return () => clearTimeout(t);
  }, [locateNotice]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <Script
        src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`}
        strategy="afterInteractive"
        onReady={() => setSdkReady(true)}
      />

      <div ref={mapContainerRef} className="h-full w-full" />

      <Link
        href="/info"
        aria-label="피그맵 정보"
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-sm font-bold text-gray-600 shadow-md"
      >
        ⓘ
      </Link>

      {/* 🐽 음식점만 보기 토글 */}
      <button
        type="button"
        onClick={toggleFoodOnly}
        aria-label="음식점만 보기"
        aria-pressed={foodOnly}
        className={`absolute bottom-[11.5rem] right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full text-xl shadow-md transition-colors ${
          foodOnly ? "bg-orange-500 ring-2 ring-orange-300" : "bg-white/95"
        }`}
      >
        🐽
      </button>

      <button
        type="button"
        onClick={handleLocate}
        aria-label="내 위치로 이동"
        className="absolute bottom-32 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-lg shadow-md"
      >
        {locating ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
        ) : (
          "📍"
        )}
      </button>

      {locateNotice && (
        <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gray-800/90 px-4 py-2 text-xs text-white shadow">
          {locateNotice}
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80">
          <span className="animate-bounce text-3xl">🐷</span>
          <p className="text-sm text-gray-500">지도를 불러오는 중...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 px-6 text-center">
          <span className="text-3xl">🐽</span>
          <p className="text-sm text-gray-600">꿀꿀... 잠시 후 다시 시도해주세요</p>
          <button
            type="button"
            onClick={refreshVisibleStores}
            className="rounded-full bg-orange-500 px-5 py-2 text-sm font-bold text-white"
          >
            다시 시도
          </button>
        </div>
      )}

      <NearbyListSheet foodOnly={foodOnly} />

      <JommechuSheet />
    </div>
  );
}
