// src/api-gateway/routes/sync.routes.js
import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import SyncService from "../../modules/sync/sync.service.js";

const router = express.Router();

router.use(requireAuth, requireRole("retailer"));

/**
 * Push a batch of device operations, pull back everything that changed.
 *
 * Always 200 when the batch was processed, even if an op inside it failed -
 * the per-op verdicts are in the body. A non-2xx here means the whole batch
 * could not be looked at (bad auth, malformed envelope), and the device should
 * retry the lot unchanged. Ops are idempotent, so retrying is free.
 */
router.post("/", async (req, res, next) => {
  try {
    res.json(await SyncService.sync(req.user, req.body));
  } catch (e) { next(e); }
});

export default router;
