// src/api-gateway/routes/distributorships.routes.js
import express from "express";
import {
  createDistributorship,
  listDistributorships,
  getDistributorshipDetails,
  requestToJoinDistributorship,
  respondToMembershipRequest,
} from "../controllers/distributorships.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

const router = express.Router();

// For frontend distributorship section (replacing hardcoded Groceries/Beverages/Personal Care)
// Deliberately unaffected by the Phase 2b membership model: browsing the
// catalogue is a separate, already-correct scope from a distributor's write
// access to it.
router.get("/", listDistributorships);
router.get("/:id", getDistributorshipDetails);

// Bootstrap a new distributorship (auto-activates the caller as its first
// member) or, on a name collision, submit a join request for the existing one.
router.post("/", requireAuth, requireRole("distributor"), createDistributorship);

// Request membership in an existing distributorship.
router.post(
  "/:id/join-request",
  requireAuth,
  requireRole("distributor"),
  requestToJoinDistributorship
);

// An existing active member approves/rejects a pending membership request.
router.put(
  "/:id/members/:requestId/respond",
  requireAuth,
  requireRole("distributor"),
  respondToMembershipRequest
);

export default router;
