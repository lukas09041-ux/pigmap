"use client";

import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPigStage } from "@/lib/pig-stage";
import { DEFAULT_MAP_CENTER } from "@/lib/constants";
import type { Store } from "@/types/store";
import JommechuSheet from "./JommechuSheet";

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

export default function StoreMap() {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);

  const [sdkReady, setSdkReady] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchNonce, setFetchNonce] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locateNotice, setLocateNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStores() {
      setLoading(true);
      setError(false);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("stores")
        .select(
          "id, name, category, address, latitude, longitude, menu_name, price, phone, pig_temperature",
        )
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (cancelled) return;
      if (error) setError(true);
      else setStores(data ?? []);
      setLoading(false);
    }

    fetchStores();
    return () => {
      cancelled = true;
    };
  }, [fetchNonce]);

  // "내 위치" 버튼 — 권한 거부/미지원/서비스 지역 밖이어도 앱이 멈추지 않게 안내만 띄운다.
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

  useEffect(() => {
    if (!sdkReady || !mapContainerRef.current || mapRef.current) return;

    window.kakao.maps.load(() => {
      if (!mapContainerRef.current) return;
      mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
        center: new window.kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
        level: 6,
      });
    });
  }, [sdkReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || stores.length === 0) return;

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    const bounds = new window.kakao.maps.LatLngBounds();

    stores.forEach((store) => {
      if (store.latitude == null || store.longitude == null) return;

      const position = new window.kakao.maps.LatLng(store.latitude, store.longitude);
      bounds.extend(position);

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
    });

    map.setBounds(bounds);
  }, [stores, router]);

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

      <button
        type="button"
        onClick={handleLocate}
        aria-label="내 위치로 이동"
        className="absolute bottom-24 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-lg shadow-md"
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
            onClick={() => setFetchNonce((n) => n + 1)}
            className="rounded-full bg-orange-500 px-5 py-2 text-sm font-bold text-white"
          >
            다시 시도
          </button>
        </div>
      )}

      <JommechuSheet />
    </div>
  );
}
