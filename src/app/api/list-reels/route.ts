import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

type Reel = { id: string; name: string; size: string; thumbnailLink?: string; week: string; createdTime?: string };

// Accept a full Drive URL or a bare folder ID
function extractFolderId(input: string): string {
  const m = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  return (m ? m[1] : input).trim();
}

/**
 * List all finished reels (videos) inside Maayan's ready-reels folder.
 * The folder is organized into weekly subfolders (e.g. "שבוע 12/7-19/7") — so we
 * list videos in each subfolder AND any sitting directly in the root, tagging each
 * with its week (subfolder name) so the Scheduler can group them.
 */
export async function POST(req: NextRequest) {
  const { accessToken, folder } = await req.json();
  if (!accessToken || !folder) {
    return NextResponse.json({ error: "Missing accessToken or folder" }, { status: 400 });
  }
  const rootId = extractFolderId(folder);

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    const reels: Reel[] = [];
    const seen = new Set<string>();

    const pushVideos = (
      files: { id?: string | null; name?: string | null; size?: string | null; thumbnailLink?: string | null; createdTime?: string | null }[],
      week: string,
    ) => {
      for (const f of files) {
        if (!f.id || seen.has(f.id)) continue;
        seen.add(f.id);
        reels.push({
          id: f.id,
          name: f.name || "(unnamed)",
          size: f.size ? `${(parseInt(f.size) / 1024 / 1024).toFixed(1)}MB` : "",
          thumbnailLink: f.thumbnailLink || undefined,
          week,
          createdTime: f.createdTime || undefined,
        });
      }
    };

    // Videos sitting directly in the root folder → week "כללי"
    const rootVids = await drive.files.list({
      q: `'${rootId}' in parents and trashed = false and mimeType contains 'video/'`,
      fields: "files(id, name, size, thumbnailLink, createdTime)",
      pageSize: 500,
      orderBy: "createdTime desc",
    });
    pushVideos(rootVids.data.files || [], "כללי");

    // Weekly subfolders → list videos in each
    const subFolders = await drive.files.list({
      q: `'${rootId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "files(id, name)",
      pageSize: 100,
    });
    for (const sub of subFolders.data.files || []) {
      const vids = await drive.files.list({
        q: `'${sub.id}' in parents and trashed = false and mimeType contains 'video/'`,
        fields: "files(id, name, size, thumbnailLink, createdTime)",
        pageSize: 500,
        orderBy: "createdTime desc",
      });
      pushVideos(vids.data.files || [], sub.name || "");
    }

    return NextResponse.json({ success: true, reels, folderId: rootId });
  } catch (err) {
    const msg = String(err);
    if (/invalid authentication|access token|unauthorized|401|credential/i.test(msg)) {
      return NextResponse.json({ error: "auth_expired" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
