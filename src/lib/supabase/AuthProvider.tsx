"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./client";
import LoginSheet from "@/components/LoginSheet";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  /** 이미 로그인 상태면 바로 resolve. 아니면 로그인 시트를 띄우고, 익명 로그인 성공 시 resolve.
   *  카카오 로그인은 페이지 전체가 리다이렉트되므로 이 Promise는 resolve되지 않는다(정상 동작).
   *  redirectPath는 카카오 로그인 완료 후 돌아올 경로. */
  requireAuth: (redirectPath?: string) => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [redirectPath, setRedirectPath] = useState("/");
  const resolveRef = useRef<((user: User | null) => void) | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user && resolveRef.current) {
        resolveRef.current(session.user);
        resolveRef.current = null;
        setSheetOpen(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const requireAuth = useCallback(
    (path?: string) => {
      if (user) return Promise.resolve(user);
      setRedirectPath(path ?? (typeof window !== "undefined" ? window.location.pathname : "/"));
      setSheetOpen(true);
      return new Promise<User | null>((resolve) => {
        resolveRef.current = resolve;
      });
    },
    [user],
  );

  function handleSheetClose() {
    setSheetOpen(false);
    if (resolveRef.current) {
      resolveRef.current(null);
      resolveRef.current = null;
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, requireAuth }}>
      {children}
      <LoginSheet open={sheetOpen} onClose={handleSheetClose} redirectPath={redirectPath} />
    </AuthContext.Provider>
  );
}
