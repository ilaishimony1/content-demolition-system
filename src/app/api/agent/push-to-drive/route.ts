import { NextRequest, NextResponse } from "next/server";

const workerUrl = process.env.WORKER_URL!;
const workerSecret = process.env.WORKER_SECRET!;

export async function POST(req: NextRequest) {
  const { clientId, accessToken, rootFolderId, moves } = await req.json();
  if (!clientId || !accessToken || !rootFolderId || !Array.isArray(moves)) {
    return NextResponse.json({ error: "Missing clientId, accessToken, rootFolderId or moves" }, { status: 400 });
  }
  try {
    const res = await fetch(`${workerUrl}/push-to-drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({
        client_id: clientId,
        google_access_token: accessToken,
        root_folder_id: rootFolderId,
        moves,
      }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
