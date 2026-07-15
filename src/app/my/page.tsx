"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/format-time";
import { getPigLevel, getNextPigLevel, type PigItemId } from "@/lib/pig-avatar";
import UserPigAvatar from "@/components/pig/UserPigAvatar";
import PigDressupSheet from "@/components/pig/PigDressupSheet";

const MOOD_EMOJI: Record<string, string> = { good: "😋", neutral: "😐", bad: "😕" };

type PigProfile = {
  pig_level: number;
  cert_count: number;
  equipped_items: PigItemId[];
  unlocked_items: PigItemId[];
};

type MyReview = {
  id: string;
  store_id: string;
  photo_url: string | null;
  content: string | null;
  mood: string;
  created_at: string;
  storeName: string;
  storeCategory: string | null;
};

function getKakaoProfile(user: User) {
  // NOTE: Supabase가 카카오 프로필을 user_metadata에 매핑하는 정확한 키는 실제 카카오 로그인
  // 연동 후 확인 필요 — 흔히 쓰이는 후보 키들을 방어적으로 순서대로 조회한다.
  const meta = user.user_metadata ?? {};
  const nickname =
    meta.name ??
    meta.full_name ??
    meta.nickname ??
    meta.user_name ??
    meta.preferred_username ??
    null;
  const avatarUrl = meta.avatar_url ?? meta.picture ?? meta.profile_image ?? null;
  return { nickname, avatarUrl };
}

