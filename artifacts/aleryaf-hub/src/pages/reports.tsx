import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BrainCircuit,
  Building2,
  CalendarRange,
  Crown,
  PackageSearch,
  Printer,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
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

interface CompanyReportResponse {
  meta: { period: ReportPeriod; label: string; startDate: string; endDate: string; generatedAt: string };
  summary: {
    salesInvoicesCount: number; purchaseInvoicesCount: number; customersCount: number; activeBranchesCount: number;
    totalItemsCount: number; lowStockCount: number; salesRevenueTry: number; salesRevenueUsd: number;
    salesCostTry: number; salesCostUsd: number; salesProfitTry: number; salesProfitUsd: number;
    purchaseSpendTry: number; purchaseSpendUsd: number; inventoryValueTry: number; inventoryValueUsd: number;
    avgSaleInvoiceTry: number; avgSaleInvoiceUsd: number;
  };
  branchPerformance: Array<{
    branchId: number; branchName: string; branchCode: string; salesInvoiceCount: number; purchaseInvoiceCount: number;
    revenueTry: number; revenueUsd: number; costTry: number; costUsd: number; profitTry: number; profitUsd: number;
  }>;
  topCustomers: Array<{
    customerName: string; invoiceCount: number; lastInvoiceDate: string; revenueTry: number; revenueUsd: number; profitTry: number; profitUsd: number;
  }>;
  topItems: Array<{
    itemId: number; itemCode: string; itemName: string; category: string; quantitySold: number; revenueTry: number; revenueUsd: number; profitTry: number; profitUsd: number;
  }>;
  categoryPerformance: Array<{ category: string; revenueTry: number; revenueUsd: number; profitTry: number; profitUsd: number }>;
  timeline: Array<{ date: string; salesInvoiceCount: number; purchaseInvoiceCount: number; revenueTry: number; revenueUsd: number; profitTry: number; profitUsd: number }>;
  recentInvoices: Array<{
    id: number; invoiceNumber: string; invoiceType: string; currency: "TRY" | "USD"; invoiceDate: string; customerName: string; branchName: string; totalAmount: number; totalProfit: number;
  }>;
  inventoryHighlights: {
    lowStockItems: Array<{ itemId: number; itemCode: string; itemName: string; currentStock: number; minStock: number; currentValueTry: number; currentValueUsd: number }>;
    topValueItems: Array<{ itemId: number; itemCode: string; itemName: string; currentStock: number; minStock: number; currentValueTry: number; currentValueUsd: number }>;
  };
  notification: { title: string; body: string };
}

interface RankedBranch { branchId: number; branchName: string; branchCode: string; salesInvoiceCount: number; salesAmount: number; share: number }
interface RankedCustomer { customerName: string; invoiceCount: number; salesAmount: number; lastInvoiceDate: string }
interface RankedItem { itemId: number; itemCode: string; itemName: string; category: string; quantitySold: number; revenueAmount: number }
interface InventoryAlertItem { itemId: number; itemCode: string; itemName: string; currentStock: number; minStock: number; valueAmount: number }
interface TrendPoint { date: string; label: string; revenue: number; profit: number; invoices: number }
interface StructuredRecommendation {
  level: "critical" | "recommended" | "opportunity";
  title: string;
  body: string;
  owner: string;
  due: string;
  impact: string;
}

function formatArabicDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

function formatArabicDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function toInputDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchCompanyReport(period: ReportPeriod, date: string) {
  const params = new URLSearchParams({ period, date });
  const response = await apiFetch(`/api/reports/company?${params.toString()}`);
  if (!response.ok) throw new Error("تعذر تحميل تقرير الشركة");
  return (await response.json()) as CompanyReportResponse;
}

function pickCurrency(report: CompanyReportResponse): SupportedCurrency {
  const usdSignal = Math.abs(report.summary.salesRevenueUsd) + Math.abs(report.summary.salesProfitUsd) + Math.abs(report.summary.purchaseSpendUsd) + Math.abs(report.summary.inventoryValueUsd);
  return usdSignal > 0 ? "USD" : "TRY";
}

function amountByCurrency(usd: number, tryAmount: number, currency: SupportedCurrency) {
  return currency === "USD" ? usd : tryAmount;
}

function formatExecutiveAmount(value: number, currency: SupportedCurrency) {
  return formatCurrency(value, currency);
}

