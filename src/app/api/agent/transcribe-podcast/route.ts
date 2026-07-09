import { NextRequest, NextResponse } from "next/server";

const workerUrl = process.env.WORKER_URL!;
const workerSecret = process.env.WORKER_SECRET!;

/** Proxy to the worker's /transcribe-podcast — Hebrew transcription via Groq Whisper. */
export async function POST(req: NextRequest) {
  const { clientId, episodeId, accessToken, driveFileId, driveFileName, episodeTitle } = await req.json();
  if (!clientId || !episodeId || !accessToken || (!driveFileId && !driveFileName)) {
    return NextResponse.json({ error: "Missing clientId, episodeId, accessToken, or a drive file id/name" }, { status: 400 });
  }
  try {
    const res = await fetch(`${workerUrl}/transcribe-podcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({
        client_id: clientId,
        episode_id: episodeId,
        google_access_token: accessToken,
        drive_file_id: driveFileId || null,
        drive_file_name: driveFileName || null,
        episode_title: episodeTitle || "",
      }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
