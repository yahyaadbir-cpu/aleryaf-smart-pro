import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, salesListsTable } from "@workspace/db";
import { requireMutationRow, sendRouteError, toIsoDateTime } from "../lib/http";

const router: IRouter = Router();

const createSalesListBody = z.object({
  title: z.string().trim().min(1).max(120),
  printMode: z.enum(["full", "simple"]),
  salesDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(4000).optional().default(""),
  itemsText: z.string().min(1).max(20000),
  totalAmount: z.number().finite().nonnegative(),
  createdBy: z.string().trim().min(1).optional(),
});

const salesListIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

function toSalesListResponse(row: typeof salesListsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    printMode: row.printMode,
    salesDate: row.salesDate,
    notes: row.notes ?? "",
    itemsText: row.itemsText,
    totalAmount: parseFloat(row.totalAmount || "0"),
    createdBy: row.createdBy ?? null,
    createdAt: toIsoDateTime(row.createdAt),
  };
}

router.get("/", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(salesListsTable)
      .orderBy(desc(salesListsTable.salesDate), desc(salesListsTable.id));

    res.json(rows.map(toSalesListResponse));
  } catch (err) {
    req.log.error({ err }, "Error fetching sales lists");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = salesListIdParams.parse(req.params);
    const [row] = await db.select().from(salesListsTable).where(eq(salesListsTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Sales list not found" });
      return;
    }

    res.json(toSalesListResponse(row));
  } catch (err) {
    req.log.error({ err }, "Error fetching sales list");
    sendRouteError(req, res, err);
  }
});

router.post("/", async (req, res) => {
  try {
    const body = createSalesListBody.parse(req.body ?? {});
    const [inserted] = await db
      .insert(salesListsTable)
      .values({
        title: body.title,
        printMode: body.printMode,
        salesDate: body.salesDate,
        notes: body.notes,
        itemsText: body.itemsText,
        totalAmount: body.totalAmount.toString(),
        createdBy: body.createdBy,
        createdAt: new Date(),
      })
      .returning();

    const row = requireMutationRow(inserted, "Sales list");
    res.status(201).json(toSalesListResponse(row));
  } catch (err) {
    req.log.error({ err }, "Error creating sales list");
    sendRouteError(req, res, err);
  }
});

export default router;
