import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Bell, Send, Shield, Terminal } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth";
import { logActivity } from "@/lib/activity";
import { apiFetch } from "@/lib/http";
const DEFAULT_NOTIFICATION_TITLE = "ALERYAF";
const DEFAULT_NOTIFICATION_URL = "/";

type ManagedUser = {
  id: number;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  canUseTurkishInvoices: boolean;
};

type ParsedCommand =
  | {
      kind: "notify";
      audience: "all" | "admin";
      title: string;
      body: string;
      url: string;
    }
  | {
      kind: "turkish-print";
      username: string;
      enabled: boolean;
    };

type ConsoleEntry = {
  id: number;
  type: "info" | "success" | "error";
  text: string;
};

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeForAutocomplete(value: string) {
  return value.replace(/\s+/g, " ");
}

function parseCommand(raw: string): ParsedCommand {
  const text = normalizeSpaces(raw);
  const lowered = text.toLowerCase();

  const allPrefix = "send noti all ";
  const adminPrefix = "send admin all ";

  if (lowered.startsWith(allPrefix) || lowered.startsWith(adminPrefix)) {
    const isAll = lowered.startsWith(allPrefix);
    const body = text.slice(isAll ? allPrefix.length : adminPrefix.length).trim();

    if (!body) {
      throw new Error("اكتب الرسالة بعد الأمر مباشرة.");
    }

    return {
      kind: "notify",
      audience: isAll ? "all" : "admin",
      title: DEFAULT_NOTIFICATION_TITLE,
      body,
      url: DEFAULT_NOTIFICATION_URL,
    };
  }

  const turkishMatch = text.match(/^set access to\s+(.+?)\s+turkish print$/i);
  if (turkishMatch) {
    return {
      kind: "turkish-print",
      username: turkishMatch[1].trim(),
      enabled: true,
    };
  }

  const removeTurkishMatch = text.match(/^remove access from\s+(.+?)\s+turkish print$/i);
  if (removeTurkishMatch) {
    return {
      kind: "turkish-print",
      username: removeTurkishMatch[1].trim(),
      enabled: false,
    };
  }

  throw new Error(
    "الأمر غير معروف. استخدم: send noti all ... أو send admin all ... أو set access to اسم_المستخدم turkish print",
  );
}

