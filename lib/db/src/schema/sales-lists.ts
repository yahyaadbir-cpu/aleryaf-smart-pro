import { pgTable, serial, text, timestamp, date, numeric } from "drizzle-orm/pg-core";

export const salesListsTable = pgTable("sales_lists", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  printMode: text("print_mode").notNull(),
  salesDate: date("sales_date").notNull(),
  notes: text("notes"),
  itemsText: text("items_text").notNull(),
  totalAmount: numeric("total_amount", { precision: 15, scale: 4 }).notNull().default("0"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SalesList = typeof salesListsTable.$inferSelect;
