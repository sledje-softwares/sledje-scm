import express from "express";
import {
  registerRetailer,
  loginRetailer,
  registerDistributor,
  loginDistributor,
  forgotPassword,
  verifyOtp,
  resetPassword,
} from "../controllers/auth.controller.js";

const router = express.Router();

// Distributor
router.post("/distributors/register", registerDistributor);
router.post("/distributors/login", loginDistributor);

// OTP / reset flows (shared)
router.post("/forgot-password", forgotPassword); // body: { email, role? }
router.post("/verify-otp", verifyOtp); // body: { email, otp }
router.post("/reset-password", resetPassword); // body: { email, otp, newPassword }

export default router;
