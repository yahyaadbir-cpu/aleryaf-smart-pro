import { sql } from "drizzle-orm";
import type { invoicesTable, invoiceItemsTable } from "@workspace/db";

type InvoicesTableRef = typeof invoicesTable;
type InvoiceItemsTableRef = typeof invoiceItemsTable;

export function buildInvoiceFilters(
  invoices: InvoicesTableRef,
  query: {
    dateFrom?: string;
    dateTo?: string;
    branchId?: number;
    currency?: "TRY" | "USD";
    invoiceType?: "sale" | "purchase";
  },
) {
  let conditions = sql`1=1`;
  if (query.dateFrom) conditions = sql`${conditions} AND ${invoices.invoiceDate} >= ${query.dateFrom}`;
  if (query.dateTo) conditions = sql`${conditions} AND ${invoices.invoiceDate} <= ${query.dateTo}`;
  if (query.branchId) conditions = sql`${conditions} AND ${invoices.branchId} = ${query.branchId}`;
  if (query.currency) conditions = sql`${conditions} AND ${invoices.currency} = ${query.currency}`;
  if (query.invoiceType) conditions = sql`${conditions} AND ${invoices.invoiceType} = ${query.invoiceType}`;
  return conditions;
}

export function invoiceRevenueSumExpr(invoiceItems: InvoiceItemsTableRef) {
  return sql<string>`COALESCE(SUM((${invoiceItems.quantity}::numeric) * ((${invoiceItems.unitPrice}::numeric) / 1000)), 0)`;
}

export function invoiceCostSumExpr(invoiceItems: InvoiceItemsTableRef) {
  return sql<string>`COALESCE(SUM((${invoiceItems.quantity}::numeric) * (${invoiceItems.unitCost}::numeric)), 0)`;
}

export function invoiceProfitSumExpr(invoiceItems: InvoiceItemsTableRef) {
  return sql<string>`COALESCE(SUM(((${invoiceItems.quantity}::numeric) * ((${invoiceItems.unitPrice}::numeric) / 1000)) - ((${invoiceItems.quantity}::numeric) * (${invoiceItems.unitCost}::numeric))), 0)`;
}

export function invoiceRevenueValueExpr(invoiceItems: InvoiceItemsTableRef) {
  return sql<string>`((${invoiceItems.quantity}::numeric) * ((${invoiceItems.unitPrice}::numeric) / 1000))`;
}

export function invoiceCostValueExpr(invoiceItems: InvoiceItemsTableRef) {
  return sql<string>`((${invoiceItems.quantity}::numeric) * (${invoiceItems.unitCost}::numeric))`;
}

export function invoiceProfitValueExpr(invoiceItems: InvoiceItemsTableRef) {
  return sql<string>`(((${invoiceItems.quantity}::numeric) * ((${invoiceItems.unitPrice}::numeric) / 1000)) - ((${invoiceItems.quantity}::numeric) * (${invoiceItems.unitCost}::numeric)))`;
}
