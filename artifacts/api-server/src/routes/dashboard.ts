import { Router, type IRouter } from "express";
import { db, invoicesTable, itemsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { GetDashboardKpisQueryParams, GetDailySalesQueryParams } from "@workspace/api-zod";
import { buildInvoiceFilters } from "../lib/invoice-financials";

const router: IRouter = Router();

async function getDerivedInventoryKpis() {
  const result = await db.execute(sql`
    WITH latest_import AS (
      SELECT DISTINCT ON (ir.item_id) 
        ir.item_id,
        COALESCE(ir.normalized_qty_kg, ir.quantity)::numeric as opening_balance,
        ir.cost_try::numeric as unit_cost_try,
        ir.cost_usd::numeric as unit_cost_usd,
        ii.import_date
      FROM inventory_import_rows ir
      JOIN inventory_imports ii ON ii.id = ir.import_id
      WHERE ir.matched = 1 AND ir.item_id IS NOT NULL
      ORDER BY ir.item_id, ii.import_date DESC, ii.id DESC
    ),
    sold_after AS (
      SELECT 
        inv_items.item_id,
        COALESCE(SUM(inv_items.quantity::numeric), 0) as sold_qty
      FROM invoice_items inv_items
      JOIN invoices inv ON inv.id = inv_items.invoice_id
      AND inv.invoice_type = 'sale'
      JOIN latest_import li ON li.item_id = inv_items.item_id AND inv.invoice_date > li.import_date
      GROUP BY inv_items.item_id
    ),
    derived_stock AS (
      SELECT 
        i.id,
        GREATEST(COALESCE(li.opening_balance, 0) - COALESCE(sa.sold_qty, 0), 0) as current_stock,
        COALESCE(li.unit_cost_try, i.unit_cost_try::numeric, 0) as unit_cost_try,
        COALESCE(li.unit_cost_usd, i.unit_cost_usd::numeric, 0) as unit_cost_usd,
        COALESCE(i.min_stock::numeric, 0) as min_stock
      FROM items i
      LEFT JOIN latest_import li ON li.item_id = i.id
      LEFT JOIN sold_after sa ON sa.item_id = i.id
      WHERE i.is_active = true
    )
    SELECT 
      COALESCE(SUM(current_stock * unit_cost_try), 0) as inventory_value_try,
      COALESCE(SUM(current_stock * unit_cost_usd), 0) as inventory_value_usd,
      COUNT(*) as total_items,
      COUNT(CASE WHEN current_stock <= min_stock THEN 1 END) as low_stock_count
    FROM derived_stock
  `);
  const row = (result.rows as any[])[0] || {};
  return {
    inventoryValueTry: parseFloat(row.inventory_value_try || "0"),
    inventoryValueUsd: parseFloat(row.inventory_value_usd || "0"),
    totalItems: parseInt(row.total_items || "0"),
    lowStockCount: parseInt(row.low_stock_count || "0"),
  };
}

async function getDerivedInvoiceKpis(query: {
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
}) {
  const conditions = buildInvoiceFilters(invoicesTable, query);
  const saleConditions = sql`${conditions} AND ${invoicesTable.invoiceType} = 'sale'`;
  const result = await db.execute(sql`
    WITH filtered_invoices AS (
      SELECT id, currency
      FROM invoices
      WHERE ${saleConditions}
    ),
    invoice_totals AS (
      SELECT
        fi.id,
        fi.currency,
        COALESCE(SUM((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)), 0) AS revenue,
        COALESCE(SUM((ii.quantity::numeric) * (ii.unit_cost::numeric)), 0) AS cost
      FROM filtered_invoices fi
      LEFT JOIN invoice_items ii ON ii.invoice_id = fi.id
      GROUP BY fi.id, fi.currency
    )
    SELECT
      COALESCE(SUM(CASE WHEN currency = 'TRY' THEN revenue ELSE 0 END), 0) AS total_revenue_try,
      COALESCE(SUM(CASE WHEN currency = 'USD' THEN revenue ELSE 0 END), 0) AS total_revenue_usd,
      COALESCE(SUM(CASE WHEN currency = 'TRY' THEN cost ELSE 0 END), 0) AS total_cost_try,
      COALESCE(SUM(CASE WHEN currency = 'USD' THEN cost ELSE 0 END), 0) AS total_cost_usd,
      COALESCE(SUM(CASE WHEN currency = 'TRY' THEN revenue - cost ELSE 0 END), 0) AS total_profit_try,
      COALESCE(SUM(CASE WHEN currency = 'USD' THEN revenue - cost ELSE 0 END), 0) AS total_profit_usd,
      COUNT(*) AS total_invoices,
      COUNT(CASE WHEN currency = 'TRY' THEN 1 END) AS try_invoice_count,
      COUNT(CASE WHEN currency = 'USD' THEN 1 END) AS usd_invoice_count
    FROM invoice_totals
  `);

  const row = (result.rows as any[])[0] || {};
  return {
    totalRevenueTry: parseFloat(row.total_revenue_try || "0"),
    totalRevenueUsd: parseFloat(row.total_revenue_usd || "0"),
    totalCostTry: parseFloat(row.total_cost_try || "0"),
    totalCostUsd: parseFloat(row.total_cost_usd || "0"),
    totalProfitTry: parseFloat(row.total_profit_try || "0"),
    totalProfitUsd: parseFloat(row.total_profit_usd || "0"),
    totalInvoices: Number(row.total_invoices || 0),
    tryInvoiceCount: Number(row.try_invoice_count || 0),
    usdInvoiceCount: Number(row.usd_invoice_count || 0),
  };
}

async function getDerivedSalesSeries(query: {
  currency?: "TRY" | "USD";
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  groupBy: "daily" | "monthly";
}) {
  const conditions = buildInvoiceFilters(invoicesTable, query);
  const saleConditions = sql`${conditions} AND ${invoicesTable.invoiceType} = 'sale'`;
  const period = query.groupBy === "monthly"
    ? sql`TO_CHAR(invoice_date::date, 'YYYY-MM')`
    : sql`invoice_date`;

  const result = await db.execute(sql`
    WITH filtered_invoices AS (
      SELECT id, invoice_date, currency
      FROM invoices
      WHERE ${saleConditions}
    ),
    invoice_totals AS (
      SELECT
        ${period} AS period,
        fi.id,
        COALESCE(SUM((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)), 0) AS revenue,
        COALESCE(SUM((ii.quantity::numeric) * (ii.unit_cost::numeric)), 0) AS cost
      FROM filtered_invoices fi
      LEFT JOIN invoice_items ii ON ii.invoice_id = fi.id
      GROUP BY period, fi.id
    )
    SELECT
      period AS date,
      COALESCE(SUM(revenue), 0) AS revenue,
      COALESCE(SUM(cost), 0) AS cost,
      COALESCE(SUM(revenue - cost), 0) AS profit,
      COUNT(*) AS invoice_count
    FROM invoice_totals
    GROUP BY period
    ORDER BY period
  `);

  return (result.rows as any[]).map((row) => ({
    date: row.date,
    revenue: parseFloat(row.revenue || "0"),
    cost: parseFloat(row.cost || "0"),
    profit: parseFloat(row.profit || "0"),
    invoiceCount: Number(row.invoice_count || 0),
  }));
}

router.get("/kpis", async (req, res) => {
  try {
    const query = GetDashboardKpisQueryParams.parse(req.query);
    const invoiceKpis = await getDerivedInvoiceKpis(query);
    const inventoryKpis = await getDerivedInventoryKpis();

    res.json({
      totalRevenueTry: invoiceKpis.totalRevenueTry,
      totalRevenueUsd: invoiceKpis.totalRevenueUsd,
      totalCostTry: invoiceKpis.totalCostTry,
      totalCostUsd: invoiceKpis.totalCostUsd,
      totalProfitTry: invoiceKpis.totalProfitTry,
      totalProfitUsd: invoiceKpis.totalProfitUsd,
      totalInvoices: invoiceKpis.totalInvoices,
      avgOrderValueTry: invoiceKpis.tryInvoiceCount > 0 ? invoiceKpis.totalRevenueTry / invoiceKpis.tryInvoiceCount : 0,
      avgOrderValueUsd: invoiceKpis.usdInvoiceCount > 0 ? invoiceKpis.totalRevenueUsd / invoiceKpis.usdInvoiceCount : 0,
      inventoryValueTry: inventoryKpis.inventoryValueTry,
      inventoryValueUsd: inventoryKpis.inventoryValueUsd,
      totalItems: inventoryKpis.totalItems,
      lowStockCount: inventoryKpis.lowStockCount,
      revenueGrowthTry: 0,
      revenueGrowthUsd: 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching dashboard KPIs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/daily-sales", async (req, res) => {
  try {
    const query = GetDailySalesQueryParams.parse(req.query);
    const groupBy = (((query as any).groupBy || "daily") === "monthly" ? "monthly" : "daily") as "daily" | "monthly";

    const series = await getDerivedSalesSeries({
      currency: query.currency,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      branchId: query.branchId,
      groupBy,
    });

    res.json(series);
  } catch (err) {
    req.log.error({ err }, "Error fetching sales data");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
