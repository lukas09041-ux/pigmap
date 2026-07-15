"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/AuthProvider";
import LevelUpModal from "@/components/pig/LevelUpModal";

type Mood = "good" | "neutral" | "bad";

const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: "good", emoji: "😋", label: "좋았어" },
  { value: "neutral", emoji: "😐", label: "그냥" },
  { value: "bad", emoji: "😕", label: "별로" },
];

export default function CertifyPage({ params }: { params: { id: string } }) {
  const storeId = params.id;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, loading: authLoading, requireAuth } = useAuth();

  const [storeName, setStoreName] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("stores")
      .select("name")
      .eq("id", storeId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setStoreName(data?.name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  // 이 페이지에 링크나 뒤로가기 등으로 바로 들어온 경우까지 보호 —
  // 로그인 안 된 상태면 로그인 시트를 띄우고, 취소하면 이전 화면으로 되돌린다.
  useEffect(() => {
    if (authLoading || user) return;
    let cancelled = false;
    requireAuth(`/store/${storeId}/certify`).then((u) => {
      if (!cancelled && !u) router.back();
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, storeId, requireAuth, router]);

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!photoFile || !mood || submitting || !user) return;
    setSubmitting(true);
    setError(null);

    const supabase = createClient();

    // 레벨업 감지용 — 인증 전 레벨을 기억해뒀다가 등록 후와 비교한다.
    const { data: preProfile } = await supabase
      .from("profiles")
      .select("pig_level")
      .eq("id", user.id)
      .maybeSingle();
    const preLevel = preProfile?.pig_level ?? 0;

    const ext = photoFile.name.split(".").pop() || "jpg";
    const path = `${storeId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("review-photos")
      .upload(path, photoFile);

    if (uploadError) {
      setError(uploadError.message);
      setSubmitting(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("review-photos").getPublicUrl(path);

    const trimmedContent = content.trim() || null;

    const { data: review, error: insertError } = await supabase
      .from("reviews")
      .insert({
        store_id: storeId,
        user_id: user.id,
        photo_url: publicUrl,
        content: trimmedContent,
        mood,
      })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    // 돼지 온도 계산과 AI 요약 갱신은 백그라운드에서 처리 — 인증 완료 UX를 막지 않는다.
    fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    }).catch(() => {});

    fetch("/api/temperature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId: review.id,
        storeId,
        content: trimmedContent,
        mood,
      }),
    }).catch(() => {});

    // 레벨업 확인 — DB 트리거가 insert 시점에 profiles를 갱신하므로 바로 조회 가능
    const { data: postProfile } = await supabase
      .from("profiles")
      .select("pig_level")
      .eq("id", user.id)
      .maybeSingle();
    const postLevel = postProfile?.pig_level ?? preLevel;

    setShowSuccess(true);
    setTimeout(() => {
      if (postLevel > preLevel) {
        // 레벨업! 축하 모달을 띄우고, 닫을 때 가게 페이지로 이동
        setShowSuccess(false);
        setLevelUp({ from: preLevel, to: postLevel });
      } else {
        router.push(`/store/${storeId}`);
        router.refresh();
      }
    }, 1400);
  }

  function handleLevelUpClose() {
    router.push(`/store/${storeId}`);
    router.refresh();
  }

  const canSubmit = photoFile !== null && mood !== null && !submitting && !!user;

  if (authLoading || !user) {
    return (
      <main className="flex h-dvh items-center justify-center bg-white">
        <p className="text-sm text-gray-400">로그인이 필요해요</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-white pb-8">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="text-xl text-gray-600"
        >
          ←
        </button>
        <p className="truncate text-sm font-semibold text-gray-700">
          {storeName ?? "즉흥 인증"}
        </p>
      </div>

      <div className="px-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50"
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-gray-400">
              <span className="text-4xl">📷</span>
              <span className="text-sm font-medium">사진 촬영 또는 선택</span>
            </span>
          )}
        </button>

        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="한 줄 소감 (선택)"
          maxLength={80}
          className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400"
        />

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-gray-500">오늘 기분은?</p>
          <div className="grid grid-cols-3 gap-2">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMood(m.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border py-3 transition ${
                  mood === m.value
                    ? "border-orange-400 bg-orange-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <span className="text-3xl">{m.emoji}</span>
                <span className="text-xs font-medium text-gray-600">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-6 w-full rounded-full bg-orange-500 py-3.5 text-base font-bold text-white disabled:bg-gray-200 disabled:text-gray-400"
        >
          {submitting ? "인증하는 중..." : "인증하기"}
        </button>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/95">
          <span className="animate-certify-pop text-7xl">🐷</span>
          <p className="animate-certify-pop text-xl font-extrabold text-gray-900">인증 완료!</p>
        </div>
      )}

      {levelUp && (
        <LevelUpModal
          fromLevel={levelUp.from}
          toLevel={levelUp.to}
          onClose={handleLevelUpClose}
        />
      )}
    </main>
  );
}
