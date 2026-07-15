# 피그맵 (PigMap)

## 컨셉

착한가격업소를 비리얼(BeReal)처럼 **즉흥적으로 인증**하는 모바일 웹앱.

- 광고는 "구매하는 것"이 아니라 **"획득하는 것"**. 업주가 돈을 내고 노출을 사는 방식이 아니라,
  사용자의 즉흥 인증(리뷰/방문 인증)이 쌓여야 노출/혜택이 발생하는 구조를 지향한다.
- 기능이나 UI를 설계할 때 이 원칙에 어긋나는 방식(예: 결제만으로 노출 순위를 사는 배너 광고 등)은
  피그맵의 정체성과 충돌하므로 지양한다.
- 이 컨셉의 실물 구현이 [광고 자동 생성(킬러 피처)](#광고-자동-생성-ai-킬러-피처) 이다 — 돼지 온도가
  일정 단계를 넘으면(즉 손님 리뷰가 쌓이면) 결제 없이 AI가 홍보 카드를 자동으로 만들어준다.

## 데이터 출처 표기

[src/app/info/page.tsx](src/app/info/page.tsx) (지도 화면 우측 상단 ⓘ 버튼으로 진입) —
"본 서비스는 행정안전부 착한가격업소 현황(공공데이터포털) 데이터를 활용합니다" 필수 표기.
원본 데이터는 [data/good_price_stores.csv](data/good_price_stores.csv) 참고.

## 인증(로그인) & 마이페이지

- **로그인 수단은 카카오 OAuth + 익명 로그인 두 가지뿐** (이메일/전화번호 없음).
  [src/lib/supabase/AuthProvider.tsx](src/lib/supabase/AuthProvider.tsx)가 전역 인증 컨텍스트를 제공한다.
- **첫 방문 시 로그인 강제 안 함.** 지도는 누구나 자유롭게 둘러볼 수 있고, `requireAuth()`가
  "인증하기"([src/components/CertifyButton.tsx](src/components/CertifyButton.tsx))나 마이페이지
  ([src/app/my/page.tsx](src/app/my/page.tsx)) 진입 시점에만 [src/components/LoginSheet.tsx](src/components/LoginSheet.tsx)를 띄운다.
  이미 로그인 상태면 즉시 통과.
- 카카오 로그인은 전체 페이지 리다이렉트([src/app/auth/callback/route.ts](src/app/auth/callback/route.ts))라
  `requireAuth()`의 Promise가 resolve되지 않는 게 정상 — 로그인 후 원래 페이지로 돌아와서
  버튼을 한 번 더 누르면 그때는 즉시 통과한다 (OAuth 흐름의 자연스러운 한계).
  익명 로그인(`signInAnonymously()`)은 페이지 이동 없이 그 자리에서 Promise가 resolve된다.
- 익명 유저는 마이페이지에서 "카카오로 연결하기" 버튼으로 `linkIdentity()`를 호출해 기존
  `user_id`(=리뷰 기록)를 유지한 채 카카오 계정으로 업그레이드할 수 있다. Supabase Auth에서
  "Allow manual linking"을 켜야 동작 — 코드에 TODO로 단순화 지점을 표시해뒀다(충돌 처리 등은 미구현).
- `reviews.user_id` + RLS: 읽기는 전체 공개, 쓰기(insert/update/delete)는 `auth.uid() = user_id`인
  로그인 유저(익명 포함)만 가능. 마이그레이션은 [supabase/migrations/001_auth_and_reviews_rls.sql](supabase/migrations/001_auth_and_reviews_rls.sql).
  `stores` 테이블은 RLS 미적용 상태 유지(AI 라우트들이 anon key로 갱신하기 때문).
- 세션 쿠키 갱신은 [src/middleware.ts](src/middleware.ts) + [src/lib/supabase/middleware.ts](src/lib/supabase/middleware.ts)가 담당.
- 하단 탭바([src/components/TabBar.tsx](src/components/TabBar.tsx))는 `/`와 `/my`에서만 보인다
  (상세/인증 페이지는 자체 CTA가 있어서 탭바를 숨김). "점메추" 탭은 `/?jommechu=1`로 이동시켜
  [src/components/JommechuSheet.tsx](src/components/JommechuSheet.tsx)가 쿼리 파라미터를 감지해서 시트를 연다.

## 유저 돼지 성장 시스템 "내 꿀꿀이"

가게의 "돼지 온도"와 별개로, **유저 자신의 돼지**가 인증 활동으로 성장한다.

- **카운트 규칙**: 서로 다른 가게 인증 수(`profiles.cert_count`)만 센다. 같은 가게 재인증은
  카운트 제외(가게 온도에는 정상 반영). 판정은 DB 트리거
  ([supabase/migrations/002_pig_growth.sql](supabase/migrations/002_pig_growth.sql)의
  `handle_review_cert_count`)가 리뷰 insert 시점에 수행 — 클라이언트는 계산하지 않는다.
- **레벨**(레벨이 곧 나이 — 아기가 어른으로 자라는 서사):
  1개→Lv1 🐷꼬물이(눈 감은 아기) / 3개→Lv2 🐽쫑긋이(귀 쫑긋) / 10개→Lv3 🍴동네 미식가(포크) /
  20개→Lv4 🗺골목 탐험가(지도) / 50개→Lv5 👨‍🍳꿀꿀 셰프(셰프 모자) / 100개→Lv6 👑전설의 황금돼지(금빛).
  0개는 Lv0 "예비 꿀꿀이". 해금 아이템은 레벨당 여러 개(총 12종):
  Lv1 리본 / Lv2 알록달록 목도리 / Lv3 냅킨 두건+모자 3종 / Lv4 선글라스+배낭 /
  Lv5 셰프복+황금 포크 / Lv6 왕관+반짝이 이펙트.
  정의는 [src/lib/pig-avatar.ts](src/lib/pig-avatar.ts) — SQL의 `pig_level_for_certs()` /
  `pig_unlocked_for_level()`([supabase/migrations/003_pig_items_expansion.sql](supabase/migrations/003_pig_items_expansion.sql))과
  기준이 중복되므로 레벨/아이템 변경 시 **양쪽을 함께** 수정할 것.
- **아바타 렌더링**: [src/components/pig/UserPigAvatar.tsx](src/components/pig/UserPigAvatar.tsx)가
  몸통 SVG 위에 아이템 SVG를 겹치는 레이어 방식. `PIG_BODY_ASSETS`/`PIG_ITEM_ASSETS`에
  이미지 경로를 넣으면 코드 SVG 대신 `<img>`로 렌더 — 디자인 에셋 교체 포인트.
  훅 없는 순수 컴포넌트라 서버 컴포넌트(가게 상세 리뷰 카드)에서도 그대로 쓴다.
- **가게 돼지와 시각적 구별**: 가게 돼지(pig-stage.ts)는 살집이 변하는 코랄핑크,
  유저 돼지는 몸집 동일 + 성장/장비 변화, 기본색 살구톤(`USER_PIG_DEFAULT_COLOR`, 커스텀 가능).
- **꾸미기**: 마이페이지 [꾸미기] → [src/components/pig/PigDressupSheet.tsx](src/components/pig/PigDressupSheet.tsx).
  장착 토글은 즉시 프리뷰 + `profiles.equipped_items`에 바로 저장(실패 시 원복).
- **레벨업 연출**: 인증 등록 전후로 `profiles.pig_level`을 비교해(certify 페이지) 오르면
  [src/components/pig/LevelUpModal.tsx](src/components/pig/LevelUpModal.tsx) 풀스크린 모달 —
  크로스페이드 + 콘페티는 전부 CSS 애니메이션(globals.css, framer-motion 미사용).
- `profiles` RLS: 읽기 전체 공개(리뷰 카드 옆 타인 아바타 렌더링 때문), 쓰기는 본인만.
  프로필 행은 가입 트리거 + 리뷰 트리거 + 마이페이지 폴백 upsert 3중으로 보장된다.

## 핵심 개념: 돼지 온도 (Pig Temperature)

업소별로 누적되는 리뷰/인증 활동에 따라 성장하는 지표. 6단계로 구성된다.
신규 가게는 전부 `pig_temperature` 36.5(돼지)에서 시작한다.

| 단계 | 라벨 | 임계값(`pig_temperature` ≥) |
|---|---|---|
| 1 | 아기돼지 | 0 (~36.0) |
| 2 | 돼지 | 36.5 (신규 가게 기본값) |
| 3 | 통통돼지 | 37.5 |
| 4 | 리본돼지 | 38.5 |
| 5 | 꽃돼지 | 39.5 |
| 6 | 황금돼지 | 40.5 |

- 단계 계산 로직은 [src/lib/pig-stage.ts](src/lib/pig-stage.ts)에 있다.
- "돼지 온도"는 업소의 핫함/신뢰도를 직관적으로 보여주는 게이미피케이션 장치이며,
  UI에서 업소를 나타낼 때 핵심 시각 요소로 다뤄야 한다. 지도 화면([src/components/StoreMap.tsx](src/components/StoreMap.tsx))와
  가게 상세 페이지([src/app/store/[id]/page.tsx](src/app/store/[id]/page.tsx))에서는 단계별 이모지 크기를 키워
  "돼지가 자라는" 느낌을 준다. 직관적으로 "~돼지"면 상위 티어 맛집이라는 걸 알 수 있게 하는 게 목적.
- **돼지 온도는 평점 평균이 아니라 AI가 리뷰의 진정성(구체성)을 읽어서 매기는 온도**라는 게 피그맵의
  핵심 차별점이다. 계산 로직: [돼지 온도 엔진](#돼지-온도-엔진-ai) 참고.

## 인증(리뷰 작성) 플로우

가게 상세 페이지의 "인증하기" 버튼 → [src/app/store/[id]/certify/page.tsx](src/app/store/[id]/certify/page.tsx).

- 입력은 딱 세 가지: 사진 1장(필수, 카메라/갤러리) · 한 줄 텍스트(선택) · 기분 이모지 3택(필수).
  별점(5단계 평가)은 의도적으로 없음 — 비리얼(즉흥성)과 당근(가벼운 신호) 사이의 절충.
- 기분 이모지(😋 좋았어 / 😐 그냥 / 😕 별로)는 `reviews.mood`(`good`/`neutral`/`bad`)로 저장되며,
  돼지 온도 계산의 최소 신호가 된다 (아래 "돼지 온도 엔진" 참고).
- 사진은 Supabase Storage의 `review-photos` 공개 버킷에 업로드하고 public URL을 `reviews.photo_url`에 저장한다.
  버킷/정책은 [supabase/002_reviews_mood_and_storage.sql](supabase/002_reviews_mood_and_storage.sql)에서 관리한다.
- 작성 완료 시 "인증 완료!" 팝 애니메이션([globals.css](src/app/globals.css)의 `.animate-certify-pop`) 후
  가게 상세로 자동 이동한다. 리뷰 insert 직후 [/api/temperature](src/app/api/temperature/route.ts)를
  백그라운드로 호출해서(await 안 함) 돼지 온도를 갱신 — 인증 완료 UX를 막지 않는다.

## 돼지 온도 엔진 (AI)

[src/app/api/temperature/route.ts](src/app/api/temperature/route.ts) — 새 리뷰가 등록되면
(인증 작성 화면에서) 트리거되는 온도 계산 API.

- Claude Haiku 4.5로 리뷰 텍스트를 분석해 `{ sentiment: -1~1, specificity: 0~1, mentions: string[] }`를
  구조화된 출력(`output_config.format` + zod 스키마, `@anthropic-ai/sdk/helpers/zod`의 `zodOutputFormat`)으로 받는다.
- **온도 변화량 = 이모지 기본값(😋 +0.3 / 😐 0 / 😕 -0.3) × (1 + specificity)**. `sentiment`는 계산식에 쓰이지
  않고 `reviews.sentiment`/`specificity`/`mentions`에 참고용으로 저장만 해둔다(추후 AI 요약 등에 재사용 가능).
- 텍스트 없이 사진만 올리면 `specificity = 0`이라 이모지 기본값만 반영된다.
- 이게 "별점 테러가 구조적으로 어려운" 이유다 — 악의적인 리뷰는 대개 구체성이 낮아서(추상적 비방) 가중치가
  깎인다. 반대로 "사장님이 계란찜 서비스 주심"처럼 구체적인 리뷰는 "맛있음"보다 온도를 더 올린다.
- `pig_temperature`는 30~42 범위로 클램프한다(무한 발산 방지, 임시값).
- 컬럼은 [supabase/003_temperature_engine.sql](supabase/003_temperature_engine.sql)에서 관리한다.

## 핵심 3줄 요약 (AI)

[src/app/api/summary/route.ts](src/app/api/summary/route.ts) — 가게 리뷰가 3개 이상이면 트리거되는
요약 생성 API. 인증 작성 화면에서 리뷰 등록 직후 백그라운드로 호출된다.

- 텍스트가 있는 리뷰들을 모아 Claude Haiku 4.5에 보내고, 구조화된 출력(pick/owner/tip)을 받아
  `🍽 대표 픽: / 👨‍🍳 사장님: / 💡 꿀팁:` 형식 3줄로 조합해 `stores.ai_summary`에 캐싱한다.
- 시스템 프롬프트에 "리뷰에 실제로 있는 내용만 사용, 없는 내용은 지어내지 마"를 명시했다.
  해당 정보가 리뷰에 없으면 "아직 파악된 내용이 없어요"처럼 정직하게 표시하도록 강제한다.
- 상세 페이지([src/app/store/[id]/page.tsx](src/app/store/[id]/page.tsx))는 `ai_summary`가 있으면
  실제 요약을, 없으면 "리뷰가 모이면 AI가 요약해줘요" placeholder를 보여준다.
- 컬럼은 [supabase/004_ai_summary.sql](supabase/004_ai_summary.sql)에서 관리한다.
- 데모용으로 **은혜식당**(김치찌개 8,000원, store id `964f4543-2e34-4c8a-97ad-658c3a18b5ad`)에
  리뷰 20개와 요약을 미리 시딩해뒀다. 지도 기본 중심(사당역)에서 가까워 데모 시연 시 바로 찾기 쉽다.

## 꿀꿀이 점메추 (AI)

홈 화면(지도) 하단 "🐷 꿀꿀아 점메추" 버튼 → [src/components/JommechuSheet.tsx](src/components/JommechuSheet.tsx)
채팅 시트 → [src/app/api/jommechu/route.ts](src/app/api/jommechu/route.ts).

- 유저가 자연어로 조건(예산/인원/음식 종류 등)을 입력하면, 브라우저 위치(권한 거부 시
  [src/lib/constants.ts](src/lib/constants.ts)의 `DEFAULT_MAP_CENTER`로 폴백) 기준 반경 2km 내
  업소 중 **리뷰가 있는 업소만** 후보로 골라(리뷰 없는 가게는 인용할 게 없으므로 후보에서 제외)
  Claude Haiku 4.5에게 컨텍스트(메뉴/가격/온도/AI요약/실제 리뷰 텍스트)로 넘겨 1곳을 추천받는다.
- 추천 이유는 반드시 실제 리뷰 문구를 인용해야 한다는 걸 시스템 프롬프트에 강제하고, 서버에서도
  모델이 반환한 `quote`가 해당 가게의 실제 리뷰 텍스트에 포함되는지 substring 검증 후, 아니면
  그 가게의 진짜 리뷰로 강제 교체한다 — 인용 문구가 100% 실제 데이터이도록 이중 안전장치.
- 응답에는 가게명·거리·추천 이유·인용문·"바로가기" 버튼(가게 상세로 이동)이 포함된다.
- 광고 기반 추천(네이버 등)과의 차별점: 여기 추천은 실제 방문자의 실제 리뷰 문구에 근거한다는 걸
  화면에서 바로 보여주는 게 목적 (데모의 핵심 시연 포인트).

## 광고 자동 생성 (AI, 킬러 피처)

돼지 온도가 `AD_UNLOCK_TEMP`([src/lib/pig-stage.ts](src/lib/pig-stage.ts), 현재 38.5 = "리본돼지"
단계. 예전 5단계 체계의 "토실토실"과 같은 임계값) 이상이면 가게 상세 페이지에 "🎉 이 가게는 손님들이
광고를 만들었어요" 배지와 AI 생성 홍보 카드가 뜬다.

- [src/app/api/ad-generate/route.ts](src/app/api/ad-generate/route.ts) — 리뷰 + 메뉴 + 온도를
  Claude Haiku 4.5에 보내 구조화된 출력(headline/bodyLine1/bodyLine2/hashtags)을 받고
  `stores.ad_*` 컬럼에 캐싱한다. 시스템 프롬프트에 "리뷰/메뉴에 없는 내용은 지어내지 마" 명시.
  온도가 임계값 미만이면 403으로 거부한다.
- [src/components/AdCard.tsx](src/components/AdCard.tsx) — 캐시된 카피가 없으면 마운트 시
  `/api/ad-generate`를 자동 호출해 생성. 1080×1080 정사각형 카드를 그린 뒤 `html2canvas`로
  `{ scale: 1080 / 실제렌더너비 }` 옵션을 줘서 화면 표시 크기와 무관하게 항상 1080×1080 PNG로
  캡처한다. "다운로드"(파일 저장)와 "공유하기"(Web Share API, 미지원 시 다운로드 폴백) 버튼 제공.
- 카드 하단에 "🎬 다음 단계: 온도가 더 오르면 영상 광고도 자동 생성돼요 (준비 중)" 로드맵 티저 문구를
  넣어, 온도가 오를수록 광고 형태도 진화한다는 방향성을 암시한다 (실제 영상 생성 기능은 미구현).
- 컬럼은 [supabase/005_ad_generate.sql](supabase/005_ad_generate.sql)에서 관리한다.
- 데모용 은혜식당은 실제 시딩된 리뷰 20개를 돼지 온도 엔진에 통과시켜(재현 가능, 하드코딩 아님)
  온도가 36.5 → 42.0(상한)까지 자연스럽게 올라가도록 해뒀다 — "리뷰가 쌓이면 광고가 열린다"는
  전체 파이프라인이 실제로 연결되어 있다는 걸 데모에서 보여준다.

## 기술 스택

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Backend/DB/Auth**: Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
  - 브라우저 클라이언트: [src/lib/supabase/client.ts](src/lib/supabase/client.ts)
  - 서버 클라이언트: [src/lib/supabase/server.ts](src/lib/supabase/server.ts)
- **지도**: Kakao Maps SDK (JS 키는 클라이언트 노출용, REST 키는 서버 전용)
- **AI**: Anthropic API (`@anthropic-ai/sdk`) — 돼지 온도 엔진 / 핵심 3줄 요약 / 꿀꿀이 점메추 /
  광고 자동 생성 네 곳에서 사용, 서버 전용. 모델은 전부 Claude Haiku 4.5
  (가벼운 분류·요약·추천·카피라이팅 작업이라 비용/속도 우선). 구조화된 출력은
  `@anthropic-ai/sdk/helpers/zod`의 `zodOutputFormat` + zod 스키마로 강제한다.
- **이미지 캡처**: `html2canvas` — 광고 카드를 1080×1080 PNG로 렌더링

## 모바일 퍼스트 원칙

- 이 앱은 **모바일 웹으로만 사용된다고 가정**하고 설계한다. 데스크톱 대응은 부차적이다.
- 모든 화면/컴포넌트는 좁은 뷰포트(~375–428px) 기준으로 먼저 레이아웃을 잡고,
  필요할 때만 데스크톱 브레이크포인트를 추가한다.
- 터치 인터랙션(탭, 스와이프, 카메라/위치 권한 등)을 우선 고려한다. 호버(hover) 전용 UX는 지양한다.
- 즉흥 인증(비리얼 스타일)의 특성상 카메라/위치 접근, 실시간성이 중요하므로,
  로딩 상태와 권한 요청 UX를 신경써서 설계한다.

## 환경 변수

`.env.local` 참고 (`.env*.local`은 gitignore 처리되어 있음).

| 변수 | 용도 | 노출 범위 |
|---|---|---|
| `NEXT_PUBLIC_KAKAO_JS_KEY` | Kakao Maps SDK 로드 | 클라이언트 |
| `KAKAO_REST_KEY` | Kakao REST API (장소 검색 등) | 서버 전용 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 클라이언트 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | 클라이언트 |
| `ANTHROPIC_API_KEY` | Anthropic API (AI 기능) | 서버 전용 |

> Next.js는 브라우저에 노출되어야 하는 변수에 `NEXT_PUBLIC_` 접두사를 강제한다.
> 지도 SDK와 Supabase 클라이언트는 브라우저에서 직접 초기화되므로 해당 접두사가 붙어 있다.
