import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// Recursively get all video files metadata from a folder
async function getAllVideoFiles(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  folderPath: string = ""
): Promise<{ id: string; name: string; size: string; path: string }[]> {
  const allFiles: { id: string; name: string; size: string; path: string }[] = [];

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, size, mimeType)",
    pageSize: 1000,
  });

  const items = res.data.files || [];

  for (const item of items) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      const subPath = folderPath ? `${folderPath}/${item.name}` : item.name!;
      const subFiles = await getAllVideoFiles(drive, item.id!, subPath);
      allFiles.push(...subFiles);
    } else if (item.mimeType?.includes("video/") || item.name?.match(/\.(mp4|mov|avi|mkv|wmv|flv|webm|m4v|lrf|LRF)$/i)) {
      allFiles.push({
        id: item.id!,
        name: item.name!,
        size: item.size ? `${(parseInt(item.size) / 1024 / 1024).toFixed(1)}MB` : "Unknown",
        path: folderPath,
      });
    }
  }

  return allFiles;
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

    // Just scan metadata — no downloading, no Bunny upload
    const files = await getAllVideoFiles(drive, folderId);

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
    }));

    return NextResponse.json({ success: true, count: clips.length, clips });
  } catch (error) {
    console.error("Drive sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
