// 카카오맵 리뷰 기반 "낮은 리스크" 시딩 (1회성 개발/테스트 배치).
//
// 무엇을 저장하나:
//   - 별점(kakao_rating), 리뷰수(kakao_review_count): 사실 데이터
//   - 강점 태그(kakao_strengths): 카카오가 집계한 "맛/가성비/친절..." 라벨
//   - kakao_summary: 카카오 리뷰 원문을 "그대로" 옮기지 않고, 우리 AI(Haiku)가 읽고
//     새로 쓴 3줄 특징. 리뷰 원문 자체는 DB에 저장하지 않는다(저작권/약관 리스크 회피).
//
// 어떻게 동작하나:
//   1) Supabase stores 순회
//   2) 카카오 Local API(공식 키)로 "가게명 + 동"을 키워드 검색해 place_id 매칭
//      (좌표를 함께 비교해 동명이인 오매칭을 거른다)
//   3) place-api panel3 엔드포인트에서 별점/리뷰수/강점/대표 후기 취득 (pf:web 헤더 필요)
//   4) 후기 텍스트를 AI에 넣어 3줄 특징 생성
//   5) Supabase 업데이트
//
// 실행: npm run seed:kakao            (전체)
//       npm run seed:kakao -- --limit 5 --dry   (5개만, DB 미기록 미리보기)
//
// 앱 런타임엔 카카오 의존성이 전혀 없다 — 이 스크립트만 카카오를 호출한다.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE 키가 .env.local에 필요합니다.");
}
if (!KAKAO_REST_KEY) throw new Error("KAKAO_REST_KEY가 .env.local에 필요합니다.");
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY가 .env.local에 필요합니다.");

// ── CLI 옵션 ───────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");
const FORCE = args.includes("--force"); // 이미 동기화된 가게도 다시 처리
const limitFlag = args.indexOf("--limit");
const LIMIT = limitFlag >= 0 ? parseInt(args[limitFlag + 1], 10) : Infinity;

const CONCURRENCY = 4; // 병렬 워커 수 (전국 1.2만 건 처리용 — 요청 자체 지연이 간격 역할)
const MIN_REVIEWS_FOR_SUMMARY = 2; // 후기가 이보다 적으면 AI 요약은 건너뜀
const MATCH_MAX_DISTANCE_M = 150; // place_id 매칭 시 좌표 허용 오차

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 동(洞) 단위까지만 추출해 검색어 정밀도를 높인다. "서울특별시 동작구 흑석동" → "흑석동"
function extractDong(address) {
  const m = address.match(/([가-힣0-9]+(?:동|가|읍|면|리))(?:\s|$|\d)/);
  return m ? m[1] : "";
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 카카오 Local 키워드 검색 → 좌표까지 비교해 가장 그럴듯한 place_id 반환
async function matchPlaceId(store) {
  const dong = extractDong(store.address || "");
  const query = `${dong} ${store.name}`.trim();
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "5");

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
  });
  if (res.status === 429) {
    await sleep(1000);
    return matchPlaceId(store);
  }
  if (!res.ok) return null;

  const data = await res.json();
  const docs = data.documents ?? [];
  if (docs.length === 0) return null;

  // 좌표가 있으면 거리로 검증, 없으면 이름이 정확히 일치하는 첫 결과
  for (const doc of docs) {
    const sameName = doc.place_name?.replace(/\s/g, "") === store.name.replace(/\s/g, "");
    if (store.latitude != null && store.longitude != null) {
      const dist = haversineMeters(
        store.latitude,
        store.longitude,
        parseFloat(doc.y),
        parseFloat(doc.x),
      );
      if (dist <= MATCH_MAX_DISTANCE_M && (sameName || docs.length === 1)) {
        return doc.id;
      }
    } else if (sameName) {
      return doc.id;
    }
  }
  // 좌표 검증에서 못 찾았고 결과가 1개뿐이면 그걸 채택
  return docs.length === 1 ? docs[0].id : null;
}

