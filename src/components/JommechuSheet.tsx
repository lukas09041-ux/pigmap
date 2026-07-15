"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistance } from "@/lib/geo";
import { getPigStage } from "@/lib/pig-stage";
import { DEFAULT_MAP_CENTER } from "@/lib/constants";

type Recommendation = {
  storeId: string;
  storeName: string;
  category: string | null;
  menuName: string | null;
  price: number | null;
  pigTemperature: number;
  distanceMeters: number;
  reason: string;
  quote: string;
};

type Exchange = {
  query: string;
  loading: boolean;
  error?: string;
  noResultMessage?: string;
  recommendation?: Recommendation;
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

// 탭바의 "점메추" 탭은 /?jommechu=1 로 이동시키고, 이 컴포넌트가 그 파라미터를 감지해서 시트를 연다.
// useSearchParams()는 Suspense 경계가 필요해서 별도 컴포넌트로 분리했다.
function JommechuAutoOpen({ onTrigger }: { onTrigger: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("jommechu") === "1") {
      onTrigger();
      router.replace("/", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

export default function JommechuSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);

  async function handleAsk() {
    const query = input.trim();
    if (!query) return;
    setInput("");

    const index = exchanges.length;
    setExchanges((prev) => [...prev, { query, loading: true }]);

    const { lat, lng } = await getCurrentPosition();

    try {
      const res = await fetch("/api/jommechu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, lat, lng }),
      });
      const data = await res.json();

      setExchanges((prev) => {
        const next = [...prev];
        if (!res.ok) {
          next[index] = { query, loading: false, error: data.error ?? "추천을 가져오지 못했어요." };
        } else if (data.noResult) {
          next[index] = { query, loading: false, noResultMessage: data.message };
        } else {
          next[index] = { query, loading: false, recommendation: data };
        }
        return next;
      });
    } catch {
      setExchanges((prev) => {
        const next = [...prev];
        next[index] = { query, loading: false, error: "네트워크 오류가 발생했어요." };
        return next;
      });
    }
  }

  return (
    <>
      <Suspense fallback={null}>
        <JommechuAutoOpen onTrigger={() => setOpen(true)} />
      </Suspense>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <div className="flex max-h-[80vh] flex-col rounded-t-2xl bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-bold text-gray-800">🐷 꿀꿀아 점메추</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {exchanges.length === 0 && (
                <p className="text-sm text-gray-400">
                  예산, 인원, 먹고 싶은 음식을 자유롭게 말해보세요.
                  <br />
                  예: &quot;만원으로 혼밥, 국물&quot;
                </p>
              )}

              <div className="flex flex-col gap-4">
                {exchanges.map((ex, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-orange-500 px-3 py-2 text-sm text-white">
                      {ex.query}
                    </div>

                    {ex.loading && (
                      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-500">
                        꿀꿀... 찾는 중 🐷
                      </div>
                    )}

                    {ex.error && (
                      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-red-50 px-3 py-2 text-sm text-red-500">
                        {ex.error}
                      </div>
                    )}

                    {ex.noResultMessage && (
                      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-500">
                        {ex.noResultMessage}
                      </div>
                    )}

                    {ex.recommendation && (
                      <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-gray-50 p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl leading-none">
                            {getPigStage(ex.recommendation.pigTemperature).emoji}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              {ex.recommendation.storeName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDistance(ex.recommendation.distanceMeters)}
                              {ex.recommendation.menuName && ` · ${ex.recommendation.menuName}`}
                              {ex.recommendation.price != null &&
                                ` ${ex.recommendation.price.toLocaleString()}원`}
                            </p>
                          </div>
                        </div>

                        <p className="mt-2 text-sm text-gray-700">{ex.recommendation.reason}</p>

                        {ex.recommendation.quote && (
                          <p className="mt-2 border-l-2 border-orange-300 pl-2 text-xs italic text-gray-500">
                            &quot;{ex.recommendation.quote}&quot;
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={() => router.push(`/store/${ex.recommendation!.storeId}`)}
                          className="mt-3 w-full rounded-full bg-orange-500 py-2 text-sm font-bold text-white"
                        >
                          바로가기
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAsk();
                }}
                placeholder="예: 만원으로 혼밥, 국물"
                className="flex-1 rounded-full border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400"
              />
              <button
                type="button"
                onClick={handleAsk}
                className="rounded-full bg-orange-500 px-4 py-2.5 text-sm font-bold text-white"
              >
                물어보기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
