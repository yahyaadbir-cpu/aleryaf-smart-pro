import { Router, type IRouter } from "express";
import { db, itemsTable, itemAliasesTable, inventoryImportsTable, inventoryImportRowsTable, warehousesTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { GetInventoryQueryParams, ImportInventoryBody } from "@workspace/api-zod";
import {
  computeCanonicalInventoryValues,
  getLatestImportSnapshotMap,
  isKgUnit,
  isSummaryInventoryRow,
  normalizeArabicText,
} from "../lib/inventory";
import { requireMutationRow, sendRouteError, toIsoDateTime } from "../lib/http";
import { evaluateStockDepletionAlerts } from "../lib/push-notifications";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const query = GetInventoryQueryParams.parse(req.query);

    let conditions = sql`${itemsTable.isActive} = true`;
    if (query.search) {
      conditions = sql`${conditions} AND (${itemsTable.name} ILIKE ${"%" + query.search + "%"} OR ${itemsTable.nameAr} ILIKE ${"%" + query.search + "%"} OR ${itemsTable.code} ILIKE ${"%" + query.search + "%"})`;
    }
    if (query.category) {
      conditions = sql`${conditions} AND ${itemsTable.category} = ${query.category}`;
    }

    const items = await db.select().from(itemsTable).where(conditions).orderBy(itemsTable.name);
    const latestSnapshots = await getLatestImportSnapshotMap(db);

    const warehousePerItemResult = await db.execute(sql`
      SELECT DISTINCT ON (ir.item_id, ii.warehouse_id)
        ir.item_id,
        w.name AS warehouse_name
      FROM inventory_import_rows ir
      JOIN inventory_imports ii ON ii.id = ir.import_id
      JOIN warehouses w ON w.id = ii.warehouse_id
      WHERE ir.matched = 1 AND ir.item_id IS NOT NULL
      ORDER BY ir.item_id, ii.warehouse_id, ii.import_date DESC, ii.id DESC
    `);

    const warehouseMap = new Map<number, string[]>();
    for (const row of warehousePerItemResult.rows as Array<{ item_id: number; warehouse_name: string }>) {
      const itemId = Number(row.item_id);
      if (!warehouseMap.has(itemId)) warehouseMap.set(itemId, []);
      warehouseMap.get(itemId)!.push(row.warehouse_name);
    }

    const soldAfterImport = await db.execute(sql`
      SELECT 
        ii_items.item_id,
        COALESCE(SUM(ii_items.quantity::numeric), 0) as sold_qty
      FROM invoice_items ii_items
      JOIN invoices inv ON inv.id = ii_items.invoice_id
      JOIN (
        SELECT DISTINCT ON (ir.item_id)
          ir.item_id, ii.import_date as last_import_date
        FROM inventory_import_rows ir
        JOIN inventory_imports ii ON ii.id = ir.import_id
        WHERE ir.matched = 1 AND ir.item_id IS NOT NULL
        ORDER BY ir.item_id, ii.import_date DESC, ii.id DESC
      ) latest ON latest.item_id = ii_items.item_id
      WHERE ii_items.item_id IS NOT NULL
        AND inv.invoice_date > latest.last_import_date
      GROUP BY ii_items.item_id
    `);

    const soldAfterMap = new Map<number, number>();
    for (const row of soldAfterImport.rows as any[]) {
      soldAfterMap.set(row.item_id, parseFloat(row.sold_qty || "0"));
    }

    res.json(items.map((item) => {
      const snapshot = latestSnapshots.get(item.id);
      const importedQuantityKg = snapshot?.quantityKg ?? 0;
      const soldQuantityKg = soldAfterMap.get(item.id) || 0;
      const currentBalanceKg = Math.max(importedQuantityKg - soldQuantityKg, 0);
      const minStock = parseFloat(item.minStock || "0");
      const unitCostTry = snapshot?.costPerKgTry ?? (item.unitCostTry ? parseFloat(item.unitCostTry) : 0);
      const unitCostUsd = snapshot?.costPerKgUsd ?? (item.unitCostUsd ? parseFloat(item.unitCostUsd) : 0);
      const currency = snapshot?.currency ?? (unitCostUsd > 0 ? "USD" : "TRY");
      const costPerKg = currency === "USD" ? unitCostUsd : unitCostTry;
      const currentValueTry = currentBalanceKg * unitCostTry;
      const currentValueUsd = currentBalanceKg * unitCostUsd;
      const currentValue = currency === "USD" ? currentValueUsd : currentValueTry;

      return {
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        itemNameAr: item.nameAr,
        category: item.category,
        importDate: snapshot?.importDate ?? null,
        importedQuantityKg,
        unitDisplay: snapshot?.unitDisplay ?? "كغ",
        costPerKg,
        totalValue: snapshot?.totalValue ?? null,
        currentBalanceKg,
        currentValue,
        currency,
        openingBalance: importedQuantityKg,
        soldQuantity: soldQuantityKg,
        currentStock: currentBalanceKg,
        minStock,
        unitCostTry,
        unitCostUsd,
        inventoryValueTry: currentValueTry,
        inventoryValueUsd: currentValueUsd,
        isLowStock: currentBalanceKg <= minStock,
        warehouses: warehouseMap.get(item.id) ?? [],
      };
    }));
  } catch (err) {
    req.log.error({ err }, "Error fetching inventory");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/import", async (req, res) => {
  try {
    const body = ImportInventoryBody.parse(req.body);
    if (!body.warehouseId) {
      res.status(400).json({ error: "Warehouse is required" });
      return;
    }

    const [warehouse] = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(eq(warehousesTable.id, body.warehouseId))
      .limit(1);

    if (!warehouse) {
      res.status(400).json({ error: "Warehouse not found" });
      return;
    }

    const allItems = await db.select().from(itemsTable);
    const allAliases = await db.select().from(itemAliasesTable);

    const codeMap = new Map(allItems.map((item) => [normalizeArabicText(item.code), item]));
    const nameMap = new Map(allItems.map((item) => [normalizeArabicText(item.name), item]));
    const nameArMap = new Map(allItems.filter((item) => item.nameAr).map((item) => [normalizeArabicText(item.nameAr!), item]));
    const aliasMap = new Map(
      allAliases.map((alias) => [normalizeArabicText(alias.alias), allItems.find((item) => item.id === alias.itemId) ?? null]),
    );

    const matchItem = (code?: string, rawName?: string) => {
      if (code) {
        const normalized = normalizeArabicText(code);
        if (codeMap.has(normalized)) return codeMap.get(normalized)!;
      }
      if (rawName) {
        const normalized = normalizeArabicText(rawName);
        if (aliasMap.has(normalized)) return aliasMap.get(normalized) ?? null;
        if (nameMap.has(normalized)) return nameMap.get(normalized)!;
        if (nameArMap.has(normalized)) return nameArMap.get(normalized)!;
        for (const [name, item] of nameMap) {
          if (name.includes(normalized) || normalized.includes(name)) return item;
        }
      }
      return null;
    };

    let rowsMatched = 0;
    let rowsUnmatched = 0;
    const unmatchedItems: string[] = [];

    const [createdImportRecord] = await db.insert(inventoryImportsTable).values({
      importDate: body.importDate,
      warehouseId: body.warehouseId,
      rowsProcessed: 0,
      rowsMatched: 0,
      rowsUnmatched: 0,
      createdAt: new Date(),
    }).returning();
    const importRecord = requireMutationRow(createdImportRecord, "Inventory import");

    for (const row of body.rows) {
      if (isSummaryInventoryRow(row.rawName, row.itemCode)) continue;

      if (!isKgUnit(row.unit)) {
        rowsUnmatched++;
        unmatchedItems.push(`${row.rawName || row.itemCode || "Unknown"} (unsupported unit: ${row.unit || "-"})`);
        continue;
      }

      const rawCost = row.costTry ?? row.costUsd ?? null;
      const canonical = computeCanonicalInventoryValues(row.quantity, row.unit, rawCost);
      if (canonical.quantityKg <= 0) continue;

      const matchedItem = matchItem(row.itemCode, row.rawName);
      const costPerKgString = canonical.costPerKg == null ? undefined : canonical.costPerKg.toString();
      const totalValue = row.totalValue ?? canonical.totalValue ?? undefined;

      if (matchedItem) {
        rowsMatched++;
        if (canonical.costPerKg != null) {
          await db.execute(sql`
            UPDATE items SET 
              unit_cost_try = COALESCE(${row.costTry != null ? costPerKgString : null}::numeric, unit_cost_try),
              unit_cost_usd = COALESCE(${row.costUsd != null ? costPerKgString : null}::numeric, unit_cost_usd)
            WHERE id = ${matchedItem.id}
          `);
        }
      } else {
        rowsUnmatched++;
        unmatchedItems.push(row.rawName || row.itemCode || "Unknown");
      }

      await db.insert(inventoryImportRowsTable).values({
        importId: importRecord.id,
        itemId: matchedItem?.id,
        itemCode: row.itemCode,
        rawName: row.rawName,
        quantity: canonical.quantityKg.toString(),
        costTry: row.costTry != null ? costPerKgString : undefined,
        costUsd: row.costUsd != null ? costPerKgString : undefined,
        sourceUnit: canonical.unitDisplay,
        sourceQuantity: canonical.quantityKg.toString(),
        sourceUnitCost: canonical.costPerKg?.toString(),
        sourceTotalValue: totalValue?.toString(),
        normalizedQtyKg: canonical.quantityKg.toString(),
        normalizedCostPerKg: canonical.costPerKg?.toString(),
        matched: matchedItem ? 1 : 0,
      });
    }

    await db.update(inventoryImportsTable)
      .set({ rowsProcessed: rowsMatched + rowsUnmatched, rowsMatched, rowsUnmatched })
      .where(eq(inventoryImportsTable.id, importRecord.id));

    res.json({
      importId: importRecord.id,
      importDate: body.importDate,
      rowsProcessed: rowsMatched + rowsUnmatched,
      rowsMatched,
      rowsUnmatched,
      unmatchedItems,
    });

    await evaluateStockDepletionAlerts().catch((error) => req.log.error({ err: error }, "Failed to evaluate stock alerts"));
  } catch (err) {
    req.log.error({ err }, "Error importing inventory");
    sendRouteError(req, res, err);
  }
});

router.get("/imports", async (req, res) => {
  try {
    const imports = await db.select({
      id: inventoryImportsTable.id,
      importDate: inventoryImportsTable.importDate,
      warehouseId: inventoryImportsTable.warehouseId,
      warehouseName: warehousesTable.name,
      rowsProcessed: inventoryImportsTable.rowsProcessed,
      rowsMatched: inventoryImportsTable.rowsMatched,
      rowsUnmatched: inventoryImportsTable.rowsUnmatched,
      createdAt: inventoryImportsTable.createdAt,
    }).from(inventoryImportsTable)
      .leftJoin(warehousesTable, eq(inventoryImportsTable.warehouseId, warehousesTable.id))
      .orderBy(desc(inventoryImportsTable.createdAt))
      .limit(50);
    res.json(imports.map((imp) => ({
      ...imp,
      createdAt: toIsoDateTime(imp.createdAt),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching import history");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
