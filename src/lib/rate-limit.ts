// AI 라우트용 초경량 rate limiter (고정 윈도우, 인메모리).
// 서버리스 특성상 인스턴스별로 카운트되지만, 단일 IP의 과다 호출을 막는 기본 방어로는 충분하다.
// 더 강한 보호가 필요해지면 Upstash Redis 등으로 교체할 것.

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function getClientIp(request: Request): string {
  // Vercel은 x-forwarded-for 맨 앞에 실제 클라이언트 IP를 넣어준다.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function rateLimitResponse() {
  return Response.json(
    { error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요. 🐷" },
    { status: 429 },
  );
}
