import { Router, type IRouter } from "express";
import { GetInvoiceParams } from "@workspace/api-zod";
import { db, invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  deactivatePushSubscription,
  getPushPublicKey,
  markInvoicePrinted,
  sendNotification,
  upsertPushSubscription,
} from "../lib/push-notifications";

const router: IRouter = Router();

router.get("/public-key", (_req, res) => {
  res.json({ publicKey: getPushPublicKey() });
});

router.post("/subscriptions", async (req, res) => {
  try {
    const subscription = req.body?.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ error: "Invalid subscription payload" });
      return;
    }

    await upsertPushSubscription({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      username: req.body?.username ?? null,
      isAdmin: !!req.body?.isAdmin,
      userAgent: req.body?.userAgent ?? null,
    });

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to register push subscription");
    res.status(500).json({ error: "Failed to register subscription" });
  }
});

router.post("/subscriptions/unregister", async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      res.status(400).json({ error: "Endpoint is required" });
      return;
    }

    await deactivatePushSubscription(endpoint);
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to unregister push subscription");
    res.status(500).json({ error: "Failed to unregister subscription" });
  }
});

router.post("/broadcast", async (req, res) => {
  try {
    const audience = req.body?.audience === "admin" ? "admin" : "all";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const tag = typeof req.body?.tag === "string" ? req.body.tag.trim() : "";

    if (!title || !body) {
      res.status(400).json({ error: "Title and body are required" });
      return;
    }

    await sendNotification({
      type: audience === "admin" ? "manual-admin-broadcast" : "manual-broadcast",
      audience,
      payload: {
        title,
        body,
        url: url || "/",
        tag: tag || `manual-broadcast-${Date.now()}`,
      },
    });

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to send manual push notification");
    res.status(500).json({ error: "Failed to send push notification" });
  }
});

router.post("/invoices/:id/printed", async (req, res) => {
  try {
    const { id } = GetInvoiceParams.parse(req.params);
    const [invoice] = await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id))
      .limit(1);

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const created = await markInvoicePrinted(id, req.body?.username ?? null);
    res.json({ ok: true, created });
  } catch (err) {
    req.log.error({ err }, "Failed to mark invoice as printed");
    res.status(500).json({ error: "Failed to mark invoice as printed" });
  }
});

export default router;
