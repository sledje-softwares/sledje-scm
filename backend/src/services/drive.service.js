import { google } from "googleapis";
import fs from "fs";
import path from "path";

// Load credentials from file or env
const KEY_FILE_PATH = path.join(process.cwd(), "service-account.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

let driveClient = null;

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
        name: `${Date.now()}-${fileObject.originalname}`,
        parents: folderId ? [folderId] : [], // Upload to root if no folderId
    };

    const media = {
        mimeType: fileObject.mimetype,
        body: fs.createReadStream(fileObject.path),
    };

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
    } finally {
        // Cleanup temp file
        if (fs.existsSync(fileObject.path)) {
            fs.unlinkSync(fileObject.path);
        }
    }
}
