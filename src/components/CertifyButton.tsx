"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/AuthProvider";

export default function CertifyButton({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { requireAuth } = useAuth();

  async function handleClick() {
    const user = await requireAuth(`/store/${storeId}/certify`);
    if (user) router.push(`/store/${storeId}/certify`);
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-20">
      <button
        type="button"
        onClick={handleClick}
        className="block w-full rounded-full bg-orange-500 py-3.5 text-center text-base font-bold text-white shadow-lg shadow-orange-500/30"
      >
        🐷 인증하기
      </button>
    </div>
  );
}
