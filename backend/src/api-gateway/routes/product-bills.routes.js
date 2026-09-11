// src/api-gateway/routes/product-bills.routes.js
import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
  listBills,
  getBill,
  getBillTransactions,
  payBill,
} from "../controllers/product-bills.controller.js";

const router = express.Router();

// all product-bill routes require auth
router.use(requireAuth);
router.use(requireRole("retailer", "distributor"));

// GET /api/product-bills?role-based
router.get("/", listBills);

// GET /api/product-bills/:billId
router.get("/:billId", getBill);

// GET /api/product-bills/:billId/transactions
router.get("/:billId/transactions", getBillTransactions);

// POST /api/product-bills/:billId/pay
router.post("/:billId/pay", payBill);

export default router;
