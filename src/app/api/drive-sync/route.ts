import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const BUNNY_API_KEY = process.env.BUNNY_API_KEY;

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

    // List video files in the folder
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: "files(id, name, size, mimeType, modifiedTime)",
      pageSize: 100,
    });

    const files = res.data.files || [];

    const results = [];

    for (const file of files) {
      try {
        // Download file from Google Drive
        const fileRes = await drive.files.get(
          { fileId: file.id!, alt: "media" },
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
          size: file.size ? `${(parseInt(file.size) / 1024 / 1024).toFixed(1)}MB` : "Unknown",
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
