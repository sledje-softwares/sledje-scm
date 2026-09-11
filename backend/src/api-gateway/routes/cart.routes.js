import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  checkoutCart
} from "../controllers/cart.controller.js";

const router = express.Router();

// Cart is retailer-only: cart.service.js dereferences a retailer-profile
// lookup with no null check, so a non-retailer token 500s there without
// this guard.
router.use(requireAuth);
router.use(requireRole("retailer"));

router.get("/", getCart);
router.post("/add", addToCart);
router.put("/update", updateCartItem);
router.delete("/:variantId", removeCartItem);
router.delete("/", clearCart);

// Order creation from cart
router.post("/checkout", checkoutCart);

export default router;
