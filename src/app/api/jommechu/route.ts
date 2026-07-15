import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicClient } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { boundingBox, haversineDistanceMeters } from "@/lib/geo";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const SEARCH_RADIUS_METERS = 2000;
const MAX_NEARBY_CANDIDATES = 12;
const MAX_FAR_CANDIDATES = 8; // 반경 밖에서도 가까운 순으로 후보에 포함 (음식 종류 매칭용)
const MAX_REVIEWS_PER_STORE = 3;

const RecommendationSchema = z.object({
  storeId: z
    .string()
    .describe("추천할 가게의 id. 반드시 제공된 후보 목록의 id 중 하나와 정확히 일치해야 해"),
  reason: z
    .string()
    .describe(
      "추천 이유 2~3문장. 상황 안내(근처인지, 반경 밖이라 조금 먼지, 찾는 음식이 없어 대안인지)를 첫머리에 자연스럽게 담아",
    ),
  quote: z
    .string()
    .describe(
      "그 가게의 reviews 배열에 있는 실제 리뷰 원문 하나를 그대로 복사. reviews가 비어 있으면 빈 문자열",
    ),
});

const SYSTEM_PROMPT = `너는 착한가격업소 지도 앱 "피그맵"의 점심 메뉴 추천 도우미 "꿀꿀이"야.
유저가 원하는 조건(예산, 인원, 음식 종류, 기분 등)에 맞는 가게를 후보 목록에서 딱 1곳만 골라 추천해.

후보에는 withinRadius(반경 2km 안 여부)와 distanceMeters가 표시돼 있어. 고르는 우선순위:
1. 조건에 맞는 반경 안 가게
2. 조건에 맞는 가게가 반경 안에 없으면 → 반경 밖에서 가장 가까운 조건 맞는 가게
3. 조건에 맞는 가게가 아예 없으면 → 가장 비슷한 대안 (반경 안 우선)

상황 안내 규칙 (reason 첫머리에 자연스럽게):
- 반경 밖 가게를 골랐으면 솔직하게 알려줘. 예: "근처 2km 안엔 짜장면집이 없어서, 조금 멀지만 가장 가까운 곳으로 골랐어요! (3.2km)"
- 찾는 음식이 후보 어디에도 없어 대안을 추천할 땐 그 사실을 먼저 말해줘. 예: "근처에 초밥집은 없지만, 대신 이런 곳은 어때요?"
- 반경 안에서 조건에 딱 맞으면 안내 없이 바로 추천해.

그 외 규칙:
- 반드시 제공된 후보 목록 안에서만 골라. 목록에 없는 가게를 지어내지 마.
- 근거는 menu/category/reviews/kakaoSummary/kakaoStrengths에 실제로 있는 내용만 사용해.
- quote는 그 가게의 reviews 배열에 있는 문장만 그대로 복사하고, reviews가 비어 있으면 빈 문자열로 둬.
- 말투는 친근하고 짧게, 이모지는 과하지 않게.`;

type StoreRow = {
  id: string;
  name: string;
  category: string | null;
  menu_name: string | null;
  price: number | null;
  pig_temperature: number;
  ai_summary: string | null;
  kakao_summary: string | null;
  kakao_strengths: string[] | null;
  kakao_rating: number | null;
  latitude: number;
  longitude: number;
};

type StoreWithDistance = StoreRow & { distanceMeters: number };

function toResponse(
  picked: StoreWithDistance,
  reason: string,
  quote: string,
) {
  return NextResponse.json({
    storeId: picked.id,
    storeName: picked.name,
    category: picked.category,
    menuName: picked.menu_name,
    price: picked.price,
    pigTemperature: picked.pig_temperature,
    distanceMeters: Math.round(picked.distanceMeters),
    reason,
    quote,
  });
}

// AI 호출이 실패해도 빈손으로 돌려보내지 않는 규칙 기반 폴백.
// 근처(2km) 가게가 있으면 그중 온도 높은 집, 없으면 가장 가까운 집을 거리 안내와 함께 추천한다.
function ruleBasedFallback(
  sorted: StoreWithDistance[],
  reviewsByStore: Map<string, string[]>,
) {
  const nearby = sorted.filter((s) => s.distanceMeters <= SEARCH_RADIUS_METERS);

  if (nearby.length > 0) {
    const picked = [...nearby.slice(0, 5)].sort(
      (a, b) => b.pig_temperature - a.pig_temperature,
    )[0];
    return toResponse(
      picked,
      `지금은 온도 높은 가까운 집을 보여드릴게요! ${picked.name}${
        picked.menu_name ? `의 ${picked.menu_name}` : ""
      } 어때요? 🐷`,
      reviewsByStore.get(picked.id)?.[0] ?? "",
    );
  }

  const picked = sorted[0];
  const km = (picked.distanceMeters / 1000).toFixed(1);
  return toResponse(
    picked,
    `근처 2km 안엔 등록된 착한가게가 없어요. 가장 가까운 곳은 ${km}km 거리의 ${picked.name}${
      picked.menu_name ? ` (${picked.menu_name})` : ""
    }이에요! 🐷`,
    reviewsByStore.get(picked.id)?.[0] ?? "",
  );
}

