import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BellRing,
  Building2,
  CalendarDays,
  FileText,
  PackageSearch,
  Printer,
  RefreshCcw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/http";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth";
import { logActivity } from "@/lib/activity";

type ReportPeriod = "weekly" | "monthly";

interface CompanyReportResponse {
  meta: {
    period: ReportPeriod;
    label: string;
    startDate: string;
    endDate: string;
    generatedAt: string;
  };
  summary: {
    salesInvoicesCount: number;
    purchaseInvoicesCount: number;
    customersCount: number;
    activeBranchesCount: number;
    totalItemsCount: number;
    lowStockCount: number;
    salesRevenueTry: number;
    salesRevenueUsd: number;
    salesCostTry: number;
    salesCostUsd: number;
    salesProfitTry: number;
    salesProfitUsd: number;
    purchaseSpendTry: number;
    purchaseSpendUsd: number;
    inventoryValueTry: number;
    inventoryValueUsd: number;
    avgSaleInvoiceTry: number;
    avgSaleInvoiceUsd: number;
  };
  branchPerformance: Array<{
    branchId: number;
    branchName: string;
    branchCode: string;
    salesInvoiceCount: number;
    purchaseInvoiceCount: number;
    revenueTry: number;
    revenueUsd: number;
    costTry: number;
    costUsd: number;
    profitTry: number;
    profitUsd: number;
  }>;
  topCustomers: Array<{
    customerName: string;
    invoiceCount: number;
    lastInvoiceDate: string;
    revenueTry: number;
    revenueUsd: number;
    profitTry: number;
    profitUsd: number;
  }>;
  topItems: Array<{
    itemId: number;
    itemCode: string;
    itemName: string;
    category: string;
    quantitySold: number;
    revenueTry: number;
    revenueUsd: number;
    profitTry: number;
    profitUsd: number;
  }>;
  categoryPerformance: Array<{
    category: string;
    revenueTry: number;
    revenueUsd: number;
    profitTry: number;
    profitUsd: number;
  }>;
  timeline: Array<{
    date: string;
    salesInvoiceCount: number;
    purchaseInvoiceCount: number;
    revenueTry: number;
    revenueUsd: number;
    profitTry: number;
    profitUsd: number;
  }>;
  recentInvoices: Array<{
    id: number;
    invoiceNumber: string;
    invoiceType: string;
    currency: "TRY" | "USD";
    invoiceDate: string;
    customerName: string;
    branchName: string;
    totalAmount: number;
    totalProfit: number;
  }>;
  inventoryHighlights: {
    lowStockItems: Array<{
      itemId: number;
      itemCode: string;
      itemName: string;
      currentStock: number;
      minStock: number;
      currentValueTry: number;
      currentValueUsd: number;
    }>;
    topValueItems: Array<{
      itemId: number;
      itemCode: string;
      itemName: string;
      currentStock: number;
      minStock: number;
      currentValueTry: number;
      currentValueUsd: number;
    }>;
  };
  notification: {
    title: string;
    body: string;
  };
}

function formatArabicDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T12:00:00`));
}

function formatArabicDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  if (!response.ok) {
    throw new Error("تعذر تحميل تقرير الشركة");
  }
  return (await response.json()) as CompanyReportResponse;
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

      if (!response.ok) {
        throw new Error("تعذر إرسال إشعار التقرير");
      }

      return response.json() as Promise<{ title: string; body: string }>;
    },
    onSuccess: async (payload) => {
      toast({
        title: payload.title,
        description: payload.body,
      });
      if (user) {
        await logActivity(
          user.username,
          "تجهيز تقرير الشركة",
          `${period === "weekly" ? "أسبوعي" : "شهري"} | التاريخ المرجعي: ${referenceDate}`,
        );
      }
    },
    onError: () => {
      toast({
        title: "فشل إرسال الإشعار",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!data) return;
    document.title = `${data.meta.label} - شركة الأرياف التجارية`;
  }, [data]);

  const sortedBranches = useMemo(() => {
    return [...(data?.branchPerformance ?? [])].sort((a, b) => Math.max(b.profitUsd, b.profitTry) - Math.max(a.profitUsd, a.profitTry));
  }, [data?.branchPerformance]);

  const sortedCustomers = useMemo(() => {
    return [...(data?.topCustomers ?? [])].sort((a, b) => Math.max(b.revenueUsd, b.revenueTry) - Math.max(a.revenueUsd, a.revenueTry));
  }, [data?.topCustomers]);

  const timelineChartData = useMemo(() => {
    return (data?.timeline ?? []).map((point) => ({
      ...point,
      label: point.date.slice(5),
    }));
  }, [data?.timeline]);

  return (
    <Layout>
      <div className="company-report-page flex flex-col gap-4 sm:gap-6" dir="rtl">
        <div className="screen-only flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground sm:text-3xl">تقارير الشركة</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              تقرير تنفيذي احترافي يغطي المبيعات، الأرباح، المخزون، الفروع، العملاء، والفواتير.
            </p>
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

        <div className="screen-only flex flex-col gap-2 rounded-2xl border border-white/10 bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPeriod("weekly")}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${period === "weekly" ? "bg-primary text-white" : "bg-white/5 text-muted-foreground hover:text-white"}`}
            >
              أسبوعي
            </button>
            <button
              type="button"
              onClick={() => setPeriod("monthly")}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${period === "monthly" ? "bg-primary text-white" : "bg-white/5 text-muted-foreground hover:text-white"}`}
            >
              شهري
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">التاريخ المرجعي</span>
            <Input
              type="date"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
              className="w-[180px] border-white/10 bg-black/30"
            />
          </div>
        </div>

        {isLoading && !data ? (
          <div className="py-20 text-center text-muted-foreground">جاري تجهيز التقرير...</div>
        ) : !data ? (
          <div className="py-20 text-center text-muted-foreground">تعذر تحميل التقرير</div>
        ) : (
          <>
            <Card className="report-surface overflow-hidden border-primary/20 bg-gradient-to-br from-[#111827] via-[#0f172a] to-[#111827] shadow-xl shadow-black/20">
              <CardContent className="p-5 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {period === "weekly" ? "تقرير أسبوعي" : "تقرير شهري"}
                    </div>
                    <h2 className="mt-3 font-display text-2xl font-bold text-white sm:text-3xl">{data.meta.label}</h2>
                    <p className="mt-2 text-sm text-slate-300">
                      الفترة: {formatArabicDate(data.meta.startDate)} - {formatArabicDate(data.meta.endDate)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      تم التحديث: {formatArabicDateTime(data.meta.generatedAt)}
                    </p>
                  </div>

                  <div className="grid min-w-[280px] grid-cols-2 gap-3">
                    <MiniStat title="فواتير البيع" value={formatNumber(data.summary.salesInvoicesCount)} icon={<FileText className="h-4 w-4 text-blue-300" />} />
                    <MiniStat title="العملاء" value={formatNumber(data.summary.customersCount)} icon={<Users className="h-4 w-4 text-emerald-300" />} />
                    <MiniStat title="الفروع النشطة" value={formatNumber(data.summary.activeBranchesCount)} icon={<Building2 className="h-4 w-4 text-amber-300" />} />
                    <MiniStat title="تنبيهات المخزون" value={formatNumber(data.summary.lowStockCount)} icon={<PackageSearch className="h-4 w-4 text-rose-300" />} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <ReportKpiCard title="مبيعات TRY" value={formatCurrency(data.summary.salesRevenueTry, "TRY")} icon={<Wallet className="h-4 w-4 text-blue-400" />} />
              <ReportKpiCard title="مبيعات USD" value={formatCurrency(data.summary.salesRevenueUsd, "USD")} icon={<Wallet className="h-4 w-4 text-blue-400" />} />
              <ReportKpiCard title="ربح TRY" value={formatCurrency(data.summary.salesProfitTry, "TRY")} icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} accent="profit" />
              <ReportKpiCard title="ربح USD" value={formatCurrency(data.summary.salesProfitUsd, "USD")} icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} accent="profit" />
              <ReportKpiCard title="مشتريات TRY" value={formatCurrency(data.summary.purchaseSpendTry, "TRY")} icon={<FileText className="h-4 w-4 text-amber-400" />} />
              <ReportKpiCard title="مشتريات USD" value={formatCurrency(data.summary.purchaseSpendUsd, "USD")} icon={<FileText className="h-4 w-4 text-amber-400" />} />
              <ReportKpiCard title="مخزون TRY" value={formatCurrency(data.summary.inventoryValueTry, "TRY")} icon={<PackageSearch className="h-4 w-4 text-cyan-400" />} />
              <ReportKpiCard title="مخزون USD" value={formatCurrency(data.summary.inventoryValueUsd, "USD")} icon={<PackageSearch className="h-4 w-4 text-cyan-400" />} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
              <Card className="report-surface">
                <CardHeader>
                  <CardTitle className="font-display text-base sm:text-lg">الاتجاه اليومي خلال الفترة</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px] sm:h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={timelineChartData} margin={{ top: 8, right: 18, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="money" stroke="#64748b" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                      <YAxis yAxisId="count" orientation="right" stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "12px",
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="count" dataKey="salesInvoiceCount" name="فواتير البيع" fill="#475569" radius={[6, 6, 0, 0]} />
                      <Line yAxisId="money" type="monotone" dataKey="revenueUsd" name="مبيعات USD" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                      <Line yAxisId="money" type="monotone" dataKey="profitUsd" name="ربح USD" stroke="#10b981" strokeWidth={2.5} dot={false} />
                      <Line yAxisId="money" type="monotone" dataKey="revenueTry" name="مبيعات TRY" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="report-surface">
                <CardHeader>
                  <CardTitle className="font-display text-base sm:text-lg">الفئات الأعلى أداءً</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px] sm:h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart layout="vertical" data={data.categoryPerformance} margin={{ top: 8, right: 8, left: 22, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="category" type="category" stroke="#94a3b8" tick={{ fill: "#e5e7eb", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "12px",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="revenueUsd" name="الإيراد USD" fill="#3b82f6" radius={[0, 8, 8, 0]} />
                      <Bar dataKey="profitUsd" name="الربح USD" fill="#10b981" radius={[0, 8, 8, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <DataTableCard title="أداء الفروع" icon={<Building2 className="h-4 w-4 text-cyan-300" />}>
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/10">
                      <TableHead className="text-right">الفرع</TableHead>
                      <TableHead className="text-right">الفواتير</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead className="text-right">TRY</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedBranches.map((branch) => (
                      <TableRow key={branch.branchId} className="border-white/5">
                        <TableCell>
                          <div className="font-medium">{branch.branchName}</div>
                          <div className="text-[10px] text-muted-foreground">{branch.branchCode}</div>
                        </TableCell>
                        <TableCell>{formatNumber(branch.salesInvoiceCount)}</TableCell>
                        <TableCell className="text-emerald-400">{formatCurrency(branch.profitUsd, "USD")}</TableCell>
                        <TableCell className="text-amber-300">{formatCurrency(branch.profitTry, "TRY")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTableCard>

              <DataTableCard title="أفضل العملاء" icon={<Users className="h-4 w-4 text-emerald-300" />}>
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/10">
                      <TableHead className="text-right">العميل</TableHead>
                      <TableHead className="text-right">الفواتير</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead className="text-right">آخر فاتورة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCustomers.map((customer) => (
                      <TableRow key={customer.customerName} className="border-white/5">
                        <TableCell className="font-medium">{customer.customerName}</TableCell>
                        <TableCell>{formatNumber(customer.invoiceCount)}</TableCell>
                        <TableCell className="text-blue-300">{formatCurrency(customer.revenueUsd, "USD")}</TableCell>
                        <TableCell>{formatArabicDate(customer.lastInvoiceDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTableCard>

              <DataTableCard title="أفضل المنتجات" icon={<BarChart3 className="h-4 w-4 text-blue-300" />}>
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/10">
                      <TableHead className="text-right">الصنف</TableHead>
                      <TableHead className="text-right">الكمية</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead className="text-right">الفئة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topItems.map((item) => (
                      <TableRow key={`${item.itemId}-${item.itemCode}`} className="border-white/5">
                        <TableCell>
                          <div className="font-medium">{item.itemName}</div>
                          <div className="text-[10px] text-muted-foreground">{item.itemCode}</div>
                        </TableCell>
                        <TableCell>{formatNumber(item.quantitySold)}</TableCell>
                        <TableCell className="text-emerald-400">{formatCurrency(item.profitUsd, "USD")}</TableCell>
                        <TableCell>{item.category}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTableCard>

              <DataTableCard title="مؤشرات المخزون" icon={<PackageSearch className="h-4 w-4 text-rose-300" />}>
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/10">
                      <TableHead className="text-right">الصنف</TableHead>
                      <TableHead className="text-right">الحالي</TableHead>
                      <TableHead className="text-right">الحد الأدنى</TableHead>
                      <TableHead className="text-right">القيمة USD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.inventoryHighlights.lowStockItems.map((item) => (
                      <TableRow key={`low-${item.itemId}`} className="border-white/5">
                        <TableCell>
                          <div className="font-medium">{item.itemName}</div>
                          <div className="text-[10px] text-muted-foreground">{item.itemCode}</div>
                        </TableCell>
                        <TableCell className="text-rose-300">{formatNumber(item.currentStock)}</TableCell>
                        <TableCell>{formatNumber(item.minStock)}</TableCell>
                        <TableCell>{formatCurrency(item.currentValueUsd, "USD")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTableCard>
            </div>

            <DataTableCard title="أحدث الفواتير خلال الفترة" icon={<FileText className="h-4 w-4 text-amber-300" />}>
              <Table>
                <TableHeader className="bg-white/5">
                  <TableRow className="border-white/10">
                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">العميل / المورد</TableHead>
                    <TableHead className="text-right">الفرع</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="border-white/5">
                      <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell>{invoice.invoiceType === "purchase" ? "شراء" : "بيع"}</TableCell>
                      <TableCell>{invoice.customerName}</TableCell>
                      <TableCell>{invoice.branchName}</TableCell>
                      <TableCell>{formatArabicDate(invoice.invoiceDate)}</TableCell>
                      <TableCell>{formatCurrency(invoice.totalAmount, invoice.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableCard>
          </>
        )}
      </div>
    </Layout>
  );
}

function ReportKpiCard({
  title,
  value,
  icon,
  accent = "default",
}: {
  title: string;
  value: string;
  icon: ReactNode;
  accent?: "default" | "profit";
}) {
  return (
    <Card className={`report-surface ${accent === "profit" ? "border-emerald-500/20" : ""}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground sm:text-xs">{title}</p>
            <p className={`mt-2 text-sm font-bold sm:text-lg ${accent === "profit" ? "text-emerald-400" : "text-foreground"}`}>{value}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-2">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-300">{title}</span>
        {icon}
      </div>
      <div className="mt-2 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function DataTableCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="report-surface">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-base sm:text-lg">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}
