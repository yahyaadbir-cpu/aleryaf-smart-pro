import { pgTable, serial, text, boolean, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";
import { itemsTable } from "./items";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  createdBy: text("created_by"),
  invoiceType: text("invoice_type").notNull().default("sale"),
  purchaseType: text("purchase_type"),
  branchId: integer("branch_id").references(() => branchesTable.id),
  currency: text("currency").notNull(), // TRY | USD
  totalAmount: numeric("total_amount", { precision: 15, scale: 4 }).notNull().default("0"),
  totalCost: numeric("total_cost", { precision: 15, scale: 4 }).notNull().default("0"),
  totalProfit: numeric("total_profit", { precision: 15, scale: 4 }).notNull().default("0"),
  invoiceDate: date("invoice_date").notNull(),
  customerName: text("customer_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoiceItemsTable = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => itemsTable.id),
  rawName: text("raw_name"), // original name from invoice (for messy data)
  quantity: numeric("quantity", { precision: 15, scale: 4 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 15, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 15, scale: 4 }).notNull(),
  totalPrice: numeric("total_price", { precision: 15, scale: 4 }).notNull(),
  totalCost: numeric("total_cost", { precision: 15, scale: 4 }).notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItemsTable).omit({ id: true });

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;
