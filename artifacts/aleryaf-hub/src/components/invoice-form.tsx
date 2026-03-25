import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useGetItems, useGetBranches, useGetInvoices, useGetInventory } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { getInvoiceLineTotals, summarizeInvoiceLines, type InvoiceKind } from "@/lib/invoice-math";
import { Plus, Trash2, X, Save, ArrowRight, AlertCircle } from "lucide-react";

type PurchaseType = "local_syria" | "local_turkey" | "import";

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
  invoiceType: InvoiceKind;
  purchaseType?: PurchaseType;
  branchId: number | null;
  currency: "TRY" | "USD";
  invoiceDate: string;
  customerName: string;
  notes: string;
  items: LineItem[];
}

interface InvoiceFormProps {
  invoiceType: InvoiceKind;
  initialData?: InvoiceFormData;
  isEdit?: boolean;
  isSaving: boolean;
  onSave: (data: {
    invoiceNumber: string;
    createdBy?: string;
    invoiceType: InvoiceKind;
    purchaseType?: PurchaseType;
    branchId: number | null;
    currency: "TRY" | "USD";
    invoiceDate: string;
    customerName?: string;
    notes?: string;
    items: Array<{ itemId?: number; rawName?: string; quantity: number; unitPrice: number; unitCost: number }>;
  }) => void;
  onCancel: () => void;
}

const PURCHASE_TYPE_OPTIONS: Array<{ value: PurchaseType; label: string }> = [
  { value: "local_syria", label: "محلي سوريا" },
  { value: "local_turkey", label: "محلي تركيا" },
  { value: "import", label: "استيراد" },
];

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

function inferPurchaseBranchId(branches: BranchOption[], purchaseType?: PurchaseType | "") {
  if (!purchaseType || branches.length === 0) return "";

  const findByIncludes = (patterns: string[]) =>
    branches.find((branch) => {
      const normalized = normalizeBranchName(branch.name);
      return patterns.some((pattern) => normalized.includes(pattern));
    });

  if (purchaseType === "local_syria") {
    return String(findByIncludes(["سوريا", "syria"])?.id ?? branches[0].id);
  }

  if (purchaseType === "local_turkey") {
    return String(findByIncludes(["مرسين", "mersin"])?.id ?? branches[0].id);
  }

  return "";
}

function getFormLabels(invoiceType: InvoiceKind) {
  if (invoiceType === "purchase") {
    return {
      title: "فاتورة شراء",
      subtitle: "إدخال شراء جديد",
      customer: "اسم المورد / الجهة",
      notes: "ملاحظات",
      lineTitle: "بنود الشراء",
      lineHint: "الصنف · الكمية · السعر",
      item: "الصنف",
      quantity: "الكمية (كغ)",
      price: "سعر الشراء/طن",
      total: "الإجمالي",
      totalCard: "إجمالي الشراء",
      save: "حفظ فاتورة الشراء",
      update: "تحديث فاتورة الشراء",
      purchaseType: "نوع الشراء",
    };
  }

  return {
    title: "فاتورة بيع",
    subtitle: "إدخال بيع جديد",
    customer: "اسم الزبون / الجهة",
    notes: "ملاحظات",
    lineTitle: "بنود الفاتورة",
    lineHint: "الصنف · الكمية · السعر",
    item: "الصنف",
    quantity: "الكمية (كغ)",
    price: "سعر البيع/طن",
    total: "الإجمالي",
    totalCard: "إجمالي المبيعات",
    save: "حفظ فاتورة البيع",
    update: "تحديث فاتورة البيع",
    purchaseType: "نوع الشراء",
  };
}

