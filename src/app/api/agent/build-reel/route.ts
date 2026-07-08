import { NextRequest, NextResponse } from "next/server";

const workerUrl = process.env.WORKER_URL!;
const workerSecret = process.env.WORKER_SECRET!;

/**
 * Proxy to the worker's /build-reel: assemble a silent 9:16 rough cut from the
 * chosen library clips (trim + concat). Music + captions are added 1:1 by the
 * editor after. The finished draft lands in the Production Queue.
 */
export async function POST(req: NextRequest) {
  const { clientId, clientName, title, sourceUrl, accessToken, rootFolderId, clips, clipSeconds } = await req.json();
  if (!clientId || !accessToken || !Array.isArray(clips) || clips.length === 0) {
    return NextResponse.json({ error: "Missing clientId, accessToken or clips" }, { status: 400 });
  }
  try {
    const res = await fetch(`${workerUrl}/build-reel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({
        client_id: clientId,
        client_name: clientName || "",
        title: title || "AI rough cut",
        source_url: sourceUrl || "",
        google_access_token: accessToken,
        root_folder_id: rootFolderId || null,
        clips,
        clip_seconds: clipSeconds || 2.0,
      }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
