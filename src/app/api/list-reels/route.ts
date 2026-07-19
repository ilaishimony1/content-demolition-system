import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

type Reel = { id: string; name: string; size: string; thumbnailLink?: string; createdTime?: string };
type Folder = { id: string; name: string };

function extractFolderId(input: string): string {
  const m = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  return (m ? m[1] : input).trim();
}

/**
 * Browse ONE level of a Drive folder — returns its subfolders + videos, so the
 * Scheduler can navigate the tree like Drive (week → client → reels).
 * Resolves Drive shortcuts to their targets.
 */
export async function POST(req: NextRequest) {
  const { accessToken, folder } = await req.json();
  if (!accessToken || !folder) {
    return NextResponse.json({ error: "Missing accessToken or folder" }, { status: 400 });
  }
  const folderId = extractFolderId(folder);

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, size, thumbnailLink, createdTime, mimeType, shortcutDetails(targetId, targetMimeType))",
      pageSize: 1000,
      orderBy: "folder,name",
    });
    const items = res.data.files || [];

    const folders: Folder[] = [];
    const reels: Reel[] = [];
    for (const f of items) {
      let mime = f.mimeType;
      let targetId = f.id;
      if (f.mimeType === "application/vnd.google-apps.shortcut") {
        mime = f.shortcutDetails?.targetMimeType || undefined;
        targetId = f.shortcutDetails?.targetId || f.id;
      }
      if (mime === "application/vnd.google-apps.folder") {
        folders.push({ id: targetId!, name: f.name || "(folder)" });
      } else if ((mime || "").includes("video/")) {
        reels.push({
          id: targetId!,
          name: f.name || "(unnamed)",
          size: f.size ? `${(parseInt(f.size) / 1024 / 1024).toFixed(1)}MB` : "",
          thumbnailLink: f.thumbnailLink || undefined,
          createdTime: f.createdTime || undefined,
        });
      }
    }

    return NextResponse.json({ success: true, folders, reels, folderId });
  } catch (err) {
    const msg = String(err);
    if (/invalid authentication|access token|unauthorized|401|credential/i.test(msg)) {
      return NextResponse.json({ error: "auth_expired" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
