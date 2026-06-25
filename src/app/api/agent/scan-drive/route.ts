import { NextRequest, NextResponse } from "next/server";

const workerUrl = process.env.WORKER_URL!;
const workerSecret = process.env.WORKER_SECRET!;

export async function POST(req: NextRequest) {
  const { clientId, accessToken, taxonomy, protectedFolders } = await req.json();
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  try {
    const res = await fetch(`${workerUrl}/scan-drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({ client_id: clientId, google_access_token: accessToken, taxonomy, protected_folders: protectedFolders }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
