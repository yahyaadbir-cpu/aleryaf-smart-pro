import { Router, type IRouter } from "express";
import { db, invoicesTable, invoiceItemsTable, branchesTable, itemsTable, itemAliasesTable } from "@workspace/db";
import { eq, sql, desc, inArray } from "drizzle-orm";

import {
  GetInvoicesQueryParams,
  CreateInvoiceBody,
  GetInvoiceParams,
  DeleteInvoiceParams,
  UpdateInvoiceParams,
  UpdateInvoiceBody,
} from "@workspace/api-zod";
import { getLatestItemCostSnapshot, normalizeArabicText } from "../lib/inventory";
import { requireMutationRow, sendRouteError, toIsoDateTime } from "../lib/http";
import {
  evaluateRollingFinancialAlerts,
  evaluateStockDepletionAlerts,
  hasInvoiceBeenPrinted,
  sendNotification,
} from "../lib/push-notifications";

const router: IRouter = Router();

type InvoiceType = "sale" | "purchase";

type ResolvedInvoiceItem = {
  itemId: number | null;
  rawName?: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

async function resolveItemByName(rawName: string): Promise<number | null> {
  if (!rawName) return null;
  const normalized = normalizeArabicText(rawName);

  const [byAlias] = await db.select({ itemId: itemAliasesTable.itemId })
    .from(itemAliasesTable)
    .where(sql`LOWER(${itemAliasesTable.alias}) = ${normalized}`)
    .limit(1);
  if (byAlias) return byAlias.itemId;

  const [byName] = await db.select({ id: itemsTable.id })
    .from(itemsTable)
    .where(sql`LOWER(${itemsTable.name}) = ${normalized}`)
    .limit(1);
  if (byName) return byName.id;

  const [byNameAr] = await db.select({ id: itemsTable.id })
    .from(itemsTable)
    .where(sql`LOWER(${itemsTable.nameAr}) = ${normalized}`)
    .limit(1);
  if (byNameAr) return byNameAr.id;

  const [fuzzy] = await db.select({ id: itemsTable.id })
    .from(itemsTable)
    .where(sql`LOWER(${itemsTable.name}) LIKE ${"%" + normalized + "%"}`)
    .limit(1);
  if (fuzzy) return fuzzy.id;

  return null;
}

function toSalePricePerKg(unitPricePerTon: number) {
  return unitPricePerTon / 1000;
}

function toSafeNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function calculateInvoiceLineTotals(
  item: { quantity: number | string | null | undefined; unitPrice: number | string | null | undefined; unitCost: number | string | null | undefined },
  invoiceType: InvoiceType,
) {
  const quantity = toSafeNumber(item.quantity);
  const unitPrice = toSafeNumber(item.unitPrice);
  const unitCost = toSafeNumber(item.unitCost);

  if (invoiceType === "purchase") {
    const purchasePricePerKg = toSalePricePerKg(unitPrice);
    const totalPrice = quantity * purchasePricePerKg;
    const totalCost = totalPrice;
    return {
      quantity,
      unitPrice,
      unitCost: purchasePricePerKg,
      totalPrice,
      totalCost,
      profit: 0,
    };
  }

  const salePricePerKg = toSalePricePerKg(unitPrice);
  const totalPrice = quantity * salePricePerKg;
  const totalCost = quantity * unitCost;

  return {
    quantity,
    unitPrice,
    unitCost,
    totalPrice,
    totalCost,
    profit: totalPrice - totalCost,
  };
}

function processItems(
  invoiceType: InvoiceType,
  items: Array<{ itemId?: number | null; rawName?: string; quantity: number; unitPrice: number; unitCost: number }>,
) {
  let totalAmount = 0;
  let totalCost = 0;

  const processed = items.map((item) => {
    const lineTotals = calculateInvoiceLineTotals(item, invoiceType);
    totalAmount += lineTotals.totalPrice;
    totalCost += lineTotals.totalCost;
    return {
      ...item,
      totalPrice: lineTotals.totalPrice,
      totalCost: lineTotals.totalCost,
    };
  });

  return {
    processed,
    totalAmount,
    totalCost,
    totalProfit: totalAmount - totalCost,
  };
}

function summarizeInvoiceLineItems<
  T extends { quantity: number | string | null | undefined; unitPrice: number | string | null | undefined; unitCost: number | string | null | undefined }
>(invoiceType: InvoiceType, items: T[]) {
  let totalAmount = 0;
  let totalCost = 0;

  const normalizedItems = items.map((item) => {
    const lineTotals = calculateInvoiceLineTotals(item, invoiceType);
    totalAmount += lineTotals.totalPrice;
    totalCost += lineTotals.totalCost;
    return {
      ...item,
      quantity: lineTotals.quantity,
      unitPrice: lineTotals.unitPrice,
      unitCost: lineTotals.unitCost,
      totalPrice: lineTotals.totalPrice,
      totalCost: lineTotals.totalCost,
      lineProfit: lineTotals.profit,
    };
  });

  return {
    items: normalizedItems,
    totalAmount,
    totalCost,
    totalProfit: totalAmount - totalCost,
  };
}

async function buildResolvedInvoiceItems(
  items: Array<{ itemId?: number | null; rawName?: string; quantity: number; unitPrice: number; unitCost: number }>,
  currency: "TRY" | "USD",
  invoiceType: InvoiceType,
  options?: { preserveProvidedCost?: boolean },
): Promise<ResolvedInvoiceItem[]> {
  const resolvedItems: ResolvedInvoiceItem[] = [];
  const costCache = new Map<number, number>();

  for (const item of items) {
    let resolvedItemId = item.itemId ?? null;
    if (!resolvedItemId && item.rawName) {
      resolvedItemId = await resolveItemByName(item.rawName);
    }

    let unitCost = item.unitCost;
    if (invoiceType === "purchase") {
      unitCost = item.unitPrice;
    } else if (resolvedItemId && !options?.preserveProvidedCost) {
      if (!costCache.has(resolvedItemId)) {
        costCache.set(
          resolvedItemId,
          await getLatestItemCostSnapshot(db, resolvedItemId, currency),
        );
      }
      unitCost = costCache.get(resolvedItemId) ?? unitCost;
    }

    resolvedItems.push({ ...item, itemId: resolvedItemId, unitCost });
  }

  return resolvedItems;
}

router.get("/", async (req, res) => {
  try {
    const query = GetInvoicesQueryParams.parse(req.query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    let conditions = sql`1=1`;
    if (query.branchId) conditions = sql`${conditions} AND ${invoicesTable.branchId} = ${query.branchId}`;
    if (query.currency) conditions = sql`${conditions} AND ${invoicesTable.currency} = ${query.currency}`;
    if (query.invoiceType) conditions = sql`${conditions} AND ${invoicesTable.invoiceType} = ${query.invoiceType}`;
    if (query.dateFrom) conditions = sql`${conditions} AND ${invoicesTable.invoiceDate} >= ${query.dateFrom}`;
    if (query.dateTo) conditions = sql`${conditions} AND ${invoicesTable.invoiceDate} <= ${query.dateTo}`;
    if (query.search) {
      conditions = sql`${conditions} AND ${invoicesTable.invoiceNumber} ILIKE ${"%" + query.search + "%"}`;
    }

    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(invoicesTable)
      .where(conditions);

    const invoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        createdBy: invoicesTable.createdBy,
        invoiceType: invoicesTable.invoiceType,
        purchaseType: invoicesTable.purchaseType,
        branchId: invoicesTable.branchId,
        branchName: branchesTable.name,
        currency: invoicesTable.currency,
        totalAmount: invoicesTable.totalAmount,
        totalCost: invoicesTable.totalCost,
        totalProfit: invoicesTable.totalProfit,
        invoiceDate: invoicesTable.invoiceDate,
        customerName: invoicesTable.customerName,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(branchesTable, eq(invoicesTable.branchId, branchesTable.id))
      .where(conditions)
      .orderBy(desc(invoicesTable.invoiceDate), desc(invoicesTable.id))
      .limit(limit)
      .offset(offset);

    const invoiceIds = invoices.map((invoice) => invoice.id);
    const invoiceItems = invoiceIds.length > 0
      ? await db
          .select({
            invoiceId: invoiceItemsTable.invoiceId,
            quantity: invoiceItemsTable.quantity,
            unitPrice: invoiceItemsTable.unitPrice,
            unitCost: invoiceItemsTable.unitCost,
          })
          .from(invoiceItemsTable)
          .where(inArray(invoiceItemsTable.invoiceId, invoiceIds))
      : [];

    const itemsByInvoiceId = new Map<number, typeof invoiceItems>();
    for (const item of invoiceItems) {
      const bucket = itemsByInvoiceId.get(item.invoiceId) ?? [];
      bucket.push(item);
      itemsByInvoiceId.set(item.invoiceId, bucket);
    }

    res.json({
      data: invoices.map((invoice) => {
        const invoiceType = (invoice.invoiceType === "purchase" ? "purchase" : "sale") as InvoiceType;
        const summary = summarizeInvoiceLineItems(invoiceType, itemsByInvoiceId.get(invoice.id) ?? []);

        return {
          ...invoice,
          invoiceType,
          purchaseType: invoice.purchaseType ?? undefined,
          totalAmount: summary.totalAmount,
          totalCost: summary.totalCost,
          totalProfit: summary.totalProfit,
          displayAmount: summary.totalAmount,
          displayCost: summary.totalCost,
          displayProfit: summary.totalProfit,
          createdAt: toIsoDateTime(invoice.createdAt),
        };
      }),
      total: Number(countResult.count),
      page,
      limit,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching invoices");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateInvoiceBody.parse(req.body);

    if (!body.items || body.items.length === 0) {
      res.status(400).json({ error: "At least one item is required" });
      return;
    }

    if (body.invoiceType === "purchase" && !body.purchaseType) {
      res.status(400).json({ error: "Purchase type is required" });
      return;
    }

    if (body.invoiceType === "sale" && !body.branchId) {
      res.status(400).json({ error: "Branch is required" });
      return;
    }

    for (const item of body.items) {
      if (item.quantity <= 0) {
        res.status(400).json({ error: "Quantity must be greater than 0" });
        return;
      }
      if (item.unitPrice < 0 || item.unitCost < 0) {
        res.status(400).json({ error: "Price and cost must be >= 0" });
        return;
      }
    }

    const resolvedItems = await buildResolvedInvoiceItems(body.items, body.currency, body.invoiceType);
    const { processed, totalAmount, totalCost, totalProfit } = processItems(body.invoiceType, resolvedItems);
    const createdAt = new Date();

    const result = await db.transaction(async (tx) => {
      const [insertedInvoice] = await tx.insert(invoicesTable).values({
        invoiceNumber: body.invoiceNumber,
        createdBy: body.createdBy,
        invoiceType: body.invoiceType,
        purchaseType: body.invoiceType === "purchase" ? body.purchaseType ?? null : null,
        branchId: body.invoiceType === "purchase" && body.purchaseType === "import" ? null : body.branchId ?? null,
        currency: body.currency,
        invoiceDate: body.invoiceDate,
        customerName: body.customerName,
        notes: body.notes,
        totalAmount: totalAmount.toString(),
        totalCost: totalCost.toString(),
        totalProfit: totalProfit.toString(),
        createdAt,
      }).returning();
      const invoice = requireMutationRow(insertedInvoice, "Invoice");

      if (processed.length > 0) {
        await tx.insert(invoiceItemsTable).values(
          processed.map((item) => ({
            invoiceId: invoice.id,
            itemId: item.itemId,
            rawName: item.rawName,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toString(),
            unitCost: item.unitCost.toString(),
            totalPrice: item.totalPrice.toString(),
            totalCost: item.totalCost.toString(),
          })),
        );
      }

      return invoice;
    });

    const unmatchedNames = processed
      .filter((item) => !item.itemId && item.rawName)
      .map((item) => item.rawName);

    res.status(201).json({
      ...result,
      purchaseType: result.purchaseType ?? undefined,
      totalAmount: parseFloat(result.totalAmount || "0"),
      totalCost: parseFloat(result.totalCost || "0"),
      totalProfit: parseFloat(result.totalProfit || "0"),
      createdAt: toIsoDateTime(result.createdAt),
      unmatchedItems: unmatchedNames,
    });

    await evaluateRollingFinancialAlerts().catch((error) => req.log.error({ err: error }, "Failed to evaluate financial alerts"));
    await evaluateStockDepletionAlerts().catch((error) => req.log.error({ err: error }, "Failed to evaluate stock alerts"));
  } catch (err) {
    req.log.error({ err }, "Error creating invoice");
    sendRouteError(req, res, err);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = GetInvoiceParams.parse(req.params);

    const [invoice] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        createdBy: invoicesTable.createdBy,
        invoiceType: invoicesTable.invoiceType,
        purchaseType: invoicesTable.purchaseType,
        branchId: invoicesTable.branchId,
        branchName: branchesTable.name,
        currency: invoicesTable.currency,
        totalAmount: invoicesTable.totalAmount,
        totalCost: invoicesTable.totalCost,
        totalProfit: invoicesTable.totalProfit,
        invoiceDate: invoicesTable.invoiceDate,
        customerName: invoicesTable.customerName,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(branchesTable, eq(invoicesTable.branchId, branchesTable.id))
      .where(eq(invoicesTable.id, id));

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const items = await db
      .select({
        id: invoiceItemsTable.id,
        itemId: invoiceItemsTable.itemId,
        itemName: itemsTable.name,
        rawName: invoiceItemsTable.rawName,
        quantity: invoiceItemsTable.quantity,
        unitPrice: invoiceItemsTable.unitPrice,
        unitCost: invoiceItemsTable.unitCost,
        totalPrice: invoiceItemsTable.totalPrice,
        totalCost: invoiceItemsTable.totalCost,
      })
      .from(invoiceItemsTable)
      .leftJoin(itemsTable, eq(invoiceItemsTable.itemId, itemsTable.id))
      .where(eq(invoiceItemsTable.invoiceId, id));

    const invoiceType = (invoice.invoiceType === "purchase" ? "purchase" : "sale") as InvoiceType;
    const summarizedItems = summarizeInvoiceLineItems(invoiceType, items);

    res.json({
      ...invoice,
      invoiceType,
      purchaseType: invoice.purchaseType ?? undefined,
      totalAmount: summarizedItems.totalAmount,
      totalCost: summarizedItems.totalCost,
      totalProfit: summarizedItems.totalProfit,
      displayAmount: summarizedItems.totalAmount,
      displayCost: summarizedItems.totalCost,
      displayProfit: summarizedItems.totalProfit,
      createdAt: toIsoDateTime(invoice.createdAt),
      items: summarizedItems.items.map((item) => ({
        ...item,
        matched: !!item.itemId,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching invoice");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = UpdateInvoiceParams.parse(req.params);
    const body = UpdateInvoiceBody.parse(req.body);

    if (!body.items || body.items.length === 0) {
      res.status(400).json({ error: "At least one item is required" });
      return;
    }

    if (body.invoiceType === "purchase" && !body.purchaseType) {
      res.status(400).json({ error: "Purchase type is required" });
      return;
    }

    if (body.invoiceType === "sale" && !body.branchId) {
      res.status(400).json({ error: "Branch is required" });
      return;
    }

    for (const item of body.items) {
      if (item.quantity <= 0) {
        res.status(400).json({ error: "Quantity must be greater than 0" });
        return;
      }
      if (item.unitPrice < 0 || item.unitCost < 0) {
        res.status(400).json({ error: "Price and cost must be >= 0" });
        return;
      }
    }

    const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const resolvedItems = await buildResolvedInvoiceItems(body.items, body.currency, body.invoiceType, {
      preserveProvidedCost: true,
    });
    const { processed, totalAmount, totalCost, totalProfit } = processItems(body.invoiceType, resolvedItems);

    const invoice = await db.transaction(async (tx) => {
      const [updated] = await tx.update(invoicesTable).set({
        invoiceNumber: body.invoiceNumber,
        invoiceType: body.invoiceType,
        purchaseType: body.invoiceType === "purchase" ? body.purchaseType ?? null : null,
        branchId: body.invoiceType === "purchase" && body.purchaseType === "import" ? null : body.branchId ?? null,
        currency: body.currency,
        invoiceDate: body.invoiceDate,
        customerName: body.customerName,
        notes: body.notes,
        totalAmount: totalAmount.toString(),
        totalCost: totalCost.toString(),
        totalProfit: totalProfit.toString(),
      }).where(eq(invoicesTable.id, id)).returning();

      await tx.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));

      if (processed.length > 0) {
        await tx.insert(invoiceItemsTable).values(
          processed.map((item) => ({
            invoiceId: id,
            itemId: item.itemId,
            rawName: item.rawName,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toString(),
            unitCost: item.unitCost.toString(),
            totalPrice: item.totalPrice.toString(),
            totalCost: item.totalCost.toString(),
          })),
        );
      }

      return updated;
    });

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const printedBefore = existing.invoiceType !== "purchase" ? await hasInvoiceBeenPrinted(id) : false;

    res.json({
      ...invoice,
      purchaseType: invoice.purchaseType ?? undefined,
      totalAmount: parseFloat(invoice.totalAmount || "0"),
      totalCost: parseFloat(invoice.totalCost || "0"),
      totalProfit: parseFloat(invoice.totalProfit || "0"),
      createdAt: toIsoDateTime(invoice.createdAt),
    });

    if (printedBefore) {
      await sendNotification({
        type: "printed-invoice-edited",
        audience: "admin",
        payload: {
          title: "تعديل فاتورة مطبوعة",
          body: `تم تعديل الفاتورة ${invoice.invoiceNumber} بعد طباعتها.`,
          url: "/admin-log",
          tag: `printed-invoice-edited-${invoice.id}`,
        },
      }).catch((error) => req.log.error({ err: error }, "Failed to send printed invoice update notification"));
    }

    await evaluateRollingFinancialAlerts().catch((error) => req.log.error({ err: error }, "Failed to evaluate financial alerts"));
    await evaluateStockDepletionAlerts().catch((error) => req.log.error({ err: error }, "Failed to evaluate stock alerts"));
  } catch (err) {
    req.log.error({ err }, "Error updating invoice");
    sendRouteError(req, res, err);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = DeleteInvoiceParams.parse(req.params);
    const [invoice] = await db
      .select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id))
      .limit(1);

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
    await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    res.status(204).send();

    await sendNotification({
      type: "invoice-deleted",
      audience: "admin",
      payload: {
        title: "حذف فاتورة",
        body: `تم حذف الفاتورة ${invoice.invoiceNumber}.`,
        url: "/admin-log",
        tag: `invoice-deleted-${invoice.id}`,
      },
    }).catch((error) => req.log.error({ err: error }, "Failed to send invoice delete notification"));

    await evaluateRollingFinancialAlerts().catch((error) => req.log.error({ err: error }, "Failed to evaluate financial alerts"));
    await evaluateStockDepletionAlerts().catch((error) => req.log.error({ err: error }, "Failed to evaluate stock alerts"));
  } catch (err) {
    req.log.error({ err }, "Error deleting invoice");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
