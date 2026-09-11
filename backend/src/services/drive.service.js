import { google } from "googleapis";
import fs from "fs";
import path from "path";

// Load credentials from file or env
const KEY_FILE_PATH = path.join(process.cwd(), "service-account.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

let driveClient = null;

/**
 * originalname is attacker-controlled (the client sets it in the multipart
 * upload) and is used verbatim in the Drive filename below - strip path
 * separators and anything outside a safe filename character set.
 */
function sanitizeFilename(name) {
    const base = path.basename(String(name || "file"));
    const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
    return cleaned || "file";
}

async function getDriveClient() {
    if (driveClient) return driveClient;

    // Check if service-account.json exists
    if (fs.existsSync(KEY_FILE_PATH)) {
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });
        driveClient = google.drive({ version: "v3", auth });
        return driveClient;
    }

    // Fallback to env vars if needed (not implemented for simplicity, relying on file)
    console.warn("⚠️ service-account.json not found. Drive uploads will fail.");
    return null;
}

export async function uploadFileToDrive(fileObject, folderId) {
    const drive = await getDriveClient();
    if (!drive) throw new Error("Google Drive configuration missing");

    const fileMetadata = {
        name: `${Date.now()}-${sanitizeFilename(fileObject.originalname)}`,
        parents: folderId ? [folderId] : [], // Upload to root if no folderId
    };

    const media = {
        mimeType: fileObject.mimetype,
        body: fs.createReadStream(fileObject.path),
    };

    // NOTE: temp-file cleanup is deliberately NOT done here. It used to live
    // in a finally block on this same try, which meant it never ran when
    // getDriveClient() returns null above (Drive unconfigured, the default
    // with no service-account.json) - that throw happens before this try is
    // ever entered, so the temp file leaked. The caller (upload.routes.js)
    // created the temp file via multer, so it now owns deleting it in its
    // own try/finally regardless of how this function resolves.
    try {
        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: "id, webViewLink, webContentLink",
        });

        // Make the file publicly readable (optional, depends on use case)
        await drive.permissions.create({
            fileId: response.data.id,
            requestBody: {
                role: "reader",
                type: "anyone",
            },
        });

        return {
            fileId: response.data.id,
            webViewLink: response.data.webViewLink,
            webContentLink: response.data.webContentLink,
        };
    } catch (error) {
        console.error("Drive upload error:", error);
        throw error;
    }
}
