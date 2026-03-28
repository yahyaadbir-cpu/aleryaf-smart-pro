import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import branchesRouter from "./branches";
import warehousesRouter from "./warehouses";
import invoicesRouter from "./invoices";
import itemsRouter from "./items";
import inventoryRouter from "./inventory";
import profitRouter from "./profit";
import activityLogRouter from "./activity-log";
import notificationsRouter from "./notifications";
import usersRouter from "./users";
import handbookRouter from "./handbook";
import reportsRouter from "./reports";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(requireAuth);
router.use("/dashboard", dashboardRouter);
router.use("/branches", branchesRouter);
router.use("/warehouses", warehousesRouter);
router.use("/invoices", invoicesRouter);
router.use("/items", itemsRouter);
router.use("/inventory", inventoryRouter);
router.use("/profit", profitRouter);
router.use("/activity-log", activityLogRouter);
router.use("/notifications", notificationsRouter);
router.use("/users", usersRouter);
router.use("/handbook", handbookRouter);
router.use("/reports", reportsRouter);

export default router;
