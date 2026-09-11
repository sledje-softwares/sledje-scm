import express from "express";
import {
  getProducts,
  getConnectedDistributorsProducts,
  getSingleProduct,
  addProduct,
  updateProduct,
  deleteProduct,bulkImportProducts
} from "../controllers/products.controller.js";
import multer from "multer";


// memory storage is fine for CSV/Excel; 5MB cap bounds how much gets
// buffered in memory before parsing (P5-9).
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

const router = express.Router();

// Public read (optional auth)
router.get("/get", getProducts);
router.get("/connected-distributors", requireAuth, getConnectedDistributorsProducts);
router.get("/:productId", getSingleProduct);

// Protected: only distributors may add/update/delete
router.post("/add", requireAuth, addProduct);
router.put("/:productId", requireAuth, updateProduct);
router.delete("/:productId", requireAuth, deleteProduct);
// Protected: only distributors may bulk upload. requireRole runs BEFORE
// upload.single("file") so an unauthorized caller is rejected before their
// file is buffered into memory at all (P5-9) - the controller's own role
// check (products.controller.js) stays in place as defense-in-depth.
router.post(
  "/bulk-upload",
  requireAuth,
  requireRole("distributor"),
  upload.single("file"),
  bulkImportProducts
);

export default router;
