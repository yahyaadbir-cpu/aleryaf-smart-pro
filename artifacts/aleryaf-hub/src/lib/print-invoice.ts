import { summarizeInvoiceLines, type InvoiceKind } from "./invoice-math";

export type InvoicePrintLanguage = "ar" | "tr";
export type PurchaseInvoiceType = "local_syria" | "local_turkey" | "import";

export interface PrintInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  branchName: string;
  currency: "TRY" | "USD";
  invoiceType?: InvoiceKind;
  purchaseType?: PurchaseInvoiceType;
  customerName?: string;
  notes?: string;
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  items?: Array<{
    itemName?: string;
    rawName?: string;
    count?: number | string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    totalPrice: number;
    totalCost: number;
  }>;
}

function sanitizePrintFileName(value?: string | null) {
  const cleaned = (value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");

  return cleaned || "invoice";
}

export function getInvoicePrintDocumentTitle(
  invoice: PrintInvoiceData,
  language: InvoicePrintLanguage = "ar",
) {
  const customerName = (invoice.customerName ?? "").trim();
  const invoiceType = invoice.invoiceType ?? "sale";

  if (language === "tr") {
    if (customerName) {
      return sanitizePrintFileName(`${invoiceType === "purchase" ? "Alış Faturası" : "Müşteri Faturası"} ${customerName}`);
    }

    return sanitizePrintFileName(`${invoiceType === "purchase" ? "Alış Faturası" : "Fatura"} ${invoice.invoiceNumber}`);
  }

  if (customerName) {
    return sanitizePrintFileName(`${invoiceType === "purchase" ? "فاتورة شراء" : "فاتورة الزبون"} ${customerName}`);
  }

  return sanitizePrintFileName(`${invoiceType === "purchase" ? "فاتورة شراء" : "فاتورة"} ${invoice.invoiceNumber}`);
}

export function preparePrintInvoice(invoice: PrintInvoiceData) {
  const currency = invoice.currency;
  const invoiceType = invoice.invoiceType ?? "sale";
  const summary = summarizeInvoiceLines(invoice.items || [], invoiceType);
  const currencyLabel = currency === "USD" ? "USD" : "TRY";
  const hasCountColumn = summary.lines.some((item) => item.count != null && String(item.count).trim() !== "");

  return {
    currency,
    invoiceType,
    purchaseType: invoice.purchaseType,
    currencyLabel,
    hasCountColumn,
    lines: summary.lines,
    revenue: summary.revenue,
    totalCost: summary.totalCost,
    profit: summary.profit,
  };
}
