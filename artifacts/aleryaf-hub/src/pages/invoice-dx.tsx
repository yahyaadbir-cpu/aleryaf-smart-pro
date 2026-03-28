import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useGetBranches, useGetInvoice } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/format";
import { getInvoiceLineTotals, summarizeInvoiceLines } from "@/lib/invoice-math";
import { DX_PRINT_STORAGE_KEY, type PrintInvoiceData } from "@/lib/print-invoice";
import { AlertTriangle, ArrowRight, Plus, Printer, Trash2 } from "lucide-react";

interface InvoiceDxPageProps {
  invoiceId: number;
}

interface DxLineItem {
  key: string;
  itemId: number | null;
  rawName: string;
  count: number | "";
  quantity: number | "";
  unitPrice: number | "";
  unitCost: number | "";
}

interface DxInvoiceState {
  invoiceNumber: string;
  branchId: string;
  currency: "TRY" | "USD";
  invoiceDate: string;
  customerName: string;
  notes: string;
  items: DxLineItem[];
}

let dxLineCounter = 0;
function nextDxKey() {
  return `dx_line_${++dxLineCounter}_${Date.now()}`;
}

function emptyDxLine(): DxLineItem {
  return {
    key: nextDxKey(),
    itemId: null,
    rawName: "",
    count: "",
    quantity: "",
    unitPrice: "",
    unitCost: "",
  };
}

function buildDxState(invoice: any): DxInvoiceState {
  return {
    invoiceNumber: invoice.invoiceNumber || "",
    branchId: invoice.branchId?.toString?.() || "",
    currency: invoice.currency === "TRY" ? "TRY" : "USD",
    invoiceDate: invoice.invoiceDate || new Date().toISOString().split("T")[0],
    customerName: invoice.customerName || "",
    notes: invoice.notes || "",
    items: (invoice.items || []).length
      ? invoice.items.map((item: any) => ({
          key: nextDxKey(),
          itemId: item.itemId ?? null,
          rawName: item.itemName || item.rawName || "",
          count: "",
          quantity: item.quantity ?? "",
          unitPrice: item.unitPrice ?? "",
          unitCost: item.unitCost ?? "",
        }))
      : [emptyDxLine()],
  };
}

