import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const BUNNY_API_KEY = process.env.BUNNY_API_KEY;

// Recursively get all video files from a folder and its subfolders
async function getAllVideoFiles(drive: ReturnType<typeof google.drive>, folderId: string): Promise<{id: string, name: string, size: string}[]> {
  const allFiles: {id: string, name: string, size: string}[] = [];

  // Get all items in this folder
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, size, mimeType)",
    pageSize: 1000,
  });

  const items = res.data.files || [];

  for (const item of items) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      // Recurse into subfolder
      const subFiles = await getAllVideoFiles(drive, item.id!);
      allFiles.push(...subFiles);
    } else if (item.mimeType?.includes("video/")) {
      allFiles.push({
        id: item.id!,
        name: item.name!,
        size: item.size ? `${(parseInt(item.size) / 1024 / 1024).toFixed(1)}MB` : "Unknown",
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

    // Get all video files recursively
    const files = await getAllVideoFiles(drive, folderId);

    const results = [];

    for (const file of files) {
      try {
        // Download file from Google Drive
        const fileRes = await drive.files.get(
          { fileId: file.id, alt: "media" },
          { responseType: "arraybuffer" }
        );

        const fileBuffer = fileRes.data as ArrayBuffer;

        // Create video in Bunny
        const createRes = await fetch(
          `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
          {
            method: "POST",
            headers: {
              AccessKey: BUNNY_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title: file.name }),
          }
        );

        const videoData = await createRes.json();
        const videoId = videoData.guid;

        // Upload to Bunny
        await fetch(
          `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
          {
            method: "PUT",
            headers: {
              AccessKey: BUNNY_API_KEY!,
              "Content-Type": "application/octet-stream",
            },
            body: fileBuffer,
          }
        );

        results.push({
          name: file.name,
          videoId,
          clientId,
          folder: "raw",
          bunnyUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}`,
          thumbnailUrl: `https://vz-${BUNNY_LIBRARY_ID}.b-cdn.net/${videoId}/thumbnail.jpg`,
          driveFileId: file.id,
          size: file.size,
          tags: [],
        });
      } catch (err) {
        console.error(`Failed to sync file ${file.name}:`, err);
      }
    }

    return NextResponse.json({ success: true, synced: results.length, files: results });
  } catch (error) {
    console.error("Drive sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
