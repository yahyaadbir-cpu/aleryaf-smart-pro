import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/http";

interface AuthUser {
  id: number;
  username: string;
  isAdmin: boolean;
  canUseTurkishInvoices: boolean;
}

interface LoginResult {
  ok: boolean;
  error?: string;
  user?: AuthUser;
}

interface AuthContextType {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  redeemInvite: (token: string, username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchCurrentUser() {
  await apiFetch("/api/auth/csrf");
  const response = await apiFetch("/api/auth/me");

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { user?: AuthUser | null };
  return data.user ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const refreshUser = async () => {
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    refreshUser().catch(() => {
      setUser(null);
      setReady(true);
    });
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    ready,
    login: async (username: string, password: string) => {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { user?: AuthUser; error?: string };

      if (!response.ok || !data.user) {
        return { ok: false, error: data.error || "خطأ في تسجيل الدخول" };
      }

      setUser(data.user);
      return { ok: true, user: data.user };
    },
    redeemInvite: async (token: string, username: string, password: string) => {
      const response = await apiFetch("/api/auth/invites/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { user?: AuthUser; error?: string };

      if (!response.ok || !data.user) {
        return { ok: false, error: data.error || "تعذر استخدام الدعوة" };
      }

      setUser(data.user);
      return { ok: true, user: data.user };
    },
    logout: async () => {
      try {
        await apiFetch("/api/auth/logout", {
          method: "POST",
        });
      } finally {
        setUser(null);
      }
    },
    refreshUser,
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
