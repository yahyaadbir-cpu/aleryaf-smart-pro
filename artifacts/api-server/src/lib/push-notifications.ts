import webpush from "web-push";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  invoicePrintEventsTable,
  notificationEventsTable,
  pushSubscriptionsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { appEnv } from "./env";

type NotificationAudience = "all" | "admin";

type NotificationPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  image?: string;
};

type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  username?: string | null;
  isAdmin?: boolean;
  userAgent?: string | null;
};

const vapidKeys = {
  publicKey: appEnv.VAPID_PUBLIC_KEY,
  privateKey: appEnv.VAPID_PRIVATE_KEY,
};

webpush.setVapidDetails(
  appEnv.VAPID_SUBJECT,
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

export function getPushPublicKey() {
  return vapidKeys.publicKey;
}

export async function upsertPushSubscription(input: PushSubscriptionInput) {
  const now = new Date();
  const existing = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, input.endpoint))
    .limit(1);

  if (existing[0]) {
    await db
      .update(pushSubscriptionsTable)
      .set({
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        username: input.username ?? null,
        isAdmin: input.isAdmin ? 1 : 0,
        isActive: 1,
        userAgent: input.userAgent ?? null,
        updatedAt: now,
        lastSeenAt: now,
      })
      .where(eq(pushSubscriptionsTable.endpoint, input.endpoint));
    return;
  }

  await db.insert(pushSubscriptionsTable).values({
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    username: input.username ?? null,
    isAdmin: input.isAdmin ? 1 : 0,
    isActive: 1,
    userAgent: input.userAgent ?? null,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });
}

export async function deactivatePushSubscription(endpoint: string) {
  await db
    .update(pushSubscriptionsTable)
    .set({
      isActive: 0,
      updatedAt: new Date(),
    })
    .where(eq(pushSubscriptionsTable.endpoint, endpoint));
}

async function getActiveSubscriptions(audience: NotificationAudience) {
  const rows = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(sql`${pushSubscriptionsTable.isActive} = 1 ${audience === "admin" ? sql`AND ${pushSubscriptionsTable.isAdmin} = 1` : sql``}`);

  return rows;
}

async function sendPayloadToAudience(audience: NotificationAudience, payload: NotificationPayload) {
  const subscriptions = await getActiveSubscriptions(audience);
  if (!subscriptions.length) return;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload),
        );
      } catch (error: any) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deactivatePushSubscription(subscription.endpoint);
          return;
        }
        logger.error({ err: error, endpoint: subscription.endpoint }, "Failed to send web push notification");
      }
    }),
  );
}

export async function sendNotificationOnce(params: {
  eventKey: string;
  type: string;
  audience: NotificationAudience;
  payload: NotificationPayload;
}) {
  const existing = await db
    .select({ id: notificationEventsTable.id })
    .from(notificationEventsTable)
    .where(eq(notificationEventsTable.eventKey, params.eventKey))
    .limit(1);

  if (existing[0]) return false;

  await db.insert(notificationEventsTable).values({
    eventKey: params.eventKey,
    type: params.type,
    title: params.payload.title,
    body: params.payload.body,
    audience: params.audience,
    createdAt: new Date(),
  });

  await sendPayloadToAudience(params.audience, {
    icon: "/pwa-512.png",
    ...params.payload,
  });
  return true;
}

