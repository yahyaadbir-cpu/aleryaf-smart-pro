import { useMemo, useState } from "react";
import { Printer, RotateCcw } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { APP_NAME_EN } from "@/lib/branding";

type SalesPrintMode = "full" | "simple";

interface SalesLine {
  id: string;
  name: string;
  price: number | null;
}

const DEFAULT_ITEMS = [
  "قرفه مطحونه 3200",
  "كركم مطحون 3000",
  "سمسم احمر 1900",
].join("\n");

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
      const price = match?.[2] ? parsePrice(match[2]) : null;

      return {
        id: `${index}-${name}`,
        name,
        price,
      };
    })
    .filter((line): line is SalesLine => Boolean(line));
}

function formatTry(value: number | null) {
  if (value === null) return "-";

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTurkishDate(value: string) {
  if (!value) return "-";

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("tr-TR", {
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
  const [documentTitle, setDocumentTitle] = useState("Satis Listesi");
  const [documentDate, setDocumentDate] = useState(getTodayValue);
  const [printMode, setPrintMode] = useState<SalesPrintMode>("full");
  const [notes, setNotes] = useState("");
  const [itemsText, setItemsText] = useState(DEFAULT_ITEMS);

  const salesLines = useMemo(() => parseSalesLines(itemsText), [itemsText]);
  const totalAmount = useMemo(
    () => salesLines.reduce((sum, line) => sum + (line.price ?? 0), 0),
    [salesLines],
  );

  const handlePrint = () => {
    window.focus();
    window.print();
  };

  const handleReset = () => {
    setDocumentTitle("Satis Listesi");
    setDocumentDate(getTodayValue());
    setPrintMode("full");
    setNotes("");
    setItemsText(DEFAULT_ITEMS);
  };

  return (
    <Layout>
      <div className="sales-list-page flex flex-col gap-4 sm:gap-6">
        <div className="screen-only flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="invoice-page-title font-display font-bold text-foreground">قائمة مبيعات</h1>
            <p className="invoice-page-subtitle">
              جهز كشف مبيعات باللغة التركية ثم اطبعه أو احفظه كملف PDF.
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
            <Button onClick={handlePrint} className="invoice-action-button invoice-action-button--primary text-white">
              <Printer className="ml-2 h-4 w-4" />
              طباعة / PDF
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="screen-only border-white/8 bg-[#0f0f10] shadow-none">
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">Başlık</label>
                <Input
                  value={documentTitle}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                  className="invoice-input text-left"
                  dir="ltr"
                  placeholder="Satis Listesi"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">Tarih</label>
                <Input
                  type="date"
                  value={documentDate}
                  onChange={(event) => setDocumentDate(event.target.value)}
                  className="invoice-input invoice-input--date text-left"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">Yazdirma Turu</label>
                <div className="invoice-segmented flex items-center gap-1 rounded-2xl p-1">
                  <button
                    type="button"
                    onClick={() => setPrintMode("full")}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                      printMode === "full" ? "invoice-segmented__active text-white" : "text-slate-300"
                    }`}
                  >
                    Tam Fatura
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode("simple")}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                      printMode === "simple" ? "invoice-segmented__active text-white" : "text-slate-300"
                    }`}
                  >
                    Faturasiz Liste
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">Urunler ve fiyatlar</label>
                <Textarea
                  value={itemsText}
                  onChange={(event) => setItemsText(event.target.value)}
                  className="invoice-input min-h-[260px] resize-y leading-8"
                  dir="rtl"
                  placeholder={"قرفه مطحونه 3200\nكركم مطحون 3000"}
                />
                <p className="text-xs text-muted-foreground">
                  كل سطر يكون بالشكل: اسم المنتج ثم السعر في النهاية.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">Not</label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="invoice-input min-h-[110px] resize-y text-left"
                  dir="ltr"
                  placeholder="Teslimat veya aciklama notu"
                />
              </div>
            </CardContent>
          </Card>

          <div className="sales-print-stage">
            <article
              className={`sales-print-sheet ${printMode === "simple" ? "sales-print-sheet--simple" : ""}`}
              dir="ltr"
            >
              <header className="sales-print-header">
                <div>
                  <div className="sales-print-kicker">ALERYAF</div>
                  <h2 className="sales-print-title">{documentTitle || "Satis Listesi"}</h2>
                  <p className="sales-print-subtitle">{APP_NAME_EN}</p>
                </div>
                <div className="sales-print-meta">
                  <div>
                    <span>Tarih</span>
                    <strong>{formatTurkishDate(documentDate)}</strong>
                  </div>
                  {printMode === "simple" ? (
                    <div>
                      <span>Liste</span>
                      <strong>Satis Listesi</strong>
                    </div>
                  ) : null}
                </div>
              </header>

              {printMode === "full" ? (
                <section className="sales-print-summary">
                  <div className="sales-print-summary-card">
                    <span>Toplam Kalem</span>
                    <strong>{salesLines.length}</strong>
                  </div>
                  <div className="sales-print-summary-card">
                    <span>Genel Toplam</span>
                    <strong>{formatTry(totalAmount)}</strong>
                  </div>
                  <div className="sales-print-summary-card">
                    <span>Not</span>
                    <strong>{notes || "-"}</strong>
                  </div>
                </section>
              ) : null}

              <section className="sales-print-table-wrap">
                <table className="sales-print-table">
                  <thead>
                    <tr>
                      <th className="sales-print-col-index">No</th>
                      <th>Urun Adi</th>
                      <th className="sales-print-col-price">Fiyat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesLines.length > 0 ? (
                      salesLines.map((line, index) => (
                        <tr key={line.id}>
                          <td className="sales-print-cell-center">{index + 1}</td>
                          <td className="sales-print-name-cell" dir="rtl">
                            {line.name}
                          </td>
                          <td className="sales-print-price-cell">{formatTry(line.price)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="sales-print-empty">
                          Liste bos. Sol taraftan urunleri ekleyin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              <footer className="sales-print-footer">
                <div className="sales-print-total">
                  <span>Toplam</span>
                  <strong>{formatTry(totalAmount)}</strong>
                </div>
                <div className="sales-print-note">
                  {printMode === "full"
                    ? notes || "Not eklenmedi."
                    : "Bu belge hizli satis listesi olarak hazirlanmistir."}
                </div>
              </footer>
            </article>
          </div>
        </div>
      </div>
    </Layout>
  );
}
