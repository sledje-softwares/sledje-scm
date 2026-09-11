// src/api-gateway/routes/sync.routes.js
import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import SyncService from "../../modules/sync/sync.service.js";

const router = express.Router();

// Offline-POS devices can batch a long backlog of operations into one call
// after an extended offline period (docs/16-offline-first.md). app.js's
// default express.json() limit (200kb, P5-6) would truncate/413 exactly the
// devices this design exists for, so this router gets its own larger parser
// - and is mounted in app.js BEFORE the default one is registered, so this
// is the only parser a /sync request body ever reaches.
router.use(express.json({ limit: "5mb" }));

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