export async function sendNotification(params: {
  type: string;
  audience: NotificationAudience;
  payload: NotificationPayload;
}) {
  const eventKey = `${params.type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(notificationEventsTable).values({
    eventKey,
    type: params.type,
    title: params.payload.title,
    body: params.payload.body,
    audience: params.audience,
    createdAt: new Date(),
  });

  await sendPayloadToAudience(params.audience, {
    icon: "/pwa-512.png",
    ...params.payload,
  });
}

export async function markInvoicePrinted(invoiceId: number, printedBy?: string | null) {
  const existing = await db
    .select({ id: invoicePrintEventsTable.id })
    .from(invoicePrintEventsTable)
    .where(eq(invoicePrintEventsTable.invoiceId, invoiceId))
    .limit(1);

  if (existing[0]) return false;

  await db.insert(invoicePrintEventsTable).values({
    invoiceId,
    printedBy: printedBy ?? null,
    printedAt: new Date(),
  });
  return true;
}

export async function hasInvoiceBeenPrinted(invoiceId: number) {
  const existing = await db
    .select({ id: invoicePrintEventsTable.id })
    .from(invoicePrintEventsTable)
    .where(eq(invoicePrintEventsTable.invoiceId, invoiceId))
    .limit(1);

  return !!existing[0];
}

export async function evaluateRollingFinancialAlerts() {
  const today = new Date().toISOString().slice(0, 10);

  const twoWeekRows = await db.execute(sql`
    WITH invoice_totals AS (
      SELECT
        inv.currency,
        COALESCE(SUM((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000)), 0) AS revenue,
        COALESCE(SUM((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000) - (ii.quantity::numeric) * (ii.unit_cost::numeric)), 0) AS profit
      FROM invoices inv
      JOIN invoice_items ii ON ii.invoice_id = inv.id
      WHERE inv.invoice_date >= CURRENT_DATE - INTERVAL '13 days'
      GROUP BY inv.currency
    )
    SELECT currency, revenue, profit
    FROM invoice_totals
  `);

  for (const row of twoWeekRows.rows as Array<{ currency: "TRY" | "USD"; revenue: string; profit: string }>) {
    const revenue = parseFloat(row.revenue || "0");
    const profit = parseFloat(row.profit || "0");

    if (revenue >= 100000) {
      await sendNotificationOnce({
        eventKey: `sales-14d-100k:${row.currency}:${today}`,
        type: "sales-14d-threshold",
        audience: "all",
        payload: {
          title: "إنجاز مبيعات",
          body: `مبيعات آخر أسبوعين وصلت إلى ${Math.round(revenue).toLocaleString("en-US")} ${row.currency}.`,
          url: "/profit",
          tag: `sales-14d-${row.currency}`,
        },
      });
    }

    if (profit >= 50000) {
      await sendNotificationOnce({
        eventKey: `profit-14d-50k:${row.currency}:${today}`,
        type: "profit-14d-threshold",
        audience: "all",
        payload: {
          title: "إنجاز أرباح",
          body: `ربح آخر أسبوعين وصل إلى ${Math.round(profit).toLocaleString("en-US")} ${row.currency}.`,
          url: "/profit",
          tag: `profit-14d-${row.currency}`,
        },
      });
    }
  }

  const dailyRows = await db.execute(sql`
    WITH daily_profit AS (
      SELECT
        inv.currency,
        inv.invoice_date::date AS day,
        COALESCE(SUM((ii.quantity::numeric) * ((ii.unit_price::numeric) / 1000) - (ii.quantity::numeric) * (ii.unit_cost::numeric)), 0) AS profit
      FROM invoices inv
      JOIN invoice_items ii ON ii.invoice_id = inv.id
      WHERE inv.invoice_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY inv.currency, inv.invoice_date::date
    )
    SELECT currency, day::text AS day, profit
    FROM daily_profit
    ORDER BY currency, day
  `);

  const grouped = new Map<string, Array<{ day: string; profit: number }>>();
  for (const row of dailyRows.rows as Array<{ currency: string; day: string; profit: string }>) {
    const bucket = grouped.get(row.currency) ?? [];
    bucket.push({ day: row.day, profit: parseFloat(row.profit || "0") });
    grouped.set(row.currency, bucket);
  }

  for (const [currency, values] of grouped.entries()) {
    const todayProfit = values.find((item) => item.day === today)?.profit ?? 0;
    const previousSeven = values.filter((item) => item.day !== today).map((item) => item.profit);
    if (!previousSeven.length) continue;

    const average = previousSeven.reduce((sum, value) => sum + value, 0) / previousSeven.length;
    if (average <= 0) continue;

    if (todayProfit < average * 0.7) {
      await sendNotificationOnce({
        eventKey: `profit-drop-7d:${currency}:${today}`,
        type: "profit-drop-7d",
        audience: "all",
        payload: {
          title: "انخفاض غير طبيعي في الربح",
          body: `ربح اليوم أقل بشكل ملحوظ من متوسط آخر 7 أيام في ${currency}.`,
          url: "/profit",
          tag: `profit-drop-${currency}`,
        },
      });
    }
  }
}

export async function evaluateStockDepletionAlerts() {
  const result = await db.execute(sql`
    WITH latest_import AS (
      SELECT DISTINCT ON (ir.item_id)
        ir.item_id,
        ii.id AS import_id,
        COALESCE(ir.normalized_qty_kg, ir.quantity)::numeric AS opening_balance
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
      JOIN latest_import li ON li.item_id = inv_items.item_id AND inv.invoice_date > (
        SELECT import_date FROM inventory_imports WHERE id = li.import_id
      )
      GROUP BY inv_items.item_id
    )
    SELECT
      i.id AS item_id,
      i.name,
      i.name_ar,
      li.import_id,
      GREATEST(COALESCE(li.opening_balance, 0) - COALESCE(sa.sold_qty, 0), 0) AS current_stock
    FROM items i
    JOIN latest_import li ON li.item_id = i.id
    LEFT JOIN sold_after sa ON sa.item_id = i.id
    WHERE i.is_active = true
  `);

  for (const row of result.rows as Array<{ item_id: number; name: string; name_ar: string | null; import_id: number; current_stock: string }>) {
    const currentStock = parseFloat(row.current_stock || "0");
    if (currentStock > 0) continue;

    const itemName = row.name_ar || row.name || `#${row.item_id}`;
    await sendNotificationOnce({
      eventKey: `stock-zero:${row.item_id}:${row.import_id}`,
      type: "stock-zero",
      audience: "all",
      payload: {
        title: "نفاد المخزون",
        body: `المادة ${itemName} وصلت إلى 0 كغ.`,
        url: "/inventory",
        tag: `stock-zero-${row.item_id}`,
      },
    });
  }
}
