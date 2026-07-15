"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const TABS_VISIBLE_ON = ["/", "/my"];

export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();

  if (!TABS_VISIBLE_ON.includes(pathname)) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-100 bg-white/95 backdrop-blur">
      <Link href="/" className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs">
        <span className="text-xl">🗺️</span>
        <span className={pathname === "/" ? "font-bold text-orange-500" : "text-gray-400"}>
          홈
        </span>
      </Link>

      <button
        type="button"
        onClick={() => router.push("/?jommechu=1")}
        className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs"
      >
        <span className="text-xl">🐷</span>
        <span className="text-gray-400">점메추</span>
      </button>

      <Link href="/my" className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs">
        <span className="text-xl">👤</span>
        <span className={pathname === "/my" ? "font-bold text-orange-500" : "text-gray-400"}>
          마이
        </span>
      </Link>
    </nav>
  );
}