export default function MyPage() {
  const { user, loading: authLoading, requireAuth } = useAuth();
  const [reviews, setReviews] = useState<MyReview[] | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [view, setView] = useState<"grid" | "diary">("grid");
  const [linking, setLinking] = useState(false);
  const [profile, setProfile] = useState<PigProfile | null>(null);
  const [dressupOpen, setDressupOpen] = useState(false);

  useEffect(() => {
    if (authLoading || user) return;
    requireAuth("/my");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      const supabase = createClient();

      // 내 꿀꿀이 프로필 — 트리거가 못 만든 경우(마이그레이션 이전 가입 등) 직접 생성
      const { data: pigProfile } = await supabase
        .from("profiles")
        .select("pig_level, cert_count, equipped_items, unlocked_items")
        .eq("id", user!.id)
        .maybeSingle();

      if (cancelled) return;

      if (pigProfile) {
        setProfile(pigProfile as PigProfile);
      } else {
        await supabase.from("profiles").insert({ id: user!.id });
        if (cancelled) return;
        setProfile({ pig_level: 0, cert_count: 0, equipped_items: [], unlocked_items: [] });
      }

      const { data: myReviews } = await supabase
        .from("reviews")
        .select("id, store_id, photo_url, content, mood, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      const storeIds = Array.from(new Set((myReviews ?? []).map((r) => r.store_id)));
      const { data: stores } = storeIds.length
        ? await supabase.from("stores").select("id, name, category").in("id", storeIds)
        : { data: [] as { id: string; name: string; category: string | null }[] };

      if (cancelled) return;

      const storeMap = new Map((stores ?? []).map((s) => [s.id, s]));
      const merged: MyReview[] = (myReviews ?? []).map((r) => ({
        ...r,
        storeName: storeMap.get(r.store_id)?.name ?? "삭제된 가게",
        storeCategory: storeMap.get(r.store_id)?.category ?? null,
      }));

      setReviews(merged);
      setLoadingReviews(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const stats = useMemo(() => {
    if (!reviews) return { monthCount: 0, topCategories: [] as string[] };

    const now = new Date();
    const monthCount = reviews.filter((r) => {
      const d = new Date(r.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;

    const categoryCounts = new Map<string, number>();
    for (const r of reviews) {
      if (!r.storeCategory) continue;
      categoryCounts.set(r.storeCategory, (categoryCounts.get(r.storeCategory) ?? 0) + 1);
    }
    const topCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category);

    return { monthCount, topCategories };
  }, [reviews]);

  async function handleLinkKakao() {
    setLinking(true);
    const supabase = createClient();
    // TODO(MVP 단순화): 익명 → 카카오 연결은 Supabase Auth에서 "Allow manual linking"을 켜야 동작한다.
    // 이미 다른 계정에 연결된 카카오 계정과 충돌하는 등의 예외 처리는 지금은 기본 alert로만 처리한다.
    const { error } = await supabase.auth.linkIdentity({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/my`,
        scopes: "profile_nickname profile_image",
      },
    });
    if (error) {
      alert("연결에 실패했어요: " + error.message);
      setLinking(false);
    }
  }

  if (authLoading || !user) {
    return (
      <main className="flex h-dvh items-center justify-center bg-white">
        <p className="text-sm text-gray-400">로그인이 필요해요</p>
      </main>
    );
  }

  const { nickname, avatarUrl } = getKakaoProfile(user);
  const displayName = user.is_anonymous ? "익명의 꿀꿀이" : nickname ?? "피그맵 유저";

  const certCount = profile?.cert_count ?? 0;
  const pigLevel = getPigLevel(certCount);
  const nextLevel = getNextPigLevel(certCount);
  const progressPct = nextLevel
    ? Math.round(
        ((certCount - pigLevel.minCerts) / (nextLevel.minCerts - pigLevel.minCerts)) * 100,
      )
    : 100;

  return (
    <main className="min-h-dvh bg-white pb-24">
      <div className="sticky top-0 z-10 bg-white/90 px-4 py-3 backdrop-blur">
        <p className="text-sm font-semibold text-gray-700">마이페이지</p>
      </div>

      {/* 내 꿀꿀이 */}
      <section className="flex flex-col items-center px-4 pt-4 text-center">
        <UserPigAvatar
          level={pigLevel.level}
          equipped={profile?.equipped_items ?? []}
          size={120}
        />

        <p className="mt-2 text-xs font-bold text-orange-500">
          {pigLevel.emoji} Lv.{pigLevel.level} {pigLevel.name}
        </p>

        <div className="mt-1 flex items-center gap-2">
          <p className="text-base font-bold text-gray-900">{displayName}</p>
          {avatarUrl && !user.is_anonymous && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
          )}
        </div>

        {/* 다음 레벨 진행바 */}
        <div className="mt-3 w-full max-w-xs">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-orange-400 transition-all"
              style={{ width: `${Math.max(progressPct, 4)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs font-semibold text-gray-500">
            {nextLevel
              ? `${nextLevel.name}까지 ${nextLevel.minCerts - certCount}꿀꿀!`
              : "최고 레벨 달성! 🏆"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDressupOpen(true)}
          className="mt-3 rounded-full bg-orange-500 px-5 py-2 text-sm font-bold text-white"
        >
          🎀 꾸미기
        </button>

        {user.is_anonymous && (
          <button
            type="button"
            onClick={handleLinkKakao}
            disabled={linking}
            className="mt-2 rounded-full border border-[#FEE500] bg-[#FEE500]/20 px-4 py-1.5 text-xs font-bold text-gray-700 disabled:opacity-50"
          >
            💬 {linking ? "연결하는 중..." : "카카오로 연결하기"}
          </button>
        )}

        <p className="mt-3 text-sm font-semibold text-orange-500">
          이번 달 {stats.monthCount}번 꿀꿀 🐷
        </p>

        {stats.topCategories.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {stats.topCategories.map((cat) => (
              <span
                key={cat}
                className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
              >
                {cat}
              </span>
            ))}
          </div>
        )}
      </section>

      {profile && (
        <PigDressupSheet
          open={dressupOpen}
          onClose={() => setDressupOpen(false)}
          userId={user.id}
          certCount={certCount}
          unlocked={profile.unlocked_items}
          equipped={profile.equipped_items}
          onEquippedChange={(items) =>
            setProfile((p) => (p ? { ...p, equipped_items: items } : p))
          }
        />
      )}

      <div className="mt-6 flex items-center justify-between px-4">
        <p className="text-sm font-semibold text-gray-400">내가 남긴 인증</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="그리드 보기"
            className={`rounded-lg px-2 py-1 text-sm ${
              view === "grid" ? "bg-orange-100 text-orange-600" : "text-gray-400"
            }`}
          >
            ▦
          </button>
          <button
            type="button"
            onClick={() => setView("diary")}
            aria-label="다이어리 보기"
            className={`rounded-lg px-2 py-1 text-sm ${
              view === "diary" ? "bg-orange-100 text-orange-600" : "text-gray-400"
            }`}
          >
            ☰
          </button>
        </div>
      </div>

      {loadingReviews ? (
        <p className="mt-6 px-4 text-sm text-gray-400">불러오는 중...</p>
      ) : !reviews || reviews.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 px-4 text-center">
          <p className="text-sm text-gray-400">아직 기록이 없어요. 첫 꿀꿀을 남겨보세요!</p>
          <Link
            href="/"
            className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-white"
          >
            홈으로 가기
          </Link>
        </div>
      ) : view === "grid" ? (
        <div className="mt-3 grid grid-cols-3 gap-0.5">
          {reviews.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setView("diary")}
              className="relative aspect-square bg-gray-100"
            >
              {r.photo_url && (
                <Image
                  src={r.photo_url}
                  alt=""
                  fill
                  sizes="33vw"
                  className="object-cover"
                />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-6 px-4">
          {reviews.map((r) => (
            <article key={r.id} className="flex flex-col gap-2">
              {r.photo_url && (
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-100">
                  <Image
                    src={r.photo_url}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 768px"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">{r.storeName}</p>
                <span className="text-lg">{MOOD_EMOJI[r.mood] ?? ""}</span>
              </div>
              {r.content && <p className="text-sm text-gray-700">{r.content}</p>}
              <p className="text-xs text-gray-400">{formatRelativeTime(r.created_at)}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
