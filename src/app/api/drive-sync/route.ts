import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

type MediaFile = {
  id: string;
  name: string;
  size: string;
  path: string;
  mediaType: "video" | "image";
};

const VIDEO_RE = /\.(mp4|mov|avi|mkv|wmv|flv|webm|m4v|lrf)$/i;
const IMAGE_RE = /\.(jpe?g|png|heic|heif|webp|gif|tiff?)$/i;

// Recursively collect all video + image files AND every folder path (incl. empty)
async function scanDrive(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  folderPath: string = "",
  files: MediaFile[] = [],
  folders: Set<string> = new Set()
): Promise<{ files: MediaFile[]; folders: string[] }> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, size, mimeType)",
    pageSize: 1000,
  });

  const items = res.data.files || [];

  for (const item of items) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      const subPath = folderPath ? `${folderPath}/${item.name}` : item.name!;
      folders.add(subPath); // record folder even if it ends up empty
      await scanDrive(drive, item.id!, subPath, files, folders);
    } else {
      const isVideo = item.mimeType?.includes("video/") || VIDEO_RE.test(item.name || "");
      const isImage = item.mimeType?.includes("image/") || IMAGE_RE.test(item.name || "");
      if (isVideo || isImage) {
        files.push({
          id: item.id!,
          name: item.name!,
          size: item.size ? `${(parseInt(item.size) / 1024 / 1024).toFixed(1)}MB` : "Unknown",
          path: folderPath,
          mediaType: isVideo ? "video" : "image",
        });
      }
    }
  }

  return { files, folders: Array.from(folders) };
}

export async function POST(req: NextRequest) {
  try {
    const { accessToken, folderId, clientId } = await req.json();

    if (!accessToken || !folderId || !clientId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Set up Google Drive client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    // Scan metadata — videos, images, and every folder (incl. empty ones)
    const { files, folders } = await scanDrive(drive, folderId);

    // Return metadata for frontend to save to Firestore
    const clips = files.map((file) => ({
      clientId,
      name: file.name,
      driveFileId: file.id,
      driveThumbnailUrl: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`,
      folder: "raw" as const,
      tags: [],
      size: file.size,
      status: "drive-only" as const,
      path: file.path,
      mediaType: file.mediaType,
    }));

    return NextResponse.json({ success: true, count: clips.length, clips, folders });
  } catch (error) {
    console.error("Drive sync error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail || "Sync failed" }, { status: 500 });
  }
}