export function InvoiceDxPage({ invoiceId }: InvoiceDxPageProps) {
  const [, setLocation] = useLocation();
  const { data: invoice, isLoading } = useGetInvoice(invoiceId, {
    query: {
      refetchOnMount: "always",
    } as any,
  });
  const { data: branches } = useGetBranches();

  const [dxState, setDxState] = useState<DxInvoiceState | null>(null);

  useEffect(() => {
    if (!invoice) return;
    const nextState = buildDxState(invoice);
    setDxState({
      ...nextState,
      items: nextState.items.map((item) => ({ ...item })),
    });
  }, [invoice]);

  const branchName = useMemo(() => {
    return branches?.find((branch) => branch.id.toString() === dxState?.branchId)?.name || invoice?.branchName || "-";
  }, [branches, dxState?.branchId, invoice?.branchName]);

  const summary = useMemo(() => {
    return summarizeInvoiceLines(dxState?.items || [], "sale");
  }, [dxState?.items]);

  const updateHeader = <K extends keyof DxInvoiceState>(field: K, value: DxInvoiceState[K]) => {
    setDxState((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateLine = (key: string, field: keyof DxLineItem, value: DxLineItem[keyof DxLineItem]) => {
    setDxState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((line) => (line.key === key ? { ...line, [field]: value } : line)),
      };
    });
  };

  const addLine = () => {
    setDxState((prev) => (prev ? { ...prev, items: [...prev.items, emptyDxLine()] } : prev));
  };

  const removeLine = (key: string) => {
    setDxState((prev) => {
      if (!prev) return prev;
      if (prev.items.length <= 1) return prev;
      return {
        ...prev,
        items: prev.items.filter((line) => line.key !== key),
      };
    });
  };

  const printableInvoice: PrintInvoiceData | null = dxState
    ? {
        invoiceNumber: dxState.invoiceNumber,
        invoiceDate: dxState.invoiceDate,
        branchName,
        currency: dxState.currency,
        invoiceType: "sale",
        customerName: dxState.customerName,
        notes: dxState.notes,
        totalAmount: summary.revenue,
        totalCost: summary.totalCost,
        totalProfit: summary.profit,
        items: dxState.items.map((line) => {
          const totals = getInvoiceLineTotals(line);
          return {
            itemName: line.rawName,
            rawName: line.rawName,
            count: line.count === "" ? undefined : line.count,
            quantity: totals.quantityKg,
            unitPrice: totals.salePricePerTon,
            unitCost: totals.costPerKg,
            totalPrice: totals.revenue,
            totalCost: totals.totalCost,
          };
        }),
      }
    : null;

  const handlePrint = () => {
    if (!printableInvoice) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        DX_PRINT_STORAGE_KEY,
        JSON.stringify({
          invoiceId,
          invoice: printableInvoice,
        }),
      );
    }
    setLocation(`/invoices/${invoiceId}/print?autoprint=1&dx=1`);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">جاري تحميل فاتورة DX...</p>
        </div>
      </Layout>
    );
  }

  if (!invoice) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">الفاتورة غير موجودة</p>
        </div>
      </Layout>
    );
  }

  if (invoice.invoiceType === "purchase") {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <p className="text-lg font-bold text-foreground">فاتورة الشراء لا تدعم DX</p>
          <p className="max-w-md text-sm text-muted-foreground">يمكنك طباعة فاتورة الشراء من صفحة الفواتير مباشرة، لكن وضع DX مخصص لفواتير البيع فقط.</p>
          <Button onClick={() => setLocation("/invoices")} className="bg-primary text-white">
            العودة إلى الفواتير
          </Button>
        </div>
      </Layout>
    );
  }

  if (!dxState) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">جاري تجهيز نسخة DX...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex max-w-7xl flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")} className="text-muted-foreground hover:text-white">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-display font-bold text-foreground sm:text-3xl">فاتورة DX</h1>
                <Badge className="border border-primary/20 bg-primary/15 text-primary">DX - وضع معاينة قابل للتعديل</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                هذه الصفحة تعمل على نسخة مؤقتة من الفاتورة. أي تعديل هنا لا يتم حفظه في قاعدة البيانات.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>وضع DX مخصص للتعديل المؤقت والطباعة فقط. لا يوجد حفظ، ولا يتم تحديث الفاتورة الأصلية.</span>
        </div>

        <Card className="glass-panel">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">بيانات الفاتورة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">رقم الفاتورة</label>
                <Input
                  value={dxState.invoiceNumber}
                  onChange={(e) => updateHeader("invoiceNumber", e.target.value)}
                  className="border-white/10 bg-black/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">التاريخ</label>
                <Input
                  type="date"
                  value={dxState.invoiceDate}
                  onChange={(e) => updateHeader("invoiceDate", e.target.value)}
                  className="border-white/10 bg-black/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">الفرع</label>
                <Select value={dxState.branchId} onValueChange={(value) => updateHeader("branchId", value)}>
                  <SelectTrigger className="border-white/10 bg-black/30">
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches?.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id.toString()}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">العملة</label>
                <div className="flex h-9 rounded-lg border border-white/10 bg-black/30 p-1">
                  <button
                    type="button"
                    onClick={() => updateHeader("currency", "USD")}
                    className={`flex-1 rounded-md text-sm font-bold transition-all ${dxState.currency === "USD" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}
                  >
                    USD
                  </button>
                  <button
                    type="button"
                    onClick={() => updateHeader("currency", "TRY")}
                    className={`flex-1 rounded-md text-sm font-bold transition-all ${dxState.currency === "TRY" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}
                  >
                    TRY
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">اسم العميل / الزبون</label>
              <Input
                value={dxState.customerName}
                onChange={(e) => updateHeader("customerName", e.target.value)}
                className="border-white/10 bg-black/30"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">ملاحظات</label>
              <Textarea
                value={dxState.notes}
                onChange={(e) => updateHeader("notes", e.target.value)}
                rows={2}
                className="resize-none border-white/10 bg-black/30"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="font-display text-base">بنود الفاتورة DX</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">القيم هنا قابلة للتعديل محلياً فقط، مع إعادة الحساب مباشرة قبل الطباعة.</p>
            </div>
            <Button size="sm" onClick={addLine} className="h-8 bg-primary/20 text-primary hover:bg-primary/30">
              <Plus className="ml-1 h-3.5 w-3.5" />
              إضافة بند
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <Table>
                <TableHeader className="bg-white/5">
                  <TableRow className="border-white/10">
                    <TableHead className="text-right">الصنف</TableHead>
                    <TableHead className="text-right">عدد</TableHead>
                    <TableHead className="text-right">الكمية (كغ)</TableHead>
                    <TableHead className="text-right">سعر البيع/طن</TableHead>
                    <TableHead className="text-right">سعر البيع/كغ</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-right">الربح</TableHead>
                    <TableHead className="w-16 text-left">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dxState.items.map((line) => {
                    const lineTotals = getInvoiceLineTotals(line);

                    return (
                      <TableRow key={line.key} className="border-white/5">
                        <TableCell className="min-w-[220px]">
                          <Input
                            value={line.rawName}
                            onChange={(e) => updateLine(line.key, "rawName", e.target.value)}
                            className="border-white/10 bg-black/30"
                          />
                        </TableCell>
                        <TableCell className="min-w-[90px]">
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={line.count}
                            onChange={(e) => updateLine(line.key, "count", e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                            className="border-white/10 bg-black/30"
                            dir="ltr"
                          />
                        </TableCell>
                        <TableCell className="min-w-[110px]">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, "quantity", e.target.value === "" ? "" : parseFloat(e.target.value))}
                            className="border-white/10 bg-black/30"
                            dir="ltr"
                          />
                        </TableCell>
                        <TableCell className="min-w-[120px]">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.key, "unitPrice", e.target.value === "" ? "" : parseFloat(e.target.value))}
                            className="border-white/10 bg-black/30"
                            dir="ltr"
                          />
                        </TableCell>
                        <TableCell className="font-bold text-muted-foreground" dir="ltr">
                          {formatCurrency(lineTotals.salePricePerKg, dxState.currency)}
                        </TableCell>
                        <TableCell className="font-bold text-blue-400" dir="ltr">
                          {formatCurrency(lineTotals.revenue, dxState.currency)}
                        </TableCell>
                        <TableCell className={`font-bold ${lineTotals.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`} dir="ltr">
                          {formatCurrency(lineTotals.profit, dxState.currency)}
                        </TableCell>
                        <TableCell className="text-left">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLine(line.key)}
                            disabled={dxState.items.length <= 1}
                            className="h-8 w-8 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-primary/20">
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">عدد البنود</p>
                <p className="text-lg font-bold">{dxState.items.length}</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">إجمالي المبيعات</p>
                <p className="text-lg font-bold text-blue-400">{formatCurrency(summary.revenue, dxState.currency)}</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">إجمالي التكلفة</p>
                <p className="text-lg font-bold text-rose-400">{formatCurrency(summary.totalCost, dxState.currency)}</p>
              </div>
              <div className="-m-2 rounded-lg bg-emerald-500/10 p-2 sm:-m-3 sm:p-3">
                <p className="mb-1 text-xs text-emerald-400">صافي الربح</p>
                <p className={`text-xl font-bold ${summary.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {formatCurrency(summary.profit, dxState.currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">الأصل:</span>{" "}
              {invoice.invoiceNumber} - {formatDate(invoice.invoiceDate)} - {invoice.branchName}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLocation("/invoices")} className="border-white/10">
                العودة للفواتير
              </Button>
              <Button onClick={handlePrint} className="bg-primary text-white">
                <Printer className="ml-2 h-4 w-4" />
                طباعة النسخة الحالية
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
