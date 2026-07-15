// 가게 상세 서버 렌더링 대기 중 스켈레톤 — 흰 화면 방지.
export default function StoreLoading() {
  return (
    <main className="min-h-dvh animate-pulse bg-white pb-28">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-5 w-5 rounded bg-gray-100" />
        <div className="h-4 w-24 rounded bg-gray-100" />
      </div>
      <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-4">
        <div className="h-20 w-20 rounded-full bg-gray-100" />
        <div className="h-7 w-32 rounded bg-gray-100" />
        <div className="h-5 w-40 rounded bg-gray-100" />
        <div className="h-4 w-56 rounded bg-gray-100" />
      </div>
      <div className="mx-4 mb-6 h-12 rounded-xl bg-gray-100" />
      <div className="mx-4 mb-8 space-y-2">
        <div className="h-4 w-28 rounded bg-gray-100" />
        <div className="h-24 rounded-xl bg-gray-100" />
      </div>
      <div className="px-4">
        <div className="mb-3 h-4 w-16 rounded bg-gray-100" />
        <div className="aspect-square w-full rounded bg-gray-100" />
      </div>
    </main>
  );
}
