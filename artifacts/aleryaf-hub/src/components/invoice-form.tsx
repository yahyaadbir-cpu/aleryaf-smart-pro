import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useGetItems, useGetBranches, useGetInvoices, useGetInventory } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { getInvoiceLineTotals, summarizeInvoiceLines } from "@/lib/invoice-math";
import { Plus, Trash2, X, Save, ArrowRight, AlertCircle } from "lucide-react";

interface LineItem {
  key: string;
  itemId: number | null;
  rawName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

interface EditableLineItem {
  key: string;
  itemId: number | null;
  rawName: string;
  quantityInput: string;
  unitPriceInput: string;
  unitCost: number;
}

interface BranchOption {
  id: number;
  name: string;
}

interface ItemOption {
  id: number;
  code: string;
  name: string;
  nameAr?: string | null;
  unitCostUsd?: number | null;
  unitCostTry?: number | null;
  unitPriceUsd?: number | null;
  unitPriceTry?: number | null;
}

interface InventoryOption {
  itemId: number;
  unitCostUsd?: number | null;
  unitCostTry?: number | null;
}

interface InvoiceNumberOption {
  invoiceNumber: string;
}

interface InvoiceFormData {
  invoiceNumber: string;
  branchId: number | null;
  currency: "TRY" | "USD";
  invoiceDate: string;
  customerName: string;
  notes: string;
  items: LineItem[];
}

interface InvoiceFormProps {
  initialData?: InvoiceFormData;
  isEdit?: boolean;
  isSaving: boolean;
  onSave: (data: {
    invoiceNumber: string;
    createdBy?: string;
    branchId: number;
    currency: "TRY" | "USD";
    invoiceDate: string;
    customerName?: string;
    notes?: string;
    items: Array<{ itemId?: number; rawName?: string; quantity: number; unitPrice: number; unitCost: number }>;
  }) => void;
  onCancel: () => void;
}

let lineKeyCounter = 0;

function nextKey() {
  return `line_${++lineKeyCounter}_${Date.now()}`;
}

function formatInputNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return "";
  return String(value);
}

