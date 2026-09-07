// src/api-gateway/routes/deliveries.routes.js
import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
  registerAgent,
  loginAgent,
  getAgentProfile,
  setAvailability,
  listAvailableAgents,
  listMyDeliveries,
  listDistributorDeliveries,
  assignAgent,
  markPickedUp,
  confirmDelivery,
  markFailed,
} from "../controllers/deliveries.controller.js";

const router = express.Router();

/* ---- agent account (public) ---- */
router.post("/agents/register", registerAgent);
router.post("/agents/login", loginAgent);

/* ---- agent's own profile ---- */
router.get("/agents/me", requireAuth, requireRole("delivery_agent"), getAgentProfile);
router.put("/agents/me/availability", requireAuth, requireRole("delivery_agent"), setAvailability);

/* ---- distributor: find and assign an agent ---- */
router.get("/agents/available", requireAuth, requireRole("distributor"), listAvailableAgents);
router.get("/distributor", requireAuth, requireRole("distributor"), listDistributorDeliveries);
router.put("/:deliveryId/assign", requireAuth, requireRole("distributor"), assignAgent);

/* ---- agent: run list and the delivery itself ---- */
router.get("/mine", requireAuth, requireRole("delivery_agent"), listMyDeliveries);
router.put("/:deliveryId/pickup", requireAuth, requireRole("delivery_agent"), markPickedUp);
// The trust boundary: agent submits the code the RETAILER holds.
router.put("/:deliveryId/confirm", requireAuth, requireRole("delivery_agent"), confirmDelivery);
router.put("/:deliveryId/fail", requireAuth, requireRole("delivery_agent"), markFailed);

export default router;