export function AdminControlPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [command, setCommand] = useState("send noti all تم تحديث النظام بنجاح");
  const [isRunning, setIsRunning] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([
    {
      id: 1,
      type: "info",
      text: "الأوامر المتاحة: send noti all ... | send admin all ... | set access to username turkish print",
    },
  ]);

  useEffect(() => {
    if (!user?.isAdmin) {
      navigate("/");
    }
  }, [navigate, user]);

  useEffect(() => {
    if (!user?.isAdmin) return;

    apiFetch("/api/users")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setManagedUsers(Array.isArray(data) ? data : []))
      .catch(() => setManagedUsers([]));
  }, [user?.isAdmin]);

  const commandPreview = useMemo(() => {
    try {
      return parseCommand(command);
    } catch {
      return null;
    }
  }, [command]);

  const suggestions = useMemo(() => {
    const text = normalizeForAutocomplete(command);
    const lowered = text.toLowerCase();
    const hasTrailingSpace = /\s$/.test(command);

    const baseSuggestions = [
      "send noti all ",
      "send admin all ",
      "set access to ",
      "remove access from ",
    ];

    if (!text) {
      return baseSuggestions;
    }

    if ("send noti all ".startsWith(lowered)) return ["send noti all "];
    if ("send admin all ".startsWith(lowered)) return ["send admin all "];
    if ("set access to ".startsWith(lowered)) return ["set access to "];
    if ("remove access from ".startsWith(lowered)) return ["remove access from "];

    if (lowered.startsWith("set access to")) {
      const exactPrefix = lowered === "set access to" || lowered === "set access to ";
      const partial = text.slice("set access to ".length).trim();

      if (exactPrefix && hasTrailingSpace) {
        return managedUsers.map((entry) => `set access to ${entry.username} turkish print`);
      }

      return managedUsers
        .filter((entry) => entry.username.toLowerCase().startsWith(partial.toLowerCase()))
        .map((entry) => `set access to ${entry.username} turkish print`);
    }

    if (lowered.startsWith("remove access from")) {
      const eligible = managedUsers.filter((entry) => entry.canUseTurkishInvoices);
      const exactPrefix = lowered === "remove access from" || lowered === "remove access from ";
      const partial = text.slice("remove access from ".length).trim();

      if (exactPrefix && hasTrailingSpace) {
        return eligible.map((entry) => `remove access from ${entry.username} turkish print`);
      }

      return eligible
        .filter((entry) => entry.username.toLowerCase().startsWith(partial.toLowerCase()))
        .map((entry) => `remove access from ${entry.username} turkish print`);
    }

    return baseSuggestions.filter((entry) => entry.startsWith(lowered));
  }, [command, managedUsers]);

  if (!user?.isAdmin) return null;

  const pushConsole = (entry: Omit<ConsoleEntry, "id">) => {
    setConsoleEntries((current) => [
      { id: Date.now() + Math.floor(Math.random() * 1000), ...entry },
      ...current,
    ]);
  };

  const applySuggestion = (value: string) => {
    setCommand(value);
  };

  const runCommand = async () => {
    const trimmed = command.trim();
    if (!trimmed || isRunning) return;

    setIsRunning(true);
    pushConsole({ type: "info", text: `> ${trimmed}` });

    try {
      const parsed = parseCommand(trimmed);

      if (parsed.kind === "notify") {
        const response = await apiFetch("/api/notifications/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });

        if (!response.ok) {
          throw new Error("فشل إرسال الإشعار");
        }

        await logActivity(
          user.username,
          parsed.audience === "all" ? "إرسال إشعار عام" : "إرسال إشعار إداري",
          parsed.body,
        );

        pushConsole({
          type: "success",
          text:
            parsed.audience === "all"
              ? `تم إرسال الإشعار لكل المستخدمين: ${parsed.body}`
              : `تم إرسال الإشعار للإدارة فقط: ${parsed.body}`,
        });

        toast({
          title: "تم تنفيذ الأمر",
          description:
            parsed.audience === "all"
              ? "تم إرسال الإشعار إلى كل الأجهزة المشتركة."
              : "تم إرسال الإشعار إلى أجهزة الإدارة فقط.",
        });
      } else {
        const targetUser = managedUsers.find((entry) => entry.username === parsed.username);
        if (!targetUser) {
          throw new Error("المستخدم غير موجود");
        }

        const response = await apiFetch(`/api/users/${targetUser.id}/turkish-invoices`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canUseTurkishInvoices: parsed.enabled }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "فشل تحديث صلاحية الطباعة التركية");
        }

        setManagedUsers((current) =>
          current.map((entry) =>
            entry.id === targetUser.id ? { ...entry, canUseTurkishInvoices: parsed.enabled } : entry,
          ),
        );

        await logActivity(
          user.username,
          parsed.enabled ? "منح صلاحية الطباعة التركية" : "سحب صلاحية الطباعة التركية",
          `المستخدم: ${parsed.username}`,
        );

        pushConsole({
          type: "success",
          text: parsed.enabled
            ? `تم منح ${parsed.username} صلاحية الطباعة التركية`
            : `تم سحب صلاحية الطباعة التركية من ${parsed.username}`,
        });

        toast({
          title: "تم تنفيذ الأمر",
          description: parsed.enabled
            ? `تم منح ${parsed.username} صلاحية الطباعة التركية`
            : `تم سحب صلاحية الطباعة التركية من ${parsed.username}`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "فشل تنفيذ الأمر";
      pushConsole({ type: "error", text: message });
      toast({
        title: "تعذر تنفيذ الأمر",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">مركز الأوامر</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              أوامر سريعة للإشعارات والصلاحيات، مع اقتراحات وإكمال تلقائي.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
            <Shield className="h-4 w-4" />
            مدراء فقط
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-3xl border border-white/10 bg-card/70 p-5 shadow-2xl shadow-black/20">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Terminal className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">لوحة الأوامر</h2>
                <p className="text-xs text-muted-foreground">اكتب الأمر، استخدم Tab للإكمال، أو اختر من الاقتراحات.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-3 shadow-inner shadow-black/20">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-emerald-300/80">
                <Terminal className="h-3.5 w-3.5" />
                admin shell
              </div>
              <Textarea
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Tab" && suggestions.length > 0) {
                    event.preventDefault();
                    applySuggestion(suggestions[0]);
                  }
                }}
                spellCheck={false}
                className="min-h-32 border-0 bg-transparent p-0 font-mono text-sm leading-7 text-foreground shadow-none focus-visible:ring-0"
                placeholder="send noti all اكتب الرسالة هنا"
              />
            </div>

            {suggestions.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] font-bold text-slate-400">اقتراحات</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 8).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={runCommand}
                disabled={isRunning}
                className="rounded-2xl bg-primary px-5 text-white hover:bg-primary/90"
              >
                <Send className="ml-2 h-4 w-4" />
                {isRunning ? "جارٍ التنفيذ..." : "تنفيذ الأمر"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCommand("send noti all ")}
                className="rounded-2xl border-white/10 bg-white/[0.03] text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
              >
                إشعار عام
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCommand("send admin all ")}
                className="rounded-2xl border-white/10 bg-white/[0.03] text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
              >
                إشعار للإدارة
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCommand("set access to ")}
                className="rounded-2xl border-white/10 bg-white/[0.03] text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
              >
                منح الطباعة التركية
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-card/70 p-5">
              <div className="mb-3 flex items-center gap-2 text-primary">
                <Bell className="h-4 w-4" />
                <h2 className="text-sm font-bold">الأوامر المدعومة</h2>
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="font-mono text-xs text-emerald-300">send noti all الرسالة</p>
                  <p className="mt-1 text-xs text-muted-foreground">يرسل إشعارًا لكل المستخدمين المشتركين.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="font-mono text-xs text-amber-300">send admin all الرسالة</p>
                  <p className="mt-1 text-xs text-muted-foreground">يرسل إشعارًا لأجهزة الإدارة فقط.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="font-mono text-xs text-cyan-300">set access to username turkish print</p>
                  <p className="mt-1 text-xs text-muted-foreground">يمنح المستخدم المحدد صلاحية الطباعة التركية.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="font-mono text-xs text-rose-300">remove access from username turkish print</p>
                  <p className="mt-1 text-xs text-muted-foreground">يسحب صلاحية الطباعة التركية من المستخدم المحدد.</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-card/70 p-5">
              <h2 className="mb-3 text-sm font-bold text-foreground">معاينة التنفيذ</h2>
              <div className="space-y-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs text-muted-foreground">العملية</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {!commandPreview
                      ? "غير صالح"
                      : commandPreview.kind === "notify"
                        ? commandPreview.audience === "all"
                          ? "إشعار لكل المستخدمين"
                          : "إشعار للإدارة فقط"
                        : commandPreview.enabled
                          ? "منح صلاحية الطباعة التركية"
                          : "سحب صلاحية الطباعة التركية"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs text-muted-foreground">التفاصيل</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {!commandPreview
                      ? "--"
                      : commandPreview.kind === "notify"
                        ? commandPreview.body
                        : commandPreview.username}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-white/10 bg-card/70 p-5">
          <h2 className="mb-4 text-sm font-bold text-foreground">مخرجات التنفيذ</h2>
          <div className="rounded-2xl border border-white/10 bg-black/45 p-3">
            <div className="space-y-2 font-mono text-xs">
              {consoleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={
                    entry.type === "success"
                      ? "text-emerald-300"
                      : entry.type === "error"
                        ? "text-rose-300"
                        : "text-slate-300"
                  }
                >
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
