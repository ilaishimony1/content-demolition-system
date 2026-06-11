import { NextRequest, NextResponse } from "next/server";

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export async function POST(req: NextRequest) {
  const { name, email, password, niche, driveFolderId, notes, clientId } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
  }

  try {
    // 1. Create Firebase Auth user via REST API
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName: name, returnSecureToken: true }),
      }
    );
    const authData = await authRes.json();

    if (authData.error) {
      return NextResponse.json({ error: authData.error.message }, { status: 400 });
    }

    const uid = authData.localId;
    const derivedClientId = clientId || name.trim().split(" ")[0].toLowerCase();

    // 2. Create Firestore user doc with uid as document ID
    const firestoreRes = await fetch(
      `${FIRESTORE_URL}/users/${uid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            name: { stringValue: name },
            email: { stringValue: email },
            role: { stringValue: "client" },
            clientId: { stringValue: derivedClientId },
            niche: { stringValue: niche || "" },
            driveFolderId: { stringValue: driveFolderId || "" },
            notes: { stringValue: notes || "" },
            status: { stringValue: "active" },
            instagramConnected: { booleanValue: false },
            tiktokConnected: { booleanValue: false },
            youtubeConnected: { booleanValue: false },
            platforms: { arrayValue: { values: [{ stringValue: "IG" }] } },
          },
        }),
      }
    );

    const firestoreData = await firestoreRes.json();
    if (firestoreData.error) {
      return NextResponse.json({ error: firestoreData.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, uid, clientId: derivedClientId });
  } catch (err) {
    console.error("Create client error:", err);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}
