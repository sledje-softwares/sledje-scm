import express from "express";
import {
  getRetailerProfile,
  updateRetailerProfile
} from "../controllers/retailers.controller.js";

import {
  registerRetailer,
  loginRetailer
} from "../controllers/auth.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// role: retailer

// Retailer
router.post("/register", registerRetailer);
router.post("/login", loginRetailer);

router.get("/profile", requireAuth, getRetailerProfile);
router.put("/profile", requireAuth, updateRetailerProfile);

export default router;
