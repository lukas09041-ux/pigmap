import Link from "next/link";

export default function InfoPage() {
  return (
    <main className="min-h-dvh bg-white pb-12">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-white/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-xl text-gray-600" aria-label="지도로 돌아가기">
          ←
        </Link>
        <p className="text-sm font-semibold text-gray-700">피그맵 정보</p>
      </div>

      <section className="px-4 pt-4">
        <h1 className="text-lg font-bold text-gray-900">🐷 피그맵</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          착한가격업소를 비리얼처럼 즉흥적으로 인증하는 모바일 웹앱이에요. 리뷰가 쌓일수록 가게의
          &quot;돼지 온도&quot;가 오르고, AI가 리뷰의 진정성을 읽어 온도를 매깁니다.
        </p>
      </section>

      <section className="mx-4 mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-sm font-semibold text-gray-700">데이터 출처</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          본 서비스는 행정안전부 착한가격업소 현황(공공데이터포털) 데이터를 활용합니다.
        </p>
      </section>
    </main>
  );
}
