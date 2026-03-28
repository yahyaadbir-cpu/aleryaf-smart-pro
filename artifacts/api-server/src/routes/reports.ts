import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendNotification } from "../lib/push-notifications";

const router: IRouter = Router();

const reportQuerySchema = z.object({
  period: z.enum(["weekly", "monthly"]).default("weekly"),
  date: z.string().optional(),
});

const reportNotifyBodySchema = reportQuerySchema;

const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatArabicDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function resolveReportRange(period: "weekly" | "monthly", requestedDate?: string) {
  const baseDate = requestedDate ? new Date(`${requestedDate}T12:00:00`) : new Date();
  const safeBaseDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

  if (period === "monthly") {
    const startDate = new Date(safeBaseDate.getFullYear(), safeBaseDate.getMonth(), 1);
    const endDate = new Date(safeBaseDate.getFullYear(), safeBaseDate.getMonth() + 1, 0);
    return {
      period,
      startDate: toIsoDate(startDate),
      endDate: toIsoDate(endDate),
      label: `تقرير ${ARABIC_MONTHS[startDate.getMonth()]} ${startDate.getFullYear()}`,
      notifyTitle: "تقرير الشركة الشهري جاهز",
    };
  }

  const startDate = new Date(safeBaseDate);
  const day = startDate.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  startDate.setDate(startDate.getDate() + offsetToMonday);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  return {
    period,
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(endDate),
    label: `التقرير الأسبوعي من ${formatArabicDate(toIsoDate(startDate))} إلى ${formatArabicDate(toIsoDate(endDate))}`,
    notifyTitle: "تقرير الشركة الأسبوعي جاهز",
  };
}

