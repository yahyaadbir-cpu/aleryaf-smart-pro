import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellRing, Printer, RefreshCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
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
  const recommendations: string[] = [];
  if (outOfStock.length > 0) recommendations.push(`إطلاق معالجة عاجلة للأصناف النافدة بالكامل وعددها ${formatNumber(outOfStock.length)} مع تحديد مسؤول وموعد تنفيذ واضح.`);
  if (belowMinimum.length > 0) recommendations.push(`تحديث خطة إعادة التوريد للأصناف دون الحد الأدنى وعددها ${formatNumber(belowMinimum.length)} لتفادي انقطاع قريب.`);
  if (topCustomer && totalSales > 0) {
    const concentration = (topCustomer.salesAmount / totalSales) * 100;
    if (concentration >= 45) recommendations.push(`تنويع قاعدة العملاء خلال الفترة القادمة لأن ${topCustomer.customerName} يمثل ${concentration.toFixed(1)}% من المبيعات الحالية.`);
  }
  const weakestBranch = rankedBranches[rankedBranches.length - 1];
  if (weakestBranch && weakestBranch.salesAmount <= 0) recommendations.push(`مراجعة أداء فرع ${weakestBranch.branchName} تشغيليًا وتسويقيًا لعدم تسجيله مساهمة فعالة خلال الفترة.`);
  if (needsReview.length > 0) recommendations.push("إعادة ضبط الحدود الدنيا للأصناف ذات القيمة المرتفعة التي لا تملك عتبات مراقبة واضحة.");
  if (suspiciousNotes.length > 0) recommendations.push("التحقق من منطق احتساب التكلفة والربح قبل اعتماد الأرقام النهائية في القرارات التنفيذية.");
  if (!recommendations.length) {
    recommendations.push("الاستمرار في مراقبة الفروع والأصناف الأعلى مساهمة وتثبيت الإيقاع التشغيلي الحالي.");
    recommendations.push("استثمار أفضل العملاء والأصناف في فرص مبيعات متكررة بدل الاكتفاء بالمراقبة الوصفية للأرقام.");
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
  recommendations: string[],
) {
  const sales = amountByCurrency(report.summary.salesRevenueUsd, report.summary.salesRevenueTry, currency);
  const profit = amountByCurrency(report.summary.salesProfitUsd, report.summary.salesProfitTry, currency);
  const bestBranch = rankedBranches[0];
  const topCustomer = rankedCustomers[0];
  const keyRisk = outOfStock.length > 0
    ? `يوجد ${formatNumber(outOfStock.length)} صنفًا نافدًا بالكامل ويحتاج إلى تدخل عاجل.`
    : belowMinimum.length > 0
      ? `هناك ${formatNumber(belowMinimum.length)} أصناف دون الحد الأدنى وقد تؤثر على الاستمرارية التشغيلية.`
      : "لا توجد مخاطر حرجة في المخزون خلال الفترة، لكن يلزم الاستمرار في المتابعة اليومية.";

  return [
    `بلغ إجمالي المبيعات خلال الفترة ${formatExecutiveAmount(sales, currency)} مع صافي ربح قدره ${formatExecutiveAmount(profit, currency)}.`,
    bestBranch
      ? `الفرع الأفضل أداءً كان ${bestBranch.branchName} بعدما ساهم بنسبة ${bestBranch.share.toFixed(1)}% من مبيعات الفترة.`
      : "لم يسجل أي فرع نشاط مبيعات كافٍ لبناء مقارنة موثوقة خلال هذه الفترة.",
    topCustomer
      ? `أعلى عميل من حيث القيمة كان ${topCustomer.customerName} بإجمالي ${formatExecutiveAmount(topCustomer.salesAmount, currency)}.`
      : "لا يوجد عميل مهيمن خلال هذه الفترة، ما يشير إلى غياب مبيعات نشطة أو محدوديتها.",
    keyRisk,
    recommendations[0] ?? "يوصى بمتابعة كفاءة التسعير والربحية على مستوى الفروع والعناصر الأعلى مساهمة.",
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

    return {
      currency, totalSales, totalProfit, purchaseValue, inventoryValue, totalInvoices, netMargin, rankedBranches, rankedCustomers, rankedItems,
      trendPoints, outOfStock, belowMinimum, needsReview, suspiciousNotes, recommendations,
      executiveSummary: createExecutiveSummary(data, currency, rankedBranches, rankedCustomers, outOfStock, belowMinimum, recommendations),
      trendInsights: createTrendInsights(trendPoints, currency),
      branchInsight: createBranchInsight(rankedBranches),
      customerInsight: createCustomerInsight(rankedCustomers, totalSales, currency),
      productInsight: createProductInsight(rankedItems, totalSales, currency),
      inventoryInsight: createInventoryInsight(outOfStock, belowMinimum, needsReview),
    };
  }, [data]);

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
                <div className="executive-cover__eyebrow">ALERYAF TRADING COMPANY</div>
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

              <SectionBlock title="المؤشرات الرئيسية" subtitle="تم الاكتفاء بالمؤشرات الأعلى أثرًا على القرار التنفيذي خلال الفترة.">
                <div className="executive-kpis">
                  <KpiCard title="إجمالي المبيعات" value={formatExecutiveAmount(analysis.totalSales, analysis.currency)} subtitle={`القيمة البيعية المسجلة خلال ${period === "weekly" ? "الأسبوع" : "الشهر"} المرجعي.`} />
                  <KpiCard title="صافي الربح" value={formatExecutiveAmount(analysis.totalProfit, analysis.currency)} subtitle={`يمثل هامشًا صافيًا قدره ${analysis.netMargin.toFixed(1)}% من المبيعات.`} accent="positive" />
                  <KpiCard title="قيمة المشتريات" value={formatExecutiveAmount(analysis.purchaseValue, analysis.currency)} subtitle="تعكس الإنفاق على الشراء خلال نفس الفترة." />
                  <KpiCard title="قيمة المخزون" value={formatExecutiveAmount(analysis.inventoryValue, analysis.currency)} subtitle="قيمة تقديرية للمخزون الحالي وفق آخر رصيد متاح." />
                  <KpiCard title="عدد الفواتير" value={formatNumber(analysis.totalInvoices)} subtitle={`تشمل ${formatNumber(data.summary.salesInvoicesCount)} بيع و${formatNumber(data.summary.purchaseInvoicesCount)} شراء.`} />
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
              </SectionBlock>

              <SectionBlock title="أداء الفروع" subtitle="ترتيب الفروع من الأعلى مساهمة إلى الأقل مع إبراز الحصة من إجمالي المبيعات.">
                <div className="executive-table-shell">
                  <Table>
                    <TableHeader><TableRow className="border-slate-200"><TableHead className="text-right">الفرع</TableHead><TableHead className="text-right">المبيعات</TableHead><TableHead className="text-right">عدد الفواتير</TableHead><TableHead className="text-right">حصة المساهمة</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {analysis.rankedBranches.map((branch) => (
                        <TableRow key={branch.branchId} className="border-slate-100">
                          <TableCell><div className="font-semibold text-slate-900">{branch.branchName}</div><div className="text-xs text-slate-500">{branch.branchCode}</div></TableCell>
                          <TableCell>{formatExecutiveAmount(branch.salesAmount, analysis.currency)}</TableCell>
                          <TableCell>{formatNumber(branch.salesInvoiceCount)}</TableCell>
                          <TableCell>{branch.share.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <SectionInsight>{analysis.branchInsight}</SectionInsight>
              </SectionBlock>

              <SectionBlock title="أهم العملاء" subtitle="العملاء الأعلى أثرًا على الإيراد مع قراءة سريعة لمخاطر التركّز.">
                <div className="executive-table-shell">
                  <Table>
                    <TableHeader><TableRow className="border-slate-200"><TableHead className="text-right">العميل</TableHead><TableHead className="text-right">المبيعات</TableHead><TableHead className="text-right">عدد الفواتير</TableHead><TableHead className="text-right">آخر فاتورة</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {analysis.rankedCustomers.map((customer) => (
                        <TableRow key={customer.customerName} className="border-slate-100">
                          <TableCell className="font-semibold text-slate-900">{customer.customerName}</TableCell>
                          <TableCell>{formatExecutiveAmount(customer.salesAmount, analysis.currency)}</TableCell>
                          <TableCell>{formatNumber(customer.invoiceCount)}</TableCell>
                          <TableCell>{formatArabicDate(customer.lastInvoiceDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <SectionInsight>{analysis.customerInsight}</SectionInsight>
              </SectionBlock>
            </section>

            <section className="executive-sheet">
              <SectionBlock title="الأصناف الأعلى مساهمة" subtitle="الأصناف التي تقود الإيراد والكمية مع تفسير لمستوى التركّز.">
                <div className="executive-table-shell">
                  <Table>
                    <TableHeader><TableRow className="border-slate-200"><TableHead className="text-right">الصنف</TableHead><TableHead className="text-right">الفئة</TableHead><TableHead className="text-right">الإيراد</TableHead><TableHead className="text-right">الكمية</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {analysis.rankedItems.slice(0, 6).map((item) => (
                        <TableRow key={item.itemId} className="border-slate-100">
                          <TableCell><div className="font-semibold text-slate-900">{item.itemName}</div><div className="text-xs text-slate-500">{item.itemCode}</div></TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell>{formatExecutiveAmount(item.revenueAmount, analysis.currency)}</TableCell>
                          <TableCell>{formatNumber(item.quantitySold)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <SectionInsight>{analysis.productInsight}</SectionInsight>
              </SectionBlock>

              <SectionBlock title="تنبيهات المخزون" subtitle="يعرض فقط الحالات التي تستحق تدخلاً فعليًا من الإدارة أو التشغيل.">
                <div className="executive-alert-groups">
                  <AlertGroup title="نافد بالكامل" emptyText="لا توجد أصناف نافدة بالكامل." items={analysis.outOfStock} currency={analysis.currency} />
                  <AlertGroup title="دون الحد الأدنى" emptyText="لا توجد أصناف تحت الحد الأدنى." items={analysis.belowMinimum} currency={analysis.currency} />
                  <AlertGroup title="يحتاج مراجعة" emptyText="لا توجد حالات تستدعي مراجعة سياسة التخزين." items={analysis.needsReview} currency={analysis.currency} />
                </div>
                <SectionInsight>{analysis.inventoryInsight}</SectionInsight>
              </SectionBlock>

              <SectionBlock title="أحدث الفواتير المهمة" subtitle="عرض مختصر للفواتير الأحدث خلال الفترة مع التركيز على القيمة والفرع.">
                <div className="executive-table-shell">
                  <Table>
                    <TableHeader><TableRow className="border-slate-200"><TableHead className="text-right">رقم الفاتورة</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">العميل / المورد</TableHead><TableHead className="text-right">الفرع</TableHead><TableHead className="text-right">الإجمالي</TableHead><TableHead className="text-right">التاريخ</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.recentInvoices.slice(0, 6).map((invoice) => (
                        <TableRow key={invoice.id} className="border-slate-100">
                          <TableCell className="font-semibold text-slate-900">{invoice.invoiceNumber}</TableCell>
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
              </SectionBlock>

              <SectionBlock title="التوصيات التنفيذية" subtitle="إجراءات عملية مقترحة بناءً على قراءة البيانات الحالية.">
                <NarrativeList items={analysis.recommendations} />
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
                <div className="font-semibold text-slate-900">{item.itemName}</div>
                <div className="text-xs text-slate-500">{item.itemCode}</div>
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-900">{formatNumber(item.currentStock)} كغ</div>
                <div className="text-xs text-slate-500">الحد الأدنى {formatNumber(item.minStock)} | {formatExecutiveAmount(item.valueAmount, currency)}</div>
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
