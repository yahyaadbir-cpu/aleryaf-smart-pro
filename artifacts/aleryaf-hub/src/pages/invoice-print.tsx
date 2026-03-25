import { useEffect, useMemo, useRef } from "react";
import { ArrowRight, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { InvoicePrintDocument } from "@/components/invoice-print-document";
import { getInvoicePrintDocumentTitle, type PrintInvoiceData } from "@/lib/print-invoice";
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
  const { data: invoice, isLoading } = useGetInvoice(invoiceId, {
    query: {
      refetchOnMount: "always",
    } as any,
  });

  const shouldAutoPrint = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("autoprint") === "1";
  }, []);

  useEffect(() => {
    if (!invoice) return;

    const previousTitle = document.title;
    document.title = getInvoicePrintDocumentTitle(invoice as PrintInvoiceData);

    return () => {
      document.title = previousTitle;
    };
  }, [invoice]);

  useEffect(() => {
    if (!invoice || hasTriggeredPrintRef.current || !shouldAutoPrint) return;

    hasTriggeredPrintRef.current = true;
    const timer = window.setTimeout(() => {
      if (!hasMarkedPrintedRef.current) {
        hasMarkedPrintedRef.current = true;
        markInvoicePrinted(invoiceId, user?.username).catch(() => undefined);
      }
      window.focus();
      window.print();
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [invoice, shouldAutoPrint]);

  const handleManualPrint = () => {
    if (!hasMarkedPrintedRef.current) {
      hasMarkedPrintedRef.current = true;
      markInvoicePrinted(invoiceId, user?.username).catch(() => undefined);
    }
    window.focus();
    window.print();
  };

  if (isLoading) {
    return (
      <div className="invoice-print-page">
        <div className="invoice-print-page__status">جار تحميل معاينة الطباعة...</div>
      </div>
    );
  }

  if (!invoice) {
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
          <p className="mt-1 text-xs text-slate-400">{invoice.invoiceNumber}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
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
          <InvoicePrintDocument invoice={invoice as PrintInvoiceData} />
        </div>
      </div>
    </div>
  );
}
