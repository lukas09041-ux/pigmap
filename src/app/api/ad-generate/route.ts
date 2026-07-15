import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicClient } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getPigStage, AD_UNLOCK_TEMP } from "@/lib/pig-stage";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MAX_REVIEWS_IN_PROMPT = 30;

const AdCopySchema = z.object({
  headline: z.string().describe("인스타 카드뉴스 헤드라인. 15자 이내, 임팩트 있게"),
  bodyLine1: z.string().describe("본문 첫 줄. 20자 이내"),
  bodyLine2: z.string().describe("본문 둘째 줄. 20자 이내"),
  hashtags: z.array(z.string()).describe("해시태그 5개 이내. # 기호 없이 단어만"),
});

const SYSTEM_PROMPT = `너는 착한가격업소 홍보 카드뉴스를 만드는 카피라이터야.
가게의 실제 리뷰와 메뉴 정보를 바탕으로 인스타그램 카드뉴스용 짧은 카피를 만들어.

규칙:
- 반드시 제공된 리뷰/메뉴 정보에 실제로 있는 내용만 사용해. 없는 메뉴나 사실을 지어내지 마.
- 헤드라인은 임팩트 있고 짧게(15자 이내), 본문은 두 줄로 리뷰에서 느껴지는 매력을 압축해.
- 해시태그는 5개 이내로, 착한가격업소/동네맛집 같은 톤을 살려.`;

export async function POST(request: Request) {
  if (!rateLimit(`ad-generate:${getClientIp(request)}`, 5)) {
    return rateLimitResponse();
  }

  const { storeId } = (await request.json()) as { storeId?: string };
  if (!storeId) {
    return NextResponse.json({ error: "storeId는 필수입니다." }, { status: 400 });
  }

  const supabase = createClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, category, menu_name, price, pig_temperature")
    .eq("id", storeId)
    .single();

  if (storeError || !store) {
    return NextResponse.json({ error: "가게를 찾을 수 없습니다." }, { status: 404 });
  }

  if (store.pig_temperature < AD_UNLOCK_TEMP) {
    return NextResponse.json(
      { error: `아직 광고 생성 조건(${getPigStage(AD_UNLOCK_TEMP).label} 이상)을 만족하지 않아요.` },
      { status: 403 },
    );
  }

  const { data: reviews } = await supabase
    .from("reviews")
    .select("content")
    .eq("store_id", storeId)
    .not("content", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_REVIEWS_IN_PROMPT);

  const reviewTexts = (reviews ?? [])
    .map((r) => r.content)
    .filter((text): text is string => Boolean(text));

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `가게명: ${store.name}\n업종: ${store.category ?? "정보 없음"}\n대표메뉴: ${
          store.menu_name ?? "정보 없음"
        }${store.price != null ? ` (${store.price.toLocaleString()}원)` : ""}\n돼지 온도: ${
          store.pig_temperature
        }\n\n실제 리뷰:\n${reviewTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
      },
    ],
    output_config: { format: zodOutputFormat(AdCopySchema) },
  });

  if (!response.parsed_output) {
    return NextResponse.json({ error: "광고 생성에 실패했습니다." }, { status: 502 });
  }

  const { headline, bodyLine1, bodyLine2, hashtags } = response.parsed_output;

  await supabase
    .from("stores")
    .update({
      ad_headline: headline,
      ad_body_line1: bodyLine1,
      ad_body_line2: bodyLine2,
      ad_hashtags: hashtags,
      ad_generated_at: new Date().toISOString(),
    })
    .eq("id", storeId);

  return NextResponse.json({ headline, bodyLine1, bodyLine2, hashtags });
}
