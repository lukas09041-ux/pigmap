import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient() {
  // 서버리스 함수가 오래 매달리지 않도록 요청당 20초 제한, 재시도는 1회만.
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 20_000,
    maxRetries: 1,
  });
}
