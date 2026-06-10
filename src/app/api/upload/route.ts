import { NextRequest, NextResponse } from "next/server";

const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const BUNNY_API_KEY = process.env.BUNNY_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const clientId = formData.get("clientId") as string;
    const folder = (formData.get("folder") as string) || "raw";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Step 1: Create video object in Bunny
    const createRes = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
      {
        method: "POST",
        headers: {
          AccessKey: BUNNY_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: file.name,
          collectionId: "", // we'll add collections later
        }),
      }
    );

    if (!createRes.ok) {
      throw new Error("Failed to create video in Bunny");
    }

    const videoData = await createRes.json();
    const videoId = videoData.guid;

    // Step 2: Upload the actual video file
    const fileBuffer = await file.arrayBuffer();

    const uploadRes = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
      {
        method: "PUT",
        headers: {
          AccessKey: BUNNY_API_KEY!,
          "Content-Type": "application/octet-stream",
        },
        body: fileBuffer,
      }
    );

    if (!uploadRes.ok) {
      throw new Error("Failed to upload video to Bunny");
    }

    // Return video info to save in Firestore
    return NextResponse.json({
      success: true,
      videoId,
      clientId,
      folder,
      name: file.name,
      bunnyUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}`,
      thumbnailUrl: `https://vz-${BUNNY_LIBRARY_ID}.b-cdn.net/${videoId}/thumbnail.jpg`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
