import { APP_NAME_AR } from "@/lib/branding";
import logoUrl from "@assets/aleryaf-logo-clean.png";

export type SalesListPrintLanguage = "ar" | "tr";
export type SalesListCurrency = "TRY" | "USD";
export type SalesListPrintMode = "full" | "simple";

export interface SalesListPrintLine {
  name: string;
  pricePerKg: number | null;
  pricePerTon: number | null;
}

const COPY = {
  ar: {
    dir: "rtl" as const,
    articleClass: "ipd ipd--print-doc",
    companyName: APP_NAME_AR,
    brandTag: "قائمة أسعار",
    title: "قائمة مبيعات",
    date: "التاريخ",
    mode: "النوع",
    item: "الصنف",
    kgPrice: "سعر الكيلو",
    tonPrice: "سعر الطن",
    notes: "ملاحظات",
    fullMode: "فاتورة كاملة",
    simpleMode: "بدون فاتورة",
    empty: "لا توجد بنود في هذه القائمة",
  },
  tr: {
    dir: "ltr" as const,
    articleClass: "ipd ipd--print-doc ipd--ltr",
    companyName: "Aleryaf Ticaret Şirketi",
    brandTag: "Satış Listesi",
    title: "Satış Listesi",
    date: "Tarih",
    mode: "Tür",
    item: "Ürün",
    kgPrice: "Kg Fiyatı",
    tonPrice: "Ton Fiyatı",
    notes: "Notlar",
    fullMode: "Tam Fatura",
    simpleMode: "Faturasız Liste",
    empty: "Bu listede kalem bulunmuyor",
  },
} as const;

function formatCurrencyByLanguage(amount: number | null, currency: SalesListCurrency, language: SalesListPrintLanguage) {
  if (amount == null) return "-";

  return new Intl.NumberFormat(language === "tr" ? "tr-TR" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateByLanguage(value: string, language: SalesListPrintLanguage) {
  return new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "ar-SY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function SalesListPrintDocument({
  language,
  currency,
  printMode,
  showMode = true,
  salesDate,
  notes,
  lines,
}: {
  language: SalesListPrintLanguage;
  currency: SalesListCurrency;
  printMode: SalesListPrintMode;
  showMode?: boolean;
  salesDate: string;
  notes: string;
  lines: SalesListPrintLine[];
}) {
  const copy = COPY[language];

  return (
    <article className={copy.articleClass} dir={copy.dir}>
      <header className="ipd__header">
        <div className="ipd__header-logo" aria-hidden="true">
          <img src={logoUrl} alt="Aleryaf logo" className="ipd__logo" />
        </div>

        <div className="ipd__brand">
          <div className="ipd__brand-name">{copy.companyName}</div>
          <div className="ipd__brand-tag">{copy.brandTag}</div>
        </div>

        <div className="ipd__invoice-meta">
          <h1 className="ipd__title">{copy.title}</h1>
          <div className="ipd__meta-stack">
            <div className="ipd__meta-line">
              {copy.date}: {formatDateByLanguage(salesDate, language)}
            </div>
            {showMode ? (
              <div className="ipd__mode-line">
                <span className="ipd__mode-value">{printMode === "full" ? copy.fullMode : copy.simpleMode}</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="ipd__table-wrap">
        <table className="ipd__table">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>#</th>
              <th className="ipd__th-name" style={{ width: "42%" }}>
                {copy.item}
              </th>
              <th style={{ width: "25%" }}>{copy.kgPrice}</th>
              <th style={{ width: "25%" }}>{copy.tonPrice}</th>
            </tr>
          </thead>
          <tbody>
            {lines.length ? (
              lines.map((line, index) => (
                <tr key={`${line.name}-${index}`}>
                  <td>{index + 1}</td>
                  <td className="ipd__item-name">{line.name}</td>
                  <td>{formatCurrencyByLanguage(line.pricePerKg, currency, language)}</td>
                  <td className="ipd__amount">{formatCurrencyByLanguage(line.pricePerTon, currency, language)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="ipd__empty">
                  {copy.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {printMode === "full" && notes.trim() ? (
        <section className="ipd__totals-row">
          <div className="ipd__side-stack">
            <div className="ipd__notes">
              <div className="ipd__notes-label">{copy.notes}</div>
              <div className="ipd__notes-body">{notes}</div>
            </div>
          </div>
          <div className="ipd__notes-spacer" aria-hidden="true" />
        </section>
      ) : null}
    </article>
  );
}
