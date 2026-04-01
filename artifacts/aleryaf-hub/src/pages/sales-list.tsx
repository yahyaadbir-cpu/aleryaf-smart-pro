import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RotateCcw, Save } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { APP_NAME_AR, APP_NAME_EN } from "@/lib/branding";
import { apiFetch } from "@/lib/http";
import { useAuth } from "@/context/auth";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity";
import logoUrl from "@assets/aleryaf-logo-transparent-cropped.png";

type SalesPrintMode = "full" | "simple";
type SalesPrintLanguage = "tr" | "ar";

interface SalesLine {
  id: string;
  name: string;
  pricePerKg: number | null;
}

interface SavedSalesList {
  id: number;
  title: string;
  printMode: SalesPrintMode;
  salesDate: string;
  notes: string;
  itemsText: string;
  totalAmount: number;
  createdBy: string | null;
  createdAt: string | null;
}

const DEFAULT_ITEMS = "";

const ITEM_NAME_TRANSLATIONS: Record<string, string> = {
  "زنجبيل مطحون": "Öğütülmüş Zencefil",
  "كركم": "Zerdeçal",
  "كزبره": "Kişniş",
  "كمون": "Kimyon",
  "يانسون": "Anason",
  "قرفه سيجار": "Çubuk Tarçın",
  "قرفة سيجار": "Çubuk Tarçın",
  "حبة بركه": "Çörek Otu",
  "كاري": "Köri",
  "قرفة حصير": "Hasır Tarçın",
  "قرفه حصير": "Hasır Tarçın",
  "فلفل مغربل": "Elenmiş Biber",
  "فلفل ليس مغربل": "Elenmemiş Biber",
  "شمرا": "Rezene",
  "سمسم احمر": "Kırmızı Susam",
  "كركم مطحون": "Öğütülmüş Zerdeçal",
  "قرفه مطحونه": "Öğütülmüş Tarçın",
  "قرفة مطحونة": "Öğütülmüş Tarçın",
};

const COPY = {
  tr: {
    defaultTitle: "Satış Listesi",
    companyName: APP_NAME_EN,
    titleLabel: "Başlık",
    languageLabel: "Dil",
    languageTurkish: "Türkçe",
    languageArabic: "العربية",
    dateLabel: "Tarih",
    printModeLabel: "Yazdırma Türü",
    fullMode: "Tam Fatura",
    simpleMode: "Faturasız Liste",
    itemsLabel: "Ürünler ve fiyatlar",
    itemsHint: "السعر الذي تكتبه يكون بالكيلو، والورقة تعرض أيضاً سعر الطن تلقائياً.",
    notesLabel: "Not",
    notesPlaceholder: "Teslimat veya açıklama notu",
    printTitle: "Satış Listesi",
    typeLabel: "Tür",
    itemName: "Ürün Adı",
    kgPrice: "Kg Fiyatı",
    tonPrice: "Ton Fiyatı",
    emptyList: "Liste boş. Sol taraftan ürünleri ekleyin.",
    savedListsTitle: "القوائم المحفوظة",
    savedListsSubtitle: "كل قائمة تحفظ مع التاريخ والنوع والإجمالي.",
  },
  ar: {
    defaultTitle: "قائمة مبيعات",
    companyName: APP_NAME_AR,
    titleLabel: "العنوان",
    languageLabel: "اللغة",
    languageTurkish: "Türkçe",
    languageArabic: "العربية",
    dateLabel: "التاريخ",
    printModeLabel: "نوع الطباعة",
    fullMode: "فاتورة كاملة",
    simpleMode: "بدون فاتورة",
    itemsLabel: "المنتجات والأسعار",
    itemsHint: "السعر الذي تكتبه يكون بالكيلو، والورقة تعرض أيضاً سعر الطن تلقائياً.",
    notesLabel: "ملاحظات",
    notesPlaceholder: "ملاحظات التسليم أو التوضيح",
    printTitle: "قائمة مبيعات",
    typeLabel: "النوع",
    itemName: "اسم المنتج",
    kgPrice: "سعر الكيلو",
    tonPrice: "سعر الطن",
    emptyList: "القائمة فارغة. أضف المنتجات من الجهة الجانبية.",
    savedListsTitle: "القوائم المحفوظة",
    savedListsSubtitle: "كل قائمة تحفظ مع التاريخ والنوع والإجمالي.",
  },
} as const;

