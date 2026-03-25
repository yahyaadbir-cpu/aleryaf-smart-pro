import { Router, type IRouter } from "express";
import { db, branchesTable, invoicesTable, invoiceItemsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  CreateBranchBody,
  UpdateBranchBody,
  UpdateBranchParams,
  DeleteBranchParams,
  GetBranchAnalyticsQueryParams,
} from "@workspace/api-zod";
import {
  buildInvoiceFilters,
  invoiceRevenueValueExpr,
  invoiceCostValueExpr,
  invoiceProfitValueExpr,
} from "../lib/invoice-financials";
import { requireMutationRow, sendRouteError, toIsoDateTime } from "../lib/http";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const branches = await db.select().from(branchesTable).orderBy(branchesTable.name);
    res.json(branches.map(b => ({
      ...b,
      createdAt: toIsoDateTime(b.createdAt),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching branches");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateBranchBody.parse(req.body);
    const [insertedBranch] = await db.insert(branchesTable).values({
      name: body.name,
      nameAr: body.nameAr,
      code: body.code,
      isActive: body.isActive ?? true,
      createdAt: new Date(),
    }).returning();
    const branch = requireMutationRow(insertedBranch, "Branch");
    res.status(201).json({ ...branch, createdAt: toIsoDateTime(branch.createdAt) });
  } catch (err) {
    req.log.error({ err }, "Error creating branch");
    sendRouteError(req, res, err);
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = UpdateBranchParams.parse(req.params);
    const body = UpdateBranchBody.parse(req.body);
    const [branch] = await db.update(branchesTable).set(body).where(eq(branchesTable.id, id)).returning();
    if (!branch) {
      res.status(404).json({ error: "Branch not found" });
      return;
    }
    res.json({ ...branch, createdAt: toIsoDateTime(branch.createdAt) });
  } catch (err) {
    req.log.error({ err }, "Error updating branch");
    sendRouteError(req, res, err);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = DeleteBranchParams.parse(req.params);
    await db.delete(branchesTable).where(eq(branchesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting branch");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics", async (req, res) => {
  try {
    const query = GetBranchAnalyticsQueryParams.parse(req.query);
    const conditions = buildInvoiceFilters(invoicesTable, { ...query, invoiceType: "sale" });

    const results = await db
      .select({
        branchId: branchesTable.id,
        branchName: branchesTable.name,
        branchCode: branchesTable.code,
        revenueTry: sql<string>`COALESCE(SUM(CASE WHEN ${invoicesTable.currency} = 'TRY' THEN ${invoiceRevenueValueExpr(invoiceItemsTable)} ELSE 0 END), 0)`,
        revenueUsd: sql<string>`COALESCE(SUM(CASE WHEN ${invoicesTable.currency} = 'USD' THEN ${invoiceRevenueValueExpr(invoiceItemsTable)} ELSE 0 END), 0)`,
        costTry: sql<string>`COALESCE(SUM(CASE WHEN ${invoicesTable.currency} = 'TRY' THEN ${invoiceCostValueExpr(invoiceItemsTable)} ELSE 0 END), 0)`,
        costUsd: sql<string>`COALESCE(SUM(CASE WHEN ${invoicesTable.currency} = 'USD' THEN ${invoiceCostValueExpr(invoiceItemsTable)} ELSE 0 END), 0)`,
        profitTry: sql<string>`COALESCE(SUM(CASE WHEN ${invoicesTable.currency} = 'TRY' THEN ${invoiceProfitValueExpr(invoiceItemsTable)} ELSE 0 END), 0)`,
        profitUsd: sql<string>`COALESCE(SUM(CASE WHEN ${invoicesTable.currency} = 'USD' THEN ${invoiceProfitValueExpr(invoiceItemsTable)} ELSE 0 END), 0)`,
        invoiceCount: sql<number>`COUNT(DISTINCT ${invoicesTable.id})`,
      })
      .from(branchesTable)
      .leftJoin(invoicesTable, sql`${invoicesTable.branchId} = ${branchesTable.id} AND ${conditions}`)
      .leftJoin(invoiceItemsTable, sql`${invoiceItemsTable.invoiceId} = ${invoicesTable.id}`)
      .groupBy(branchesTable.id, branchesTable.name, branchesTable.code)
      .orderBy(branchesTable.name);

    const totalTry = results.reduce((s, r) => s + parseFloat(r.revenueTry || "0"), 0);
    const totalUsd = results.reduce((s, r) => s + parseFloat(r.revenueUsd || "0"), 0);

    const analytics = results.map(r => ({
      branchId: r.branchId,
      branchName: r.branchName,
      branchCode: r.branchCode,
      revenueTry: parseFloat(r.revenueTry || "0"),
      revenueUsd: parseFloat(r.revenueUsd || "0"),
      costTry: parseFloat(r.costTry || "0"),
      costUsd: parseFloat(r.costUsd || "0"),
      profitTry: parseFloat(r.profitTry || "0"),
      profitUsd: parseFloat(r.profitUsd || "0"),
      invoiceCount: Number(r.invoiceCount),
      contributionPctTry: totalTry > 0 ? (parseFloat(r.revenueTry || "0") / totalTry) * 100 : 0,
      contributionPctUsd: totalUsd > 0 ? (parseFloat(r.revenueUsd || "0") / totalUsd) * 100 : 0,
    }));

    res.json(analytics);
  } catch (err) {
    req.log.error({ err }, "Error fetching branch analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
