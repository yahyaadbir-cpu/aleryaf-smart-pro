import { APP_NAME_AR } from "@/lib/branding";
import { preparePrintInvoice, type InvoicePrintLanguage, type PrintInvoiceData } from "@/lib/print-invoice";
import logoUrl from "@assets/aleryaf-logo-clean.png";

function formatCurrencyByLanguage(amount: number, currency: "TRY" | "USD", language: InvoicePrintLanguage) {
  return new Intl.NumberFormat(language === "tr" ? "tr-TR" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumberByLanguage(value: number, language: InvoicePrintLanguage) {
  return new Intl.NumberFormat(language === "tr" ? "tr-TR" : "en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateByLanguage(value: string, language: InvoicePrintLanguage) {
  return new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

const TURKISH_ITEM_NAMES: Record<string, string> = {
  "حمص كسر": "Kırık Nohut",
  "حمص 7 ملم": "7 mm Nohut",
  "حمص 8.5 ملم": "8.5 mm Nohut",
  "جوز صيني": "Çin Cevizi",
};

const TURKISH_BRANCH_NAMES: Record<string, string> = {
  "سوريا": "Suriye",
  "مرسين": "Mersin",
  "اسطنبول": "İstanbul",
  "إسطنبول": "İstanbul",
};

function translateKnownValue(value: string | undefined, map: Record<string, string>) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "-";
  return map[normalized] ?? normalized;
}

function getArabicPurchaseTypeLabel(value?: string) {
  switch (value) {
    case "local_syria":
      return "محلي سوريا";
    case "local_turkey":
      return "محلي تركيا";
    case "import":
      return "استيراد";
    default:
      return "-";
  }
}

function getTurkishPurchaseTypeLabel(value?: string) {
  switch (value) {
    case "local_syria":
      return "Suriye Yerel";
    case "local_turkey":
      return "Türkiye Yerel";
    case "import":
      return "İthalat";
    default:
      return "-";
  }
}

const COPY = {
  ar: {
    dir: "rtl" as const,
    articleClass: "ipd ipd--print-doc",
    companyName: APP_NAME_AR,
    saleBrandTag: "فاتورة مبيعات",
    purchaseBrandTag: "فاتورة شراء",
    saleTitle: "فاتورة مبيعات",
    purchaseTitle: "فاتورة شراء",
    eyebrow: "ALERYAF TRADING COMPANY",
    saleCustomer: "العميل / الزبون",
    purchaseCustomer: "المورد / الجهة",
    branch: "الفرع",
    purchaseType: "نوع الشراء",
    currency: "العملة",
    invoiceNumber: "رقم الفاتورة",
    item: "الصنف",
    count: "عدد",
    quantity: "الكمية",
    salePrice: "سعر الطن",
    purchasePrice: "السعر",
    total: "الإجمالي",
    notes: "ملاحظات",
    saleGrandTotal: "إجمالي المبيعات",
    purchaseGrandTotal: "إجمالي الشراء",
    totalQuantity: "إجمالي الكمية",
    date: "التاريخ",
    thanks: "شكراً لتعاملكم معنا",
    empty: "لا توجد بنود في هذه الفاتورة",
  },
  tr: {
    dir: "ltr" as const,
    articleClass: "ipd ipd--print-doc ipd--ltr",
    companyName: "Aleryaf Ticaret Şirketi",
    saleBrandTag: "Satış Faturası",
    purchaseBrandTag: "Alış Faturası",
    saleTitle: "Satış Faturası",
    purchaseTitle: "Alış Faturası",
    eyebrow: "ALERYAF TRADING COMPANY",
    saleCustomer: "Müşteri",
    purchaseCustomer: "Tedarikçi",
    branch: "Şube",
    purchaseType: "Alış Türü",
    currency: "Para Birimi",
    invoiceNumber: "Fatura No",
    item: "Ürün",
    count: "Adet",
    quantity: "Miktar",
    salePrice: "Ton Fiyatı",
    purchasePrice: "Birim Fiyat",
    total: "Toplam",
    notes: "Notlar",
    saleGrandTotal: "Toplam Satış",
    purchaseGrandTotal: "Toplam Alış",
    totalQuantity: "Toplam Miktar",
    date: "Tarih",
    thanks: "Teşekkür ederiz",
    empty: "Bu faturada kalem bulunmuyor",
  },
};

export function InvoicePrintDocument({
  invoice,
  language = "ar",
}: {
  invoice: PrintInvoiceData;
  language?: InvoicePrintLanguage;
}) {
  const prepared = preparePrintInvoice(invoice);
  const totalQuantity = prepared.lines.reduce((sum, item) => sum + item.quantityKg, 0);
  const copy = COPY[language];
  const isPurchase = prepared.invoiceType === "purchase";
  const branchName = language === "tr" ? translateKnownValue(invoice.branchName, TURKISH_BRANCH_NAMES) : invoice.branchName || "-";
  const customerLabel = isPurchase ? copy.purchaseCustomer : copy.saleCustomer;
  const priceLabel = isPurchase ? copy.purchasePrice : copy.salePrice;
  const totalLabel = isPurchase ? copy.purchaseGrandTotal : copy.saleGrandTotal;
  const purchaseTypeLabel = language === "tr"
    ? getTurkishPurchaseTypeLabel(prepared.purchaseType)
    : getArabicPurchaseTypeLabel(prepared.purchaseType);

  return (
    <article className={copy.articleClass} dir={copy.dir}>
      <header className="ipd__header">
        <div className="ipd__header-logo" aria-hidden="true">
          <img src={logoUrl} alt="Aleryaf logo" className="ipd__logo" />
        </div>

        <div className="ipd__brand">
          <div className="ipd__brand-name">{copy.companyName}</div>
          <div className="ipd__brand-tag">{isPurchase ? copy.purchaseBrandTag : copy.saleBrandTag}</div>
        </div>

        <div className="ipd__invoice-meta">
          <div className="ipd__eyebrow">{copy.eyebrow}</div>
          <h1 className="ipd__title">{isPurchase ? copy.purchaseTitle : copy.saleTitle}</h1>
          <div className="ipd__meta-line">
            {copy.invoiceNumber}: {invoice.invoiceNumber}
          </div>
          <div className="ipd__meta-line">
            {copy.date}: {formatDateByLanguage(invoice.invoiceDate, language)}
          </div>
        </div>
      </header>

      <section className="ipd__info-grid">
        <div className="ipd__info-box">
          <div className="ipd__info-label">{customerLabel}</div>
          <div className="ipd__info-value">{invoice.customerName || "-"}</div>
        </div>
        <div className="ipd__info-box">
          <div className="ipd__info-label">{copy.branch}</div>
          <div className="ipd__info-value">{branchName}</div>
        </div>
        <div className="ipd__info-box">
          <div className="ipd__info-label">{copy.currency}</div>
          <div className="ipd__info-value">{prepared.currencyLabel}</div>
        </div>
        <div className="ipd__info-box">
          <div className="ipd__info-label">{copy.invoiceNumber}</div>
          <div className="ipd__info-value">{invoice.invoiceNumber}</div>
        </div>
        {isPurchase ? (
          <div className="ipd__info-box">
            <div className="ipd__info-label">{copy.purchaseType}</div>
            <div className="ipd__info-value">{purchaseTypeLabel}</div>
          </div>
        ) : null}
      </section>

      <section className="ipd__table-wrap">
        <table className="ipd__table">
          <thead>
            <tr>
              <th style={{ width: "7%" }}>#</th>
              <th className="ipd__th-name" style={{ width: prepared.hasCountColumn ? "29%" : "39%" }}>
                {copy.item}
              </th>
              {prepared.hasCountColumn ? <th style={{ width: "12%" }}>{copy.count}</th> : null}
              <th style={{ width: "17%" }}>{copy.quantity}</th>
              <th style={{ width: "17%" }}>{priceLabel}</th>
              <th style={{ width: "18%" }}>{copy.total}</th>
            </tr>
          </thead>
          <tbody>
            {prepared.lines.length ? (
              prepared.lines.map((item, index) => {
                const itemName = item.itemName || item.rawName || "-";
                const translatedItemName =
                  language === "tr" ? translateKnownValue(itemName, TURKISH_ITEM_NAMES) : itemName;
                const displayedUnitPrice = isPurchase ? item.salePricePerKg : item.salePricePerKg * 1000;

                return (
                  <tr key={`${item.itemName || item.rawName || "line"}-${index}`}>
                    <td>{index + 1}</td>
                    <td className="ipd__item-name">{translatedItemName}</td>
                    {prepared.hasCountColumn ? (
                      <td>{item.count == null || String(item.count).trim() === "" ? "-" : item.count}</td>
                    ) : null}
                    <td>{formatNumberByLanguage(item.quantityKg, language)}</td>
                    <td>{formatCurrencyByLanguage(displayedUnitPrice, prepared.currency, language)}</td>
                    <td className="ipd__amount">{formatCurrencyByLanguage(item.revenue, prepared.currency, language)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={prepared.hasCountColumn ? 6 : 5} className="ipd__empty">
                  {copy.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="ipd__totals-row">
        <div className="ipd__side-stack">
          {invoice.notes ? (
            <div className="ipd__notes">
              <div className="ipd__notes-label">{copy.notes}</div>
              <div className="ipd__notes-body">{invoice.notes}</div>
            </div>
          ) : (
            <div className="ipd__notes-spacer" aria-hidden="true" />
          )}
        </div>

        <div className="ipd__total-card">
          <div className="ipd__total-label">{totalLabel}</div>
          <div className="ipd__total-value">{formatCurrencyByLanguage(prepared.revenue, prepared.currency, language)}</div>
          <div className="ipd__total-meta">
            <span>{copy.totalQuantity}</span>
            <strong>{formatNumberByLanguage(totalQuantity, language)}</strong>
          </div>
        </div>
      </section>

      <footer className="ipd__footer">{copy.thanks}</footer>
    </article>
  );
}
