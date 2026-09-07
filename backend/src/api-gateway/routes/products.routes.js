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


const upload = multer(); // memory storage is fine for CSV/Excel

import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Public read (optional auth)
router.get("/get", getProducts);
router.get("/connected-distributors", requireAuth, getConnectedDistributorsProducts);
router.get("/:productId", getSingleProduct);

// Protected: only distributors may add/update/delete
router.post("/add", requireAuth, addProduct);
router.put("/:productId", requireAuth, updateProduct);
router.delete("/:productId", requireAuth, deleteProduct);
// Protected: only distributors may bulk upload
router.post(
  "/bulk-upload",
  requireAuth,
  upload.single("file"),
  bulkImportProducts
);

export default router;
