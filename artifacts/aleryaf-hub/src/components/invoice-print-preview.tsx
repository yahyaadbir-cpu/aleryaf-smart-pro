import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth";
import {
  INVOICE_PRINT_PREVIEW_STORAGE_KEY,
  type InvoicePrintLanguage,
  type PrintInvoiceData,
} from "@/lib/print-invoice";
import { InvoicePrintDocument } from "@/components/invoice-print-document";

interface InvoicePrintPreviewProps {
  invoice: PrintInvoiceData | null;
  open: boolean;
  onClose: () => void;
  onBackToInvoices: () => void;
  printHref?: string;
}

export function InvoicePrintPreview({
  invoice,
  open,
  onClose,
  onBackToInvoices,
  printHref,
}: InvoicePrintPreviewProps) {
  const { user } = useAuth();
  const [language, setLanguage] = useState<InvoicePrintLanguage>("ar");

  const effectiveLanguage = user?.canUseTurkishInvoices ? language : "ar";
  const finalPrintHref = useMemo(() => {
    if (!printHref) return undefined;
    const separator = printHref.includes("?") ? "&" : "?";
    return `${printHref}${separator}lang=${effectiveLanguage}`;
  }, [effectiveLanguage, printHref]);

  useEffect(() => {
    if (!open) return;

    document.body.classList.add("invoice-print-mode", "invoice-preview-open");

    return () => {
      document.body.classList.remove("invoice-preview-open");

      if (!document.querySelector(".invoice-print-page")) {
        document.body.classList.remove("invoice-print-mode");
      }
    };
  }, [open]);

  if (!open || !invoice) {
    return null;
  }

  const handlePrint = () => {
    if (finalPrintHref) {
      const matchedInvoiceId = finalPrintHref.match(/\/invoices\/(\d+)\/print/);
      if (typeof window !== "undefined" && matchedInvoiceId && invoice) {
        window.sessionStorage.setItem(
          INVOICE_PRINT_PREVIEW_STORAGE_KEY,
          JSON.stringify({
            invoiceId: Number(matchedInvoiceId[1]),
            invoice,
          }),
        );
      }
      window.location.assign(finalPrintHref);
      return;
    }

    window.print();
  };

  return (
    <div className="invoice-preview-overlay">
      <div className="invoice-preview-shell">
        <div className="invoice-preview-toolbar screen-only">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-white">معاينة طباعة الفاتورة</p>
            <p className="mt-1 text-xs text-slate-400">{invoice.invoiceNumber}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {user?.canUseTurkishInvoices ? (
              <div className="invoice-segmented flex items-center gap-1 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => setLanguage("ar")}
                  className={`rounded-xl px-3 py-2 text-sm font-bold transition ${effectiveLanguage === "ar" ? "invoice-segmented__active text-white" : "text-slate-300"}`}
                >
                  العربية
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage("tr")}
                  className={`rounded-xl px-3 py-2 text-sm font-bold transition ${effectiveLanguage === "tr" ? "invoice-segmented__active text-white" : "text-slate-300"}`}
                >
                  Türkçe
                </button>
              </div>
            ) : null}

            <Button variant="outline" onClick={onBackToInvoices} className="invoice-action-button invoice-action-button--subtle text-white">
              <ArrowRight className="ml-2 h-4 w-4" />
              العودة إلى الفواتير
            </Button>
            <Button onClick={handlePrint} className="invoice-preview-print-button invoice-action-button text-white">
              <Printer className="ml-2 h-4 w-4" />
              طباعة
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="self-end text-slate-300 hover:bg-white/10 hover:text-white sm:self-auto">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="invoice-print-stage">
          <div className="invoice-print-sheet">
            <InvoicePrintDocument invoice={invoice} language={effectiveLanguage} />
          </div>
        </div>
      </div>
    </div>
  );
}