export async function POST(request: Request) {
  if (!rateLimit(`jommechu:${getClientIp(request)}`, 10)) {
    return rateLimitResponse();
  }

  const { query, lat, lng } = (await request.json()) as {
    query?: string;
    lat?: number;
    lng?: number;
  };

  if (!query?.trim() || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "query, lat, lng는 필수입니다." }, { status: 400 });
  }

  const supabase = createClient();

  // 전국 1.2만 가게를 전부 받을 수는 없으니 바운딩 박스를 10km → 50km로 넓혀가며 찾는다.
  // (10km면 도시 지역은 충분하고, 시골에서도 50km 안엔 대부분 착한가게가 있다)
  let fetched: StoreRow[] = [];
  for (const radius of [10_000, 50_000]) {
    const box = boundingBox(lat, lng, radius);
    const { data, error: storesError } = await supabase
      .from("stores")
      .select(
        "id, name, category, menu_name, price, pig_temperature, ai_summary, kakao_summary, kakao_strengths, kakao_rating, latitude, longitude",
      )
      .gte("latitude", box.minLat)
      .lte("latitude", box.maxLat)
      .gte("longitude", box.minLng)
      .lte("longitude", box.maxLng)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(1000);

    if (storesError) {
      return NextResponse.json({ error: storesError.message }, { status: 500 });
    }
    fetched = (data as StoreRow[]) ?? [];
    if (fetched.length > 0) break;
  }

  const sorted: StoreWithDistance[] = fetched
    .map((store) => ({
      ...store,
      distanceMeters: haversineDistanceMeters(lat, lng, store.latitude, store.longitude),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (sorted.length === 0) {
    return NextResponse.json({
      noResult: true,
      message: "반경 50km 안에 등록된 착한가격업소가 없어요. 🐷",
    });
  }

  const nearby = sorted
    .filter((s) => s.distanceMeters <= SEARCH_RADIUS_METERS)
    .slice(0, MAX_NEARBY_CANDIDATES);
  const far = sorted
    .filter((s) => s.distanceMeters > SEARCH_RADIUS_METERS)
    .slice(0, MAX_FAR_CANDIDATES);
  const candidates = [...nearby, ...far];

  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("store_id, content")
    .in(
      "store_id",
      candidates.map((s) => s.id),
    )
    .not("content", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const reviewsByStore = new Map<string, string[]>();
  for (const row of (reviewRows as { store_id: string; content: string | null }[]) ?? []) {
    if (!row.content) continue;
    const list = reviewsByStore.get(row.store_id) ?? [];
    if (list.length < MAX_REVIEWS_PER_STORE) {
      list.push(row.content);
      reviewsByStore.set(row.store_id, list);
    }
  }

  const candidateContext = candidates.map((store) => ({
    id: store.id,
    name: store.name,
    category: store.category,
    menu: store.menu_name,
    price: store.price,
    temperature: store.pig_temperature,
    distanceMeters: Math.round(store.distanceMeters),
    withinRadius: store.distanceMeters <= SEARCH_RADIUS_METERS,
    summary: store.ai_summary,
    kakaoSummary: store.kakao_summary,
    kakaoStrengths: store.kakao_strengths,
    kakaoRating: store.kakao_rating,
    reviews: reviewsByStore.get(store.id) ?? [],
  }));

  let response;
  try {
    const anthropic = createAnthropicClient();
    response = await anthropic.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `유저 요청: "${query.trim()}"\n\n후보 가게 목록(JSON):\n${JSON.stringify(candidateContext, null, 2)}`,
        },
      ],
      output_config: { format: zodOutputFormat(RecommendationSchema) },
    });
  } catch {
    // 타임아웃/AI 장애 시에도 서비스는 계속 — 규칙 기반 폴백
    return ruleBasedFallback(sorted, reviewsByStore);
  }

  if (!response.parsed_output) {
    return ruleBasedFallback(sorted, reviewsByStore);
  }

  const picked =
    candidates.find((c) => c.id === response.parsed_output!.storeId) ?? candidates[0];
  const pickedReviews = reviewsByStore.get(picked.id) ?? [];

  // 인용은 실제 리뷰에 있는 문장일 때만 노출 (리뷰가 없는 가게면 빈 문자열)
  let quote = response.parsed_output.quote?.trim() ?? "";
  if (!quote || !pickedReviews.some((text) => text.includes(quote))) {
    quote = pickedReviews[0] ?? "";
  }

  return toResponse(picked, response.parsed_output.reason, quote);
}