function getDefaultTitle(language: SalesPrintLanguage) {
  return COPY[language].defaultTitle;
}

function toAsciiDigits(value: string) {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  const easternArabicIndic = "۰۱۲۳۴۵۶۷۸۹";

  return value
    .split("")
    .map((char) => {
      const arabicIndex = arabicIndic.indexOf(char);
      if (arabicIndex >= 0) return String(arabicIndex);

      const easternArabicIndex = easternArabicIndic.indexOf(char);
      if (easternArabicIndex >= 0) return String(easternArabicIndex);

      return char;
    })
    .join("");
}

function parsePrice(rawPrice: string) {
  const normalized = toAsciiDigits(rawPrice).replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSalesLines(source: string): SalesLine[] {
  return source
    .split(/\r?\n/)
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return null;

      const match = trimmed.match(/^(.*?)(?:\s+([\d٠-٩۰-۹,.\-]+))$/);
      const name = match?.[1]?.trim() || trimmed;
      const pricePerKg = match?.[2] ? parsePrice(match[2]) : null;

      return {
        id: `${index}-${name}`,
        name,
        pricePerKg,
      };
    })
    .filter((line): line is SalesLine => Boolean(line));
}

function normalizeArabicItemName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function translateItemNameToTurkish(value: string) {
  const direct = ITEM_NAME_TRANSLATIONS[value.trim()];
  if (direct) return direct;

  const normalized = normalizeArabicItemName(value);

  for (const [arabicName, turkishName] of Object.entries(ITEM_NAME_TRANSLATIONS)) {
    if (normalizeArabicItemName(arabicName) === normalized) {
      return turkishName;
    }
  }

  return value;
}

function resolveDisplayItemName(value: string, language: SalesPrintLanguage) {
  return language === "tr" ? translateItemNameToTurkish(value) : value;
}

function toPricePerTon(value: number | null) {
  if (value === null) return null;
  return value * 1000;
}

