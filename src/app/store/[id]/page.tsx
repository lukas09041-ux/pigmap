import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPigStage, AD_UNLOCK_TEMP } from "@/lib/pig-stage";
import { getPigLevel, type PigItemId } from "@/lib/pig-avatar";
import { formatRelativeTime } from "@/lib/format-time";
import type { Review } from "@/types/review";
import AdCard from "@/components/AdCard";
import CertifyButton from "@/components/CertifyButton";
import UserPigAvatar from "@/components/pig/UserPigAvatar";

export default async function StorePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: store } = await supabase
    .from("stores")
    .select(
      "id, name, category, address, menu_name, price, phone, pig_temperature, ai_summary, kakao_summary, kakao_rating, kakao_review_count, kakao_strengths, ad_headline, ad_body_line1, ad_body_line2, ad_hashtags",
    )
    .eq("id", params.id)
    .single();

  if (!store) notFound();

  const adUnlocked = store.pig_temperature >= AD_UNLOCK_TEMP;
  const initialAd =
    store.ad_headline && store.ad_body_line1 && store.ad_body_line2 && store.ad_hashtags
      ? {
          headline: store.ad_headline as string,
          bodyLine1: store.ad_body_line1 as string,
          bodyLine2: store.ad_body_line2 as string,
          hashtags: store.ad_hashtags as string[],
        }
      : null;

  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, user_id, photo_url, content, created_at")
    .eq("store_id", params.id)
    .order("created_at", { ascending: false });

  // 리뷰 작성자들의 꿀꿀이 프로필 (아바타 렌더링용)
  const authorIds = Array.from(
    new Set((reviews ?? []).map((r) => r.user_id).filter(Boolean)),
  ) as string[];
  const { data: authorProfiles } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id, cert_count, equipped_items")
        .in("id", authorIds)
    : { data: [] };
  const profileMap = new Map(
    (authorProfiles ?? []).map((p) => [
      p.id as string,
      { certCount: p.cert_count as number, equipped: (p.equipped_items ?? []) as PigItemId[] },
    ]),
  );

  const stage = getPigStage(store.pig_temperature);

  return (
    <main className="min-h-dvh bg-white pb-28">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-white/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-xl text-gray-600" aria-label="지도로 돌아가기">
          ←
        </Link>
        <p className="truncate text-sm font-semibold text-gray-700">{store.name}</p>
      </div>

      {/* ① 돼지 온도 */}
      <section className="flex flex-col items-center gap-1 px-4 pb-6 pt-4 text-center">
        <span className={`${stage.detailSizeClass} leading-none`}>{stage.emoji}</span>
        <p className="mt-2 text-2xl font-extrabold text-gray-900">
          {stage.label} {store.pig_temperature.toFixed(1)}°
        </p>
        <h1 className="mt-3 text-lg font-bold text-gray-800">{store.name}</h1>
        <p className="text-sm text-gray-500">
          {store.category}
          {store.category && " · "}
          {store.address}
        </p>
      </section>

      {/* ② 대표 메뉴 */}
      {store.menu_name && (
        <section className="mx-4 mb-6 flex items-center justify-between rounded-xl bg-orange-50 px-4 py-3">
          <span className="font-medium text-gray-800">{store.menu_name}</span>
          {store.price != null && (
            <span className="font-bold text-orange-600">{store.price.toLocaleString()}원</span>
          )}
        </section>
      )}

      {/* 광고 자동 생성 (킬러 피처) */}
      {adUnlocked && (
        <AdCard
          storeId={store.id}
          storeName={store.name}
          menuName={store.menu_name}
          price={store.price}
          pigTemperature={store.pig_temperature}
          initialAd={initialAd}
        />
      )}

      {/* ③ AI 요약 */}
      <section className="mx-4 mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-400">
          {store.ai_summary ? "AI 핵심 3줄 요약" : "카카오맵 정보"}
        </h2>
        {store.ai_summary ? (
          <div className="rounded-xl bg-orange-50 p-4 text-sm leading-relaxed text-gray-800">
            {store.ai_summary.split("\n").map((line: string, i: number) => (
              <p key={i} className={i > 0 ? "mt-1.5" : undefined}>
                {line}
              </p>
            ))}
          </div>
        ) : store.kakao_summary ? (
          <div className="space-y-3">
            {store.kakao_rating != null && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-yellow-500">★ {store.kakao_rating.toFixed(1)}</span>
                <span className="text-xs text-gray-500">
                  ({store.kakao_review_count ?? 0}개 리뷰)
                </span>
              </div>
            )}
            {store.kakao_strengths && Array.isArray(store.kakao_strengths) && (
              <div className="flex flex-wrap gap-1.5">
                {(store.kakao_strengths as string[]).map((strength: string) => (
                  <span
                    key={strength}
                    className="inline-block rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600"
                  >
                    {strength}
                  </span>
                ))}
              </div>
            )}
            <div className="rounded-xl bg-orange-50 p-4 text-sm leading-relaxed text-gray-800">
              {store.kakao_summary.split("\n").map((line: string, i: number) => (
                <p key={i} className={i > 0 ? "mt-1.5" : undefined}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm leading-relaxed text-gray-400">
            리뷰가 모이면 AI가 요약해줘요
            <br />
            리뷰가 모이면 AI가 요약해줘요
            <br />
            리뷰가 모이면 AI가 요약해줘요
          </div>
        )}
      </section>

      {/* ④ 리뷰 피드 */}
      <section>
        <h2 className="mb-3 px-4 text-sm font-semibold text-gray-400">
          리뷰 {reviews?.length ?? 0}
        </h2>

        {reviews && reviews.length > 0 ? (
          <div className="flex flex-col gap-8">
            {reviews.map((review: Review) => {
              const author = review.user_id ? profileMap.get(review.user_id) : undefined;
              const authorLevel = author ? getPigLevel(author.certCount) : null;

              return (
                <article key={review.id}>
                  {/* 작성자 꿀꿀이 아바타 */}
                  <div className="mb-2 flex items-center gap-2 px-4">
                    <UserPigAvatar
                      level={authorLevel?.level ?? 0}
                      equipped={author?.equipped ?? []}
                      size={32}
                    />
                    <span className="text-xs font-semibold text-gray-600">
                      {authorLevel ? authorLevel.name : "꿀꿀이"}
                    </span>
                  </div>
                  {review.photo_url && (
                    <div className="relative aspect-square w-full bg-gray-100">
                      <Image
                        src={review.photo_url}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 100vw, 768px"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="px-4 pt-2">
                    <p className="truncate text-sm text-gray-800">{review.content}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {formatRelativeTime(review.created_at)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="px-4 text-sm text-gray-400">
            아직 인증된 리뷰가 없어요. 첫 즉흥 인증을 남겨보세요!
          </p>
        )}
      </section>

      <CertifyButton storeId={store.id} />
    </main>
  );
}
