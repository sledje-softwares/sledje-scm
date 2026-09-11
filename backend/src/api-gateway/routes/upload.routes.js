import express from "express";
import multer from "multer";
import fs from "fs/promises";
import { uploadFileToDrive } from "../../services/drive.service.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import DistributorsRepo from "../../modules/distributors/distributors.repository.js";
import RetailersRepo from "../../modules/retailers/retailers.repository.js";

const router = express.Router();

// Profile pictures only: bound both size and type. The mimetype check here
// is the client-declared Content-Type, which is a cheap gate, not a proof -
// a deeper magic-byte sniff is a nice-to-have flagged for later, not
// required for this pass.
const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

const upload = multer({
  dest: "uploads/", // Temp storage
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }, // 2MB, single file
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error("Only PNG, JPEG, or WEBP images are allowed"));
    }
    cb(null, true);
  },
});

router.post("/profile-picture", requireAuth, upload.single("image"), async (req, res, next) => {
    try {
        if (!req.file) throw new Error("No file uploaded");

        // Use a default folder ID or env var
        const folderId = process.env.DRIVE_FOLDER_ID;

        const result = await uploadFileToDrive(req.file, folderId);

        // Update user profile in DB
        // Note: We need to know if it's a distributor or retailer to update the correct table.
        if (req.user.role === "distributor") {
            await DistributorsRepo.updateProfile(req.user.id, { profilePictureUrl: result.webViewLink });
        } else if (req.user.role === "retailer") {
            await RetailersRepo.updateProfile(req.user.id, { profilePictureUrl: result.webViewLink });
        }

        res.json({
            message: "Profile picture updated",
            url: result.webViewLink,
        });
    } catch (err) {
        next(err);
    } finally {
        // multer created this temp file, so this route owns deleting it -
        // regardless of whether the Drive upload succeeded, threw, or the
        // role branch above was skipped. Previously cleanup lived inside
        // drive.service.js's own finally block, but that block sits on a
        // try that is never reached when Drive is unconfigured (the
        // default, no service-account.json), so the temp file leaked.
        if (req.file?.path) {
            await fs.unlink(req.file.path).catch(() => {});
        }
    }
});

export default router;
