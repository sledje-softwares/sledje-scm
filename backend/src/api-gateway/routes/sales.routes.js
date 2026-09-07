// src/api-gateway/routes/sales.routes.js
import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import SalesService from "../../modules/sales/sales.service.js";

const router = express.Router();

router.use(requireAuth, requireRole("retailer"));

/** The shelf, priced for selling - what the POS lists. */
router.get("/sellable", async (req, res, next) => {
  try {
    res.json({ items: await SalesService.getSellableItems(req.user) });
  } catch (e) { next(e); }
});

/** Set what this shop charges for a variant. */
router.put("/price/:variantId", async (req, res, next) => {
  try {
    const price = await SalesService.setRetailPrice(req.user, req.params.variantId, req.body.price);
    res.json({ message: "Price updated", price });
  } catch (e) { next(e); }
});

/** Ring up a sale. */
router.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await SalesService.createSale(req.user, req.body));
  } catch (e) { next(e); }
});

router.get("/", async (req, res, next) => {
  try {
    res.json({ sales: await SalesService.listSales(req.user, { limit: Number(req.query.limit) || 50 }) });
  } catch (e) { next(e); }
});

router.get("/:saleId", async (req, res, next) => {
  try {
    res.json({ sale: await SalesService.getSale(req.user, req.params.saleId) });
  } catch (e) { next(e); }
});

export default router;
