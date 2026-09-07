import express from "express";
import {
  createOrder,
  getRetailerOrders,
  getRetailerOrder,
  modifyOrder,
  cancelOrder,
  completeOrder,
  approveModifiedOrder,

  getDistributorOrders,
  getDistributorOrder,
  processDistributorOrder,
  dispatchOrder,
  updateOrderStatus
} from "../controllers/orders.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Retailer endpoints
router.post("/create", requireAuth, createOrder);
router.get("/retailer/orders", requireAuth, getRetailerOrders);
router.get("/retailer/orders/:orderId", requireAuth, getRetailerOrder);
router.put("/retailer/orders/:orderId/modify", requireAuth, modifyOrder);
router.put("/retailer/orders/:orderId/cancel", requireAuth, cancelOrder);
router.put("/retailer/orders/:orderId/complete", requireAuth, completeOrder);
router.put("/retailer/orders/:orderId/approve", requireAuth, approveModifiedOrder);

// Distributor endpoints
router.get("/distributor/orders", requireAuth, getDistributorOrders);
router.get("/distributor/orders/:orderId", requireAuth, getDistributorOrder);
router.put("/distributor/orders/:orderId/process", requireAuth, processDistributorOrder);
router.put("/distributor/orders/:orderId/dispatch", requireAuth, dispatchOrder);
router.put("/distributor/orders/:orderId/status", requireAuth, updateOrderStatus);

export default router;