export function InvoiceForm({ invoiceType, initialData, isEdit, isSaving, onSave, onCancel }: InvoiceFormProps) {
  const effectiveInvoiceType = initialData?.invoiceType ?? invoiceType;
  const labels = getFormLabels(effectiveInvoiceType);

  const [invoiceNumber] = useState(initialData?.invoiceNumber || "");
  const [purchaseType, setPurchaseType] = useState<PurchaseType | "">(initialData?.purchaseType || "");
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
  const { data: invoicesData } = useGetInvoices({ page: 1, limit: 300 });

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
    const item = typedItems.find((candidate) => candidate.id === itemId);
    const inventoryItem = typedInventoryItems.find((candidate) => candidate.itemId === itemId);
    const isUsd = currency === "USD";

    const unitCost =
      (isUsd ? inventoryItem?.unitCostUsd : inventoryItem?.unitCostTry) ??
      (isUsd ? item?.unitCostUsd : item?.unitCostTry) ??
      0;

    const saleUnitPrice = (isUsd ? item?.unitPriceUsd : item?.unitPriceTry) ?? 0;

    return {
      item,
      unitCost,
      unitPriceInput: effectiveInvoiceType === "purchase" ? "" : String(saleUnitPrice || ""),
    };
  }, [currency, effectiveInvoiceType, typedInventoryItems, typedItems]);

  const selectItem = useCallback((lineKey: string, itemId: number) => {
    const { item, unitCost, unitPriceInput } = resolveLinePricing(itemId);
    if (!item) return;

    setLines((prev) =>
      prev.map((line) =>
        line.key === lineKey
          ? {
              ...line,
              itemId: item.id,
              rawName: item.nameAr || item.name,
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
        if (effectiveInvoiceType === "purchase") {
          return {
            ...line,
            unitCost,
          };
        }
        return {
          ...line,
          unitCost,
          unitPriceInput: line.unitPriceInput === "" ? line.unitPriceInput : unitPriceInput,
        };
      }),
    );
  }, [currency, effectiveInvoiceType, resolveLinePricing]);

  useEffect(() => {
    if (isEdit || initialData?.branchId || branchId || !typedBranches.length) return;
    const defaultBranch = typedBranches.find((branch) => {
      const normalized = normalizeBranchName(branch.name);
      return normalized.includes("سوريا") || normalized.includes("syria");
    });
    if (defaultBranch) {
      setBranchId(defaultBranch.id.toString());
    }
  }, [typedBranches, branchId, initialData?.branchId, isEdit]);

  useEffect(() => {
    if (effectiveInvoiceType !== "purchase") return;
    setCurrency("USD");
  }, [effectiveInvoiceType]);

  useEffect(() => {
    if (effectiveInvoiceType !== "purchase" || !typedBranches.length || !purchaseType) return;
    setBranchId(inferPurchaseBranchId(typedBranches, purchaseType));
  }, [effectiveInvoiceType, purchaseType, typedBranches]);

  const numericLines = useMemo(() => lines.map(toBusinessLine), [lines]);

  const summary = useMemo(() => summarizeInvoiceLines(numericLines, effectiveInvoiceType), [effectiveInvoiceType, numericLines]);

  const validate = () => {
    const errs: string[] = [];

    if (effectiveInvoiceType !== "purchase" && !branchId) errs.push("الفرع مطلوب");
    if (!invoiceDate) errs.push("التاريخ مطلوب");
    if (!customerName.trim()) errs.push(effectiveInvoiceType === "purchase" ? "اسم المورد مطلوب" : "اسم الزبون مطلوب");
    if (effectiveInvoiceType === "purchase" && !purchaseType) errs.push("نوع الشراء مطلوب");
    if (lines.length === 0) errs.push("يجب إضافة بند واحد على الأقل");

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const numericLine = numericLines[i];

      if (!line.itemId && !line.rawName.trim()) errs.push(`السطر ${i + 1}: الصنف مطلوب`);
      if (!line.quantityInput.trim() || numericLine.quantity <= 0) errs.push(`السطر ${i + 1}: الكمية يجب أن تكون أكبر من صفر`);
      if (!line.unitPriceInput.trim() || numericLine.unitPrice < 0) errs.push(`السطر ${i + 1}: السعر يجب أن يكون صفراً أو أكثر`);
    }

    setErrors(errs);
    return errs.length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    const prefix = effectiveInvoiceType === "purchase" ? "PUR" : "INV";
    const generatedInvoiceNumber = isEdit
      ? invoiceNumber
      : `${prefix}${String(
          typedInvoices.reduce((max, invoice) => {
            if (!invoice.invoiceNumber.startsWith(prefix)) return max;
            const match = invoice.invoiceNumber.match(/(\d+)(?!.*\d)/);
            return Math.max(max, match ? parseInt(match[1], 10) : 0);
          }, 0) + 1,
        ).padStart(4, "0")}`;

    const resolvedBranchId = effectiveInvoiceType === "purchase"
      ? purchaseType === "import"
        ? null
        : parseInt(branchId || inferPurchaseBranchId(typedBranches, purchaseType), 10)
      : parseInt(branchId, 10);

    onSave({
      invoiceNumber: generatedInvoiceNumber,
      invoiceType: effectiveInvoiceType,
      purchaseType: effectiveInvoiceType === "purchase" ? purchaseType || undefined : undefined,
      branchId: Number.isNaN(resolvedBranchId as number) ? null : resolvedBranchId,
      currency: effectiveInvoiceType === "purchase" ? "USD" : currency,
      invoiceDate,
      customerName: customerName.trim(),
      notes: notes.trim() || undefined,
      items: numericLines.map((line) => ({
        itemId: line.itemId || undefined,
        rawName: line.rawName || undefined,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: effectiveInvoiceType === "purchase" ? line.unitPrice : line.unitCost,
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
              {isEdit ? labels.update : labels.title}
            </h1>
            <p className="invoice-page-subtitle">{isEdit ? `#${invoiceNumber}` : labels.subtitle}</p>
          </div>
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

            {effectiveInvoiceType === "purchase" ? (
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold">{labels.purchaseType}</label>
                <Select value={purchaseType} onValueChange={(value) => setPurchaseType(value as PurchaseType)}>
                  <SelectTrigger className="invoice-input">
                    <SelectValue placeholder="اختر نوع الشراء" />
                  </SelectTrigger>
                  <SelectContent>
                    {PURCHASE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">{labels.customer}</label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="invoice-input"
                required
              />
            </div>

            {effectiveInvoiceType === "purchase" ? null : (
              <>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold">الفرع</label>
                  {useNativeBranchSelect ? (
                    <select
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      className="invoice-input h-10 w-full appearance-auto px-3 py-2 text-sm"
                    >
                      <option value="">اختر الفرع</option>
                      {typedBranches.map((branch) => (
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
                        {typedBranches.map((branch) => (
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
              </>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">{labels.notes}</label>
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
            <p className="invoice-form-section__title mb-0">{labels.lineTitle}</p>
            <p className="text-[11px] text-muted-foreground">{labels.lineHint}</p>
          </div>
          <div className="mb-3 hidden xl:grid xl:grid-cols-[minmax(0,2.1fr)_110px_120px_150px_44px] xl:gap-2 xl:px-1 text-xs font-medium text-muted-foreground">
            <span>{labels.item}</span>
            <span>{labels.quantity}</span>
            <span>{labels.price}</span>
            <span>{labels.total}</span>
            <span />
          </div>

          <div className="flex flex-col gap-3 sm:gap-4">
            {lines.map((line, idx) => {
              const numericLine = numericLines[idx];
              const lineTotals = getInvoiceLineTotals(numericLine, effectiveInvoiceType);
              const searchVal = itemSearch[line.key] || "";
              const filteredItems =
                searchVal.length > 0
                  ? typedItems
                      .filter(
                        (item) =>
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
                          placeholder="ابحث عن الصنف..."
                          className="invoice-input min-h-10 text-sm"
                        />
                      )}

                      {!line.itemId && filteredItems.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-2xl border border-white/10 bg-card shadow-xl">
                          {filteredItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => selectItem(line.key, item.id)}
                              className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-white/5"
                            >
                              <span>{item.nameAr || item.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <Input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={line.quantityInput}
                      onChange={(e) => updateLine(line.key, "quantityInput", e.target.value)}
                      className="invoice-input min-h-10 text-center text-sm"
                      dir="ltr"
                    />

                    <Input
                      type="text"
                      inputMode="decimal"
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
                      <label className="mb-1.5 block text-sm font-semibold">{labels.item}</label>
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
                          placeholder="ابحث عن الصنف..."
                          className="invoice-input text-sm"
                        />
                      )}

                      {!line.itemId && filteredItems.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-2xl border border-white/10 bg-card shadow-xl">
                          {filteredItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => selectItem(line.key, item.id)}
                              className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-white/5"
                            >
                              <span>{item.nameAr || item.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold">{labels.quantity}</label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={line.quantityInput}
                        onChange={(e) => updateLine(line.key, "quantityInput", e.target.value)}
                        className="invoice-input text-sm"
                        dir="ltr"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold">{labels.price}</label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={line.unitPriceInput}
                        onChange={(e) => updateLine(line.key, "unitPriceInput", e.target.value)}
                        className="invoice-input text-sm"
                        dir="ltr"
                      />
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-3">
                      <span className="text-sm font-semibold text-muted-foreground">{labels.total}</span>
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
          <div className="grid grid-cols-1 gap-3">
            <div className="invoice-summary-card rounded-2xl p-3">
              <p className="mb-1 text-[11px] text-muted-foreground">{labels.totalCard}</p>
              <p className="text-lg font-bold text-foreground" dir="ltr">{formatCurrency(summary.revenue, currency)}</p>
            </div>
            {effectiveInvoiceType === "sale" ? (
              <div className="invoice-summary-card invoice-summary-card--profit rounded-2xl p-3">
                <p className="mb-1 text-[11px] text-emerald-200/80">صافي الربح</p>
                <p className={`text-lg font-bold ${summary.profit >= 0 ? "text-emerald-200" : "text-rose-200"}`} dir="ltr">
                  {formatCurrency(summary.profit, currency)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={isSaving} className="invoice-save-button invoice-action-button w-full rounded-2xl text-base font-bold text-white">
        <Save className="ml-2 h-4 w-4" />
        {isSaving ? "جارٍ الحفظ..." : isEdit ? labels.update : labels.save}
      </Button>
    </div>
  );
}
