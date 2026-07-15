import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicClient } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MIN_REVIEWS_FOR_SUMMARY = 3;
const MAX_REVIEWS_IN_PROMPT = 40;

const SummarySchema = z.object({
  pick: z.string().describe("리뷰에서 가장 많이 언급된 대표 메뉴나 강점. 한 문장 이내"),
  owner: z
    .string()
    .describe(
      "사장님/서비스/친절함 등 사람과 관련해 리뷰에 실제로 언급된 내용. 한 문장 이내. 관련 언급이 없으면 '아직 파악된 내용이 없어요'라고 써",
    ),
  tip: z
    .string()
    .describe(
      "웨이팅, 방문 시간대, 주문 팁 등 리뷰에서 발견되는 실용적인 팁. 한 문장 이내. 없으면 '아직 파악된 팁이 없어요'라고 써",
    ),
});

const SYSTEM_PROMPT = `너는 착한가격업소의 방문 인증 리뷰들을 세 줄로 요약하는 도우미야.

규칙:
- 반드시 제공된 리뷰 텍스트에 실제로 쓰여 있는 내용만 사용해. 리뷰에 없는 메뉴, 사실, 디테일을 절대 지어내지 마.
- 여러 리뷰에서 공통으로 나오는 내용을 우선해.
- 각 항목은 한 문장 이내로 간결하게 써.
- 해당 정보가 리뷰에 없으면 억지로 만들어내지 말고 정직하게 정보가 없다고 표시해.`;

function formatSummary(parsed: { pick: string; owner: string; tip: string }) {
  return `🍽 대표 픽: ${parsed.pick}\n👨‍🍳 사장님: ${parsed.owner}\n💡 꿀팁: ${parsed.tip}`;
}

export async function POST(request: Request) {
  if (!rateLimit(`summary:${getClientIp(request)}`, 10)) {
    return rateLimitResponse();
  }

  const { storeId } = (await request.json()) as { storeId?: string };

  if (!storeId) {
    return NextResponse.json({ error: "storeId는 필수입니다." }, { status: 400 });
  }

  const supabase = createClient();

  const { count: totalReviewCount } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);

  if (!totalReviewCount || totalReviewCount < MIN_REVIEWS_FOR_SUMMARY) {
    return NextResponse.json({ skipped: true, reason: "리뷰가 3개 미만입니다." });
  }

  const { data: reviews, error: reviewsError } = await supabase
    .from("reviews")
    .select("content")
    .eq("store_id", storeId)
    .not("content", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_REVIEWS_IN_PROMPT);

  if (reviewsError) {
    return NextResponse.json({ error: reviewsError.message }, { status: 500 });
  }

  const reviewTexts = (reviews ?? [])
    .map((r) => r.content)
    .filter((text): text is string => Boolean(text));

  if (reviewTexts.length === 0) {
    return NextResponse.json({ skipped: true, reason: "텍스트가 있는 리뷰가 없습니다." });
  }

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `아래는 한 가게에 대한 방문 인증 리뷰 ${reviewTexts.length}개야.\n\n${reviewTexts
          .map((text, i) => `${i + 1}. ${text}`)
          .join("\n")}`,
      },
    ],
    output_config: { format: zodOutputFormat(SummarySchema) },
  });

  if (!response.parsed_output) {
    return NextResponse.json({ error: "AI 요약 생성에 실패했습니다." }, { status: 502 });
  }

  const summary = formatSummary(response.parsed_output);

  await supabase
    .from("stores")
    .update({ ai_summary: summary, ai_summary_updated_at: new Date().toISOString() })
    .eq("id", storeId);

  return NextResponse.json({ summary });
}