async function buildCompanyReport(period: "weekly" | "monthly", requestedDate?: string) {
  const range = resolveReportRange(period, requestedDate);
  const { startDate, endDate } = range;

  const [summaryResult, branchResult, customersResult, itemsResult, categoryResult, timelineResult, recentInvoicesResult, inventoryResult] =
    await Promise.all([
      db.execute(sql`
        WITH invoice_totals AS (
          SELECT
            inv.id,
            inv.invoice_number,
            inv.invoice_type,
            inv.currency,
            inv.branch_id,
            COALESCE(NULLIF(BTRIM(inv.customer_name), ''), 'بدون اسم') AS customer_name,
            inv.invoice_date,
            COALESCE(SUM((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)), 0) AS revenue,
            COALESCE(SUM((ii.quantity::numeric) * (ii.unit_cost::numeric)), 0) AS cost
          FROM invoices inv
          LEFT JOIN invoice_items ii ON ii.invoice_id = inv.id
          WHERE inv.invoice_date >= ${startDate}
            AND inv.invoice_date <= ${endDate}
          GROUP BY inv.id
        ),
        inventory_snapshot AS (
          WITH latest_import AS (
            SELECT DISTINCT ON (ir.item_id)
              ir.item_id,
              COALESCE(ir.normalized_qty_kg, ir.quantity)::numeric AS opening_balance,
              ir.cost_try::numeric AS unit_cost_try,
              ir.cost_usd::numeric AS unit_cost_usd,
              ii.import_date
            FROM inventory_import_rows ir
            JOIN inventory_imports ii ON ii.id = ir.import_id
            WHERE ir.matched = 1 AND ir.item_id IS NOT NULL
            ORDER BY ir.item_id, ii.import_date DESC, ii.id DESC
          ),
          sold_after AS (
            SELECT
              inv_items.item_id,
              COALESCE(SUM(inv_items.quantity::numeric), 0) AS sold_qty
            FROM invoice_items inv_items
            JOIN invoices inv ON inv.id = inv_items.invoice_id
            JOIN latest_import li ON li.item_id = inv_items.item_id AND inv.invoice_type = 'sale' AND inv.invoice_date > li.import_date
            GROUP BY inv_items.item_id
          )
          SELECT
            COUNT(*) FILTER (WHERE i.is_active = true) AS total_items,
            COUNT(*) FILTER (
              WHERE i.is_active = true
              AND GREATEST(COALESCE(li.opening_balance, 0) - COALESCE(sa.sold_qty, 0), 0) <= COALESCE(i.min_stock::numeric, 0)
            ) AS low_stock_count,
            COALESCE(SUM(
              GREATEST(COALESCE(li.opening_balance, 0) - COALESCE(sa.sold_qty, 0), 0) * COALESCE(li.unit_cost_try, i.unit_cost_try::numeric, 0)
            ), 0) AS inventory_value_try,
            COALESCE(SUM(
              GREATEST(COALESCE(li.opening_balance, 0) - COALESCE(sa.sold_qty, 0), 0) * COALESCE(li.unit_cost_usd, i.unit_cost_usd::numeric, 0)
            ), 0) AS inventory_value_usd
          FROM items i
          LEFT JOIN latest_import li ON li.item_id = i.id
          LEFT JOIN sold_after sa ON sa.item_id = i.id
        )
        SELECT
          COUNT(*) FILTER (WHERE invoice_type = 'sale') AS sales_invoice_count,
          COUNT(*) FILTER (WHERE invoice_type = 'purchase') AS purchase_invoice_count,
          COUNT(DISTINCT customer_name) FILTER (WHERE invoice_type = 'sale') AS customers_count,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'TRY' THEN revenue ELSE 0 END), 0) AS sales_revenue_try,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'USD' THEN revenue ELSE 0 END), 0) AS sales_revenue_usd,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'TRY' THEN cost ELSE 0 END), 0) AS sales_cost_try,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'USD' THEN cost ELSE 0 END), 0) AS sales_cost_usd,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'TRY' THEN revenue - cost ELSE 0 END), 0) AS sales_profit_try,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'USD' THEN revenue - cost ELSE 0 END), 0) AS sales_profit_usd,
          COALESCE(SUM(CASE WHEN invoice_type = 'purchase' AND currency = 'TRY' THEN revenue ELSE 0 END), 0) AS purchase_spend_try,
          COALESCE(SUM(CASE WHEN invoice_type = 'purchase' AND currency = 'USD' THEN revenue ELSE 0 END), 0) AS purchase_spend_usd,
          (SELECT COUNT(*) FROM branches WHERE is_active = true) AS active_branches_count,
          MAX(inventory_snapshot.total_items) AS total_items,
          MAX(inventory_snapshot.low_stock_count) AS low_stock_count,
          MAX(inventory_snapshot.inventory_value_try) AS inventory_value_try,
          MAX(inventory_snapshot.inventory_value_usd) AS inventory_value_usd
        FROM invoice_totals, inventory_snapshot
      `),
      db.execute(sql`
        WITH invoice_totals AS (
          SELECT
            inv.id,
            inv.invoice_type,
            inv.currency,
            inv.branch_id,
            COALESCE(SUM((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)), 0) AS revenue,
            COALESCE(SUM((ii.quantity::numeric) * (ii.unit_cost::numeric)), 0) AS cost
          FROM invoices inv
          LEFT JOIN invoice_items ii ON ii.invoice_id = inv.id
          WHERE inv.invoice_date >= ${startDate}
            AND inv.invoice_date <= ${endDate}
          GROUP BY inv.id
        )
        SELECT
          b.id AS branch_id,
          b.name AS branch_name,
          b.code AS branch_code,
          COUNT(*) FILTER (WHERE it.invoice_type = 'sale') AS sales_invoice_count,
          COUNT(*) FILTER (WHERE it.invoice_type = 'purchase') AS purchase_invoice_count,
          COALESCE(SUM(CASE WHEN it.invoice_type = 'sale' AND it.currency = 'TRY' THEN it.revenue ELSE 0 END), 0) AS revenue_try,
          COALESCE(SUM(CASE WHEN it.invoice_type = 'sale' AND it.currency = 'USD' THEN it.revenue ELSE 0 END), 0) AS revenue_usd,
          COALESCE(SUM(CASE WHEN it.invoice_type = 'sale' AND it.currency = 'TRY' THEN it.cost ELSE 0 END), 0) AS cost_try,
          COALESCE(SUM(CASE WHEN it.invoice_type = 'sale' AND it.currency = 'USD' THEN it.cost ELSE 0 END), 0) AS cost_usd,
          COALESCE(SUM(CASE WHEN it.invoice_type = 'sale' AND it.currency = 'TRY' THEN it.revenue - it.cost ELSE 0 END), 0) AS profit_try,
          COALESCE(SUM(CASE WHEN it.invoice_type = 'sale' AND it.currency = 'USD' THEN it.revenue - it.cost ELSE 0 END), 0) AS profit_usd
        FROM branches b
        LEFT JOIN invoice_totals it ON it.branch_id = b.id
        GROUP BY b.id, b.name, b.code
        ORDER BY b.name
      `),
      db.execute(sql`
        WITH invoice_totals AS (
          SELECT
            inv.id,
            inv.currency,
            COALESCE(NULLIF(BTRIM(inv.customer_name), ''), 'بدون اسم') AS customer_name,
            inv.invoice_date,
            COALESCE(SUM((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)), 0) AS revenue,
            COALESCE(SUM((ii.quantity::numeric) * (ii.unit_cost::numeric)), 0) AS cost
          FROM invoices inv
          LEFT JOIN invoice_items ii ON ii.invoice_id = inv.id
          WHERE inv.invoice_type = 'sale'
            AND inv.invoice_date >= ${startDate}
            AND inv.invoice_date <= ${endDate}
          GROUP BY inv.id
        )
        SELECT
          customer_name,
          COUNT(*) AS invoice_count,
          MAX(invoice_date)::text AS last_invoice_date,
          COALESCE(SUM(CASE WHEN currency = 'TRY' THEN revenue ELSE 0 END), 0) AS revenue_try,
          COALESCE(SUM(CASE WHEN currency = 'USD' THEN revenue ELSE 0 END), 0) AS revenue_usd,
          COALESCE(SUM(CASE WHEN currency = 'TRY' THEN revenue - cost ELSE 0 END), 0) AS profit_try,
          COALESCE(SUM(CASE WHEN currency = 'USD' THEN revenue - cost ELSE 0 END), 0) AS profit_usd
        FROM invoice_totals
        GROUP BY customer_name
        ORDER BY GREATEST(
          COALESCE(SUM(CASE WHEN currency = 'TRY' THEN revenue ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN currency = 'USD' THEN revenue ELSE 0 END), 0)
        ) DESC
        LIMIT 8
      `),
      db.execute(sql`
        SELECT
          i.id AS item_id,
          i.code AS item_code,
          i.name AS item_name,
          COALESCE(i.category, 'غير مصنف') AS category,
          COALESCE(SUM(ii.quantity::numeric), 0) AS quantity_sold,
          COALESCE(SUM(CASE WHEN inv.currency = 'TRY' THEN (ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000) ELSE 0 END), 0) AS revenue_try,
          COALESCE(SUM(CASE WHEN inv.currency = 'USD' THEN (ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000) ELSE 0 END), 0) AS revenue_usd,
          COALESCE(SUM(CASE WHEN inv.currency = 'TRY' THEN ((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)) - ((ii.quantity::numeric) * (ii.unit_cost::numeric)) ELSE 0 END), 0) AS profit_try,
          COALESCE(SUM(CASE WHEN inv.currency = 'USD' THEN ((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)) - ((ii.quantity::numeric) * (ii.unit_cost::numeric)) ELSE 0 END), 0) AS profit_usd
        FROM invoice_items ii
        JOIN invoices inv ON inv.id = ii.invoice_id AND inv.invoice_type = 'sale'
        LEFT JOIN items i ON i.id = ii.item_id
        WHERE inv.invoice_date >= ${startDate}
          AND inv.invoice_date <= ${endDate}
        GROUP BY i.id, i.code, i.name, i.category
        ORDER BY GREATEST(
          COALESCE(SUM(CASE WHEN inv.currency = 'TRY' THEN ((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)) - ((ii.quantity::numeric) * (ii.unit_cost::numeric)) ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN inv.currency = 'USD' THEN ((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)) - ((ii.quantity::numeric) * (ii.unit_cost::numeric)) ELSE 0 END), 0)
        ) DESC
        LIMIT 8
      `),
      db.execute(sql`
        SELECT
          COALESCE(i.category, 'غير مصنف') AS category,
          COALESCE(SUM(CASE WHEN inv.currency = 'TRY' THEN (ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000) ELSE 0 END), 0) AS revenue_try,
          COALESCE(SUM(CASE WHEN inv.currency = 'USD' THEN (ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000) ELSE 0 END), 0) AS revenue_usd,
          COALESCE(SUM(CASE WHEN inv.currency = 'TRY' THEN ((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)) - ((ii.quantity::numeric) * (ii.unit_cost::numeric)) ELSE 0 END), 0) AS profit_try,
          COALESCE(SUM(CASE WHEN inv.currency = 'USD' THEN ((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)) - ((ii.quantity::numeric) * (ii.unit_cost::numeric)) ELSE 0 END), 0) AS profit_usd
        FROM invoice_items ii
        JOIN invoices inv ON inv.id = ii.invoice_id AND inv.invoice_type = 'sale'
        LEFT JOIN items i ON i.id = ii.item_id
        WHERE inv.invoice_date >= ${startDate}
          AND inv.invoice_date <= ${endDate}
        GROUP BY COALESCE(i.category, 'غير مصنف')
        ORDER BY GREATEST(
          COALESCE(SUM(CASE WHEN inv.currency = 'TRY' THEN (ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000) ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN inv.currency = 'USD' THEN (ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000) ELSE 0 END), 0)
        ) DESC
        LIMIT 6
      `),
      db.execute(sql`
        WITH invoice_totals AS (
          SELECT
            inv.id,
            inv.invoice_date,
            inv.invoice_type,
            inv.currency,
            COALESCE(SUM((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)), 0) AS revenue,
            COALESCE(SUM((ii.quantity::numeric) * (ii.unit_cost::numeric)), 0) AS cost
          FROM invoices inv
          LEFT JOIN invoice_items ii ON ii.invoice_id = inv.id
          WHERE inv.invoice_date >= ${startDate}
            AND inv.invoice_date <= ${endDate}
          GROUP BY inv.id
        )
        SELECT
          invoice_date::text AS date,
          COUNT(*) FILTER (WHERE invoice_type = 'sale') AS sales_invoice_count,
          COUNT(*) FILTER (WHERE invoice_type = 'purchase') AS purchase_invoice_count,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'TRY' THEN revenue ELSE 0 END), 0) AS revenue_try,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'USD' THEN revenue ELSE 0 END), 0) AS revenue_usd,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'TRY' THEN revenue - cost ELSE 0 END), 0) AS profit_try,
          COALESCE(SUM(CASE WHEN invoice_type = 'sale' AND currency = 'USD' THEN revenue - cost ELSE 0 END), 0) AS profit_usd
        FROM invoice_totals
        GROUP BY invoice_date
        ORDER BY invoice_date
      `),
      db.execute(sql`
        SELECT
          inv.id,
          inv.invoice_number,
          inv.invoice_type,
          inv.currency,
          inv.invoice_date::text AS invoice_date,
          COALESCE(NULLIF(BTRIM(inv.customer_name), ''), 'بدون اسم') AS customer_name,
          COALESCE(b.name, 'بدون فرع') AS branch_name,
          COALESCE(inv.total_amount::numeric, 0) AS total_amount,
          COALESCE(inv.total_profit::numeric, 0) AS total_profit
        FROM invoices inv
        LEFT JOIN branches b ON b.id = inv.branch_id
        WHERE inv.invoice_date >= ${startDate}
          AND inv.invoice_date <= ${endDate}
        ORDER BY inv.invoice_date DESC, inv.id DESC
        LIMIT 10
      `),
      db.execute(sql`
        WITH latest_import AS (
          SELECT DISTINCT ON (ir.item_id)
            ir.item_id,
            COALESCE(ir.normalized_qty_kg, ir.quantity)::numeric AS opening_balance,
            ir.cost_try::numeric AS unit_cost_try,
            ir.cost_usd::numeric AS unit_cost_usd,
            ii.import_date
          FROM inventory_import_rows ir
          JOIN inventory_imports ii ON ii.id = ir.import_id
          WHERE ir.matched = 1 AND ir.item_id IS NOT NULL
          ORDER BY ir.item_id, ii.import_date DESC, ii.id DESC
        ),
        sold_after AS (
          SELECT
            inv_items.item_id,
            COALESCE(SUM(inv_items.quantity::numeric), 0) AS sold_qty
          FROM invoice_items inv_items
          JOIN invoices inv ON inv.id = inv_items.invoice_id
          JOIN latest_import li ON li.item_id = inv_items.item_id AND inv.invoice_type = 'sale' AND inv.invoice_date > li.import_date
          GROUP BY inv_items.item_id
        ),
        derived_stock AS (
          SELECT
            i.id AS item_id,
            i.code AS item_code,
            COALESCE(i.name_ar, i.name) AS item_name,
            GREATEST(COALESCE(li.opening_balance, 0) - COALESCE(sa.sold_qty, 0), 0) AS current_stock,
            COALESCE(i.min_stock::numeric, 0) AS min_stock,
            COALESCE(li.unit_cost_try, i.unit_cost_try::numeric, 0) AS unit_cost_try,
            COALESCE(li.unit_cost_usd, i.unit_cost_usd::numeric, 0) AS unit_cost_usd
          FROM items i
          LEFT JOIN latest_import li ON li.item_id = i.id
          LEFT JOIN sold_after sa ON sa.item_id = i.id
          WHERE i.is_active = true
        )
        SELECT
          item_id,
          item_code,
          item_name,
          current_stock,
          min_stock,
          (current_stock * unit_cost_try) AS current_value_try,
          (current_stock * unit_cost_usd) AS current_value_usd
        FROM derived_stock
        ORDER BY current_stock ASC, item_name ASC
      `),
    ]);

  const summaryRow = (summaryResult.rows as any[])[0] || {};
  const inventoryRows = (inventoryResult.rows as any[]) || [];
  const lowStockItems = inventoryRows
    .filter((row) => parseFloat(row.current_stock || "0") <= parseFloat(row.min_stock || "0"))
    .slice(0, 8);
  const topValueItems = [...inventoryRows]
    .sort((a, b) => {
      const aValue = Math.max(parseFloat(a.current_value_try || "0"), parseFloat(a.current_value_usd || "0"));
      const bValue = Math.max(parseFloat(b.current_value_try || "0"), parseFloat(b.current_value_usd || "0"));
      return bValue - aValue;
    })
    .slice(0, 8);

  const salesRevenueTry = parseFloat(summaryRow.sales_revenue_try || "0");
  const salesRevenueUsd = parseFloat(summaryRow.sales_revenue_usd || "0");

  return {
    meta: {
      period: range.period,
      label: range.label,
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
    },
    summary: {
      salesInvoicesCount: Number(summaryRow.sales_invoice_count || 0),
      purchaseInvoicesCount: Number(summaryRow.purchase_invoice_count || 0),
      customersCount: Number(summaryRow.customers_count || 0),
      activeBranchesCount: Number(summaryRow.active_branches_count || 0),
      totalItemsCount: Number(summaryRow.total_items || 0),
      lowStockCount: Number(summaryRow.low_stock_count || 0),
      salesRevenueTry,
      salesRevenueUsd,
      salesCostTry: parseFloat(summaryRow.sales_cost_try || "0"),
      salesCostUsd: parseFloat(summaryRow.sales_cost_usd || "0"),
      salesProfitTry: parseFloat(summaryRow.sales_profit_try || "0"),
      salesProfitUsd: parseFloat(summaryRow.sales_profit_usd || "0"),
      purchaseSpendTry: parseFloat(summaryRow.purchase_spend_try || "0"),
      purchaseSpendUsd: parseFloat(summaryRow.purchase_spend_usd || "0"),
      inventoryValueTry: parseFloat(summaryRow.inventory_value_try || "0"),
      inventoryValueUsd: parseFloat(summaryRow.inventory_value_usd || "0"),
      avgSaleInvoiceTry: Number(summaryRow.sales_invoice_count || 0) > 0 ? salesRevenueTry / Number(summaryRow.sales_invoice_count || 0) : 0,
      avgSaleInvoiceUsd: Number(summaryRow.sales_invoice_count || 0) > 0 ? salesRevenueUsd / Number(summaryRow.sales_invoice_count || 0) : 0,
    },
    branchPerformance: (branchResult.rows as any[]).map((row) => ({
      branchId: Number(row.branch_id),
      branchName: row.branch_name,
      branchCode: row.branch_code,
      salesInvoiceCount: Number(row.sales_invoice_count || 0),
      purchaseInvoiceCount: Number(row.purchase_invoice_count || 0),
      revenueTry: parseFloat(row.revenue_try || "0"),
      revenueUsd: parseFloat(row.revenue_usd || "0"),
      costTry: parseFloat(row.cost_try || "0"),
      costUsd: parseFloat(row.cost_usd || "0"),
      profitTry: parseFloat(row.profit_try || "0"),
      profitUsd: parseFloat(row.profit_usd || "0"),
    })),
    topCustomers: (customersResult.rows as any[]).map((row) => ({
      customerName: row.customer_name,
      invoiceCount: Number(row.invoice_count || 0),
      lastInvoiceDate: row.last_invoice_date,
      revenueTry: parseFloat(row.revenue_try || "0"),
      revenueUsd: parseFloat(row.revenue_usd || "0"),
      profitTry: parseFloat(row.profit_try || "0"),
      profitUsd: parseFloat(row.profit_usd || "0"),
    })),
    topItems: (itemsResult.rows as any[]).map((row) => ({
      itemId: Number(row.item_id || 0),
      itemCode: row.item_code,
      itemName: row.item_name || "بند غير معروف",
      category: row.category,
      quantitySold: parseFloat(row.quantity_sold || "0"),
      revenueTry: parseFloat(row.revenue_try || "0"),
      revenueUsd: parseFloat(row.revenue_usd || "0"),
      profitTry: parseFloat(row.profit_try || "0"),
      profitUsd: parseFloat(row.profit_usd || "0"),
    })),
    categoryPerformance: (categoryResult.rows as any[]).map((row) => ({
      category: row.category,
      revenueTry: parseFloat(row.revenue_try || "0"),
      revenueUsd: parseFloat(row.revenue_usd || "0"),
      profitTry: parseFloat(row.profit_try || "0"),
      profitUsd: parseFloat(row.profit_usd || "0"),
    })),
    timeline: (timelineResult.rows as any[]).map((row) => ({
      date: row.date,
      salesInvoiceCount: Number(row.sales_invoice_count || 0),
      purchaseInvoiceCount: Number(row.purchase_invoice_count || 0),
      revenueTry: parseFloat(row.revenue_try || "0"),
      revenueUsd: parseFloat(row.revenue_usd || "0"),
      profitTry: parseFloat(row.profit_try || "0"),
      profitUsd: parseFloat(row.profit_usd || "0"),
    })),
    recentInvoices: (recentInvoicesResult.rows as any[]).map((row) => ({
      id: Number(row.id),
      invoiceNumber: row.invoice_number,
      invoiceType: row.invoice_type,
      currency: row.currency,
      invoiceDate: row.invoice_date,
      customerName: row.customer_name,
      branchName: row.branch_name,
      totalAmount: parseFloat(row.total_amount || "0"),
      totalProfit: parseFloat(row.total_profit || "0"),
    })),
    inventoryHighlights: {
      lowStockItems: lowStockItems.map((row) => ({
        itemId: Number(row.item_id),
        itemCode: row.item_code,
        itemName: row.item_name,
        currentStock: parseFloat(row.current_stock || "0"),
        minStock: parseFloat(row.min_stock || "0"),
        currentValueTry: parseFloat(row.current_value_try || "0"),
        currentValueUsd: parseFloat(row.current_value_usd || "0"),
      })),
      topValueItems: topValueItems.map((row) => ({
        itemId: Number(row.item_id),
        itemCode: row.item_code,
        itemName: row.item_name,
        currentStock: parseFloat(row.current_stock || "0"),
        minStock: parseFloat(row.min_stock || "0"),
        currentValueTry: parseFloat(row.current_value_try || "0"),
        currentValueUsd: parseFloat(row.current_value_usd || "0"),
      })),
    },
    notification: {
      title: range.notifyTitle,
      body: `تم تجهيز ${range.label} للفترة من ${formatArabicDate(startDate)} إلى ${formatArabicDate(endDate)}.`,
    },
  };
}

router.get("/company", async (req, res) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const report = await buildCompanyReport(query.period, query.date);
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "Error building company report");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/company/notify", async (req, res) => {
  try {
    const body = reportNotifyBodySchema.parse(req.body ?? {});
    const report = await buildCompanyReport(body.period, body.date);

    await sendNotification({
      type: `company-report-ready-${report.meta.period}`,
      audience: "admin",
      payload: {
        title: report.notification.title,
        body: report.notification.body,
        url: "/reports",
        tag: `company-report-${report.meta.period}-${report.meta.startDate}-${report.meta.endDate}`,
      },
    });

    res.json({
      ok: true,
      title: report.notification.title,
      body: report.notification.body,
      meta: report.meta,
    });
  } catch (err) {
    req.log.error({ err }, "Error notifying company report");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
