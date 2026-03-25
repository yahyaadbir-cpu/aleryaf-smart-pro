import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth";
import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LogEntry {
  id: number;
  username: string;
  action: string;
  details: string | null;
  createdAt: string;
}

type ActivityType = "all" | "invoice" | "item" | "branch" | "warehouse" | "inventory" | "auth" | "other";
type TimeFilter = "all" | "today" | "7d" | "30d";

function classifyLogEntry(entry: LogEntry): ActivityType {
  const text = `${entry.action} ${entry.details ?? ""}`;

  if (text.includes("فاتورة")) return "invoice";
  if (text.includes("منتج")) return "item";
  if (text.includes("مستودع")) return "warehouse";
  if (text.includes("فرع")) return "branch";
  if (text.includes("مخزون")) return "inventory";
  if (text.includes("تسجيل دخول") || text.includes("تسجيل خروج")) return "auth";

  return "other";
}

function getActivityTypeLabel(type: ActivityType) {
  switch (type) {
    case "invoice":
      return "فاتورة";
    case "item":
      return "منتج";
    case "branch":
      return "فرع";
    case "warehouse":
      return "مستودع";
    case "inventory":
      return "مخزون";
    case "auth":
      return "دخول";
    case "other":
      return "أخرى";
    default:
      return "الكل";
  }
}

function getActivityTypeBadgeClass(type: ActivityType, action: string) {
  if (type === "auth") {
    if (action.includes("دخول")) return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20";
    if (action.includes("خروج")) return "bg-amber-500/15 text-amber-300 border border-amber-500/20";
  }

  switch (type) {
    case "invoice":
      return "bg-blue-500/15 text-blue-300 border border-blue-500/20";
    case "item":
      return "bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/20";
    case "branch":
      return "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20";
    case "warehouse":
      return "bg-orange-500/15 text-orange-300 border border-orange-500/20";
    case "inventory":
      return "bg-lime-500/15 text-lime-300 border border-lime-500/20";
    case "auth":
      return "bg-white/10 text-white border border-white/10";
    default:
      return "bg-white/5 text-slate-300 border border-white/10";
  }
}

function getActivityCardClass(type: ActivityType, action: string) {
  if (type === "auth") {
    if (action.includes("دخول")) return "border-emerald-500/20 bg-emerald-500/[0.04]";
    if (action.includes("خروج")) return "border-amber-500/20 bg-amber-500/[0.04]";
  }

  switch (type) {
    case "invoice":
      return "border-blue-500/15 bg-blue-500/[0.03]";
    case "item":
      return "border-fuchsia-500/15 bg-fuchsia-500/[0.03]";
    case "branch":
      return "border-cyan-500/15 bg-cyan-500/[0.03]";
    case "warehouse":
      return "border-orange-500/15 bg-orange-500/[0.03]";
    case "inventory":
      return "border-lime-500/15 bg-lime-500/[0.03]";
    default:
      return "border-white/10";
  }
}

function formatLogDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function AdminLogPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [usernameFilter, setUsernameFilter] = useState("all");

  useEffect(() => {
    if (!user?.isAdmin) navigate("/");
  }, [user, navigate]);

  const { data, isLoading } = useQuery<LogEntry[]>({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const res = await apiFetch("/api/activity-log");
      if (!res.ok) throw new Error("فشل في جلب السجل");
      return res.json();
    },
    enabled: !!user?.isAdmin,
    refetchInterval: 15000,
  });

  const usernames = useMemo(() => {
    return Array.from(new Set((data ?? []).map((entry) => entry.username))).sort((a, b) => a.localeCompare(b, "ar"));
  }, [data]);

  const filteredData = useMemo(() => {
    const source = data ?? [];
    const now = Date.now();

    return source.filter((entry) => {
      const matchesUser = usernameFilter === "all" || entry.username === usernameFilter;
      const createdAt = new Date(entry.createdAt).getTime();

      let matchesTime = true;
      if (timeFilter === "today") {
        const entryDate = new Date(entry.createdAt);
        const today = new Date();
        matchesTime =
          entryDate.getFullYear() === today.getFullYear() &&
          entryDate.getMonth() === today.getMonth() &&
          entryDate.getDate() === today.getDate();
      } else if (timeFilter === "7d") {
        matchesTime = now - createdAt <= 7 * 24 * 60 * 60 * 1000;
      } else if (timeFilter === "30d") {
        matchesTime = now - createdAt <= 30 * 24 * 60 * 60 * 1000;
      }

      return matchesUser && matchesTime;
    });
  }, [data, timeFilter, usernameFilter]);

  if (!user?.isAdmin) return null;

  return (
    <Layout>
      <div className="mx-auto max-w-4xl" dir="rtl">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">سجل النشاط</h1>
          <p className="text-sm text-muted-foreground mt-1">جميع العمليات التي قام بها المستخدمون</p>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Select value={timeFilter} onValueChange={(value) => setTimeFilter(value as TimeFilter)}>
            <SelectTrigger className="bg-black/30 border-white/10">
              <SelectValue placeholder="فلترة حسب الوقت" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأوقات</SelectItem>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="7d">آخر 7 أيام</SelectItem>
              <SelectItem value="30d">آخر 30 يومًا</SelectItem>
            </SelectContent>
          </Select>

          <Select value={usernameFilter} onValueChange={setUsernameFilter}>
            <SelectTrigger className="bg-black/30 border-white/10">
              <SelectValue placeholder="فلترة حسب المستخدم" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المستخدمين</SelectItem>
              {usernames.map((username) => (
                <SelectItem key={username} value={username}>
                  {username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground">جاري التحميل...</div>
        ) : !data?.length ? (
          <div className="py-16 text-center text-muted-foreground">لا توجد سجلات بعد</div>
        ) : !filteredData.length ? (
          <div className="py-16 text-center text-muted-foreground">لا توجد نتائج مطابقة للفلاتر الحالية</div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredData.map((entry) => {
              const activityType = classifyLogEntry(entry);

              return (
                <div
                  key={entry.id}
                  className={`glass-panel border rounded-xl px-4 py-3 flex items-start gap-4 ${getActivityCardClass(activityType, entry.action)}`}
                >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-primary bg-primary/10 rounded px-2 py-0.5">
                      {entry.username}
                    </span>
                    <span className={`text-[10px] font-medium rounded px-2 py-0.5 ${getActivityTypeBadgeClass(activityType, entry.action)}`}>
                      {getActivityTypeLabel(activityType)}
                    </span>
                    <span className="text-sm font-medium text-foreground">{entry.action}</span>
                  </div>
                  {entry.details && (
                    <p className="text-xs text-muted-foreground mt-1">{entry.details}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5 tabular-nums" dir="ltr">
                  {formatLogDate(entry.createdAt)}
                </span>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
import { apiFetch, BASE } from "@/lib/http";
