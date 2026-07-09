import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

type DriveVideo = { id: string; name: string; size: string; thumbnailLink?: string; folder?: string };

function esc(s: string) { return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

/**
 * List video files in the user's Drive for the podcast picker.
 * Given a query, it finds matching FOLDERS and lists videos inside them,
 * and also finds videos whose NAME matches — so typing "podcast test" (a folder)
 * or part of an episode name both work.
 */
export async function POST(req: NextRequest) {
  const { accessToken, query } = await req.json();
  if (!accessToken) return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    const videos: DriveVideo[] = [];
    const seen = new Set<string>();
    const q = (query || "").trim();

    const pushVideos = (files: { id?: string | null; name?: string | null; size?: string | null; thumbnailLink?: string | null }[], folder = "") => {
      for (const f of files) {
        if (!f.id || seen.has(f.id)) continue;
        seen.add(f.id);
        videos.push({
          id: f.id,
          name: f.name || "(unnamed)",
          size: f.size ? `${(parseInt(f.size) / 1024 / 1024).toFixed(0)}MB` : "",
          thumbnailLink: f.thumbnailLink || undefined,
          folder,
        });
      }
    };

    if (q) {
      // 1. Folders matching the query → list videos inside each.
      const folderRes = await drive.files.list({
        q: `mimeType = 'application/vnd.google-apps.folder' and name contains '${esc(q)}' and trashed = false`,
        fields: "files(id, name)", pageSize: 20,
      });
      for (const folder of folderRes.data.files || []) {
        const vids = await drive.files.list({
          q: `'${folder.id}' in parents and trashed = false and mimeType contains 'video/'`,
          fields: "files(id, name, size, thumbnailLink)", pageSize: 200,
        });
        pushVideos(vids.data.files || [], folder.name || "");
      }
      // 2. Videos whose name matches the query directly.
      const nameRes = await drive.files.list({
        q: `name contains '${esc(q)}' and trashed = false and mimeType contains 'video/'`,
        fields: "files(id, name, size, thumbnailLink)", pageSize: 200,
      });
      pushVideos(nameRes.data.files || []);
    } else {
      // No query → show the most recent videos so the user has something to click.
      const recent = await drive.files.list({
        q: `trashed = false and mimeType contains 'video/'`,
        fields: "files(id, name, size, thumbnailLink)", orderBy: "modifiedTime desc", pageSize: 50,
      });
      pushVideos(recent.data.files || []);
    }

    return NextResponse.json({ videos });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
