import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { LockKeyhole, ShieldCheck, Ticket, UserRound } from "lucide-react";
import { useAuth } from "@/context/auth";
import { APP_NAME_AR, APP_NAME_EN, APP_TAGLINE_AR } from "@/lib/branding";
import { apiFetch } from "@/lib/http";
import { ensurePushSubscription } from "@/lib/push-notifications";

type GoogleConfigResponse = {
  enabled: boolean;
  clientId: string | null;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              shape?: "rectangular" | "pill" | "circle" | "square";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              width?: number;
              locale?: string;
            },
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export function LoginPage() {
  const { user, login, googleLogin, redeemInvite } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "invite">("login");
  const [googleConfig, setGoogleConfig] = useState<GoogleConfigResponse>({ enabled: false, clientId: null });
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [navigate, user]);

  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/auth/google/config")
      .then((response) => response.json() as Promise<GoogleConfigResponse>)
      .then((config) => {
        if (!cancelled) {
          setGoogleConfig(config);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGoogleConfig({ enabled: false, clientId: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!googleConfig.enabled || !googleConfig.clientId || !googleButtonRef.current) {
      return;
    }

    let cancelled = false;
    const clientId = googleConfig.clientId;

    const renderGoogleButton = () => {
      if (cancelled || !window.google || !googleButtonRef.current) {
        return;
      }

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (!response.credential) {
            setError("تعذر استلام بيانات تسجيل Google");
            return;
          }

          setError("");
          setLoading(true);
          const result = await googleLogin(response.credential);

          if (result.ok) {
            try {
              await ensurePushSubscription({
                username: result.user?.username ?? "",
                isAdmin: Boolean(result.user?.isAdmin),
              });
            } catch {
            }

            navigate("/");
            setLoading(false);
            return;
          }

          setError(result.error || "تعذر تسجيل الدخول عبر Google");
          setLoading(false);
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_blue",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320,
        locale: "ar",
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    if (existingScript) {
      renderGoogleButton();
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => renderGoogleButton();
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [googleConfig.clientId, googleConfig.enabled, googleLogin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result =
      mode === "login"
        ? await login(username, password)
        : await redeemInvite(inviteToken, username, password);

    if (result.ok) {
      try {
        await ensurePushSubscription({
          username: username.trim(),
          isAdmin: Boolean(result.user?.isAdmin),
        });
      } catch {
      }

      navigate("/");
      setLoading(false);
      return;
    }

    setError(result.error || "خطأ في التحقق");
    setLoading(false);
  };

  return (
    <div dir="rtl" className="min-h-screen overflow-hidden bg-background">
      <div className="relative isolate min-h-screen bg-[radial-gradient(circle_at_bottom_left,rgba(10,88,117,0.28),transparent_28%),radial-gradient(circle_at_top_right,rgba(30,64,175,0.16),transparent_22%),linear-gradient(180deg,#06070b_0%,#0a0d12_100%)]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:140px_140px] opacity-[0.06]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid w-full max-w-6xl items-stretch gap-6 lg:grid-cols-[430px_minmax(0,1fr)]">
            <form
              onSubmit={handleSubmit}
              className="glass-panel flex rounded-[2rem] border border-white/10 bg-[rgba(15,18,24,0.9)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-8"
            >
              <div className="flex w-full flex-col">
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#4ea0ff,#2482ea)] shadow-[0_18px_44px_rgba(37,99,235,0.28)]">
                    <ShieldCheck className="h-8 w-8 text-white" />
                  </div>

                  <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground">
                    {APP_NAME_AR}
                  </h1>

                  <p className="mt-2 text-sm uppercase tracking-[0.32em] text-slate-500">
                    {APP_NAME_EN}
                  </p>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition ${mode === "login" ? "bg-primary text-white" : "text-slate-300"}`}
                  >
                    دخول
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("invite")}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition ${mode === "invite" ? "bg-primary text-white" : "text-slate-300"}`}
                  >
                    دعوة
                  </button>
                </div>

                <div className="space-y-5">
                  {mode === "invite" ? (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-300">
                        رمز الدعوة
                      </label>

                      <div className="relative">
                        <input
                          type="text"
                          value={inviteToken}
                          onChange={(e) => setInviteToken(e.target.value)}
                          placeholder="ألصق رمز الدعوة"
                          className="h-12 w-full rounded-xl border border-white/10 bg-[rgba(9,11,16,0.94)] px-4 pl-12 text-base text-foreground placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/60"
                        />
                        <Ticket className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-300">
                      اسم المستخدم
                    </label>

                    <div className="relative">
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="اكتب اسم المستخدم"
                        autoComplete="username"
                        className="h-12 w-full rounded-xl border border-white/10 bg-[rgba(9,11,16,0.94)] px-4 pl-12 text-base text-foreground placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/60"
                      />
                      <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-300">
                      كلمة المرور
                    </label>

                    <div className="relative">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="أدخل كلمة المرور"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        className="h-12 w-full rounded-xl border border-white/10 bg-[rgba(9,11,16,0.94)] px-4 pl-12 text-base text-foreground placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/60"
                      />
                      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    </div>
                  </div>
                </div>

                {error ? (
                  <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-300">
                    {error}
                  </p>
                ) : null}

                {mode === "login" && googleConfig.enabled ? (
                  <div className="mt-5">
                    <div className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                      أو
                    </div>
                    <div className="flex justify-center" ref={googleButtonRef} />
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 h-12 w-full rounded-xl bg-[linear-gradient(180deg,#4f8cff,#3a76e3)] text-lg font-extrabold text-white shadow-[0_18px_40px_rgba(58,118,227,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "جارٍ التحقق..." : mode === "login" ? "دخول النظام" : "إنشاء الحساب من الدعوة"}
                </button>
              </div>
            </form>

            <section className="glass-panel hidden rounded-[2.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,20,29,0.96),rgba(13,16,24,0.92))] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.32)] lg:flex lg:flex-col lg:justify-between">
              <div>
                <div className="mb-10 flex justify-start">
                  <span className="rounded-full border border-sky-500/20 bg-sky-500/8 px-4 py-2 text-sm font-bold text-sky-300">
                    ALERYAF HUB
                  </span>
                </div>

                <div className="max-w-2xl">
                  <h2 className="font-display text-5xl font-extrabold leading-[1.1] text-foreground xl:text-6xl">
                    {APP_NAME_AR}
                  </h2>

                  <p className="mt-6 text-2xl font-semibold text-slate-300">
                    {APP_TAGLINE_AR}
                  </p>

                  <p className="mt-6 max-w-xl text-lg leading-9 text-slate-400">
                    دخول موحد للفريق مع جلسات محمية، وصلاحيات مضبوطة، ودعوات إدارية مؤقتة لإنشاء الحسابات الجديدة.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
