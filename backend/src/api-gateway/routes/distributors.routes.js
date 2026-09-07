import express from "express";
import {
  getDistributorProfile,
  updateDistributorProfile,

} from "../controllers/distributors.controller.js";

import { registerDistributor,
  loginDistributor
} from "../controllers/auth.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/register", registerDistributor);
router.post("/login", loginDistributor);

router.get("/profile", requireAuth, getDistributorProfile);
router.put("/profile", requireAuth, updateDistributorProfile);
// router.post("/batch", getDistributorsBatch);

export default router;
