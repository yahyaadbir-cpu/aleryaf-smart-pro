import { useState, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useGetInvoices, useGetInvoice, useCreateInvoice, useUpdateInvoice, useDeleteInvoice, useGetBranches } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth";
import { logActivity } from "@/lib/activity";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { summarizeInvoiceLines } from "@/lib/invoice-math";
import { Plus, Trash2, Eye, Edit2, Search, FileText, AlertTriangle, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { InvoiceForm } from "@/components/invoice-form";
import { InvoicePrintPreview } from "@/components/invoice-print-preview";
import { getInvoicePrintDocumentTitle, type PrintInvoiceData } from "@/lib/print-invoice";
import { getInvoice } from "@workspace/api-client-react";
import { useLocation } from "wouter";

type ViewMode = "list" | "create" | "edit" | "view";
type InvoiceType = "sale" | "purchase";

function getInvoiceTypeLabel(invoiceType?: string) {
  return invoiceType === "purchase" ? "شراء" : "بيع";
}

function getPurchaseTypeLabel(purchaseType?: string) {
  switch (purchaseType) {
    case "local_syria":
      return "محلي سوريا";
    case "local_turkey":
      return "محلي تركيا";
    case "import":
      return "استيراد";
    default:
      return "—";
  }
}

function normalizeInvoiceText(value: unknown) {
  return String(value ?? "").trim();
}

function formatInvoiceLineForLog(item: any) {
  const name = normalizeInvoiceText(item.itemName || item.rawName);
  const quantity = Number(item.quantity ?? 0);
  const unitPrice = Number(item.unitPrice ?? 0);
  return `${name || "بند بدون اسم"} (${formatNumber(quantity)} كغ @ ${unitPrice}/طن)`;
}

function buildInvoiceEditDetails(previousInvoice: any, nextInvoice: any, branches?: Array<any>) {
  if (!previousInvoice) return "";

  const changes: string[] = [];
  const previousBranch =
    branches?.find((branch) => branch.id === previousInvoice.branchId)?.nameAr ||
    branches?.find((branch) => branch.id === previousInvoice.branchId)?.name ||
    previousInvoice.branchName ||
    String(previousInvoice.branchId);
  const nextBranch =
    branches?.find((branch) => branch.id === nextInvoice.branchId)?.nameAr ||
    branches?.find((branch) => branch.id === nextInvoice.branchId)?.name ||
    String(nextInvoice.branchId);

  if (previousInvoice.invoiceDate !== nextInvoice.invoiceDate) {
    changes.push(`التاريخ: ${previousInvoice.invoiceDate} -> ${nextInvoice.invoiceDate}`);
  }
  if ((previousInvoice.invoiceType || "sale") !== (nextInvoice.invoiceType || "sale")) {
    changes.push(`النوع: ${getInvoiceTypeLabel(previousInvoice.invoiceType)} -> ${getInvoiceTypeLabel(nextInvoice.invoiceType)}`);
  }
  if ((previousInvoice.purchaseType || "") !== (nextInvoice.purchaseType || "")) {
    changes.push(`نوع الشراء: ${getPurchaseTypeLabel(previousInvoice.purchaseType)} -> ${getPurchaseTypeLabel(nextInvoice.purchaseType)}`);
  }
  if (normalizeInvoiceText(previousInvoice.customerName) !== normalizeInvoiceText(nextInvoice.customerName)) {
    changes.push(`الزبون: ${normalizeInvoiceText(previousInvoice.customerName) || "بدون"} -> ${normalizeInvoiceText(nextInvoice.customerName) || "بدون"}`);
  }
  if (previousInvoice.branchId !== nextInvoice.branchId) {
    changes.push(`الفرع: ${previousBranch} -> ${nextBranch}`);
  }
  if (previousInvoice.currency !== nextInvoice.currency) {
    changes.push(`العملة: ${previousInvoice.currency} -> ${nextInvoice.currency}`);
  }
  if (normalizeInvoiceText(previousInvoice.notes) !== normalizeInvoiceText(nextInvoice.notes)) {
    changes.push("تم تعديل الملاحظات");
  }

  const previousItems = (previousInvoice.items || []).map((item: any) => formatInvoiceLineForLog(item));
  const nextItems = (nextInvoice.items || []).map((item: any) => formatInvoiceLineForLog(item));
  if (previousItems.join(" | ") !== nextItems.join(" | ")) {
    changes.push(`البنود: ${nextItems.join(" | ") || "لا توجد بنود"}`);
  }

  return changes.join(" | ");
}

export function InvoicesPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<ViewMode>("list");
  const [activeInvoiceType, setActiveInvoiceType] = useState<InvoiceType>("sale");
  const [editId, setEditId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; number: string } | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<PrintInvoiceData | null>(null);
  const [previewPrintHref, setPreviewPrintHref] = useState<string | undefined>(undefined);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [pendingEditActivityDetails, setPendingEditActivityDetails] = useState<string | null>(null);

  const [currency, setCurrencyState] = useState<string>("all");
  const [branchFilter, setBranchFilterState] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const setCurrency = (val: string) => { setCurrencyState(val); setPage(1); };
  const setBranchFilter = (val: string) => { setBranchFilterState(val); setPage(1); };

  const { toast, dismiss } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: branches } = useGetBranches();

  const { data: invoicesData, isLoading } = useGetInvoices({
    page,
    limit: 30,
    currency: currency !== "all" ? currency as "TRY" | "USD" : undefined,
    branchId: branchFilter !== "all" ? Number(branchFilter) : undefined,
    search: searchQuery || undefined,
  }, {
    query: {
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
    } as any,
  });

  const { data: viewInvoice, isLoading: isViewLoading } = useGetInvoice(viewId ?? 0);
  const { data: editInvoice, isLoading: isEditLoading } = useGetInvoice(editId ?? 0);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
  }, [queryClient]);

  const { mutate: createInvoice, isPending: isCreating } = useCreateInvoice({
    mutation: {
      onSuccess: (createdInvoice: any) => {
        toast({ title: "تم إنشاء الفاتورة بنجاح" });
        invalidateAll();
        if (user) {
          const createdType = createdInvoice?.invoiceType === "purchase" ? "فاتورة شراء" : "فاتورة بيع";
          logActivity(user.username, "إنشاء فاتورة", `${createdType}: ${createdInvoice?.invoiceNumber ?? ""}`);
        }
        if (createdInvoice?.id) {
          dismiss();
          window.setTimeout(() => {
            setLocation(`/invoices/${createdInvoice.id}/print?autoprint=1`);
          }, 50);
          return;
        }
        setMode("list");
      },
      onError: () => toast({ title: "خطأ في إنشاء الفاتورة", variant: "destructive" }),
    }
  });

  const { mutate: updateInvoice, isPending: isUpdating } = useUpdateInvoice({
    mutation: {
      onSuccess: () => {
        toast({ title: "تم تحديث الفاتورة بنجاح" });
        if (user && pendingEditActivityDetails) {
          logActivity(user.username, "تعديل فاتورة", pendingEditActivityDetails);
        }
        setPendingEditActivityDetails(null);
        setMode("list");
        setEditId(null);
        invalidateAll();
      },
      onError: () => {
        setPendingEditActivityDetails(null);
        toast({ title: "خطأ في تحديث الفاتورة", variant: "destructive" });
      },
    }
  });

  const { mutate: deleteInvoice, isPending: isDeleting } = useDeleteInvoice({
    mutation: {
      onSuccess: () => {
        toast({ title: "تم حذف الفاتورة بنجاح" });
        if (user) logActivity(user.username, "حذف فاتورة", `رقم الفاتورة: ${deleteTarget?.number ?? ""}`);
        setDeleteTarget(null);
        invalidateAll();
      },
      onError: () => toast({ title: "خطأ في حذف الفاتورة", variant: "destructive" }),
    }
  });

  const handleCreate = (data: any) => {
    createInvoice({
      data: {
        ...data,
        createdBy: user?.username || "غير معروف",
      },
    });
  };

  const handleUpdate = (data: any) => {
    if (!editId) return;
    if (editInvoice) {
      const details = buildInvoiceEditDetails(editInvoice, data, branches);
      setPendingEditActivityDetails(`رقم الفاتورة: ${editInvoice.invoiceNumber}${details ? ` | ${details}` : ""}`);
    }
    updateInvoice({ id: editId, data });
  };

  const openEdit = (id: number) => {
    setEditId(id);
    const invoice = invoicesData?.data?.find((entry) => entry.id === id);
    setActiveInvoiceType((invoice?.invoiceType === "purchase" ? "purchase" : "sale") as InvoiceType);
    setMode("edit");
  };

  const openView = (id: number) => {
    setViewId(id);
  };

  const handlePrint = async (id: number) => {
    setIsPreviewLoading(true);
    try {
      const inv = await getInvoice(id);
      setPreviewInvoice(inv as PrintInvoiceData);
      setPreviewPrintHref(`/invoices/${id}/print?autoprint=1`);
    } catch {
      toast({ title: "خطأ في تحميل بيانات الفاتورة", variant: "destructive" });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const totalPages = invoicesData ? Math.ceil(invoicesData.total / 30) : 0;
  const viewInvoiceType = (viewInvoice?.invoiceType === "purchase" ? "purchase" : "sale") as InvoiceType;
  const viewInvoiceSummary = viewInvoice ? summarizeInvoiceLines(viewInvoice.items || [], viewInvoiceType) : null;

  useEffect(() => {
    if (!invoicesData?.data?.length) return;

    invoicesData.data.forEach((invoice) => {
      console.debug("[InvoicesPage:list-row]", {
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        totalProfit: invoice.totalProfit,
        displayAmount: (invoice as any).displayAmount,
        displayProfit: (invoice as any).displayProfit,
        renderedAmountSource: (invoice as any).displayAmount,
        renderedProfitSource: (invoice as any).displayProfit,
      });
    });
  }, [invoicesData]);

  useEffect(() => {
    if (!previewInvoice) return;

    const previousTitle = document.title;
    document.title = getInvoicePrintDocumentTitle(previewInvoice);

    return () => {
      document.title = previousTitle;
    };
  }, [previewInvoice]);

  if (mode === "create") {
    return (
      <Layout>
        <InvoiceForm
          invoiceType={activeInvoiceType}
          isSaving={isCreating}
          onSave={handleCreate}
          onCancel={() => setMode("list")}
        />
      </Layout>
    );
  }

  if (mode === "edit" && editId) {
    if (isEditLoading) {
      return (
        <Layout>
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">جاري تحميل بيانات الفاتورة...</p>
          </div>
        </Layout>
      );
    }

    if (!editInvoice) {
      return (
        <Layout>
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">الفاتورة غير موجودة</p>
          </div>
        </Layout>
      );
    }

    return (
      <Layout>
        <InvoiceForm
          invoiceType={(editInvoice.invoiceType === "purchase" ? "purchase" : "sale") as InvoiceType}
          isEdit
          isSaving={isUpdating}
          initialData={{
            invoiceNumber: editInvoice.invoiceNumber,
            invoiceType: (editInvoice.invoiceType === "purchase" ? "purchase" : "sale") as InvoiceType,
            purchaseType: editInvoice.purchaseType,
            branchId: editInvoice.branchId,
            currency: editInvoice.currency as "TRY" | "USD",
            invoiceDate: editInvoice.invoiceDate,
            customerName: editInvoice.customerName || "",
            notes: editInvoice.notes || "",
            items: (editInvoice.items || []).map((item: any, idx: number) => ({
              key: `edit_${idx}_${Date.now()}`,
              itemId: item.itemId || null,
              rawName: item.itemName || item.rawName || "",
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: item.unitCost,
            })),
          }}
          onSave={handleUpdate}
          onCancel={() => { setMode("list"); setEditId(null); }}
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h1 className="invoice-page-title font-display font-bold text-foreground">الفواتير</h1>
            <p className="invoice-page-subtitle">
              إدارة وتتبع الفواتير
              {invoicesData && <span className="mr-2">— {invoicesData.total} فاتورة</span>}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => { setActiveInvoiceType("sale"); setMode("create"); }}
              className="invoice-action-button invoice-action-button--primary text-white"
            >
              <Plus className="w-4 h-4 ml-2" />
              فاتورة بيع
            </Button>
            <Button
              variant="outline"
              onClick={() => { setActiveInvoiceType("purchase"); setMode("create"); }}
              className="invoice-action-button border-white/10 text-white hover:bg-white/5"
            >
              <Plus className="w-4 h-4 ml-2" />
              فاتورة شراء
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث برقم الفاتورة..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="invoice-input pr-9"
            />
          </div>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="invoice-input w-full sm:w-[160px]">
              <SelectValue placeholder="كل الفروع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {branches?.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="invoice-input w-full sm:w-[120px]">
              <SelectValue placeholder="العملة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="TRY">TRY</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border-white/8 bg-[#0f0f10] shadow-none">
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto sm:block">
              <Table>
                <TableHeader className="bg-[#252527]">
                  <TableRow className="border-white/8">
                    <TableHead className="text-right">الزبون / المورد</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">التاريخ</TableHead>
                    <TableHead className="text-right hidden md:table-cell">الفرع</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">الربح</TableHead>
                    <TableHead className="text-left w-28">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow className="border-white/6 bg-[#111214] hover:bg-[#111214]">
                      <TableCell colSpan={6} className="text-center py-12">جاري التحميل...</TableCell>
                    </TableRow>
                  ) : invoicesData?.data?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="text-muted-foreground">لا توجد فواتير</p>
                        <Button variant="link" onClick={() => { setActiveInvoiceType("sale"); setMode("create"); }} className="text-primary mt-2">
                          إنشاء فاتورة بيع
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : invoicesData?.data?.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="cursor-pointer border-white/6 bg-[#1a1a1d] hover:bg-[#202024]"
                      onClick={() => openView(invoice.id)}
                    >
                      <TableCell className="text-sm font-medium">
                        <div className="flex flex-col gap-1">
                          <span>{invoice.customerName?.trim() || "—"}</span>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="border-white/10 bg-white/5 text-[10px]">
                              {getInvoiceTypeLabel((invoice as any).invoiceType)}
                            </Badge>
                            {(invoice as any).invoiceType === "purchase" ? (
                              <Badge variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-[10px] text-cyan-300">
                                {getPurchaseTypeLabel((invoice as any).purchaseType)}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">{formatDate(invoice.invoiceDate)}</TableCell>
                      <TableCell className="text-sm hidden md:table-cell">{invoice.branchName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{formatCurrency((invoice as any).displayAmount, invoice.currency)}</span>
                          <Badge variant="outline" className={`text-[10px] border-white/10 ${invoice.currency === "USD" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"}`}>
                            {invoice.currency}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className={`font-bold text-sm hidden sm:table-cell ${(((invoice as any).displayProfit) >= 0) ? "text-emerald-400" : "text-rose-400"}`}>
                        {formatCurrency((invoice as any).displayProfit, invoice.currency)}
                      </TableCell>
                      <TableCell className="text-left" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openView(invoice.id)} className="h-7 w-7 text-muted-foreground hover:text-white hover:bg-white/10">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handlePrint(invoice.id)} className="h-7 w-7 text-purple-400 hover:text-purple-300 hover:bg-purple-400/10">
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          {user?.isAdmin && (invoice as any).invoiceType !== "purchase" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLocation(`/invoices/${invoice.id}/dx`)}
                              className="h-7 px-2 text-[11px] font-bold text-amber-300 hover:text-amber-200 hover:bg-amber-400/10"
                            >
                              DX
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="icon" onClick={() => openEdit(invoice.id)} className="h-7 w-7 text-muted-foreground hover:text-white hover:bg-white/10">
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: invoice.id, number: invoice.invoiceNumber })} className="h-7 w-7 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="invoice-mobile-list flex flex-col p-3 sm:hidden">
              {isLoading ? (
                <div className="py-12 text-center text-muted-foreground">جاري التحميل...</div>
              ) : invoicesData?.data?.length === 0 ? (
                <div className="py-12 text-center">
                  <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">لا توجد فواتير</p>
                  <Button variant="link" onClick={() => { setActiveInvoiceType("sale"); setMode("create"); }} className="mt-2 text-primary">
                    إنشاء فاتورة بيع
                  </Button>
                </div>
              ) : invoicesData?.data?.map((invoice) => (
                <div
                  key={invoice.id}
                  onClick={() => openView(invoice.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openView(invoice.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className="invoice-mobile-card w-full cursor-pointer text-right"
                >
                  <div className="invoice-mobile-card__header">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">{invoice.customerName?.trim() || "—"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        <span>{invoice.invoiceNumber}</span>
                        <Badge variant="outline" className="border-white/10 bg-white/5 text-[9px]">
                          {getInvoiceTypeLabel((invoice as any).invoiceType)}
                        </Badge>
                        {(invoice as any).invoiceType === "purchase" ? (
                          <Badge variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-[9px] text-cyan-300">
                            {getPurchaseTypeLabel((invoice as any).purchaseType)}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-[10px] border-white/10 ${invoice.currency === "USD" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"}`}>
                      {invoice.currency}
                    </Badge>
                  </div>

                  <div className="invoice-mobile-card__meta">
                    <div className="text-[11px] text-muted-foreground">{formatDate(invoice.invoiceDate)}</div>
                    <div className="text-[11px] text-muted-foreground">{invoice.branchName || "—"}</div>
                  </div>

                  <div className="invoice-mobile-kpis mt-3">
                    <div className="invoice-mobile-kpi">
                      <div className="invoice-mobile-kpi__label">المبلغ</div>
                      <div className="invoice-mobile-kpi__value">{formatCurrency((invoice as any).displayAmount, invoice.currency)}</div>
                    </div>
                    <div className="invoice-mobile-kpi">
                      <div className="invoice-mobile-kpi__label">الربح</div>
                      <div className={`invoice-mobile-kpi__value ${(((invoice as any).displayProfit) >= 0) ? "text-emerald-400" : "text-rose-400"}`}>
                        {formatCurrency((invoice as any).displayProfit, invoice.currency)}
                      </div>
                    </div>
                  </div>

                  <div className="invoice-mobile-card__footer" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="icon" onClick={() => openView(invoice.id)} className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handlePrint(invoice.id)} className="h-8 w-8 text-purple-400 hover:text-purple-300 hover:bg-purple-400/10">
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(invoice.id)} className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: invoice.id, number: invoice.invoiceNumber })} className="h-8 w-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {user?.isAdmin && (invoice as any).invoiceType !== "purchase" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(`/invoices/${invoice.id}/dx`)}
                        className="h-8 rounded-xl px-2.5 text-[11px] font-bold text-amber-300 hover:bg-amber-400/10 hover:text-amber-200"
                      >
                        DX
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 p-4 border-t border-white/5">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border-white/10 h-8">
                  السابق
                </Button>
                <span className="text-xs text-muted-foreground px-3">
                  {page} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="border-white/10 h-8">
                  التالي
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="glass-panel border-white/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              تأكيد الحذف
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              هل أنت متأكد من حذف الفاتورة رقم <span className="font-mono font-bold text-foreground">{deleteTarget?.number}</span>؟
            </p>
            <p className="text-xs text-rose-400 mt-2">هذا الإجراء لا يمكن التراجع عنه.</p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-white/10">
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteInvoice({ id: deleteTarget.id })}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {isDeleting ? "جاري الحذف..." : "حذف الفاتورة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewId} onOpenChange={(open) => { if (!open) setViewId(null); }}>
        <DialogContent className="glass-panel border-white/10 sm:max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              تفاصيل الفاتورة
            </DialogTitle>
          </DialogHeader>
          {isViewLoading ? (
            <div className="py-12 text-center text-muted-foreground">جاري التحميل...</div>
          ) : viewInvoice ? (
            <div className="invoice-view-grid">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="invoice-view-block">
                  <p className="text-[10px] text-muted-foreground mb-1">رقم الفاتورة</p>
                  <p className="font-mono font-bold text-sm">{viewInvoice.invoiceNumber}</p>
                </div>
                <div className="invoice-view-block">
                  <p className="text-[10px] text-muted-foreground mb-1">التاريخ</p>
                  <p className="font-bold text-sm">{formatDate(viewInvoice.invoiceDate)}</p>
                </div>
                <div className="invoice-view-block">
                  <p className="text-[10px] text-muted-foreground mb-1">الفرع</p>
                  <p className="font-bold text-sm">{viewInvoice.branchName}</p>
                </div>
                <div className="invoice-view-block">
                  <p className="text-[10px] text-muted-foreground mb-1">العملة</p>
                  <Badge className={`${viewInvoice.currency === "USD" ? "bg-blue-500/20 text-blue-400" : "bg-orange-500/20 text-orange-400"}`}>
                    {viewInvoice.currency}
                  </Badge>
                </div>
              </div>
              {viewInvoice.customerName && (
                <div className="invoice-view-block">
                  <p className="text-[10px] text-muted-foreground mb-1">{viewInvoiceType === "purchase" ? "المورد / الجهة" : "الزبون / العميل"}</p>
                  <p className="font-bold text-sm">{viewInvoice.customerName}</p>
                </div>
              )}
              {viewInvoiceType === "purchase" && viewInvoice.purchaseType ? (
                <div className="invoice-view-block">
                  <p className="text-[10px] text-muted-foreground mb-1">نوع الشراء</p>
                  <p className="font-bold text-sm">{getPurchaseTypeLabel(viewInvoice.purchaseType)}</p>
                </div>
              ) : null}
              {viewInvoice.notes && (
                <div className="invoice-view-block">
                  <p className="text-[10px] text-muted-foreground mb-1">ملاحظات</p>
                  <p className="text-sm">{viewInvoice.notes}</p>
                </div>
              )}
              {viewInvoice.items && viewInvoice.items.length > 0 && (
                <div className="invoice-view-items-mobile">
                  {(viewInvoiceSummary?.lines || []).map((item: any, idx: number) => (
                    <div key={idx} className="invoice-view-item-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-foreground">{item.itemName || item.rawName || "-"}</div>
                          {!item.itemId && item.rawName && (
                            <Badge variant="outline" className="mt-2 text-[9px] bg-yellow-500/10 text-yellow-400 border-yellow-500/20">غير مطابق</Badge>
                          )}
                        </div>
                        <div className="text-sm font-bold text-blue-400">{formatCurrency(item.revenue, viewInvoice.currency)}</div>
                      </div>
                      <div className="invoice-view-item-card__grid">
                        <div>
                          <div className="invoice-detail-pair__label">الكمية</div>
                          <div className="invoice-detail-pair__value">{formatNumber(item.quantity)}</div>
                        </div>
                        <div>
                          <div className="invoice-detail-pair__label">{viewInvoiceType === "purchase" ? "السعر" : "سعر البيع"}</div>
                          <div className="invoice-detail-pair__value">{formatCurrency(item.unitPrice, viewInvoice.currency)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 border border-white/8 rounded-xl px-2 py-2.5">
                <div className="text-center">
                  <p className="text-[10px] text-blue-400 mb-0.5">{viewInvoiceType === "purchase" ? "إجمالي الشراء" : "إجمالي المبيعات"}</p>
                  <p className="text-sm font-bold text-blue-400">{formatCurrency(viewInvoiceSummary?.revenue ?? viewInvoice.totalAmount, viewInvoice.currency)}</p>
                </div>
                <div className="text-center border-x border-white/8">
                  <p className="text-[10px] text-rose-400 mb-0.5">إجمالي التكلفة</p>
                  <p className="text-sm font-bold text-rose-400">{formatCurrency(viewInvoiceSummary?.totalCost ?? viewInvoice.totalCost, viewInvoice.currency)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-emerald-400 mb-0.5">{viewInvoiceType === "purchase" ? "الفرق" : "صافي الربح"}</p>
                  <p className="text-sm font-bold text-emerald-400">{formatCurrency(viewInvoiceSummary?.profit ?? viewInvoice.totalProfit, viewInvoice.currency)}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setViewId(null)} className="invoice-action-button invoice-action-button--subtle">
                  إغلاق
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handlePrint(viewInvoice.id)}
                  disabled={isPreviewLoading}
                  className="invoice-action-button border-purple-500/20 text-purple-400 hover:bg-purple-500/10"
                >
                  <Printer className="w-4 h-4 ml-2" />
                  {isPreviewLoading ? "جاري التحضير..." : "طباعة"}
                </Button>
                <Button onClick={() => { setViewId(null); openEdit(viewInvoice.id); }} className="invoice-action-button invoice-action-button--primary text-white">
                  <Edit2 className="w-4 h-4 ml-2" />
                  تعديل
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">الفاتورة غير موجودة</div>
          )}
        </DialogContent>
      </Dialog>

      <InvoicePrintPreview
        invoice={previewInvoice}
        open={!!previewInvoice}
        printHref={previewPrintHref}
        onClose={() => {
          setPreviewInvoice(null);
          setPreviewPrintHref(undefined);
        }}
        onBackToInvoices={() => {
          setPreviewInvoice(null);
          setPreviewPrintHref(undefined);
          setViewId(null);
          setLocation("/invoices");
        }}
      />
    </Layout>
  );
}
