// src/api-gateway/routes/distributorships.routes.js
import express from "express";
import {
  createDistributorship,
  listDistributorships,
  getDistributorshipDetails,
} from "../controllers/distributorships.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// For frontend distributorship section (replacing hardcoded Groceries/Beverages/Personal Care)
router.get("/", listDistributorships);
router.get("/:id", getDistributorshipDetails);

// Allow authenticated distributors to create new distributorships
router.post("/", requireAuth, createDistributorship);

export default router;
