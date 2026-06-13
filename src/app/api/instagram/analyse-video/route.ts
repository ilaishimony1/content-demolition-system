import { NextRequest, NextResponse } from "next/server";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const workerUrl = process.env.WORKER_URL!;

async function getClientCreds(clientId: string) {
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
  const doc = data[0]?.document;
  if (!doc) return null;
  return {
    token: doc.fields?.instagramAccessToken?.stringValue,
    igUserId: doc.fields?.instagramAccountId?.stringValue,
    niche: doc.fields?.niche?.stringValue || "",
  };
}

export async function POST(req: NextRequest) {
  const { postId, clientId, caption } = await req.json();
  if (!postId || !clientId) return NextResponse.json({ error: "Missing postId or clientId" }, { status: 400 });

  const creds = await getClientCreds(clientId);
  if (!creds?.token) return NextResponse.json({ error: "No Instagram token" }, { status: 404 });

  // Fetch the video URL from Instagram
  const mediaRes = await fetch(
    `https://graph.instagram.com/v19.0/${postId}?fields=media_url,media_type&access_token=${creds.token}`
  );
  const mediaData = await mediaRes.json();
  if (mediaData.error) return NextResponse.json({ error: mediaData.error.message }, { status: 400 });
  if (mediaData.media_type !== "VIDEO") return NextResponse.json({ error: "Not a video post" }, { status: 400 });

  const videoUrl = mediaData.media_url;
  if (!videoUrl) return NextResponse.json({ error: "No video URL available" }, { status: 400 });

  // Send to worker
  const workerRes = await fetch(`${workerUrl}/analyse-ig-post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_url: videoUrl,
      caption: caption || "",
      post_id: postId,
      client_id: clientId,
      niche: creds.niche,
    }),
  });

  const result = await workerRes.json();
  return NextResponse.json(result);
}
