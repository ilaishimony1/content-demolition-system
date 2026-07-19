import { NextRequest, NextResponse } from "next/server";

const workerUrl = process.env.WORKER_URL!;
const workerSecret = process.env.WORKER_SECRET!;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;

// Look up the target account's stored Instagram token by clientId.
async function getIgToken(clientId: string): Promise<string | null> {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "users" }],
          where: { fieldFilter: { field: { fieldPath: "clientId" }, op: "EQUAL", value: { stringValue: clientId } } },
          limit: 1,
        },
      }),
    }
  );
  const data = await res.json();
  return data?.[0]?.document?.fields?.instagramAccessToken?.stringValue || null;
}

export async function POST(req: NextRequest) {
  const { clientId, driveFileId, caption, accessToken, postId } = await req.json();
  if (!clientId || !driveFileId || !accessToken) {
    return NextResponse.json({ error: "Missing clientId, driveFileId or accessToken (Google)" }, { status: 400 });
  }

  const igToken = await getIgToken(clientId);
  if (!igToken) {
    return NextResponse.json({ error: "This account has no connected Instagram — connect it first." }, { status: 400 });
  }

  try {
    const res = await fetch(`${workerUrl}/publish-reel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({
        post_id: postId || null,
        drive_file_id: driveFileId,
        google_access_token: accessToken,   // to download the reel from Drive
        ig_access_token: igToken,           // the client's Instagram token
        worker_public_url: workerUrl,       // so Meta can fetch the served video
        caption: caption || "",
      }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
