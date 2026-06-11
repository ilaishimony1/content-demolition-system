import { NextRequest, NextResponse } from "next/server";

const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

async function firestoreQuery(collection: string, field: string, value: string) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "EQUAL",
              value: { stringValue: value },
            },
          },
          limit: 1,
        },
      }),
    }
  );
  return res.json();
}

async function firestoreUpdate(docPath: string, fields: Record<string, unknown>) {
  // Build Firestore field mask and value format
  const firestoreFields: Record<string, unknown> = {};
  const updateMask: string[] = [];

  for (const [key, val] of Object.entries(fields)) {
    updateMask.push(key);
    if (val === null || val === undefined) {
      firestoreFields[key] = { nullValue: null };
    } else if (typeof val === "boolean") {
      firestoreFields[key] = { booleanValue: val };
    } else if (typeof val === "number") {
      firestoreFields[key] = { integerValue: val.toString() };
    } else {
      firestoreFields[key] = { stringValue: String(val) };
    }
  }

  const res = await fetch(
    `${FIRESTORE_URL}/${docPath}?updateMask.fieldPaths=${updateMask.join("&updateMask.fieldPaths=")}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: firestoreFields }),
    }
  );
  return res.json();
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXTAUTH_URL!;

  if (error) return NextResponse.redirect(`${baseUrl}/clients?error=instagram_denied`);
  if (!code || !state) return NextResponse.redirect(`${baseUrl}/clients?error=missing_params`);

  let clientId: string;
  try {
    clientId = JSON.parse(Buffer.from(state, "base64").toString()).clientId;
  } catch {
    return NextResponse.redirect(`${baseUrl}/clients?error=invalid_state`);
  }

  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const redirectUri = `${baseUrl}/api/auth/instagram/callback`;

  try {
    // 1. Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return NextResponse.redirect(`${baseUrl}/clients?error=token_exchange_failed`);
    }

    // 2. Exchange for long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longData = await longRes.json();
    const accessToken = longData.access_token || tokenData.access_token;

    // 3. Get Facebook pages
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`);
    const pagesData = await pagesRes.json();
    const page = pagesData.data?.[0];

    let igAccountId = null;
    let igUsername = null;
    let igFollowers = null;
    let igProfilePic = null;
    let finalToken = accessToken;

    if (page) {
      finalToken = page.access_token || accessToken;

      // 4. Get IG Business Account from page
      const igPageRes = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${finalToken}`
      );
      const igPageData = await igPageRes.json();
      igAccountId = igPageData.instagram_business_account?.id;

      if (igAccountId) {
        // 5. Get IG profile
        const profileRes = await fetch(
          `https://graph.facebook.com/v19.0/${igAccountId}?fields=username,followers_count,profile_picture_url&access_token=${finalToken}`
        );
        const profileData = await profileRes.json();
        igUsername = profileData.username || null;
        igFollowers = profileData.followers_count || null;
        igProfilePic = profileData.profile_picture_url || null;
      }
    }

    // 6. Find user doc by clientId via Firestore REST API
    const queryResult = await firestoreQuery("users", "clientId", clientId);
    const docResult = Array.isArray(queryResult) ? queryResult.find((r: { document?: unknown }) => r.document) : null;

    if (docResult?.document) {
      // Extract doc ID from name path
      const docName = (docResult.document as { name: string }).name;
      const docId = docName.split("/").pop()!;

      await firestoreUpdate(`users/${docId}`, {
        instagramConnected: true,
        instagramAccessToken: finalToken,
        instagramAccountId: igAccountId,
        instagramUsername: igUsername,
        followers: igFollowers ? `${(igFollowers / 1000).toFixed(1)}K` : null,
        profilePhoto: igProfilePic,
        instagramConnectedAt: new Date().toISOString(),
      });
    }

    return NextResponse.redirect(`${baseUrl}/clients?success=instagram_connected&client=${clientId}`);
  } catch (err) {
    console.error("Instagram OAuth error:", err);
    return NextResponse.redirect(`${baseUrl}/clients?error=oauth_failed`);
  }
}