function getMargin(revenue: number, profit: number) {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

function createSuspiciousNotes(report: CompanyReportResponse, currency: SupportedCurrency) {
  const revenue = amountByCurrency(report.summary.salesRevenueUsd, report.summary.salesRevenueTry, currency);
  const profit = amountByCurrency(report.summary.salesProfitUsd, report.summary.salesProfitTry, currency);
  const cost = amountByCurrency(report.summary.salesCostUsd, report.summary.salesCostTry, currency);
  const margin = getMargin(revenue, profit);
  const notes: string[] = [];
  if (revenue > 0 && cost <= 0) notes.push("صافي الربح يظهر دون تكلفة مقابلة تقريبًا، ما قد يشير إلى حاجة لمراجعة منطق التكلفة.");
  if (revenue > 0 && margin >= 90) notes.push("هامش الربح مرتفع بشكل غير معتاد مقارنة بالمبيعات ويستحسن تدقيق تكلفة الأصناف.");
  if (profit > revenue) notes.push("صافي الربح يتجاوز المبيعات المسجلة، وهو مؤشر غير منطقي يستوجب تدقيقًا فوريًا.");
  return notes;
}

function createTrendInsights(trend: TrendPoint[], currency: SupportedCurrency) {
  if (!trend.length) return ["لا توجد حركة يومية مسجلة خلال الفترة المرجعية."];
  const sortedByRevenue = [...trend].sort((a, b) => b.revenue - a.revenue);
  const peakDay = sortedByRevenue[0];
  const weakestActiveDay = [...trend].filter((point) => point.revenue > 0).sort((a, b) => a.revenue - b.revenue)[0];
  const averageRevenue = trend.reduce((sum, point) => sum + point.revenue, 0) / trend.length;
  const unusualDay = trend.find((point) => averageRevenue > 0 && point.revenue >= averageRevenue * 1.6);
  const zeroDays = trend.filter((point) => point.revenue <= 0).length;
  const insights = [`سجلت الفترة ذروة الأداء في ${formatArabicDate(peakDay.date)} بمبيعات بلغت ${formatExecutiveAmount(peakDay.revenue, currency)}.`];
  if (weakestActiveDay) {
    insights.push(`أضعف يوم نشط كان ${formatArabicDate(weakestActiveDay.date)} بقيمة ${formatExecutiveAmount(weakestActiveDay.revenue, currency)}، ما يعكس تفاوتًا واضحًا في الطلب.`);
  } else if (zeroDays === trend.length) {
    insights.push("لم يتم تسجيل أي مبيعات يومية خلال الفترة، ما يستدعي مراجعة النشاط أو اكتمال الإدخال.");
  }
  if (unusualDay) insights.push(`ظهرت قفزة غير اعتيادية في ${formatArabicDate(unusualDay.date)} مقارنة بمتوسط الفترة، ويستحسن ربطها بعميل أو صنف أو سبب تشغيلي محدد.`);
  else if (zeroDays > 0) insights.push(`شهدت ${formatNumber(zeroDays)} أيام دون مبيعات، وهو ما يشير إلى فترات خمول تستحق المعالجة.`);
  return insights;
}

function createBranchInsight(branches: RankedBranch[]) {
  if (!branches.length) return "لا توجد بيانات فروع كافية لتقييم الأداء خلال هذه الفترة.";
  const leader = branches[0];
  const laggard = branches[branches.length - 1];
  if (leader.salesAmount <= 0) return "الفروع لم تسجل مبيعات فعلية خلال هذه الفترة، ويجب التحقق من النشاط أو اكتمال إدخال البيانات.";
  if (laggard && laggard.salesAmount <= 0 && laggard.branchId !== leader.branchId) {
    return `${leader.branchName} حقق أعلى مساهمة خلال الفترة، بينما ${laggard.branchName} لم يسجل نشاطًا يذكر ويحتاج إلى متابعة تشغيلية.`;
  }
  return `${leader.branchName} يقود الأداء خلال الفترة بحصة ${leader.share.toFixed(1)}% من إجمالي المبيعات، ما يجعله معيارًا للمقارنة مع بقية الفروع.`;
}

function createCustomerInsight(customers: RankedCustomer[], totalSales: number, currency: SupportedCurrency) {
  if (!customers.length || totalSales <= 0) return "قاعدة العملاء خلال هذه الفترة لا تظهر تركّزًا كافيًا لبناء استنتاج تجاري واضح.";
  const topCustomer = customers[0];
  const concentration = (topCustomer.salesAmount / totalSales) * 100;
  if (concentration >= 45) {
    return `هناك تركّز مرتفع في المبيعات؛ إذ يمثل ${topCustomer.customerName} نحو ${concentration.toFixed(1)}% من إجمالي المبيعات بقيمة ${formatExecutiveAmount(topCustomer.salesAmount, currency)}.`;
  }
  return `العملاء الرئيسيون موزعون بشكل مقبول نسبيًا، وأكبر عميل هو ${topCustomer.customerName} بحصة ${concentration.toFixed(1)}% من إجمالي المبيعات.`;
}

function createProductInsight(items: RankedItem[], totalSales: number, currency: SupportedCurrency) {
  if (!items.length || totalSales <= 0) return "لم تُسجل أصناف مهيمنة بوضوح خلال هذه الفترة أو أن النشاط البيعي ما يزال محدودًا.";
  const topProduct = items[0];
  const topThreeShare = (items.slice(0, 3).reduce((sum, item) => sum + item.revenueAmount, 0) / totalSales) * 100;
  if (topThreeShare >= 70) {
    return `الإيراد يتركز بشكل واضح في عدد محدود من الأصناف؛ إذ تقودها ${topProduct.itemName}، بينما تمثل أفضل ثلاثة أصناف ${topThreeShare.toFixed(1)}% من إجمالي المبيعات.`;
  }
  return `${topProduct.itemName} يقود الإيراد خلال الفترة بقيمة ${formatExecutiveAmount(topProduct.revenueAmount, currency)}، مع توزيع أكثر توازنًا نسبيًا بين الأصناف الرئيسية.`;
}

function createInventoryInsight(outOfStock: InventoryAlertItem[], belowMinimum: InventoryAlertItem[], needsReview: InventoryAlertItem[]) {
  if (!outOfStock.length && !belowMinimum.length && !needsReview.length) {
    return "لا توجد تنبيهات مخزون حرجة حاليًا، ويكفي الحفاظ على المراجعة الدورية لمستويات الكميات.";
  }
  if (outOfStock.length > 0) return "الأولوية الحالية هي تغطية الأصناف النافدة بالكامل قبل أن تتحول إلى تأثير مباشر على المبيعات أو خدمة العملاء.";
  if (belowMinimum.length > 0) return "ينبغي جدولة إعادة التوريد للأصناف دون الحد الأدنى قبل تصاعد الضغط على المخزون التشغيلي.";
  return "يوصى بمراجعة سياسة الحدود الدنيا للأصناف ذات القيمة العالية حتى لا تبقى خارج إطار التنبيه المبكر.";
}

function createRecommendations(args: {
  report: CompanyReportResponse;
  currency: SupportedCurrency;
  rankedBranches: RankedBranch[];
  rankedCustomers: RankedCustomer[];
  outOfStock: InventoryAlertItem[];
  belowMinimum: InventoryAlertItem[];
  needsReview: InventoryAlertItem[];
  suspiciousNotes: string[];
}) {
  const { report, currency, rankedBranches, rankedCustomers, outOfStock, belowMinimum, needsReview, suspiciousNotes } = args;
  const totalSales = amountByCurrency(report.summary.salesRevenueUsd, report.summary.salesRevenueTry, currency);
  const topCustomer = rankedCustomers[0];
  const recommendations: StructuredRecommendation[] = [];
  if (outOfStock.length > 0) recommendations.push({
    level: "critical",
    title: "معالجة فجوة المخزون الحرجة",
    body: `يوجد ${formatNumber(outOfStock.length)} صنفًا نافدًا بالكامل؛ يجب اعتماد إعادة توريد عاجلة مع مسؤول تنفيذ وتاريخ إغلاق واضح.`,
    owner: "مدير المشتريات / العمليات",
    due: "خلال 48 ساعة",
    impact: "خفض خطر توقف البيع ومعالجة النقص المباشر.",
  });
  if (belowMinimum.length > 0) recommendations.push({
    level: "recommended",
    title: "إعادة ضبط التوريد الوقائي",
    body: `هناك ${formatNumber(belowMinimum.length)} أصناف دون الحد الأدنى؛ ينبغي ترحيلها فورًا إلى خطة شراء وقائية قبل تعطل البيع.`,
    owner: "إدارة المخزون",
    due: "نهاية الأسبوع القادم",
    impact: "تقليل احتمالات الانقطاع وتحسين جاهزية المخزون.",
  });
  if (topCustomer && totalSales > 0) {
    const concentration = (topCustomer.salesAmount / totalSales) * 100;
    if (concentration >= 45) recommendations.push({
      level: "critical",
      title: "تقليل الاعتماد على عميل واحد",
      body: `${topCustomer.customerName} يمثل ${concentration.toFixed(1)}% من المبيعات الحالية، ما يرفع مخاطر التركز ويستدعي خطة تنويع مبيعات فورية.`,
      owner: "مدير المبيعات",
      due: "خلال أسبوعين",
      impact: "خفض مخاطر فقدان نسبة كبيرة من الإيراد عند تراجع عميل واحد.",
    });
  }
  const weakestBranch = rankedBranches[rankedBranches.length - 1];
  if (weakestBranch && weakestBranch.salesAmount <= 0) recommendations.push({
    level: "recommended",
    title: "تصحيح أداء الفرع الأضعف",
    body: `فرع ${weakestBranch.branchName} لم يسجل مساهمة فعالة خلال الفترة؛ يلزم تشخيص السبب تشغيليًا وتسويقيًا خلال الدورة القادمة.`,
    owner: "مدير الفروع",
    due: "خلال 72 ساعة",
    impact: "توضيح ما إذا كان الضعف تشغيليًا أو متعلقًا بالبيانات أو بطلب السوق.",
  });
  if (needsReview.length > 0) recommendations.push({
    level: "opportunity",
    title: "تحسين سياسة الحدود الدنيا",
    body: "هناك أصناف ذات قيمة مرتفعة دون عتبات مراقبة كافية؛ تعديل الحدود الدنيا سيحسن الإنذار المبكر ويقلل المفاجآت التشغيلية.",
    owner: "إدارة التخطيط والمخزون",
    due: "خلال هذا الشهر",
    impact: "رفع جودة الإنذار المبكر وتوجيه السيولة إلى الأصناف الأهم.",
  });
  if (suspiciousNotes.length > 0) recommendations.push({
    level: "critical",
    title: "تدقيق جودة البيانات المالية",
    body: "الهوامش أو التكاليف تبدو غير منطقية نسبيًا؛ يجب التحقق من منطق تكلفة الأصناف قبل اعتماد التقرير في القرار التنفيذي.",
    owner: "المدير المالي / مسؤول النظام",
    due: "خلال 48 ساعة",
    impact: "منع اتخاذ قرار إداري على أرقام قد تكون غير دقيقة.",
  });
  if (!recommendations.length) {
    recommendations.push({
      level: "recommended",
      title: "تثبيت الزخم الحالي",
      body: "لا توجد اختناقات حرجة فورية؛ الأولوية هي الحفاظ على الإيقاع التشغيلي ومتابعة مؤشرات البيع الأعلى مساهمة.",
      owner: "الإدارة التشغيلية",
      due: "أسبوعيًا",
      impact: "الحفاظ على الأداء الحالي دون خلق تعقيد إضافي.",
    });
    recommendations.push({
      level: "opportunity",
      title: "توسيع ما ينجح حاليًا",
      body: "يمكن استثمار أفضل العملاء والأصناف في عروض متكررة أو عقود أوسع لرفع المبيعات دون زيادة كبيرة في التعقيد التشغيلي.",
      owner: "مدير المبيعات",
      due: "خلال هذا الشهر",
      impact: "رفع الإيراد من القنوات الناجحة بأقل تكلفة تنفيذية.",
    });
  }
  return recommendations.slice(0, 5);
}

function createExecutiveSummary(
  report: CompanyReportResponse,
  currency: SupportedCurrency,
  rankedBranches: RankedBranch[],
  rankedCustomers: RankedCustomer[],
  outOfStock: InventoryAlertItem[],
  belowMinimum: InventoryAlertItem[],
  recommendations: StructuredRecommendation[],
  suspiciousNotes: string[],
) {
  const sales = amountByCurrency(report.summary.salesRevenueUsd, report.summary.salesRevenueTry, currency);
  const profit = amountByCurrency(report.summary.salesProfitUsd, report.summary.salesProfitTry, currency);
  const margin = getMargin(sales, profit);
  const bestBranch = rankedBranches[0];
  const topCustomer = rankedCustomers[0];
  const performanceLine = sales > 0
    ? margin >= 20
      ? `الأداء المالي قوي خلال الفترة؛ الشركة حققت مبيعات بقيمة ${formatExecutiveAmount(sales, currency)} مع ربح صافي ${formatExecutiveAmount(profit, currency)}.`
      : `المبيعات تحققت بقيمة ${formatExecutiveAmount(sales, currency)} لكن هامش الربح عند ${margin.toFixed(1)}% فقط، ما يعني أن الجودة الربحية تحتاج انتباهًا إداريًا.`
    : "الأداء البيعي ضعيف خلال الفترة المرجعية، ولا توجد حركة كافية تسمح باعتبارها دورة مريحة للإدارة.";

  const riskLine = suspiciousNotes.length > 0
    ? "تم رصد إشارة مخاطر في منطق الربحية أو التكلفة، ويجب التعامل معها كقضية بيانات قبل أي اعتماد نهائي للأرقام."
    : outOfStock.length > 0
      ? `تم رصد خطر تشغيلي مباشر: ${formatNumber(outOfStock.length)} صنفًا نافدًا بالكامل ويستلزم إجراءً عاجلًا.`
      : belowMinimum.length > 0
        ? `تم رصد ضغط تشغيلي متوسط: ${formatNumber(belowMinimum.length)} أصناف دون الحد الأدنى وقد تتحول سريعًا إلى نقص مباشر.`
        : "لا توجد مخاطر تشغيلية حرجة ظاهرة حاليًا، ما يسمح للإدارة بالتركيز على تحسين النمو والجودة الربحية.";

  return [
    performanceLine,
    bestBranch
      ? `الفرع الأقوى هو ${bestBranch.branchName} بحصة ${bestBranch.share.toFixed(1)}% من المبيعات، ما يجعله مرجع الأداء الحالي للفروع الأخرى.`
      : "لا يوجد فرع أظهر تفوقًا واضحًا خلال الفترة، ما يضعف وضوح صورة الأداء الميداني.",
    topCustomer
      ? `أعلى عميل هو ${topCustomer.customerName} بإجمالي ${formatExecutiveAmount(topCustomer.salesAmount, currency)}، ويجب تقييم ما إذا كان هذا التركّز صحيًا أو مخاطرة كامنة.`
      : "لا يظهر عميل قائد واضح خلال الفترة، ما قد يعني تشتت الطلب أو محدودية النشاط التجاري.",
    riskLine,
    recommendations[0]?.body ?? "يلزم اتخاذ إجراء تنفيذي مباشر بناءً على قراءة الربحية والمخزون والفروع بدل الاكتفاء بمراقبة الأرقام.",
  ];
}

export function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [referenceDate, setReferenceDate] = useState(toInputDate());
  const { toast } = useToast();
  const { user } = useAuth();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["company-report", period, referenceDate],
    queryFn: () => fetchCompanyReport(period, referenceDate),
  });

  const notifyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/api/reports/company/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, date: referenceDate }),
      });
      if (!response.ok) throw new Error("تعذر إرسال إشعار التقرير");
      return response.json() as Promise<{ title: string; body: string }>;
    },
    onSuccess: async (payload) => {
      toast({ title: payload.title, description: payload.body });
      if (user) {
        await logActivity(user.username, "تجهيز تقرير الشركة", `${period === "weekly" ? "أسبوعي" : "شهري"} | التاريخ المرجعي: ${referenceDate}`);
      }
    },
    onError: () => {
      toast({ title: "فشل إرسال الإشعار", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (data) document.title = `${data.meta.label} - شركة الأرياف التجارية`;
  }, [data]);

  const analysis = useMemo(() => {
    if (!data) return null;
    const currency = pickCurrency(data);
    const totalSales = amountByCurrency(data.summary.salesRevenueUsd, data.summary.salesRevenueTry, currency);
    const totalProfit = amountByCurrency(data.summary.salesProfitUsd, data.summary.salesProfitTry, currency);
    const purchaseValue = amountByCurrency(data.summary.purchaseSpendUsd, data.summary.purchaseSpendTry, currency);
    const inventoryValue = amountByCurrency(data.summary.inventoryValueUsd, data.summary.inventoryValueTry, currency);
    const totalInvoices = data.summary.salesInvoicesCount + data.summary.purchaseInvoicesCount;
    const netMargin = getMargin(totalSales, totalProfit);

    const rankedBranches: RankedBranch[] = [...data.branchPerformance].map((branch) => ({
      branchId: branch.branchId,
      branchName: branch.branchName,
      branchCode: branch.branchCode,
      salesInvoiceCount: branch.salesInvoiceCount,
      salesAmount: amountByCurrency(branch.revenueUsd, branch.revenueTry, currency),
      share: totalSales > 0 ? (amountByCurrency(branch.revenueUsd, branch.revenueTry, currency) / totalSales) * 100 : 0,
    })).sort((a, b) => b.salesAmount - a.salesAmount);

    const rankedCustomers: RankedCustomer[] = [...data.topCustomers].map((customer) => ({
      customerName: customer.customerName,
      invoiceCount: customer.invoiceCount,
      salesAmount: amountByCurrency(customer.revenueUsd, customer.revenueTry, currency),
      lastInvoiceDate: customer.lastInvoiceDate,
    })).sort((a, b) => b.salesAmount - a.salesAmount);

    const rankedItems: RankedItem[] = [...data.topItems].map((item) => ({
      itemId: item.itemId,
      itemCode: item.itemCode,
      itemName: item.itemName,
      category: item.category,
      quantitySold: item.quantitySold,
      revenueAmount: amountByCurrency(item.revenueUsd, item.revenueTry, currency),
    })).sort((a, b) => b.revenueAmount - a.revenueAmount);

    const trendPoints: TrendPoint[] = data.timeline.map((point) => ({
      date: point.date,
      label: point.date.slice(5),
      revenue: amountByCurrency(point.revenueUsd, point.revenueTry, currency),
      profit: amountByCurrency(point.profitUsd, point.profitTry, currency),
      invoices: point.salesInvoiceCount,
    }));

    const outOfStock: InventoryAlertItem[] = data.inventoryHighlights.lowStockItems.filter((item) => item.currentStock <= 0).map((item) => ({
      itemId: item.itemId, itemCode: item.itemCode, itemName: item.itemName, currentStock: item.currentStock, minStock: item.minStock,
      valueAmount: amountByCurrency(item.currentValueUsd, item.currentValueTry, currency),
    }));

    const belowMinimum: InventoryAlertItem[] = data.inventoryHighlights.lowStockItems.filter((item) => item.currentStock > 0 && item.currentStock <= item.minStock).map((item) => ({
      itemId: item.itemId, itemCode: item.itemCode, itemName: item.itemName, currentStock: item.currentStock, minStock: item.minStock,
      valueAmount: amountByCurrency(item.currentValueUsd, item.currentValueTry, currency),
    }));

    const lowAlertIds = new Set(data.inventoryHighlights.lowStockItems.map((item) => item.itemId));
    const needsReview: InventoryAlertItem[] = data.inventoryHighlights.topValueItems.filter((item) => !lowAlertIds.has(item.itemId) && item.minStock <= 0 && item.currentStock > 0).slice(0, 4).map((item) => ({
      itemId: item.itemId, itemCode: item.itemCode, itemName: item.itemName, currentStock: item.currentStock, minStock: item.minStock,
      valueAmount: amountByCurrency(item.currentValueUsd, item.currentValueTry, currency),
    }));

    const suspiciousNotes = createSuspiciousNotes(data, currency);
    const recommendations = createRecommendations({ report: data, currency, rankedBranches, rankedCustomers, outOfStock, belowMinimum, needsReview, suspiciousNotes });
    const unspecifiedItems = [
      "مقارنة الفترة السابقة غير متاحة حاليًا داخل التقرير.",
      "سعر الصرف الموحد بين الدولار والليرة غير محدد داخل بيانات التقرير الحالية.",
      suspiciousNotes.length > 0 ? "تعريف تكلفة البضاعة أو منطق الربح يحتاج مراجعة قبل اعتماد الأرقام نهائيًا." : null,
    ].filter(Boolean) as string[];

    return {
      currency, totalSales, totalProfit, purchaseValue, inventoryValue, totalInvoices, netMargin, rankedBranches, rankedCustomers, rankedItems,
      trendPoints, outOfStock, belowMinimum, needsReview, suspiciousNotes, recommendations,
      executiveSummary: createExecutiveSummary(data, currency, rankedBranches, rankedCustomers, outOfStock, belowMinimum, recommendations, suspiciousNotes),
      trendInsights: createTrendInsights(trendPoints, currency),
      branchInsight: createBranchInsight(rankedBranches),
      customerInsight: createCustomerInsight(rankedCustomers, totalSales, currency),
      productInsight: createProductInsight(rankedItems, totalSales, currency),
      inventoryInsight: createInventoryInsight(outOfStock, belowMinimum, needsReview),
      unspecifiedItems,
    };
  }, [data]);

  const briefing = useMemo(() => {
    if (!data || !analysis) return null;

    const branchLeader = analysis.rankedBranches[0];
    const customerLeader = analysis.rankedCustomers[0];
    const itemLeader = analysis.rankedItems[0];
    const categoryLeader = [...data.categoryPerformance]
      .map((category) => ({
        category: category.category,
        revenue: amountByCurrency(category.revenueUsd, category.revenueTry, analysis.currency),
        profit: amountByCurrency(category.profitUsd, category.profitTry, analysis.currency),
      }))
      .sort((a, b) => b.revenue - a.revenue)[0];

    const topCustomersRevenue = analysis.rankedCustomers.slice(0, 3).reduce((sum, customer) => sum + customer.salesAmount, 0);
    const topItemsRevenue = analysis.rankedItems.slice(0, 3).reduce((sum, item) => sum + item.revenueAmount, 0);
    const customerConcentration = analysis.totalSales > 0 ? (topCustomersRevenue / analysis.totalSales) * 100 : 0;
    const itemConcentration = analysis.totalSales > 0 ? (topItemsRevenue / analysis.totalSales) * 100 : 0;
    const branchConcentration = branchLeader?.share ?? 0;

    const operationalRisk = analysis.suspiciousNotes.length > 0
      ? "مرتفع"
      : analysis.outOfStock.length > 0
        ? "تشغيلي حرج"
        : analysis.belowMinimum.length > 0
          ? "متوسط"
          : "منخفض";

    const healthScore = Math.max(
      28,
      Math.min(
        96,
        Math.round(
          55 +
            Math.min(analysis.netMargin, 25) * 0.9 +
            (analysis.outOfStock.length === 0 ? 10 : -10) +
            (analysis.suspiciousNotes.length === 0 ? 8 : -18) +
            (branchConcentration < 60 ? 8 : -6) +
            (customerConcentration < 55 ? 7 : -7),
        ),
      ),
    );

    const posture = analysis.totalSales <= 0
      ? "الفترة هادئة جدًا ولا تكفي للحكم على اتجاه تجاري مريح."
      : analysis.netMargin >= 35
        ? "الوضع المالي قوي جدًا، والشركة لا تبيع فقط بل تحتفظ بجودة ربحية ممتازة."
        : analysis.netMargin >= 20
          ? "الشركة في وضع جيد، لكن هناك مساحة واضحة لرفع جودة الربح والانضباط التشغيلي."
          : "المبيعات موجودة لكن جودة الربح ليست بالمستوى الذي يطمئن الإدارة بالكامل.";

    const ceoBullets = [
      `أهم فرع حاليًا هو ${branchLeader ? branchLeader.branchName : "غير محدد"}${branchLeader ? ` بحصة ${branchLeader.share.toFixed(1)}% من المبيعات` : ""}.`,
      customerLeader
        ? `أكبر عميل هو ${customerLeader.customerName} بحجم ${formatExecutiveAmount(customerLeader.salesAmount, analysis.currency)}.`
        : "لا يظهر عميل مهيمن بوضوح خلال هذه الفترة.",
      itemLeader
        ? `أكثر صنف تأثيرًا هو ${itemLeader.itemName} بإيراد ${formatExecutiveAmount(itemLeader.revenueAmount, analysis.currency)}.`
        : "لا يوجد صنف قائد واضح خلال الفترة.",
      categoryLeader
        ? `الفئة الأقوى هي ${categoryLeader.category} وتستحق حماية في التسعير والتوريد.`
        : "هيكل الفئات لا يعطي قائدًا واضحًا حتى الآن.",
    ];

    const managementLetter = [
      `هذا التقرير يقرأ الشركة من زاوية القرار التنفيذي، لا من زاوية عرض الأرقام فقط. ${posture}`,
      analysis.suspiciousNotes.length > 0
        ? "قبل أي اعتماد كامل للأرقام، هناك مؤشرات تستدعي مراجعة منطق التكلفة أو الربحية حتى لا نبني قرارًا كبيرًا على قراءة مالية مضللة."
        : analysis.outOfStock.length > 0
          ? `الخطر التشغيلي الأقرب الآن هو المخزون؛ يوجد ${formatNumber(analysis.outOfStock.length)} صنف نافد بالكامل، وهذا قد يوقف البيع أسرع من أي مشكلة تسويقية.`
          : "تشغيليًا، لا توجد إشارة حرجة تمنع الإدارة من التركيز على تحسين التوسع والجودة الربحية.",
      branchConcentration >= 60
        ? "الاعتماد على مركز أداء واحد لا يزال مرتفعًا؛ هذا جيد مؤقتًا لكنه ليس نموذجًا مريحًا للنمو طويل المدى."
        : "توزيع المبيعات بين الفروع مقبول نسبيًا، وهذا يمنح الإدارة مرونة أفضل في التشغيل والتوسع.",
    ];

    const decisionCards = [
      {
        title: "الصورة العامة",
        tone: analysis.netMargin >= 25 ? "good" : analysis.netMargin >= 15 ? "warn" : "risk",
        text: posture,
      },
      {
        title: "تركيز الإيراد",
        tone: customerConcentration >= 55 || branchConcentration >= 60 ? "warn" : "good",
        text: `تركيز العملاء ${customerConcentration.toFixed(1)}% وتركيز الفرع القائد ${branchConcentration.toFixed(1)}%.`,
      },
      {
        title: "المخاطر التشغيلية",
        tone: operationalRisk === "منخفض" ? "good" : operationalRisk === "متوسط" ? "warn" : "risk",
        text: `تصنيف المخاطر الحالي: ${operationalRisk}.`,
      },
    ] as const;

    return {
      healthScore,
      operationalRisk,
      customerConcentration,
      itemConcentration,
      branchConcentration,
      categoryLeader,
      ceoBullets,
      managementLetter,
      decisionCards,
    };
  }, [analysis, data]);

  return (
    <Layout>
      <div className="company-report-page executive-report flex flex-col gap-5 sm:gap-6" dir="rtl">
        <div className="screen-only flex flex-col gap-3 rounded-[28px] border border-white/10 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">تقارير الشركة</h1>
            <p className="mt-1 text-sm text-muted-foreground">تقرير تنفيذي عربي مخصص للإدارة العليا، يركز على ما يهم القرار بدل عرض البيانات الخام فقط.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="border-white/10 text-white">
              <RefreshCcw className="ml-2 h-4 w-4" />
              تحديث التقرير
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="border-white/10 text-white">
              <Printer className="ml-2 h-4 w-4" />
              طباعة التقرير
            </Button>
            <Button onClick={() => notifyMutation.mutate()} disabled={notifyMutation.isPending} className="bg-primary text-white">
              <BellRing className="ml-2 h-4 w-4" />
              إشعار بجاهزية التقرير
            </Button>
          </div>
        </div>

        <div className="screen-only flex flex-col gap-3 rounded-[24px] border border-white/10 bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPeriod("weekly")} className={`rounded-full px-4 py-2 text-sm font-bold transition ${period === "weekly" ? "bg-primary text-white" : "bg-white/5 text-muted-foreground hover:text-white"}`}>أسبوعي</button>
            <button type="button" onClick={() => setPeriod("monthly")} className={`rounded-full px-4 py-2 text-sm font-bold transition ${period === "monthly" ? "bg-primary text-white" : "bg-white/5 text-muted-foreground hover:text-white"}`}>شهري</button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">التاريخ المرجعي</span>
            <Input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="w-[180px] border-white/10 bg-black/30" />
          </div>
        </div>

        {isLoading && !data ? (
          <div className="py-20 text-center text-muted-foreground">جاري تجهيز التقرير التنفيذي...</div>
        ) : !data || !analysis ? (
          <div className="py-20 text-center text-muted-foreground">تعذر تحميل التقرير</div>
        ) : (
          <>
            <section className="executive-sheet">
              <div className="executive-cover">
                <div className="executive-cover__eyebrow">
                  <Badge variant="outline" className="executive-cover__eyebrow-badge">ALERYAF TRADING COMPANY</Badge>
                </div>
                <div className="executive-cover__grid">
                  <div>
                    <h2 className="executive-cover__title">شركة الأرياف التجارية</h2>
                    <p className="executive-cover__subtitle">{period === "weekly" ? "التقرير التنفيذي الأسبوعي" : "التقرير التنفيذي الشهري"}</p>
                  </div>
                  <div className="executive-cover__meta">
                    <div><span>الفترة</span><strong>{formatArabicDate(data.meta.startDate)} - {formatArabicDate(data.meta.endDate)}</strong></div>
                    <div><span>تاريخ الإصدار</span><strong>{formatArabicDateTime(data.meta.generatedAt)}</strong></div>
                    <div><span>نوع التقرير</span><strong>{data.meta.label}</strong></div>
                  </div>
                </div>
                <div className="executive-cover__highlights">
                  <div className="executive-cover__highlight">
                    <span>المبيعات خلال الفترة</span>
                    <strong>{formatExecutiveAmount(analysis.totalSales, analysis.currency)}</strong>
                  </div>
                  <div className="executive-cover__highlight">
                    <span>صافي الربح</span>
                    <strong>{formatExecutiveAmount(analysis.totalProfit, analysis.currency)}</strong>
                  </div>
                  <div className="executive-cover__highlight">
                    <span>المخاطر التشغيلية</span>
                    <strong>{analysis.outOfStock.length > 0 ? `${formatNumber(analysis.outOfStock.length)} نافد` : analysis.belowMinimum.length > 0 ? `${formatNumber(analysis.belowMinimum.length)} منخفض` : "مستقرة"}</strong>
                  </div>
                </div>
              </div>

              <SectionBlock title="الملخص التنفيذي" subtitle="خلاصة مركزة للإدارة حول ما حدث خلال الفترة وما يحتاج إلى قرار.">
                <NarrativeList items={analysis.executiveSummary} />
              </SectionBlock>

              {analysis.suspiciousNotes.length > 0 && (
                <div className="executive-note executive-note--warning">
                  <div className="executive-note__icon"><AlertTriangle className="h-4 w-4" /></div>
                  <div>
                    <h3 className="executive-note__title">ملاحظة رقابية</h3>
                    <p className="executive-note__body">{analysis.suspiciousNotes.join(" ")}</p>
                  </div>
                </div>
              )}

              <SectionBlock title="ملاحظات حرجة" subtitle="إشارات تحتاج انتباهًا إداريًا مباشرًا قبل المرور لبقية التفاصيل.">
                <NarrativeList
                  items={
                    analysis.suspiciousNotes.length > 0
                      ? analysis.suspiciousNotes
                      : [
                          analysis.outOfStock.length > 0
                            ? `هناك ${formatNumber(analysis.outOfStock.length)} أصناف نافدة بالكامل وتشكل خطرًا تشغيليًا مباشرًا.`
                            : "لا توجد إشارات مالية حرجة ظاهرة في هذا الإصدار.",
                        ]
                  }
                  compact
                />
              </SectionBlock>

              <SectionBlock title="المؤشرات الرئيسية" subtitle="تم الاكتفاء بالمؤشرات الأعلى أثرًا على القرار التنفيذي خلال الفترة.">
                <div className="executive-kpis">
                  <KpiCard title="إجمالي المبيعات" value={formatExecutiveAmount(analysis.totalSales, analysis.currency)} subtitle={`القيمة البيعية المسجلة خلال ${period === "weekly" ? "الأسبوع" : "الشهر"} المرجعي.`} />
                  <KpiCard title="صافي الربح" value={formatExecutiveAmount(analysis.totalProfit, analysis.currency)} subtitle={`يمثل هامشًا صافيًا قدره ${analysis.netMargin.toFixed(1)}% من المبيعات.`} accent="positive" />
                  <KpiCard title="قيمة المشتريات" value={formatExecutiveAmount(analysis.purchaseValue, analysis.currency)} subtitle="مؤشر على حجم الإنفاق وتأثيره المتوقع على السيولة والمخزون." />
                  <KpiCard title="قيمة المخزون" value={formatExecutiveAmount(analysis.inventoryValue, analysis.currency)} subtitle="تقدير رأسمال المخزون المتاح حاليًا ومدى الحاجة لتحريره أو دعمه." />
                  <KpiCard title="عدد الفواتير" value={formatNumber(analysis.totalInvoices)} subtitle={`حجم النشاط المنفذ: ${formatNumber(data.summary.salesInvoicesCount)} بيع و${formatNumber(data.summary.purchaseInvoicesCount)} شراء.`} />
                </div>
              </SectionBlock>
            </section>

            <section className="executive-sheet">
              <SectionBlock title="تحليل الاتجاه" subtitle="أداء يومي خلال الفترة مع قراءة مختصرة لما يجب ملاحظته.">
                <div className="executive-chart-shell">
                  <div className="h-[280px] sm:h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analysis.trendPoints} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="executiveRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0e7490" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#0e7490" stopOpacity={0.04} />
                          </linearGradient>
                          <linearGradient id="executiveProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#16a34a" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
                        <XAxis dataKey="label" stroke="#64748b" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis stroke="#64748b" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={74} />
                        <Tooltip
                          formatter={(value: number, key: string) => [key === "invoices" ? formatNumber(value) : formatExecutiveAmount(value, analysis.currency), key === "profit" ? "الربح" : key === "invoices" ? "الفواتير" : "المبيعات"]}
                          labelFormatter={(label) => `التاريخ: ${label}`}
                          contentStyle={{ backgroundColor: "#fff", border: "1px solid rgba(148, 163, 184, 0.22)", borderRadius: "16px", color: "#0f172a" }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#0f766e" strokeWidth={2.4} fill="url(#executiveRevenue)" name="المبيعات" />
                        <Area type="monotone" dataKey="profit" stroke="#15803d" strokeWidth={1.8} fill="url(#executiveProfit)" name="الربح" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <NarrativeList items={analysis.trendInsights} compact />
                <SectionTriad
                  happened="الأداء اليومي أظهر تفاوتًا واضحًا بين أيام الذروة وأيام الضعف، بدل مسار بيع مستقر."
                  matters="هذا يعني أن الإيراد الحالي يعتمد على قمم متفرقة أكثر من اعتماده على تدفق ثابت يمكن التخطيط عليه."
                  action="ينبغي ربط أيام الذروة بأسبابها الفعلية ثم تكرارها تشغيليًا أو تجاريًا خلال الفترة القادمة."
                />
              </SectionBlock>

              <SectionBlock title="أداء الفروع" subtitle="ترتيب الفروع من الأعلى مساهمة إلى الأقل مع إبراز الحصة من إجمالي المبيعات.">
                <div className="executive-table-shell">
                  <Table>
                    <TableHeader><TableRow className="border-slate-200"><TableHead className="text-right">الفرع</TableHead><TableHead className="text-right">المبيعات</TableHead><TableHead className="text-right">عدد الفواتير</TableHead><TableHead className="text-right">حصة المساهمة</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {analysis.rankedBranches.slice(0, 4).map((branch) => (
                        <TableRow key={branch.branchId} className="border-slate-100">
                          <TableCell><div className="font-semibold text-foreground">{branch.branchName}</div><div className="text-xs text-muted-foreground">{branch.branchCode}</div></TableCell>
                          <TableCell>{formatExecutiveAmount(branch.salesAmount, analysis.currency)}</TableCell>
                          <TableCell>{formatNumber(branch.salesInvoiceCount)}</TableCell>
                          <TableCell>{branch.share.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <SectionInsight>{analysis.branchInsight}</SectionInsight>
                <SectionTriad
                  happened="المبيعات متركزة في عدد محدود من الفروع مع تباين واضح في المساهمة."
                  matters="هذا التفاوت يؤثر مباشرة على كفاءة توزيع الجهد التجاري والمخزون والقرارات التشغيلية."
                  action="يجب التعامل مع الفرع القائد كنموذج أداء، ومعالجة الفروع المتأخرة بخطة تصحيح محددة زمنياً."
                />
              </SectionBlock>

              <SectionBlock title="أهم العملاء" subtitle="العملاء الأعلى أثرًا على الإيراد مع قراءة سريعة لمخاطر التركّز.">
                <div className="executive-table-shell">
                  <Table>
                    <TableHeader><TableRow className="border-slate-200"><TableHead className="text-right">العميل</TableHead><TableHead className="text-right">المبيعات</TableHead><TableHead className="text-right">عدد الفواتير</TableHead><TableHead className="text-right">آخر فاتورة</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {analysis.rankedCustomers.slice(0, 4).map((customer) => (
                        <TableRow key={customer.customerName} className="border-slate-100">
                          <TableCell className="font-semibold text-foreground">{customer.customerName}</TableCell>
                          <TableCell>{formatExecutiveAmount(customer.salesAmount, analysis.currency)}</TableCell>
                          <TableCell>{formatNumber(customer.invoiceCount)}</TableCell>
                          <TableCell>{formatArabicDate(customer.lastInvoiceDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <SectionInsight>{analysis.customerInsight}</SectionInsight>
                <SectionTriad
                  happened="الإيراد تقوده شريحة محدودة من العملاء الأهم خلال الفترة."
                  matters="تركيز الإيراد يرفع المخاطر إذا توقف عميل رئيسي أو تراجع طلبه بشكل مفاجئ."
                  action="ينبغي حماية العملاء الكبار بخطة متابعة، وفي الوقت نفسه توسيع القاعدة لتخفيف التركز."
                />
              </SectionBlock>
            </section>

            <section className="executive-sheet">
              <SectionBlock title="الأصناف الأعلى مساهمة" subtitle="الأصناف التي تقود الإيراد والكمية مع تفسير لمستوى التركّز.">
                <div className="executive-table-shell">
                  <Table>
                    <TableHeader><TableRow className="border-slate-200"><TableHead className="text-right">الصنف</TableHead><TableHead className="text-right">الفئة</TableHead><TableHead className="text-right">الإيراد</TableHead><TableHead className="text-right">الكمية</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {analysis.rankedItems.slice(0, 4).map((item) => (
                        <TableRow key={item.itemId} className="border-slate-100">
                          <TableCell><div className="font-semibold text-foreground">{item.itemName}</div><div className="text-xs text-muted-foreground">{item.itemCode}</div></TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell>{formatExecutiveAmount(item.revenueAmount, analysis.currency)}</TableCell>
                          <TableCell>{formatNumber(item.quantitySold)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <SectionInsight>{analysis.productInsight}</SectionInsight>
                <SectionTriad
                  happened="عدد محدود من الأصناف يقود القسم الأكبر من الإيراد والحركة."
                  matters="هذا يحدد أين يجب أن يتركز التسعير، الشراء، والمتابعة التجارية بدل توزيع الجهد على كل الأصناف بالتساوي."
                  action="ينبغي حماية الأصناف القائدة من الانقطاع، ومراجعة تسعيرها وتكرار بيعها ضمن خطط المبيعات القادمة."
                />
              </SectionBlock>

              <SectionBlock title="تنبيهات المخزون" subtitle="يعرض فقط الحالات التي تستحق تدخلاً فعليًا من الإدارة أو التشغيل.">
                <div className="executive-alert-groups">
                  <AlertGroup title="نافد بالكامل" emptyText="لا توجد أصناف نافدة بالكامل." items={analysis.outOfStock.slice(0, 3)} currency={analysis.currency} />
                  <AlertGroup title="دون الحد الأدنى" emptyText="لا توجد أصناف تحت الحد الأدنى." items={analysis.belowMinimum.slice(0, 3)} currency={analysis.currency} />
                  <AlertGroup title="يحتاج مراجعة" emptyText="لا توجد حالات تستدعي مراجعة سياسة التخزين." items={analysis.needsReview.slice(0, 3)} currency={analysis.currency} />
                </div>
                <SectionInsight>{analysis.inventoryInsight}</SectionInsight>
                <SectionTriad
                  happened="ظهرت تنبيهات مخزون عملية تستحق المتابعة بدل عرض قوائم طويلة منخفضة القيمة."
                  matters="المخزون هو أقرب نقطة تتحول فيها المشكلة التشغيلية إلى فقدان بيع فعلي أو تجميد سيولة."
                  action="يجب معالجة الأصناف الحرجة أولًا، ثم إعادة ضبط الحدود الدنيا للأصناف ذات القيمة الأعلى."
                />
              </SectionBlock>

              <SectionBlock title="أحدث الفواتير المهمة" subtitle="عرض مختصر للفواتير الأحدث خلال الفترة مع التركيز على القيمة والفرع.">
                <div className="executive-table-shell">
                  <Table>
                    <TableHeader><TableRow className="border-slate-200"><TableHead className="text-right">رقم الفاتورة</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">العميل / المورد</TableHead><TableHead className="text-right">الفرع</TableHead><TableHead className="text-right">الإجمالي</TableHead><TableHead className="text-right">التاريخ</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.recentInvoices.slice(0, 4).map((invoice) => (
                        <TableRow key={invoice.id} className="border-slate-100">
                          <TableCell className="font-semibold text-foreground">{invoice.invoiceNumber}</TableCell>
                          <TableCell>{invoice.invoiceType === "purchase" ? "شراء" : "بيع"}</TableCell>
                          <TableCell>{invoice.customerName}</TableCell>
                          <TableCell>{invoice.branchName}</TableCell>
                          <TableCell>{formatCurrency(invoice.totalAmount, invoice.currency)}</TableCell>
                          <TableCell>{formatArabicDate(invoice.invoiceDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <SectionTriad
                  happened="تم الإبقاء فقط على أحدث الفواتير ذات القيمة المرجعية السريعة، وليس كل الحركة التشغيلية."
                  matters="هذا يمنح المالك لمحة سريعة عن نوع النشاط الجاري دون إغراقه في تفاصيل غير لازمة للقرار."
                  action="إذا ظهرت فاتورة غير منطقية في القيمة أو الربح، يجب مراجعتها مباشرة كعينة تشغيلية من الفترة."
                />
              </SectionBlock>

              <SectionBlock title="التوصيات التنفيذية" subtitle="إجراءات عملية مقترحة بناءً على قراءة البيانات الحالية.">
                <RecommendationsList items={analysis.recommendations} />
              </SectionBlock>

              <SectionBlock title="بنود غير محددة" subtitle="ثغرات معلوماتية يجب فهمها عند قراءة التقرير أو مقارنته زمنيًا.">
                <NarrativeList items={analysis.unspecifiedItems} compact />
              </SectionBlock>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

function SectionBlock({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="executive-section">
      <div className="executive-section__header">
        <h3 className="executive-section__title">{title}</h3>
        <p className="executive-section__subtitle">{subtitle}</p>
      </div>
      <div className="executive-section__body">{children}</div>
    </section>
  );
}

function NarrativeList({ items, compact = false }: { items: string[]; compact?: boolean }) {
  return <ul className={`executive-list ${compact ? "executive-list--compact" : ""}`}>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function KpiCard({ title, value, subtitle, accent = "default" }: { title: string; value: string; subtitle: string; accent?: "default" | "positive" }) {
  return (
    <article className={`executive-kpi ${accent === "positive" ? "executive-kpi--positive" : ""}`}>
      <div className="executive-kpi__label">{title}</div>
      <div className="executive-kpi__value">{value}</div>
      <div className="executive-kpi__subtitle">{subtitle}</div>
    </article>
  );
}

function AlertGroup({ title, emptyText, items, currency }: { title: string; emptyText: string; items: InventoryAlertItem[]; currency: SupportedCurrency }) {
  return (
    <article className="executive-alert-group">
      <h4 className="executive-alert-group__title">{title}</h4>
      {items.length === 0 ? (
        <p className="executive-alert-group__empty">{emptyText}</p>
      ) : (
        <div className="executive-alert-group__list">
          {items.map((item) => (
            <div key={item.itemId} className="executive-alert-item">
              <div>
                <div className="font-semibold text-foreground">{item.itemName}</div>
                <div className="text-xs text-muted-foreground">{item.itemCode}</div>
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground">{formatNumber(item.currentStock)} كغ</div>
                <div className="text-xs text-muted-foreground">الحد الأدنى {formatNumber(item.minStock)} | {formatExecutiveAmount(item.valueAmount, currency)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function SectionInsight({ children }: { children: ReactNode }) {
  return <p className="executive-insight">{children}</p>;
}

function SectionTriad({
  happened,
  matters,
  action,
}: {
  happened: string;
  matters: string;
  action: string;
}) {
  return (
    <div className="executive-triad">
      <div className="executive-triad__item">
        <span>ماذا حدث</span>
        <p>{happened}</p>
      </div>
      <div className="executive-triad__item">
        <span>لماذا يهم</span>
        <p>{matters}</p>
      </div>
      <div className="executive-triad__item">
        <span>ماذا نفعل</span>
        <p>{action}</p>
      </div>
    </div>
  );
}

function RecommendationsList({ items }: { items: StructuredRecommendation[] }) {
  return (
    <div className="executive-recommendations">
      {items.map((item) => (
        <article key={`${item.level}-${item.title}`} className={`executive-recommendation executive-recommendation--${item.level}`}>
          <div className="executive-recommendation__badge">
            {item.level === "critical" ? "🔴 إجراء حرج" : item.level === "recommended" ? "🟡 موصى به" : "🟢 فرصة"}
          </div>
          <h4 className="executive-recommendation__title">{item.title}</h4>
          <p className="executive-recommendation__body">{item.body}</p>
          <div className="executive-recommendation__meta">
            <span><strong>المالك:</strong> {item.owner}</span>
            <span><strong>الموعد:</strong> {item.due}</span>
            <span><strong>الأثر المتوقع:</strong> {item.impact}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
