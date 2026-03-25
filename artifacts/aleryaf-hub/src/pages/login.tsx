import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/context/auth";
import { APP_NAME_AR, APP_NAME_EN, APP_TAGLINE_AR } from "@/lib/branding";
import { ensurePushSubscription } from "@/lib/push-notifications";

export function LoginPage() {
  const { user, login } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [navigate, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = login(username, password);

    if (result.ok) {
      try {
        await ensurePushSubscription({
          username: username.trim(),
          isAdmin: username.trim() === "الارياف" && password.trim() === "admin5713",
        });
      } catch {
        // Keep login successful even if notifications are skipped or blocked.
      }

      navigate("/");
      setLoading(false);
      return;
    }

    setError(result.error || "خطأ في تسجيل الدخول");
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

                  <p className="mt-2 text-sm tracking-[0.32em] text-slate-500 uppercase">
                    {APP_NAME_EN}
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-300">
                      اسم المستخدم
                    </label>

                    <div className="relative">
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="اكتب أي اسم مستخدم"
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
                        placeholder="ادخل كلمة المرور"
                        autoComplete="current-password"
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

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 h-12 w-full rounded-xl bg-[linear-gradient(180deg,#4f8cff,#3a76e3)] text-lg font-extrabold text-white shadow-[0_18px_40px_rgba(58,118,227,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "جارٍ تسجيل الدخول..." : "دخول النظام"}
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
                    دخول موحد للفريق. المستخدم العادي يدخل بأي اسم مستخدم مع كلمة
                    المرور <span className="font-bold text-slate-200">الرياف</span>،
                    والإدارة تستخدم بيانات المدير.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[1.4rem] border border-white/8 bg-[rgba(10,12,18,0.56)] p-5">
                  <p className="text-2xl font-extrabold text-foreground">
                    دخول الموظفين
                  </p>
                  <p className="mt-4 text-sm leading-7 text-slate-400">
                    أي اسم مستخدم + كلمة المرور الثابتة
                  </p>
                </div>

                <div className="rounded-[1.4rem] border border-white/8 bg-[rgba(10,12,18,0.56)] p-5">
                  <p className="text-2xl font-extrabold text-foreground">
                    دخول الإدارة
                  </p>
                  <p className="mt-4 text-sm leading-7 text-slate-400">
                    اسم المستخدم: الرياف، كلمة المرور: admin5713
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
