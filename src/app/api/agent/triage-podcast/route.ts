import { NextRequest, NextResponse } from "next/server";

const workerUrl = process.env.WORKER_URL!;
const workerSecret = process.env.WORKER_SECRET!;

/** Proxy to the worker's /triage-podcast — Claude reads the transcript, returns gold/keep/cut. */
export async function POST(req: NextRequest) {
  const { episodeId } = await req.json();
  if (!episodeId) {
    return NextResponse.json({ error: "Missing episodeId" }, { status: 400 });
  }
  try {
    const res = await fetch(`${workerUrl}/triage-podcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({ episode_id: episodeId }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
