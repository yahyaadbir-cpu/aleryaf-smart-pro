import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, BellRing, BrainCircuit, Building2, CalendarRange, Crown, PackageSearch, Printer, RefreshCcw, ShieldAlert, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatNumber } from "@/lib/format";
import { apiFetch } from "@/lib/http";
import { logActivity } from "@/lib/activity";

type ReportPeriod = "weekly" | "monthly";
type SupportedCurrency = "USD" | "TRY";

type ReportData = {
  meta: { period: ReportPeriod; label: string; startDate: string; endDate: string; generatedAt: string };
  summary: { salesInvoicesCount: number; purchaseInvoicesCount: number; customersCount: number; activeBranchesCount: number; totalItemsCount: number; lowStockCount: number; salesRevenueTry: number; salesRevenueUsd: number; salesProfitTry: number; salesProfitUsd: number; purchaseSpendTry: number; purchaseSpendUsd: number; inventoryValueTry: number; inventoryValueUsd: number };
  branchPerformance: Array<{ branchId: number; branchName: string; branchCode: string; salesInvoiceCount: number; revenueTry: number; revenueUsd: number }>;
  topCustomers: Array<{ customerName: string; invoiceCount: number; lastInvoiceDate: string; revenueTry: number; revenueUsd: number }>;
  topItems: Array<{ itemId: number; itemCode: string; itemName: string; category: string; quantitySold: number; revenueTry: number; revenueUsd: number }>;
  categoryPerformance: Array<{ category: string; revenueTry: number; revenueUsd: number; profitTry: number; profitUsd: number }>;
  timeline: Array<{ date: string; salesInvoiceCount: number; revenueTry: number; revenueUsd: number; profitTry: number; profitUsd: number }>;
  recentInvoices: Array<{ id: number; invoiceNumber: string; invoiceType: string; currency: "TRY" | "USD"; invoiceDate: string; customerName: string; branchName: string; totalAmount: number }>;
  inventoryHighlights: { lowStockItems: Array<{ itemId: number; itemCode: string; itemName: string; currentStock: number; minStock: number; currentValueTry: number; currentValueUsd: number }> };
};

const toInputDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const formatArabicDate = (value: string) => new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${value}T12:00:00`));
const formatArabicDateTime = (value: string) => new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const amountByCurrency = (usd: number, tryAmount: number, currency: SupportedCurrency) => currency === "USD" ? usd : tryAmount;
const margin = (revenue: number, profit: number) => revenue > 0 ? (profit / revenue) * 100 : 0;
const fmt = (value: number, currency: SupportedCurrency) => formatCurrency(value, currency);

async function fetchCompanyReport(period: ReportPeriod, date: string) {
  const r = await apiFetch(`/api/reports/company?${new URLSearchParams({ period, date })}`);
  if (!r.ok) throw new Error("تعذر تحميل التقرير");
  return (await r.json()) as ReportData;
}

export function SmartReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [referenceDate, setReferenceDate] = useState(toInputDate());
  const { toast } = useToast();
  const { user } = useAuth();
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ["smart-report", period, referenceDate], queryFn: () => fetchCompanyReport(period, referenceDate) });

  const notifyMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/api/reports/company/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, date: referenceDate }) });
      if (!r.ok) throw new Error("notify failed");
      return r.json() as Promise<{ title: string; body: string }>;
    },
    onSuccess: async (payload) => {
      toast({ title: payload.title, description: payload.body });
      if (user) await logActivity(user.username, "التقرير الذكي للشركة", `${period} | ${referenceDate}`);
    },
    onError: () => toast({ title: "فشل إرسال الإشعار", variant: "destructive" }),
  });

  useEffect(() => {
    if (data) document.title = `${data.meta.label} - شركة الأرياف التجارية`;
  }, [data]);

  const analysis = useMemo(() => {
    if (!data) return null;
    const currency: SupportedCurrency = Math.abs(data.summary.salesRevenueUsd) + Math.abs(data.summary.salesProfitUsd) > 0 ? "USD" : "TRY";
    const totalSales = amountByCurrency(data.summary.salesRevenueUsd, data.summary.salesRevenueTry, currency);
    const totalProfit = amountByCurrency(data.summary.salesProfitUsd, data.summary.salesProfitTry, currency);
    const inventoryValue = amountByCurrency(data.summary.inventoryValueUsd, data.summary.inventoryValueTry, currency);
    const purchaseValue = amountByCurrency(data.summary.purchaseSpendUsd, data.summary.purchaseSpendTry, currency);
    const netMargin = margin(totalSales, totalProfit);
    const branches = data.branchPerformance.map((b) => ({ ...b, salesAmount: amountByCurrency(b.revenueUsd, b.revenueTry, currency), share: totalSales > 0 ? amountByCurrency(b.revenueUsd, b.revenueTry, currency) / totalSales * 100 : 0 })).sort((a, b) => b.salesAmount - a.salesAmount);
    const customers = data.topCustomers.map((c) => ({ ...c, salesAmount: amountByCurrency(c.revenueUsd, c.revenueTry, currency) })).sort((a, b) => b.salesAmount - a.salesAmount);
    const items = data.topItems.map((i) => ({ ...i, revenueAmount: amountByCurrency(i.revenueUsd, i.revenueTry, currency) })).sort((a, b) => b.revenueAmount - a.revenueAmount);
    const categories = data.categoryPerformance.map((c) => ({ ...c, revenueAmount: amountByCurrency(c.revenueUsd, c.revenueTry, currency), profitAmount: amountByCurrency(c.profitUsd, c.profitTry, currency) })).sort((a, b) => b.revenueAmount - a.revenueAmount);
    const trend = data.timeline.map((t) => ({ label: t.date.slice(5), revenue: amountByCurrency(t.revenueUsd, t.revenueTry, currency), profit: amountByCurrency(t.profitUsd, t.profitTry, currency), invoices: t.salesInvoiceCount, date: t.date }));
    const outOfStock = data.inventoryHighlights.lowStockItems.filter((i) => i.currentStock <= 0).map((i) => ({ ...i, valueAmount: amountByCurrency(i.currentValueUsd, i.currentValueTry, currency) }));
    const belowMinimum = data.inventoryHighlights.lowStockItems.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock).map((i) => ({ ...i, valueAmount: amountByCurrency(i.currentValueUsd, i.currentValueTry, currency) }));
    const customerConcentration = totalSales > 0 ? customers.slice(0, 3).reduce((s, c) => s + c.salesAmount, 0) / totalSales * 100 : 0;
    const branchConcentration = branches[0]?.share ?? 0;
    const suspicious = [];
    if (totalSales > 0 && purchaseValue <= 0 && totalProfit > 0) suspicious.push("الربح الظاهر لا يقابله إنفاق شراء واضح خلال الفترة، وهذا يستدعي مراجعة منطق التكلفة.");
    if (totalProfit > totalSales) suspicious.push("صافي الربح أعلى من المبيعات المسجلة، وهو مؤشر غير طبيعي ويحتاج تدقيقًا فوريًا.");
    const posture = totalSales <= 0 ? "الفترة هادئة جدًا ولا تعطي صورة نمو مريحة." : netMargin >= 35 ? "الوضع المالي قوي جدًا وجودة الربح ممتازة." : netMargin >= 20 ? "الشركة في وضع جيد لكن تحتاج رفع جودة الربح والانضباط التشغيلي." : "المبيعات موجودة لكن جودة الربح ما تزال أقل من المستوى المطمئن.";
    const healthScore = Math.max(28, Math.min(96, Math.round(56 + Math.min(netMargin, 25) + (outOfStock.length ? -11 : 10) + (suspicious.length ? -18 : 8) + (branchConcentration >= 60 ? -6 : 8) + (customerConcentration >= 55 ? -7 : 7))));
    return { currency, totalSales, totalProfit, inventoryValue, netMargin, branches, customers, items, categories, trend, outOfStock, belowMinimum, suspicious, customerConcentration, branchConcentration, posture, healthScore };
  }, [data]);

  if (!analysis && isLoading) return <Layout><div className="py-20 text-center text-muted-foreground">جاري تجهيز التقرير الذكي...</div></Layout>;
  if (!analysis || !data) return <Layout><div className="py-20 text-center text-muted-foreground">تعذر تحميل التقرير</div></Layout>;

  const recommendations = [
    analysis.suspicious.length ? { level: "critical", title: "تدقيق الربحية والتكلفة", body: "قبل اعتماد التقرير ماليًا يجب التحقق من آلية حساب التكلفة والربح حتى لا تُبنى القرارات على قراءة مضللة.", owner: "المالية / النظام", due: "خلال 48 ساعة", impact: "رفع موثوقية التقرير." } : null,
    analysis.outOfStock.length ? { level: "critical", title: "معالجة الأصناف النافدة", body: `يوجد ${formatNumber(analysis.outOfStock.length)} صنف نافد بالكامل، وهذا خطر مباشر على البيع وخدمة العملاء.`, owner: "المخزون / المشتريات", due: "فوري", impact: "منع خسارة مبيعات مباشرة." } : null,
    analysis.customerConcentration >= 45 ? { level: "recommended", title: "تخفيف تركّز الإيراد", body: `أكبر العملاء يمثلون ${analysis.customerConcentration.toFixed(1)}% من المبيعات تقريبًا، وهذا يجعل الإيراد حساسًا لأي تغيير مفاجئ.`, owner: "المبيعات", due: "أسبوعان", impact: "تقليل الاعتماد على عدد محدود من العملاء." } : null,
    !analysis.suspicious.length && !analysis.outOfStock.length ? { level: "opportunity", title: "استثمار الاستقرار في النمو", body: "الوضع الحالي يمنح الإدارة مساحة للتوسع المنظم وتحسين الكفاءة قبل ظهور ضغط جديد.", owner: "الإدارة العليا", due: "هذا الشهر", impact: "استثمار لحظة الاستقرار." } : null,
  ].filter(Boolean) as Array<{ level: "critical" | "recommended" | "opportunity"; title: string; body: string; owner: string; due: string; impact: string }>;

  const summary = [
    analysis.posture,
    analysis.branches[0] ? `${analysis.branches[0].branchName} هو الفرع المرجعي حاليًا بحصة ${analysis.branches[0].share.toFixed(1)}% من المبيعات.` : "لا يوجد فرع قائد واضح.",
    analysis.customers[0] ? `${analysis.customers[0].customerName} هو العميل الأعلى أثرًا خلال الفترة.` : "لا يوجد عميل مهيمن بوضوح.",
    analysis.outOfStock.length ? `الخطر الأقرب الآن هو المخزون، وهناك ${formatNumber(analysis.outOfStock.length)} صنف نافد بالكامل.` : "تشغيليًا لا توجد إشارة حرجة تمنع التركيز على النمو.",
  ];

  const letter = [
    `هذا التقرير يقرأ الشركة من زاوية القرار التنفيذي، لا من زاوية عرض الأرقام فقط. ${analysis.posture}`,
    analysis.suspicious.length ? "قبل اعتماد التقرير بالكامل، توجد إشارات تستدعي تدقيق منطق التكلفة أو الربحية." : "ماليًا لا تظهر إشارة حرجة تمنع البناء على هذه القراءة.",
    analysis.branchConcentration >= 60 ? "الاعتماد على فرع واحد لا يزال مرتفعًا، وهذا جيد مؤقتًا لكنه ليس نموذجًا مريحًا للنمو طويل المدى." : "توزيع المبيعات بين الفروع مقبول نسبيًا ويعطي مرونة أفضل في التشغيل.",
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-5" dir="rtl">
        <Card className="screen-only glass-panel border-white/10">
          <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="executive-cover__eyebrow-badge">ALERYAF TRADING COMPANY</Badge>
                  <Badge variant="outline" className="rounded-full border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">{data.meta.label}</Badge>
                </div>
                <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">التقرير التنفيذي الذكي للشركة</h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">تقرير يشرح لك ما الذي يحدث في الشركة فعلًا، وما الذي يحتاج قرارًا، وبأي أولوية.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="border-white/10 text-white"><RefreshCcw className="ml-2 h-4 w-4" />تحديث</Button>
                <Button variant="outline" onClick={() => window.print()} className="border-white/10 text-white"><Printer className="ml-2 h-4 w-4" />طباعة</Button>
                <Button onClick={() => notifyMutation.mutate()} disabled={notifyMutation.isPending} className="bg-primary text-white"><BellRing className="ml-2 h-4 w-4" />إشعار</Button>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPeriod("weekly")} className={`rounded-full px-4 py-2 text-sm font-bold ${period === "weekly" ? "bg-primary text-white" : "bg-white/5 text-muted-foreground"}`}>أسبوعي</button>
                <button type="button" onClick={() => setPeriod("monthly")} className={`rounded-full px-4 py-2 text-sm font-bold ${period === "monthly" ? "bg-primary text-white" : "bg-white/5 text-muted-foreground"}`}>شهري</button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300"><CalendarRange className="h-4 w-4 text-primary" />{`${formatArabicDate(data.meta.startDate)} - ${formatArabicDate(data.meta.endDate)}`}</div>
                <Input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="w-[190px] border-white/10 bg-black/30" />
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_22%),radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_18%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] p-5 shadow-[0_32px_80px_rgba(2,6,23,0.45)] sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="executive-cover__eyebrow-badge">{period === "weekly" ? "إصدار أسبوعي" : "إصدار شهري"}</Badge>
                <Badge variant="outline" className="rounded-full border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">آخر تحديث {formatArabicDateTime(data.meta.generatedAt)}</Badge>
              </div>
              <div>
                <h2 className="font-display text-3xl font-bold text-white sm:text-[2.75rem]">شركة الأرياف التجارية</h2>
                <p className="mt-3 max-w-3xl text-base leading-8 text-slate-300">هذا ليس عرض بيانات فقط. هذا تقرير مصمم كأنه مذكرة من مستشار أعمال للإدارة العليا.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={<Wallet className="h-5 w-5 text-blue-300" />} label="المبيعات" value={fmt(analysis.totalSales, analysis.currency)} hint="الحجم البيعي" />
                <MetricCard icon={<TrendingUp className="h-5 w-5 text-emerald-300" />} label="صافي الربح" value={fmt(analysis.totalProfit, analysis.currency)} hint={`هامش ${analysis.netMargin.toFixed(1)}%`} />
                <MetricCard icon={<PackageSearch className="h-5 w-5 text-amber-300" />} label="قيمة المخزون" value={fmt(analysis.inventoryValue, analysis.currency)} hint="رأس المال في المخزون" />
                <MetricCard icon={<Users className="h-5 w-5 text-fuchsia-300" />} label="عدد العملاء" value={formatNumber(data.summary.customersCount)} hint="العملاء النشطون" />
              </div>
            </div>

            <Card className="glass-panel border-white/10 bg-white/5">
              <CardContent className="space-y-5 p-5">
                <div className="flex items-center justify-between"><div><p className="text-sm text-slate-400">درجة صحة الأعمال</p><div className="mt-2 text-4xl font-bold text-white">{analysis.healthScore}<span className="text-lg text-slate-400">/100</span></div></div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><BrainCircuit className="h-7 w-7 text-primary" /></div></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" style={{ width: `${analysis.healthScore}%` }} /></div>
                <Decision tone={analysis.netMargin >= 25 ? "good" : analysis.netMargin >= 15 ? "warn" : "risk"} title="الصورة العامة" text={analysis.posture} />
                <Decision tone={analysis.customerConcentration >= 55 || analysis.branchConcentration >= 60 ? "warn" : "good"} title="تركيز الإيراد" text={`تركيز العملاء ${analysis.customerConcentration.toFixed(1)}% وحصة الفرع القائد ${analysis.branchConcentration.toFixed(1)}%.`} />
                <Decision tone={analysis.suspicious.length || analysis.outOfStock.length ? "risk" : analysis.belowMinimum.length ? "warn" : "good"} title="المخاطر التشغيلية" text={analysis.suspicious.length ? "هناك مؤشرات رقابية تحتاج تدقيقًا قبل الاعتماد الكامل." : analysis.outOfStock.length ? "المخزون هو أقرب نقطة خطر الآن." : "الوضع التشغيلي مستقر نسبيًا."} />
              </CardContent>
            </Card>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <TextPanel title="الملخص الذي يهم المالك" icon={<Sparkles className="h-5 w-5 text-primary" />} items={summary} />
          <TextPanel title="رسالة الإدارة" icon={<Crown className="h-5 w-5 text-emerald-300" />} items={letter} />
        </div>

        {analysis.suspicious.length > 0 && (
          <Card className="glass-panel border-amber-400/20 bg-amber-500/8"><CardContent className="flex gap-3 p-5"><div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3"><ShieldAlert className="h-5 w-5 text-amber-300" /></div><div className="space-y-2"><h3 className="font-display text-xl text-amber-100">ملاحظة رقابية قبل الاعتماد الكامل</h3>{analysis.suspicious.map((note) => <p key={note} className="text-sm leading-7 text-amber-50/90">{note}</p>)}</div></CardContent></Card>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="glass-panel border-white/10">
            <CardHeader><CardTitle className="text-xl text-white">اتجاه الأداء خلال الفترة</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="h-[320px] rounded-[24px] border border-white/8 bg-black/20 p-3">
                <ResponsiveContainer width="100%" height="100%"><AreaChart data={analysis.trend} margin={{ top: 14, right: 14, left: 0, bottom: 0 }}><defs><linearGradient id="rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} /></linearGradient><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.32} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} /><XAxis dataKey="label" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={72} /><Tooltip formatter={(value: number, key: string) => [fmt(value, analysis.currency), key === "profit" ? "الربح" : "المبيعات"]} contentStyle={{ backgroundColor: "#020617", border: "1px solid rgba(148,163,184,0.18)", borderRadius: "14px", color: "#e2e8f0" }} /><Area type="monotone" dataKey="revenue" stroke="#60a5fa" strokeWidth={2.5} fill="url(#rf)" name="المبيعات" /><Area type="monotone" dataKey="profit" stroke="#34d399" strokeWidth={2} fill="url(#pf)" name="الربح" /></AreaChart></ResponsiveContainer>
              </div>
              <Bullet>ذروة المبيعات خلال العينة وصلت إلى {fmt(Math.max(...analysis.trend.map((p) => p.revenue)), analysis.currency)}، وهذا يؤكد أن النشاط يعتمد على أيام قوية محددة أكثر من اعتماده على تدفق ثابت.</Bullet>
              <Bullet>الفرع القائد هو {analysis.branches[0]?.branchName ?? "غير متاح"}، وأكبر عميل هو {analysis.customers[0]?.customerName ?? "غير متاح"}.</Bullet>
            </CardContent>
          </Card>

          <Card className="glass-panel border-white/10">
            <CardHeader><CardTitle className="text-xl text-white">بوصلة الشركة</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Mini label="تركيز العملاء" value={`${analysis.customerConcentration.toFixed(1)}%`} />
              <Mini label="حصة الفرع القائد" value={`${analysis.branchConcentration.toFixed(1)}%`} />
              <Mini label="أصناف نافدة" value={formatNumber(analysis.outOfStock.length)} />
              <Mini label="أهم فئة" value={analysis.categories[0]?.category ?? "غير متاحة"} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Spotlight icon={<Building2 className="h-5 w-5 text-blue-300" />} title="أفضل فرع" name={analysis.branches[0]?.branchName ?? "غير متاح"} meta={analysis.branches[0] ? `${analysis.branches[0].share.toFixed(1)}% من المبيعات` : "لا توجد بيانات"} value={analysis.branches[0] ? fmt(analysis.branches[0].salesAmount, analysis.currency) : "-"} />
          <Spotlight icon={<Users className="h-5 w-5 text-emerald-300" />} title="العميل الأهم" name={analysis.customers[0]?.customerName ?? "غير متاح"} meta={analysis.customers[0] ? `${formatNumber(analysis.customers[0].invoiceCount)} فواتير` : "لا توجد بيانات"} value={analysis.customers[0] ? fmt(analysis.customers[0].salesAmount, analysis.currency) : "-"} />
          <Spotlight icon={<PackageSearch className="h-5 w-5 text-amber-300" />} title="الصنف القائد" name={analysis.items[0]?.itemName ?? "غير متاح"} meta={analysis.items[0]?.category ?? "لا توجد بيانات"} value={analysis.items[0] ? fmt(analysis.items[0].revenueAmount, analysis.currency) : "-"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <DataTable title="الفروع" headers={["الفرع", "المبيعات", "الفواتير", "الحصة"]} rows={analysis.branches.slice(0, 5).map((b) => [b.branchName, fmt(b.salesAmount, analysis.currency), formatNumber(b.salesInvoiceCount), `${b.share.toFixed(1)}%`])} />
          <DataTable title="الأصناف الأعلى مساهمة" headers={["الصنف", "الفئة", "الإيراد", "الكمية"]} rows={analysis.items.slice(0, 5).map((i) => [i.itemName, i.category, fmt(i.revenueAmount, analysis.currency), formatNumber(i.quantitySold)])} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="glass-panel border-white/10">
            <CardHeader><CardTitle className="text-xl text-white">المخزون والأولوية المباشرة</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(analysis.outOfStock.length ? analysis.outOfStock : analysis.belowMinimum).slice(0, 4).map((item) => <div key={item.itemId} className="flex items-center justify-between gap-3 rounded-2xl border border-white/6 bg-black/15 px-3 py-3"><div><div className="font-semibold text-white">{item.itemName}</div><div className="text-xs text-slate-400">{item.itemCode}</div></div><div className="text-left"><div className="font-semibold text-white">{formatNumber(item.currentStock)} كغ</div><div className="text-xs text-slate-400">الحد الأدنى {formatNumber(item.minStock)} | {fmt(item.valueAmount, analysis.currency)}</div></div></div>)}
              {!analysis.outOfStock.length && !analysis.belowMinimum.length && <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-4 text-sm text-emerald-100">لا توجد إشارات مخزون حرجة في هذه الفترة.</div>}
            </CardContent>
          </Card>
          <DataTable title="أحدث الفواتير المرجعية" headers={["الرقم", "النوع", "الجهة", "الفرع", "الإجمالي"]} rows={data.recentInvoices.slice(0, 5).map((i) => [i.invoiceNumber, i.invoiceType === "purchase" ? "شراء" : "بيع", i.customerName, i.branchName, formatCurrency(i.totalAmount, i.currency)])} />
        </div>

        <Card className="glass-panel border-white/10"><CardHeader><CardTitle className="text-xl text-white">التوصيات التنفيذية</CardTitle></CardHeader><CardContent className="grid gap-4 xl:grid-cols-3">{recommendations.map((item) => <RecommendationBox key={item.title} item={item} />)}</CardContent></Card>
        <Card className="glass-panel border-white/10"><CardHeader><CardTitle className="text-xl text-white">هوامش القراءة</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{["لا يتضمن التقرير مقارنة مباشرة بالفترة السابقة.", "سعر الصرف المرجعي غير ظاهر داخل بيانات هذا الإصدار.", analysis.suspicious.length ? "ينبغي مراجعة قراءة الربح قبل اعتمادها ماليًا بشكل نهائي." : "لا توجد ملاحظات رقابية إضافية في هذا الإصدار."].map((item) => <div key={item} className="rounded-[22px] border border-white/8 bg-white/4 p-4 text-sm leading-7 text-slate-300">{item}</div>)}</CardContent></Card>
      </div>
    </Layout>
  );
}

function MetricCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) { return <div className="rounded-[24px] border border-white/10 bg-white/5 p-4"><div className="flex items-center justify-between gap-3"><div className="rounded-2xl border border-white/10 bg-black/20 p-3">{icon}</div><div className="text-left"><div className="text-xs text-slate-400">{label}</div><div className="mt-1 text-xl font-bold text-white">{value}</div></div></div><div className="mt-3 text-xs leading-6 text-slate-400">{hint}</div></div>; }
function Bullet({ children }: { children: React.ReactNode }) { return <div className="flex items-start gap-3 rounded-[22px] border border-white/8 bg-white/4 px-4 py-3 text-sm leading-7 text-slate-300"><ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-primary" /><span>{children}</span></div>; }
function Decision({ title, text, tone }: { title: string; text: string; tone: "good" | "warn" | "risk" }) { const s = tone === "good" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : tone === "warn" ? "border-amber-400/20 bg-amber-500/10 text-amber-100" : "border-rose-400/20 bg-rose-500/10 text-rose-100"; return <div className={`rounded-[22px] border p-4 ${s}`}><div className="text-sm font-semibold">{title}</div><p className="mt-2 text-sm leading-7">{text}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-[20px] border border-white/10 bg-white/4 p-4"><div className="text-xs text-slate-400">{label}</div><div className="mt-2 text-2xl font-bold text-white">{value}</div></div>; }
function Spotlight({ icon, title, name, meta, value }: { icon: React.ReactNode; title: string; name: string; meta: string; value: string }) { return <Card className="glass-panel border-white/10"><CardContent className="space-y-4 p-5"><div className="flex items-center justify-between gap-3"><div className="rounded-2xl border border-white/10 bg-white/5 p-3">{icon}</div><Badge variant="outline" className="rounded-full border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">{title}</Badge></div><div className="font-display text-2xl font-bold text-white">{name}</div><div className="text-sm text-slate-400">{meta}</div><div className="text-2xl font-bold text-primary">{value}</div></CardContent></Card>; }
function TextPanel({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) { return <Card className="glass-panel border-white/10"><CardHeader className="pb-3"><div className="flex items-center gap-3"><div className="rounded-2xl border border-white/10 bg-white/5 p-3">{icon}</div><CardTitle className="text-xl text-white">{title}</CardTitle></div></CardHeader><CardContent className="space-y-3">{items.map((item) => <Bullet key={item}>{item}</Bullet>)}</CardContent></Card>; }
function DataTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) { return <Card className="glass-panel border-white/10"><CardHeader><CardTitle className="text-xl text-white">{title}</CardTitle></CardHeader><CardContent><div className="overflow-hidden rounded-[22px] border border-white/10"><Table><TableHeader className="bg-white/5"><TableRow className="border-white/10 hover:bg-transparent">{headers.map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, i) => <TableRow key={i} className="border-white/6 hover:bg-white/4">{row.map((cell, idx) => <TableCell key={`${i}-${idx}`} className={idx === 0 ? "font-semibold text-foreground" : ""}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table></div></CardContent></Card>; }
function RecommendationBox({ item }: { item: { level: "critical" | "recommended" | "opportunity"; title: string; body: string; owner: string; due: string; impact: string } }) { const tone = item.level === "critical" ? "border-rose-400/20 bg-rose-500/8" : item.level === "recommended" ? "border-amber-400/20 bg-amber-500/8" : "border-emerald-400/20 bg-emerald-500/8"; const label = item.level === "critical" ? "إجراء حرج" : item.level === "recommended" ? "موصى به" : "فرصة"; return <div className={`rounded-[24px] border p-5 ${tone}`}><div className="flex items-center justify-between gap-3"><Badge variant="outline" className="rounded-full border-white/10 bg-black/15 px-3 py-1 text-xs text-white">{label}</Badge><ArrowRight className="h-4 w-4 text-white/70" /></div><h3 className="mt-4 font-display text-xl font-bold text-white">{item.title}</h3><p className="mt-3 text-sm leading-7 text-slate-200">{item.body}</p><div className="mt-4 space-y-2 text-xs leading-6 text-slate-300"><div><span className="text-slate-400">المالك:</span> {item.owner}</div><div><span className="text-slate-400">الموعد:</span> {item.due}</div><div><span className="text-slate-400">الأثر:</span> {item.impact}</div></div></div>; }
