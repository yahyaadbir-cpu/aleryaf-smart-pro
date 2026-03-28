import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { InvoicePrintDocument } from "@/components/invoice-print-document";
import {
  DX_PRINT_STORAGE_KEY,
  INVOICE_PRINT_PREVIEW_STORAGE_KEY,
  getInvoicePrintDocumentTitle,
  type InvoicePrintLanguage,
  type PrintInvoiceData,
} from "@/lib/print-invoice";
import { useGetInvoice } from "@workspace/api-client-react";
import { markInvoicePrinted } from "@/lib/push-notifications";
import { useAuth } from "@/context/auth";

interface InvoicePrintPageProps {
  invoiceId: number;
}

export function InvoicePrintPage({ invoiceId }: InvoicePrintPageProps) {
  const [, setLocation] = useLocation();
  const hasTriggeredPrintRef = useRef(false);
  const hasMarkedPrintedRef = useRef(false);
  const { user } = useAuth();
  const [overrideInvoice, setOverrideInvoice] = useState<PrintInvoiceData | null>(null);
  const { data: invoice, isLoading } = useGetInvoice(invoiceId, {
    query: {
      refetchOnMount: "always",
    } as any,
  });

  const initialLanguage = useMemo<InvoicePrintLanguage>(() => {
    if (typeof window === "undefined") return "ar";
    const requested = new URLSearchParams(window.location.search).get("lang");
    return requested === "tr" ? "tr" : "ar";
  }, []);

  const [language, setLanguage] = useState<InvoicePrintLanguage>(initialLanguage);

  const effectiveLanguage = user?.canUseTurkishInvoices ? language : "ar";

  const shouldAutoPrint = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("autoprint") === "1";
  }, []);

  const isDxPrint = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("dx") === "1";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storageKey = isDxPrint ? DX_PRINT_STORAGE_KEY : INVOICE_PRINT_PREVIEW_STORAGE_KEY;
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { invoiceId?: number; invoice?: PrintInvoiceData };
      if (parsed.invoiceId === invoiceId && parsed.invoice) {
        setOverrideInvoice(parsed.invoice);
        window.sessionStorage.removeItem(storageKey);
      }
    } catch {
      setOverrideInvoice(null);
    }
  }, [invoiceId, isDxPrint]);

  const printableInvoice = overrideInvoice ?? ((invoice as PrintInvoiceData | undefined) ?? null);

  useEffect(() => {
    if (!user?.canUseTurkishInvoices && language !== "ar") {
      setLanguage("ar");
    }
  }, [language, user?.canUseTurkishInvoices]);

  useEffect(() => {
    document.body.classList.add("invoice-print-mode");

    return () => {
      document.body.classList.remove("invoice-print-mode");
    };
  }, []);

  useEffect(() => {
    if (!printableInvoice) return;

    const previousTitle = document.title;
    document.title = getInvoicePrintDocumentTitle(printableInvoice, effectiveLanguage);

    return () => {
      document.title = previousTitle;
    };
  }, [effectiveLanguage, printableInvoice]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("lang", effectiveLanguage);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [effectiveLanguage]);

  useEffect(() => {
    if (!printableInvoice || hasTriggeredPrintRef.current || !shouldAutoPrint) return;

    hasTriggeredPrintRef.current = true;
    const timer = window.setTimeout(() => {
      if (!hasMarkedPrintedRef.current && !isDxPrint) {
        hasMarkedPrintedRef.current = true;
        markInvoicePrinted(invoiceId, user?.username).catch(() => undefined);
      }
      window.focus();
      window.print();
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [printableInvoice, invoiceId, isDxPrint, shouldAutoPrint, user?.username]);

  const handleManualPrint = () => {
    if (!hasMarkedPrintedRef.current && !isDxPrint) {
      hasMarkedPrintedRef.current = true;
      markInvoicePrinted(invoiceId, user?.username).catch(() => undefined);
    }
    window.focus();
    window.print();
  };

  if (isLoading && !overrideInvoice) {
    return (
      <div className="invoice-print-page">
        <div className="invoice-print-page__status">جاري تحميل معاينة الطباعة...</div>
      </div>
    );
  }

  if (!printableInvoice) {
    return (
      <div className="invoice-print-page">
        <div className="invoice-print-page__status">الفاتورة غير موجودة</div>
      </div>
    );
  }

  return (
    <div className="invoice-print-page">
      <div className="invoice-print-page__toolbar screen-only">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-white">معاينة طباعة الفاتورة</p>
          <p className="mt-1 text-xs text-slate-400">{printableInvoice.invoiceNumber}</p>
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

          <Button variant="outline" onClick={() => setLocation("/invoices")} className="invoice-action-button invoice-action-button--subtle text-white">
            <ArrowRight className="ml-2 h-4 w-4" />
            العودة إلى الفواتير
          </Button>
          <Button onClick={handleManualPrint} className="invoice-preview-print-button invoice-action-button text-white">
            <Printer className="ml-2 h-4 w-4" />
            طباعة
          </Button>
        </div>
      </div>

      <div className="invoice-print-stage">
        <div className="invoice-print-sheet invoice-print-sheet--page">
          <InvoicePrintDocument invoice={printableInvoice} language={effectiveLanguage} />
        </div>
      </div>
    </div>
  );
}
