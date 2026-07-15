import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicClient } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { boundingBox, haversineDistanceMeters } from "@/lib/geo";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const SEARCH_RADIUS_METERS = 2000;
const MAX_CANDIDATES = 15;
const MAX_REVIEWS_PER_STORE = 3;

const RecommendationSchema = z.object({
  storeId: z
    .string()
    .describe("추천할 가게의 id. 반드시 제공된 후보 목록의 id 중 하나와 정확히 일치해야 해"),
  reason: z
    .string()
    .describe(
      "추천 이유 2~3문장. 유저의 요청과 왜 잘 맞는지 설명하고, 반드시 제공된 리뷰 문구를 그대로 인용해서 포함해",
    ),
  quote: z
    .string()
    .describe("추천 이유에 인용한 실제 리뷰 원문. 제공된 리뷰 텍스트 중 하나를 그대로 복사해서 넣어"),
});

const SYSTEM_PROMPT = `너는 착한가격업소 지도 앱 "피그맵"의 점심 메뉴 추천 도우미 "꿀꿀이"야.
유저가 원하는 조건(예산, 인원, 음식 종류, 기분 등)에 맞는 가게를 후보 목록 중에서 딱 1곳만 골라 추천해.

규칙:
- 반드시 제공된 후보 목록 안에서만 골라. 목록에 없는 가게를 지어내거나 다른 가게 이름을 만들어내지 마.
- 추천 이유에는 반드시 그 가게의 실제 리뷰 문구를 그대로 인용해. 리뷰에 없는 내용을 지어내지 마.
- 유저의 예산/인원/음식 종류 조건과 가장 잘 맞는 가게를 골라.
- 말투는 친근하고 짧게, 이모지는 과하지 않게.`;

type StoreRow = {
  id: string;
  name: string;
  category: string | null;
  menu_name: string | null;
  price: number | null;
  pig_temperature: number;
  ai_summary: string | null;
  latitude: number;
  longitude: number;
};

// AI 호출이 실패해도 빈손으로 돌려보내지 않는 규칙 기반 폴백 —
// 가까운 5곳 중 돼지 온도가 가장 높은 집을 추천한다.
function ruleBasedFallback(
  stores: (StoreRow & { distanceMeters: number })[],
  reviewsByStore: Map<string, string[]>,
) {
  const picked = [...stores]
    .slice(0, 5)
    .sort((a, b) => b.pig_temperature - a.pig_temperature)[0];

  return NextResponse.json({
    storeId: picked.id,
    storeName: picked.name,
    category: picked.category,
    menuName: picked.menu_name,
    price: picked.price,
    pigTemperature: picked.pig_temperature,
    distanceMeters: Math.round(picked.distanceMeters),
    reason: `꿀꿀이가 잠깐 조는 바람에... 지금은 온도 높은 가까운 집을 보여드릴게요! ${picked.name}${
      picked.menu_name ? `의 ${picked.menu_name}` : ""
    } 어때요? 🐷`,
    quote: reviewsByStore.get(picked.id)?.[0] ?? "",
  });
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
  const box = boundingBox(lat, lng, SEARCH_RADIUS_METERS);

  const { data: nearbyStores, error: storesError } = await supabase
    .from("stores")
    .select(
      "id, name, category, menu_name, price, pig_temperature, ai_summary, latitude, longitude",
    )
    .gte("latitude", box.minLat)
    .lte("latitude", box.maxLat)
    .gte("longitude", box.minLng)
    .lte("longitude", box.maxLng)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (storesError) {
    return NextResponse.json({ error: storesError.message }, { status: 500 });
  }

  const withinRadius = ((nearbyStores as StoreRow[]) ?? [])
    .map((store) => ({
      ...store,
      distanceMeters: haversineDistanceMeters(lat, lng, store.latitude, store.longitude),
    }))
    .filter((store) => store.distanceMeters <= SEARCH_RADIUS_METERS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (withinRadius.length === 0) {
    return NextResponse.json({
      noResult: true,
      message: "반경 2km 안에 등록된 착한가격업소가 없어요.",
    });
  }

  const storeIds = withinRadius.map((s) => s.id);

  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("store_id, content")
    .in("store_id", storeIds)
    .not("content", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  const reviewsByStore = new Map<string, string[]>();
  for (const row of (reviewRows as { store_id: string; content: string | null }[]) ?? []) {
    if (!row.content) continue;
    const list = reviewsByStore.get(row.store_id) ?? [];
    if (list.length < MAX_REVIEWS_PER_STORE) {
      list.push(row.content);
      reviewsByStore.set(row.store_id, list);
    }
  }

  const candidates = withinRadius
    .filter((store) => reviewsByStore.has(store.id))
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    // 리뷰 달린 가게가 없으면 AI 없이 규칙 기반으로라도 추천
    return ruleBasedFallback(withinRadius, reviewsByStore);
  }

  const candidateContext = candidates.map((store) => ({
    id: store.id,
    name: store.name,
    category: store.category,
    menu: store.menu_name,
    price: store.price,
    temperature: store.pig_temperature,
    distanceMeters: Math.round(store.distanceMeters),
    summary: store.ai_summary,
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
    return ruleBasedFallback(withinRadius, reviewsByStore);
  }

  if (!response.parsed_output) {
    return ruleBasedFallback(withinRadius, reviewsByStore);
  }

  const picked =
    candidates.find((c) => c.id === response.parsed_output!.storeId) ?? candidates[0];
  const pickedReviews = reviewsByStore.get(picked.id) ?? [];

  let quote = response.parsed_output.quote?.trim() ?? "";
  const isRealQuote = pickedReviews.some((text) => text.includes(quote));
  if (!quote || !isRealQuote) {
    quote = pickedReviews[0] ?? "";
  }

  return NextResponse.json({
    storeId: picked.id,
    storeName: picked.name,
    category: picked.category,
    menuName: picked.menu_name,
    price: picked.price,
    pigTemperature: picked.pig_temperature,
    distanceMeters: Math.round(picked.distanceMeters),
    reason: response.parsed_output.reason,
    quote,
  });
}
