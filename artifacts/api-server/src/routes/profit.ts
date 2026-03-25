import { Router, type IRouter } from "express";
import { db, invoicesTable, invoiceItemsTable, itemsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  GetProfitAnalysisQueryParams,
  GetProfitByItemQueryParams,
} from "@workspace/api-zod";
import {
  buildInvoiceFilters,
  invoiceRevenueSumExpr,
  invoiceCostSumExpr,
  invoiceProfitSumExpr,
  invoiceRevenueValueExpr,
  invoiceCostValueExpr,
  invoiceProfitValueExpr,
} from "../lib/invoice-financials";

const router: IRouter = Router();

router.get("/analysis", async (req, res) => {
  try {
    const query = GetProfitAnalysisQueryParams.parse(req.query);
    const currency = query.currency || "TRY";

    const conditions = buildInvoiceFilters(invoicesTable, {
      currency,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      branchId: query.branchId,
      invoiceType: "sale",
    });

    const [totals] = await db.select({
      totalRevenue: invoiceRevenueSumExpr(invoiceItemsTable),
      totalCost: invoiceCostSumExpr(invoiceItemsTable),
      totalProfit: invoiceProfitSumExpr(invoiceItemsTable),
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, sql`${invoiceItemsTable.invoiceId} = ${invoicesTable.id} AND ${conditions}`);

    const monthlyData = await db.select({
      month: sql<string>`TO_CHAR(${invoicesTable.invoiceDate}, 'YYYY-MM')`,
      revenue: invoiceRevenueSumExpr(invoiceItemsTable),
      cost: invoiceCostSumExpr(invoiceItemsTable),
      profit: invoiceProfitSumExpr(invoiceItemsTable),
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, sql`${invoiceItemsTable.invoiceId} = ${invoicesTable.id} AND ${conditions}`)
    .groupBy(sql`TO_CHAR(${invoicesTable.invoiceDate}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${invoicesTable.invoiceDate}, 'YYYY-MM')`);

    const totalRevenue = parseFloat(totals?.totalRevenue || "0");
    const totalCost = parseFloat(totals?.totalCost || "0");
    const totalProfit = parseFloat(totals?.totalProfit || "0");

    res.json({
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      currency,
      monthlyData: monthlyData.map(m => {
        const rev = parseFloat(m.revenue || "0");
        const cost = parseFloat(m.cost || "0");
        const profit = parseFloat(m.profit || "0");
        return {
          month: m.month,
          revenue: rev,
          cost,
          profit,
          margin: rev > 0 ? (profit / rev) * 100 : 0,
        };
      }),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching profit analysis");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/by-item", async (req, res) => {
  try {
    const query = GetProfitByItemQueryParams.parse(req.query);
    const currency = query.currency || "TRY";
    const limit = query.limit ?? 20;

    const conditions = buildInvoiceFilters(invoicesTable, {
      currency,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      branchId: query.branchId,
      invoiceType: "sale",
    });

    const results = await db.select({
      itemId: itemsTable.id,
      itemCode: itemsTable.code,
      itemName: itemsTable.name,
      quantitySold: sql<string>`SUM(${invoiceItemsTable.quantity}::numeric)`,
      revenue: invoiceRevenueSumExpr(invoiceItemsTable),
      cost: invoiceCostSumExpr(invoiceItemsTable),
      profit: invoiceProfitSumExpr(invoiceItemsTable),
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, sql`${invoiceItemsTable.invoiceId} = ${invoicesTable.id} AND ${conditions}`)
    .innerJoin(itemsTable, sql`${invoiceItemsTable.itemId} = ${itemsTable.id}`)
    .where(sql`${invoiceItemsTable.itemId} IS NOT NULL`)
    .groupBy(itemsTable.id, itemsTable.code, itemsTable.name)
    .orderBy(sql`${invoiceProfitSumExpr(invoiceItemsTable)} DESC`)
    .limit(limit);

    res.json(results.map(r => {
      const revenue = parseFloat(r.revenue || "0");
      const profit = parseFloat(r.profit || "0");
      return {
        itemId: r.itemId,
        itemCode: r.itemCode,
        itemName: r.itemName,
        quantitySold: parseFloat(r.quantitySold || "0"),
        revenue,
        cost: parseFloat(r.cost || "0"),
        profit,
        margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      };
    }));
  } catch (err) {
    req.log.error({ err }, "Error fetching profit by item");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
