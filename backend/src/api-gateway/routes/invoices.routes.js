

import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
  listInvoices,
  getInvoice,
  getInvoicePDF,
  createInvoice,
  markInvoicePaid,
} from "../controllers/invoices.controller.js";
const router = express.Router();

router.use(requireAuth);
router.use(requireRole("retailer", "distributor"));

/**
 * GET /api/invoices
 * Query: period=monthly|weekly|custom&start=&end=
 * Role: retailer OR distributor
 */
router.get("/", listInvoices);

/**
 * GET /api/invoices/:invoiceId
 */
router.get("/:invoiceId", getInvoice);

/**
 * POST /api/invoices/generate
 * Body: { periodType, start, end }
 * Only distributor may generate invoice for retailer
 */
router.post("/generate", createInvoice);

/**
 * GET /api/invoices/:invoiceId/pdf
 */
router.get("/:invoiceId/pdf", getInvoicePDF);

router.post("/:invoiceId/pay", markInvoicePaid);

export default router;