function parseInputNumber(value: string) {
  if (value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toEditableLine(line: LineItem): EditableLineItem {
  return {
    key: line.key,
    itemId: line.itemId,
    rawName: line.rawName,
    quantityInput: formatInputNumber(line.quantity),
    unitPriceInput: formatInputNumber(line.unitPrice),
    unitCost: line.unitCost,
  };
}

function toBusinessLine(line: EditableLineItem): LineItem {
  return {
    key: line.key,
    itemId: line.itemId,
    rawName: line.rawName,
    quantity: parseInputNumber(line.quantityInput),
    unitPrice: parseInputNumber(line.unitPriceInput),
    unitCost: line.unitCost,
  };
}

function emptyLine(): EditableLineItem {
  return {
    key: nextKey(),
    itemId: null,
    rawName: "",
    quantityInput: "",
    unitPriceInput: "",
    unitCost: 0,
  };
}

function normalizeBranchName(name?: string | null) {
  return (name || "").trim().toLowerCase();
}

export function InvoiceForm({ initialData, isEdit, isSaving, onSave, onCancel }: InvoiceFormProps) {
  const [invoiceNumber] = useState(initialData?.invoiceNumber || "");
  const [branchId, setBranchId] = useState(initialData?.branchId?.toString() || "");
  const [currency, setCurrency] = useState<"TRY" | "USD">(initialData?.currency || "USD");
  const [invoiceDate, setInvoiceDate] = useState(initialData?.invoiceDate || new Date().toISOString().split("T")[0]);
  const [customerName, setCustomerName] = useState(initialData?.customerName || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [lines, setLines] = useState<EditableLineItem[]>(
    initialData?.items?.length ? initialData.items.map(toEditableLine) : [emptyLine()],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [itemSearch, setItemSearch] = useState<Record<string, string>>({});
  const [useNativeBranchSelect, setUseNativeBranchSelect] = useState(false);
  const previousCurrencyRef = useRef(currency);

  const { data: allItems } = useGetItems({});
  const { data: inventoryItems } = useGetInventory({});
  const { data: branches } = useGetBranches();
  const { data: invoicesData } = useGetInvoices({ page: 1, limit: 200 });

  const typedItems = (allItems ?? []) as ItemOption[];
  const typedInventoryItems = (inventoryItems ?? []) as InventoryOption[];
  const typedBranches = (branches ?? []) as BranchOption[];
  const typedInvoices = (invoicesData?.data ?? []) as InvoiceNumberOption[];

  const updateLine = useCallback((key: string, field: keyof EditableLineItem, value: string | number | null) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  }, []);

  const clearSelectedItem = useCallback((key: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.key === key
          ? {
              ...line,
              itemId: null,
              rawName: "",
              unitCost: 0,
              unitPriceInput: "",
            }
          : line,
      ),
    );
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((line) => line.key !== key);
    });
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
  }, []);

  const resolveLinePricing = useCallback((itemId: number) => {
    const item = typedItems.find((candidate: ItemOption) => candidate.id === itemId);
    const inventoryItem = typedInventoryItems.find((candidate: InventoryOption) => candidate.itemId === itemId);
    const isUsd = currency === "USD";

    const unitCost =
      (isUsd ? inventoryItem?.unitCostUsd : inventoryItem?.unitCostTry) ??
      (isUsd ? item?.unitCostUsd : item?.unitCostTry) ??
      0;

    const unitPrice = (isUsd ? item?.unitPriceUsd : item?.unitPriceTry) ?? 0;

    return {
      item,
      unitCost,
      unitPriceInput: unitPrice === 0 ? "" : String(unitPrice),
    };
  }, [typedInventoryItems, typedItems, currency]);

  const selectItem = useCallback((lineKey: string, itemId: number) => {
    const { item, unitCost, unitPriceInput } = resolveLinePricing(itemId);
    if (!item) return;

    setLines((prev) =>
      prev.map((line) =>
        line.key === lineKey
          ? {
              ...line,
              itemId: item.id,
              rawName: item.name,
              unitCost,
              unitPriceInput,
            }
          : line,
      ),
    );

    setItemSearch((prev) => ({ ...prev, [lineKey]: "" }));
  }, [resolveLinePricing]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const userAgent = window.navigator.userAgent || "";
    setUseNativeBranchSelect(/iPhone|iPad|iPod/i.test(userAgent));
  }, []);

  useEffect(() => {
    if (previousCurrencyRef.current === currency) return;
    previousCurrencyRef.current = currency;

    setLines((prev) =>
      prev.map((line) => {
        if (!line.itemId) return line;
        const { unitCost, unitPriceInput } = resolveLinePricing(line.itemId);
        return {
          ...line,
          unitCost,
          unitPriceInput: line.unitPriceInput === "" ? line.unitPriceInput : unitPriceInput,
        };
      }),
    );
  }, [currency, resolveLinePricing]);

  useEffect(() => {
    if (isEdit || initialData?.branchId || branchId || !typedBranches.length) return;

    const defaultBranch = typedBranches.find((branch: BranchOption) => {
      const normalized = normalizeBranchName(branch.name);
      return normalized.includes("\u0633\u0648\u0631\u064a\u0627") || normalized.includes("syria");
    });

    if (defaultBranch) {
      setBranchId(defaultBranch.id.toString());
    }
  }, [typedBranches, branchId, initialData?.branchId, isEdit]);

  const numericLines = useMemo(() => lines.map(toBusinessLine), [lines]);

  const summary = useMemo(() => {
    const totals = summarizeInvoiceLines(numericLines);
    return {
      subtotal: totals.revenue,
      totalCost: totals.totalCost,
      totalProfit: totals.profit,
      itemCount: lines.length,
    };
  }, [numericLines, lines.length]);

  const validate = () => {
    const errs: string[] = [];

    if (!branchId) errs.push("الفرع مطلوب");
    if (!invoiceDate) errs.push("التاريخ مطلوب");
    if (!customerName.trim()) errs.push("اسم الزبون مطلوب");
    if (lines.length === 0) errs.push("يجب إضافة بند واحد على الأقل");

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const numericLine = numericLines[i];

      if (!line.itemId && !line.rawName.trim()) errs.push(`السطر ${i + 1}: المنتج مطلوب`);
      if (!line.quantityInput.trim() || numericLine.quantity <= 0) errs.push(`السطر ${i + 1}: الكمية يجب أن تكون أكبر من صفر`);
      if (!line.unitPriceInput.trim() || numericLine.unitPrice < 0) errs.push(`السطر ${i + 1}: سعر البيع يجب أن يكون صفراً أو أكثر`);
    }

    setErrors(errs);
    return errs.length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    const generatedInvoiceNumber = isEdit
      ? invoiceNumber
      : `INV${String(
          typedInvoices.reduce((max: number, invoice: InvoiceNumberOption) => {
            const match = invoice.invoiceNumber.match(/(\d+)(?!.*\d)/);
            return Math.max(max, match ? parseInt(match[1], 10) : 0);
          }, 0) + 1,
        ).padStart(4, "0")}`;

    onSave({
      invoiceNumber: generatedInvoiceNumber,
      branchId: parseInt(branchId, 10),
      currency,
      invoiceDate,
      customerName: customerName.trim(),
      notes: notes.trim() || undefined,
      items: numericLines.map((line) => ({
        itemId: line.itemId || undefined,
        rawName: line.rawName || undefined,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
      })),
    });
  };

  return (
    <div className="invoice-form-shell mx-auto flex w-full max-w-6xl flex-col gap-3 sm:gap-4">
      <div className="invoice-form-header flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="invoice-header-back mt-0.5 h-10 w-10 shrink-0 rounded-2xl text-muted-foreground hover:text-white"
          >
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="invoice-page-title font-display font-bold text-foreground">
              {isEdit ? "تعديل الفاتورة" : "فاتورة جديدة"}
            </h1>
            <p className="invoice-page-subtitle">{isEdit ? `#${invoiceNumber}` : "إدخال سريع"}</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Button variant="outline" onClick={onCancel} className="invoice-action-button invoice-action-button--subtle">
            إلغاء
          </Button>
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="rounded-[20px] border border-rose-500/20 bg-rose-500/10 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-rose-300">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-bold">يوجد أخطاء يجب تصحيحها</span>
          </div>
          <div className="space-y-1">
            {errors.map((error, index) => (
              <p key={`${error}-${index}`} className="text-sm text-rose-200">
                {error}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="invoice-form-unified">
        <div className="invoice-form-section invoice-form-section--meta">
          <p className="invoice-form-section__title">بيانات الفاتورة</p>
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">التاريخ</label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="invoice-input invoice-input--date"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">الزبون / الشخص</label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="invoice-input"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">الفرع</label>
              {useNativeBranchSelect ? (
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="invoice-input h-10 w-full appearance-auto px-3 py-2 text-sm"
                >
                  <option value="">اختر الفرع</option>
                  {typedBranches.map((branch: BranchOption) => (
                    <option key={branch.id} value={branch.id.toString()}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger className="invoice-input">
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {typedBranches.map((branch: BranchOption) => (
                      <SelectItem key={branch.id} value={branch.id.toString()}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">العملة</label>
              <div className="invoice-segmented flex rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => setCurrency("USD")}
                  className={`flex-1 rounded-xl text-sm font-bold transition-all ${
                    currency === "USD" ? "invoice-segmented__active text-white" : "text-muted-foreground hover:text-white"
                  }`}
                >
                  دولار
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency("TRY")}
                  className={`flex-1 rounded-xl text-sm font-bold transition-all ${
                    currency === "TRY" ? "invoice-segmented__active text-white" : "text-muted-foreground hover:text-white"
                  }`}
                >
                  تركي
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">ملاحظات</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات اختيارية..."
                rows={2}
                className="invoice-input min-h-[60px] resize-none"
              />
            </div>
          </div>
        </div>

        <div className="invoice-form-sep" />

        <div className="invoice-form-section">
          <div className="mb-3 flex items-center justify-between">
            <p className="invoice-form-section__title mb-0">بنود الفاتورة</p>
            <p className="text-[11px] text-muted-foreground">المنتج · الكمية · السعر</p>
          </div>
          <div className="mb-3 hidden xl:grid xl:grid-cols-[minmax(0,2.1fr)_110px_120px_150px_44px] xl:gap-2 xl:px-1 text-xs font-medium text-muted-foreground">
            <span>المنتج</span>
            <span>الكمية (كغ)</span>
            <span>سعر البيع/طن</span>
            <span>الإجمالي</span>
            <span />
          </div>

          <div className="flex flex-col gap-3 sm:gap-4">
            {lines.map((line, idx) => {
              const numericLine = numericLines[idx];
              const lineTotals = getInvoiceLineTotals(numericLine);
              const searchVal = itemSearch[line.key] || "";
              const filteredItems =
                searchVal.length > 0
                  ? typedItems
                      .filter(
                        (item: ItemOption) =>
                          item.name.toLowerCase().includes(searchVal.toLowerCase()) ||
                          item.code.toLowerCase().includes(searchVal.toLowerCase()) ||
                          (item.nameAr && item.nameAr.includes(searchVal)),
                      )
                      .slice(0, 8)
                  : [];

              return (
                <div key={line.key} className="invoice-line-card p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between xl:hidden">
                    <span className="text-[11px] font-bold tracking-wide text-muted-foreground">بند #{idx + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length <= 1}
                      className="h-8 w-8 rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="hidden xl:grid xl:grid-cols-[minmax(0,2.1fr)_110px_120px_150px_44px] xl:items-center xl:gap-2">
                    <div className="relative">
                      {line.itemId ? (
                        <div className="invoice-line-picker flex items-center gap-2 rounded-xl px-3 py-2">
                          <span className="flex-1 truncate text-sm">{line.rawName}</span>
                          <button
                            type="button"
                            onClick={() => clearSelectedItem(line.key)}
                            className="rounded-md p-1 text-muted-foreground hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Input
                          value={searchVal}
                          onChange={(e) => setItemSearch((prev) => ({ ...prev, [line.key]: e.target.value }))}
                          placeholder="ابحث عن المنتج..."
                          className="invoice-input min-h-10 text-sm"
                        />
                      )}

                      {!line.itemId && filteredItems.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-2xl border border-white/10 bg-card shadow-xl">
                          {filteredItems.map((item: ItemOption) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => selectItem(line.key, item.id)}
                              className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-white/5"
                            >
                              <span>{item.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <Input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      value={line.quantityInput}
                      onChange={(e) => updateLine(line.key, "quantityInput", e.target.value)}
                      className="invoice-input min-h-10 text-center text-sm"
                      dir="ltr"
                    />

                    <Input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      value={line.unitPriceInput}
                      onChange={(e) => updateLine(line.key, "unitPriceInput", e.target.value)}
                      className="invoice-input min-h-10 text-sm"
                      dir="ltr"
                    />

                    <div className="text-sm font-bold text-foreground" dir="ltr">
                      {formatCurrency(lineTotals.revenue, currency)}
                    </div>

                    <div className="flex items-center justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length <= 1}
                        className="h-8 w-8 rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4 xl:hidden">
                    <div className="relative">
                      <label className="mb-1.5 block text-sm font-semibold">الصنف</label>
                      {line.itemId ? (
                        <div className="invoice-line-picker flex items-center gap-2 rounded-2xl px-3 py-2.5">
                          <span className="flex-1 truncate text-sm font-medium">{line.rawName}</span>
                          <button
                            type="button"
                            onClick={() => clearSelectedItem(line.key)}
                            className="rounded-lg p-1 text-muted-foreground hover:text-white"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <Input
                          value={searchVal}
                          onChange={(e) => setItemSearch((prev) => ({ ...prev, [line.key]: e.target.value }))}
                          placeholder="ابحث عن المنتج..."
                          className="invoice-input text-sm"
                        />
                      )}

                      {!line.itemId && filteredItems.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-2xl border border-white/10 bg-card shadow-xl">
                          {filteredItems.map((item: ItemOption) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => selectItem(line.key, item.id)}
                              className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-white/5"
                            >
                              <span>{item.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold">الكمية (كغ)</label>
                      <Input
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        value={line.quantityInput}
                        onChange={(e) => updateLine(line.key, "quantityInput", e.target.value)}
                        className="invoice-input text-sm"
                        dir="ltr"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold">السعر</label>
                      <Input
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        value={line.unitPriceInput}
                        onChange={(e) => updateLine(line.key, "unitPriceInput", e.target.value)}
                        className="invoice-input text-sm"
                        placeholder="مثال 1500"
                        dir="ltr"
                      />
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-3">
                      <span className="text-sm font-semibold text-muted-foreground">الإجمالي</span>
                      <span className="text-base font-bold text-foreground" dir="ltr">
                        {formatCurrency(lineTotals.revenue, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pt-1">
              <Button size="sm" onClick={addLine} className="invoice-add-line w-full rounded-2xl px-4 text-sm font-bold sm:w-auto sm:min-w-[180px]">
                <Plus className="ml-1.5 h-4 w-4" />
                إضافة بند
              </Button>
            </div>
          </div>
        </div>

        <div className="invoice-form-sep" />

        <div className="invoice-form-section invoice-form-section--totals">
          <div className="grid grid-cols-2 gap-3">
            <div className="invoice-summary-card rounded-2xl p-3">
              <p className="mb-1 text-[11px] text-muted-foreground">إجمالي المبيعات</p>
              <p className="text-lg font-bold text-foreground" dir="ltr">{formatCurrency(summary.subtotal, currency)}</p>
            </div>

            <div className="invoice-summary-card invoice-summary-card--profit rounded-2xl p-3">
              <p className="mb-1 text-[11px] text-emerald-200/80">صافي الربح</p>
              <p className={`text-lg font-bold ${summary.totalProfit >= 0 ? "text-emerald-200" : "text-rose-200"}`} dir="ltr">
                {formatCurrency(summary.totalProfit, currency)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={isSaving} className="invoice-save-button invoice-action-button w-full rounded-2xl text-base font-bold text-white">
        <Save className="ml-2 h-4 w-4" />
        {isSaving ? "جارٍ الحفظ..." : isEdit ? "تحديث الفاتورة" : "حفظ الفاتورة"}
      </Button>
    </div>
  );
}
