"use client";

import { useEffect, useRef, useState } from "react";
import { getPigStage } from "@/lib/pig-stage";

type AdCopy = {
  headline: string;
  bodyLine1: string;
  bodyLine2: string;
  hashtags: string[];
};

export default function AdCard({
  storeId,
  storeName,
  menuName,
  price,
  pigTemperature,
  initialAd,
}: {
  storeId: string;
  storeName: string;
  menuName: string | null;
  price: number | null;
  pigTemperature: number;
  initialAd: AdCopy | null;
}) {
  const [ad, setAd] = useState<AdCopy | null>(initialAd);
  const [loading, setLoading] = useState(!initialAd);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialAd) return;
    let cancelled = false;

    async function generate() {
      try {
        const res = await fetch("/api/ad-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(data.error ?? "광고 생성에 실패했어요.");
        else setAd(data);
      } catch {
        if (!cancelled) setError("네트워크 오류가 발생했어요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    generate();
    return () => {
      cancelled = true;
    };
  }, [storeId, initialAd]);

  async function renderCanvas() {
    if (!cardRef.current) return null;
    const html2canvas = (await import("html2canvas")).default;
    return html2canvas(cardRef.current, {
      scale: 1080 / cardRef.current.offsetWidth,
      useCORS: true,
      backgroundColor: null,
    });
  }

  async function handleDownload() {
    const canvas = await renderCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${storeName}-피그맵-광고카드.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function handleShare() {
    const canvas = await renderCanvas();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `${storeName}-피그맵.png`, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: `${storeName} 피그맵 광고카드`, text: ad?.headline });
      } else {
        handleDownload();
      }
    }, "image/png");
  }

  const stage = getPigStage(pigTemperature);

  return (
    <section className="mx-4 mb-8">
      <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-600">
        🎉 이 가게는 손님들이 광고를 만들었어요
      </div>

      {loading && (
        <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-gray-50 text-sm text-gray-400">
          🐷 광고 카드 만드는 중...
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {ad && (
        <>
          <div
            ref={cardRef}
            className="relative flex aspect-square w-full flex-col justify-between overflow-hidden rounded-2xl p-6 text-white"
            style={{ background: "linear-gradient(135deg, #fb923c, #f97316 45%, #ea580c)" }}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
                {stage.emoji} {stage.label} {pigTemperature.toFixed(1)}°
              </span>
              <span className="text-xs font-bold opacity-80">피그맵</span>
            </div>

            <div>
              <p className="text-2xl font-extrabold leading-tight drop-shadow-sm">{ad.headline}</p>
              <p className="mt-3 text-sm leading-relaxed opacity-95">
                {ad.bodyLine1}
                <br />
                {ad.bodyLine2}
              </p>
              <p className="mt-4 text-xs font-bold opacity-90">{storeName}</p>
              {menuName && (
                <p className="text-xs opacity-80">
                  {menuName}
                  {price != null && ` · ${price.toLocaleString()}원`}
                </p>
              )}
              <p className="mt-2 text-[10px] opacity-75">
                {ad.hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 rounded-full border border-gray-200 py-2.5 text-sm font-bold text-gray-700"
            >
              다운로드
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 rounded-full bg-orange-500 py-2.5 text-sm font-bold text-white"
            >
              공유하기
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-gray-400">
            🎬 다음 단계: 온도가 더 오르면 영상 광고도 자동 생성돼요 (준비 중)
          </p>
        </>
      )}
    </section>
  );
}