function formatTry(value: number | null) {
  if (value === null) return "-";

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateByLanguage(value: string, language: SalesPrintLanguage) {
  if (!value) return "-";

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "ar-SY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function getTodayValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SalesListPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [printLanguage, setPrintLanguage] = useState<SalesPrintLanguage>("tr");
  const [documentTitle, setDocumentTitle] = useState<string>(getDefaultTitle("tr"));
  const [documentDate, setDocumentDate] = useState(getTodayValue);
  const [printMode, setPrintMode] = useState<SalesPrintMode>("full");
  const [notes, setNotes] = useState("");
  const [itemsText, setItemsText] = useState(DEFAULT_ITEMS);
  const [savedLists, setSavedLists] = useState<SavedSalesList[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSavedLists, setIsLoadingSavedLists] = useState(true);
  const [activeSavedListId, setActiveSavedListId] = useState<number | null>(null);

  const copy = COPY[printLanguage];
  const salesLines = useMemo(() => parseSalesLines(itemsText), [itemsText]);

  const loadSavedLists = async () => {
    setIsLoadingSavedLists(true);
    try {
      const response = await apiFetch("/api/sales-lists");
      if (!response.ok) {
        throw new Error("load failed");
      }
      const data = (await response.json()) as SavedSalesList[];
      setSavedLists(data);
    } catch {
      toast({
        title: "تعذر تحميل القوائم المحفوظة",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSavedLists(false);
    }
  };

  useEffect(() => {
    loadSavedLists().catch(() => undefined);
  }, []);

  const handlePrint = () => {
    window.focus();
    window.print();
  };

  const handleLanguageChange = (nextLanguage: SalesPrintLanguage) => {
    setDocumentTitle((currentTitle) =>
      currentTitle === getDefaultTitle(printLanguage) ? getDefaultTitle(nextLanguage) : currentTitle,
    );
    setPrintLanguage(nextLanguage);
  };

  const handleReset = () => {
    setDocumentTitle(getDefaultTitle(printLanguage));
    setDocumentDate(getTodayValue());
    setPrintMode("full");
    setNotes("");
    setItemsText(DEFAULT_ITEMS);
    setActiveSavedListId(null);
  };

  const handleSave = async () => {
    if (!itemsText.trim()) {
      toast({
        title: "أدخل عناصر القائمة أولاً",
        variant: "destructive",
      });
      return;
    }

    const totalAmount = salesLines.reduce((sum, line) => sum + (toPricePerTon(line.pricePerKg) ?? 0), 0);

    setIsSaving(true);
    try {
      const response = await apiFetch("/api/sales-lists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: documentTitle.trim() || getDefaultTitle(printLanguage),
          printMode,
          salesDate: documentDate,
          notes,
          itemsText,
          totalAmount,
          createdBy: user?.username,
        }),
      });

      if (!response.ok) {
        throw new Error("save failed");
      }

      const saved = (await response.json()) as SavedSalesList;
      setSavedLists((current) => [saved, ...current]);
      setActiveSavedListId(saved.id);
      toast({
        title: "تم حفظ قائمة المبيعات",
      });
      if (user) {
        logActivity(
          user.username,
          "حفظ قائمة مبيعات",
          `${saved.title} | ${saved.salesDate} | ${printLanguage === "tr" ? "Türkçe" : "العربية"} | ${printMode === "full" ? "Tam Fatura" : "Faturasız"}`,
        );
      }
    } catch {
      toast({
        title: "تعذر حفظ قائمة المبيعات",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const loadSavedListIntoEditor = (saved: SavedSalesList) => {
    setDocumentTitle(saved.title);
    setDocumentDate(saved.salesDate);
    setPrintMode(saved.printMode);
    setNotes(saved.notes);
    setItemsText(saved.itemsText);
    setActiveSavedListId(saved.id);
  };

  return (
    <Layout>
      <div className="sales-list-page flex flex-col gap-4 sm:gap-6">
        <div className="screen-only flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="invoice-page-title font-display font-bold text-foreground">قائمة مبيعات</h1>
            <p className="invoice-page-subtitle">
              احفظ كل قائمة مبيعات مع تاريخها ونوعها ثم أعد فتحها أو اطبعها لاحقاً.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleReset}
              className="invoice-action-button border-white/10 text-white hover:bg-white/5"
            >
              <RotateCcw className="ml-2 h-4 w-4" />
              إعادة تعيين
            </Button>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isSaving}
              className="invoice-action-button border-white/10 text-white hover:bg-white/5"
            >
              <Save className="ml-2 h-4 w-4" />
              {isSaving ? "جارٍ الحفظ..." : "حفظ القائمة"}
            </Button>
            <Button onClick={handlePrint} className="invoice-action-button invoice-action-button--primary text-white">
              <Printer className="ml-2 h-4 w-4" />
              طباعة / PDF
            </Button>
          </div>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[380px_minmax(0,1fr)_320px]">
          <Card className="screen-only border-white/8 bg-[#0f0f10] shadow-none">
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">{copy.titleLabel}</label>
                <Input
                  value={documentTitle}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                  className="invoice-input text-left"
                  dir={printLanguage === "tr" ? "ltr" : "rtl"}
                  placeholder={copy.defaultTitle}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">{copy.languageLabel}</label>
                <div className="invoice-segmented flex items-center gap-1 rounded-2xl p-1">
                  <button
                    type="button"
                    onClick={() => handleLanguageChange("ar")}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                      printLanguage === "ar" ? "invoice-segmented__active text-white" : "text-slate-300"
                    }`}
                  >
                    {copy.languageArabic}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange("tr")}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                      printLanguage === "tr" ? "invoice-segmented__active text-white" : "text-slate-300"
                    }`}
                  >
                    {copy.languageTurkish}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">{copy.dateLabel}</label>
                <Input
                  type="date"
                  value={documentDate}
                  onChange={(event) => setDocumentDate(event.target.value)}
                  className="invoice-input invoice-input--date text-left"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">{copy.printModeLabel}</label>
                <div className="invoice-segmented flex items-center gap-1 rounded-2xl p-1">
                  <button
                    type="button"
                    onClick={() => setPrintMode("simple")}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                      printMode === "simple" ? "invoice-segmented__active text-white" : "text-slate-300"
                    }`}
                  >
                    {copy.simpleMode}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode("full")}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                      printMode === "full" ? "invoice-segmented__active text-white" : "text-slate-300"
                    }`}
                  >
                    {copy.fullMode}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">{copy.itemsLabel}</label>
                <Textarea
                  value={itemsText}
                  onChange={(event) => setItemsText(event.target.value)}
                  className="invoice-input min-h-[260px] resize-y leading-8"
                  dir="rtl"
                  placeholder=""
                />
                <p className="text-xs text-muted-foreground">{copy.itemsHint}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">{copy.notesLabel}</label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="invoice-input min-h-[110px] resize-y text-left"
                  dir={printLanguage === "tr" ? "ltr" : "rtl"}
                  placeholder={copy.notesPlaceholder}
                />
              </div>
            </CardContent>
          </Card>

          <div className="sales-print-stage">
            <article
              className={`sales-print-sheet ${printLanguage === "ar" ? "sales-print-sheet--rtl" : ""} ${printMode === "simple" ? "sales-print-sheet--simple" : ""}`}
              dir={printLanguage === "tr" ? "ltr" : "rtl"}
            >
              <header className="sales-print-header">
                <div className="sales-print-brand">
                  <img src={logoUrl} alt="Aleryaf logo" className="sales-print-logo" />
                  <div className="sales-print-brand-copy">
                    <div className="sales-print-kicker">ALERYAF</div>
                    <h2 className="sales-print-title">{documentTitle || copy.printTitle}</h2>
                    <p className="sales-print-subtitle">{copy.companyName}</p>
                  </div>
                </div>
                <div className="sales-print-meta">
                  <div>
                    <span>{copy.dateLabel}</span>
                    <strong>{formatDateByLanguage(documentDate, printLanguage)}</strong>
                  </div>
                  <div>
                    <span>{copy.typeLabel}</span>
                    <strong>{printMode === "full" ? copy.fullMode : copy.simpleMode}</strong>
                  </div>
                </div>
              </header>

              <section className="sales-print-table-wrap">
                <table className="sales-print-table">
                  <thead>
                    <tr>
                      <th className="sales-print-col-index">No</th>
                      <th>{copy.itemName}</th>
                      <th className="sales-print-col-price">{copy.kgPrice}</th>
                      <th className="sales-print-col-price">{copy.tonPrice}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesLines.length > 0 ? (
                      salesLines.map((line, index) => (
                        <tr key={line.id}>
                          <td className="sales-print-cell-center">{index + 1}</td>
                          <td className="sales-print-name-cell">
                            <div className="sales-print-name-primary" dir={printLanguage === "tr" ? "ltr" : "rtl"}>
                              {resolveDisplayItemName(line.name, printLanguage)}
                            </div>
                          </td>
                          <td className="sales-print-price-cell">{formatTry(line.pricePerKg)}</td>
                          <td className="sales-print-price-cell">{formatTry(toPricePerTon(line.pricePerKg))}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="sales-print-empty">
                          {copy.emptyList}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              {printMode === "full" && notes.trim() ? (
                <footer className="sales-print-footer">
                  <div className="sales-print-note">{notes}</div>
                </footer>
              ) : null}
            </article>
          </div>

          <Card className="screen-only border-white/8 bg-[#0f0f10] shadow-none">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-foreground">{copy.savedListsTitle}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{copy.savedListsSubtitle}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadSavedLists().catch(() => undefined)}
                  className="border-white/10 text-white hover:bg-white/5"
                >
                  <Download className="ml-2 h-3.5 w-3.5" />
                  تحديث
                </Button>
              </div>

              <div className="sales-saved-list">
                {isLoadingSavedLists ? (
                  <div className="sales-saved-list__empty">جارٍ تحميل القوائم...</div>
                ) : savedLists.length === 0 ? (
                  <div className="sales-saved-list__empty">لا توجد قوائم مبيعات محفوظة بعد.</div>
                ) : (
                  savedLists.map((saved) => (
                    <button
                      key={saved.id}
                      type="button"
                      onClick={() => loadSavedListIntoEditor(saved)}
                      className={`sales-saved-card ${
                        activeSavedListId === saved.id ? "sales-saved-card--active" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-right">
                          <div className="truncate text-sm font-bold text-foreground">{saved.title}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {formatDateByLanguage(saved.salesDate, printLanguage)}
                          </div>
                        </div>
                        <div className="sales-saved-card__badge">
                          {saved.printMode === "full" ? COPY[printLanguage].fullMode : COPY[printLanguage].simpleMode}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
