// src/api-gateway/routes/distributor-inventory.routes.js
import express from "express";
import {
  getMyDistributorInventory,
  importVariantToInventory,
} from "../controllers/distributor-inventory.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Distributor-side inventory management
router.get("/mine", requireAuth, getMyDistributorInventory);
router.post("/import", requireAuth, importVariantToInventory);

export default router;