// panel3 엔드포인트에서 별점/리뷰수/강점/대표 후기 취득
async function fetchKakaoReviewData(placeId) {
  const res = await fetch(`https://place-api.map.kakao.com/places/panel3/${placeId}`, {
    headers: {
      pf: "web", // 이 헤더가 없으면 406
      Accept: "application/json",
      Referer: "https://place.map.kakao.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) return null;
  const j = await res.json();
  const km = j.kakaomap_review;
  if (!km) return null;

  const scoreSet = km.score_set ?? {};
  const strengthNames = new Map(
    (km.strength_description ?? []).map((s) => [s.id, s.name]),
  );
  const strengths = (scoreSet.strength_counts ?? [])
    .sort((a, b) => b.count - a.count)
    .map((s) => strengthNames.get(s.id))
    .filter(Boolean);

  const reviewTexts = (km.reviews ?? [])
    .map((r) => (r.contents || "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);

  return {
    rating: scoreSet.average_score ?? null,
    reviewCount: scoreSet.review_count ?? null,
    strengths,
    reviewTexts, // AI 입력용 — DB에 원문 저장하지 않음
  };
}

const SummarySchema = z.object({
  line1: z.string().describe("이 가게를 한마디로 규정하는 대표 특징. 15자 내외"),
  line2: z.string().describe("맛/메뉴/가성비 등 리뷰에서 반복되는 강점. 20자 내외"),
  line3: z.string().describe("분위기·방문 상황(모임/혼밥 등)이나 실용 팁. 20자 내외"),
});

const SYSTEM_PROMPT = `너는 맛집 리뷰들을 읽고 그 가게의 특징을 세 줄로 압축하는 카피라이터야.
규칙:
- 리뷰에 실제로 쓰인 내용에 근거해서만 써. 없는 사실을 지어내지 마.
- 리뷰 문장을 그대로 베끼지 말고 네 표현으로 새로 써.
- 각 줄은 짧고 담백하게. 광고 문구처럼 과장하지 마.`;

async function generateSummary(store, reviewTexts, strengths) {
  const response = await anthropic.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `가게 이름: ${store.name} (${store.category ?? "분류 없음"})
카카오맵 강점 태그: ${strengths.join(", ") || "없음"}

방문자 리뷰:
${reviewTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
      },
    ],
    output_config: { format: zodOutputFormat(SummarySchema) },
  });
  const p = response.parsed_output;
  if (!p) return null;
  return `${p.line1}\n${p.line2}\n${p.line3}`;
}

async function main() {
  console.log(
    `[kakao-seed] 시작 ${DRY_RUN ? "(DRY RUN — DB 미기록)" : ""}${
      FORCE ? " (FORCE)" : ""
    }`,
  );

  let stores;
  {
    let query = supabase
      .from("stores")
      .select("id, name, category, address, latitude, longitude, kakao_synced_at")
      .order("created_at", { ascending: true });
    if (!FORCE) query = query.is("kakao_synced_at", null);

    const { data, error } = await query;
    if (error) {
      // 마이그레이션 004 미적용 상태 — 컬럼 없이 조회 (dry-run 미리보기 용도)
      if (/kakao_/.test(error.message)) {
        console.warn(
          "[kakao-seed] 카카오 컬럼이 아직 없습니다. 마이그레이션 004를 적용하세요. 지금은 컬럼 없이 조회합니다(DB 반영 불가).",
        );
        const { data: d2, error: e2 } = await supabase
          .from("stores")
          .select("id, name, category, address, latitude, longitude")
          .order("created_at", { ascending: true });
        if (e2) throw new Error(`stores 조회 실패: ${e2.message}`);
        stores = d2;
      } else {
        throw new Error(`stores 조회 실패: ${error.message}`);
      }
    } else {
      stores = data;
    }
  }

  const targets = stores.slice(0, LIMIT);
  console.log(`[kakao-seed] 대상 ${targets.length}건 (전체 미동기화 ${stores.length}건)`);

  const stats = { matched: 0, noMatch: 0, summarized: 0, updated: 0, done: 0 };

  async function processStore(store, index) {
    const tag = `(${index + 1}/${targets.length}) ${store.name}`;

    try {
      const placeId = await matchPlaceId(store);

      if (!placeId) {
        stats.noMatch++;
        // 미매칭도 synced_at을 기록해 재실행 시 다시 시도하지 않게 한다
        if (!DRY_RUN) {
          await supabase
            .from("stores")
            .update({ kakao_synced_at: new Date().toISOString() })
            .eq("id", store.id);
        }
        return;
      }
      stats.matched++;

      const rev = await fetchKakaoReviewData(placeId);
      if (!rev) {
        if (!DRY_RUN) {
          await supabase
            .from("stores")
            .update({ kakao_place_id: placeId, kakao_synced_at: new Date().toISOString() })
            .eq("id", store.id);
        }
        return;
      }

      let summary = null;
      if (rev.reviewTexts.length >= MIN_REVIEWS_FOR_SUMMARY) {
        summary = await generateSummary(store, rev.reviewTexts, rev.strengths);
        if (summary) stats.summarized++;
      }

      const patch = {
        kakao_place_id: placeId,
        kakao_rating: rev.rating,
        kakao_review_count: rev.reviewCount,
        kakao_strengths: rev.strengths,
        kakao_summary: summary,
        kakao_synced_at: new Date().toISOString(),
      };

      if (DRY_RUN) {
        console.log(
          `  ✓ ${tag} — ★${rev.rating ?? "?"} 리뷰${rev.reviewCount ?? "?"} [${rev.strengths.join("/")}]${
            summary ? "\n      " + summary.replace(/\n/g, " / ") : ""
          }`,
        );
      } else {
        const { error: upErr } = await supabase.from("stores").update(patch).eq("id", store.id);
        if (upErr) console.log(`  ! ${tag} 업데이트 실패: ${upErr.message}`);
        else stats.updated++;
      }
    } catch (e) {
      console.log(`  ! ${tag} — 예외: ${String(e).slice(0, 160)}`);
    } finally {
      stats.done++;
      if (stats.done % 100 === 0) {
        console.log(
          `[kakao-seed] 진행 ${stats.done}/${targets.length} — 매칭 ${stats.matched} / 요약 ${stats.summarized} / 반영 ${stats.updated}`,
        );
      }
    }
  }

  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor++;
      await processStore(targets[index], index);
      await sleep(50); // 카카오/AI에 과하지 않게 살짝 간격
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(
    `[kakao-seed] 완료 — 매칭 ${stats.matched} / 매칭실패 ${stats.noMatch} / 요약 ${stats.summarized} / DB반영 ${stats.updated}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
