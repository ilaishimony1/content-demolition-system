import { NextRequest, NextResponse } from "next/server";

// Temporary debug endpoint — shows what Meta returns for a stored token
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId") || "ilai";
  const reset = req.nextUrl.searchParams.get("reset") === "true";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
  const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  // Fetch token from Firestore REST API
  const queryRes = await fetch(
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
  const queryData = await queryRes.json();
  const doc = queryData[0]?.document;
  if (!doc) return NextResponse.json({ error: "No user doc found", clientId });

  const docId = doc.name.split("/").pop();
  const fields = doc.fields;

  // Reset mode — clear Instagram data so client can reconnect
  if (reset) {
    const resetFields = {
      instagramConnected: { booleanValue: false },
      instagramAccessToken: { nullValue: null },
      instagramAccountId: { nullValue: null },
      instagramUsername: { nullValue: null },
      followers: { nullValue: null },
      profilePhoto: { nullValue: null },
    };
    await fetch(
      `${FIRESTORE_URL}/users/${docId}?updateMask.fieldPaths=instagramConnected&updateMask.fieldPaths=instagramAccessToken&updateMask.fieldPaths=instagramAccountId&updateMask.fieldPaths=instagramUsername&updateMask.fieldPaths=followers&updateMask.fieldPaths=profilePhoto`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: resetFields }),
      }
    );
    return NextResponse.json({ success: true, message: `Instagram reset for ${clientId}. They can now reconnect.` });
  }

  const token = fields?.instagramAccessToken?.stringValue;
  if (!token) return NextResponse.json({ error: "No token saved", fields });

  // Now test the token
  const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${token}`);
  const pagesData = await pagesRes.json();

  const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${token}`);
  const meData = await meRes.json();

  // Check permissions
  const permRes = await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${token}`);
  const permData = await permRes.json();

  // Try getting IG directly from user
  const igDirectRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=instagram_business_account&access_token=${token}`);
  const igDirectData = await igDirectRes.json();

  const results: Record<string, unknown> = {
    saved_fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, (v as Record<string, unknown>).stringValue || (v as Record<string, unknown>).booleanValue])),
    me: meData,
    pages: pagesData,
    permissions: permData,
    ig_direct: igDirectData,
  };

  if (pagesData.data) {
    for (const page of pagesData.data) {
      const igRes = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      const igData = await igRes.json();
      results[`ig_on_page_${page.name}`] = igData;
    }
  }

  return NextResponse.json(results);
}
