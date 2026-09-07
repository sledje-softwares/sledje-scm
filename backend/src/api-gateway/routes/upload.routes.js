import express from "express";
import multer from "multer";
import { uploadFileToDrive } from "../../services/drive.service.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import DistributorsRepo from "../../modules/distributors/distributors.repository.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" }); // Temp storage

router.post("/profile-picture", requireAuth, upload.single("image"), async (req, res, next) => {
    try {
        if (!req.file) throw new Error("No file uploaded");

        // Use a default folder ID or env var
        const folderId = process.env.DRIVE_FOLDER_ID;

        const result = await uploadFileToDrive(req.file, folderId);

        // Update user profile in DB
        // Note: We need to know if it's a distributor or retailer to update the correct table.
        // Assuming distributor for now based on current task context.
        if (req.user.role === "distributor") {
            await DistributorsRepo.updateProfile(req.user.id, { profilePictureUrl: result.webViewLink });
        }
        // TODO: Handle retailer case

        res.json({
            message: "Profile picture updated",
            url: result.webViewLink,
        });
    } catch (err) {
        next(err);
    }
});

export default router;
