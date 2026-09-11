import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
  getLedger,
  getLedgerForBill,
  getLedgerForVariant,
  getLedgerForInvoice,
  getFullStatement,
} from "../controllers/ledger.controller.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRole("retailer", "distributor"));

// GET /api/ledger
router.get("/", getLedger);

// GET /api/ledger/bill/:billId
router.get("/bill/:billId", getLedgerForBill);

// GET /api/ledger/variant/:variantId
router.get("/variant/:variantId", getLedgerForVariant);

// GET /api/ledger/invoice/:invoiceId
router.get("/invoice/:invoiceId", getLedgerForInvoice);

// GET /api/ledger/statement (full combined statement)
router.get("/statement/full", getFullStatement);

export default router;
