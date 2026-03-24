import { APP_NAME_AR } from "@/lib/branding";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { preparePrintInvoice, type PrintInvoiceData } from "@/lib/print-invoice";
import logoUrl from "@assets/aleryaf-logo-clean.png";

export function InvoicePrintDocument({ invoice }: { invoice: PrintInvoiceData }) {
  const prepared = preparePrintInvoice(invoice);
  const totalQuantityKg = prepared.lines.reduce((sum, item) => sum + item.quantityKg, 0);

  return (
    <article className="ipd" dir="rtl">
      <header className="ipd__header">
        <div className="ipd__header-logo" aria-hidden="true">
          <img src={logoUrl} alt="Aleryaf logo" className="ipd__logo" />
        </div>

        <div className="ipd__brand">
          <div className="ipd__brand-name">{APP_NAME_AR}</div>
          <div className="ipd__brand-tag">فاتورة مبيعات</div>
        </div>

        <div className="ipd__invoice-meta">
          <div className="ipd__eyebrow">ALERYAF TRADING COMPANY</div>
          <h1 className="ipd__title">فاتورة</h1>
          <div className="ipd__meta-line">رقم الفاتورة: {invoice.invoiceNumber}</div>
          <div className="ipd__meta-line">التاريخ: {formatDate(invoice.invoiceDate)}</div>
        </div>
      </header>

      <section className="ipd__info-grid">
        <div className="ipd__info-box">
          <div className="ipd__info-label">العميل / الزبون</div>
          <div className="ipd__info-value">{invoice.customerName || "-"}</div>
        </div>
        <div className="ipd__info-box">
          <div className="ipd__info-label">الفرع</div>
          <div className="ipd__info-value">{invoice.branchName || "-"}</div>
        </div>
        <div className="ipd__info-box">
          <div className="ipd__info-label">العملة</div>
          <div className="ipd__info-value">{prepared.currencyLabel}</div>
        </div>
        <div className="ipd__info-box">
          <div className="ipd__info-label">رقم الفاتورة</div>
          <div className="ipd__info-value">{invoice.invoiceNumber}</div>
        </div>
      </section>

      <section className="ipd__table-wrap">
        <table className="ipd__table">
          <thead>
            <tr>
              <th style={{ width: "7%" }}>#</th>
              <th className="ipd__th-name" style={{ width: prepared.hasCountColumn ? "29%" : "39%" }}>
                الصنف
              </th>
              {prepared.hasCountColumn ? <th style={{ width: "12%" }}>عدد</th> : null}
              <th style={{ width: "17%" }}>الكمية (كغ)</th>
              <th style={{ width: "17%" }}>سعر الطن</th>
              <th style={{ width: "18%" }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {prepared.lines.length ? (
              prepared.lines.map((item, index) => (
                <tr key={`${item.itemName || item.rawName || "line"}-${index}`}>
                  <td>{index + 1}</td>
                  <td className="ipd__item-name">{item.itemName || item.rawName || "-"}</td>
                  {prepared.hasCountColumn ? (
                    <td>{item.count == null || String(item.count).trim() === "" ? "-" : item.count}</td>
                  ) : null}
                  <td>{formatNumber(item.quantityKg)}</td>
                  <td>{formatCurrency(item.salePricePerKg * 1000, prepared.currency)}</td>
                  <td className="ipd__amount">{formatCurrency(item.revenue, prepared.currency)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={prepared.hasCountColumn ? 6 : 5} className="ipd__empty">
                  لا توجد بنود في هذه الفاتورة
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
              <div className="ipd__notes-label">ملاحظات</div>
              <div className="ipd__notes-body">{invoice.notes}</div>
            </div>
          ) : (
            <div className="ipd__notes-spacer" aria-hidden="true" />
          )}
        </div>

        <div className="ipd__total-card">
          <div className="ipd__total-label">الإجمالي الكلي</div>
          <div className="ipd__total-value">{formatCurrency(prepared.revenue, prepared.currency)}</div>
          <div className="ipd__total-meta">
            <span>إجمالي الكمية</span>
            <strong>{formatNumber(totalQuantityKg)} كغ</strong>
          </div>
        </div>
      </section>

      <footer className="ipd__footer">شكراً لتعاملكم معنا</footer>
    </article>
  );
}
