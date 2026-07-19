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

    // Recursively walk the whole folder tree (Maayan nests reels as
    // ready-reels → week → client → reel, so a 1-level scan misses them).
    // Each video is labelled with its immediate parent folder name.
    async function walk(folderId: string, label: string, depth: number) {
      if (depth > 6) return; // safety
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, size, thumbnailLink, createdTime, mimeType, shortcutDetails(targetId, targetMimeType))",
        pageSize: 1000,
        orderBy: "createdTime desc",
      });
      const items = res.data.files || [];
      const vids = items.filter(f => (f.mimeType || "").includes("video/"));
      pushVideos(vids, label);
      const folders = items.filter(f =>
        f.mimeType === "application/vnd.google-apps.folder" ||
        (f.mimeType === "application/vnd.google-apps.shortcut" && f.shortcutDetails?.targetMimeType === "application/vnd.google-apps.folder"));
      for (const sub of folders) {
        const targetId = sub.mimeType === "application/vnd.google-apps.shortcut" ? sub.shortcutDetails?.targetId : sub.id;
        if (targetId) await walk(targetId, sub.name || label, depth + 1);
      }
    }
    await walk(rootId, "כללי", 0);

    return NextResponse.json({ success: true, reels, folderId: rootId });
  } catch (err) {
    const msg = String(err);
    if (/invalid authentication|access token|unauthorized|401|credential/i.test(msg)) {
      return NextResponse.json({ error: "auth_expired" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
