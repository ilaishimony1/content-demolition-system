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
          where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } },
          limit: 1,
        },
      }),
    }
  );
  return res.json();
}

async function firestoreUpdate(docPath: string, fields: Record<string, unknown>) {
  const firestoreFields: Record<string, unknown> = {};
  const updateMask: string[] = [];
  for (const [key, val] of Object.entries(fields)) {
    updateMask.push(key);
    if (val === null || val === undefined) firestoreFields[key] = { nullValue: null };
    else if (typeof val === "boolean") firestoreFields[key] = { booleanValue: val };
    else if (typeof val === "number") firestoreFields[key] = { integerValue: val.toString() };
    else firestoreFields[key] = { stringValue: String(val) };
  }
  const res = await fetch(
    `${FIRESTORE_URL}/${docPath}?updateMask.fieldPaths=${updateMask.join("&updateMask.fieldPaths=")}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: firestoreFields }) }
  );
  return res.json();
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXTAUTH_URL!;

  let earlyReturnTo = "clients";
  if (state) {
    try { const p = JSON.parse(Buffer.from(state, "base64").toString()); earlyReturnTo = p.returnTo || "clients"; } catch { /* ignore */ }
  }

  if (error) return NextResponse.redirect(`${baseUrl}/${earlyReturnTo}?error=instagram_denied`);
  if (!code || !state) return NextResponse.redirect(`${baseUrl}/${earlyReturnTo}?error=missing_params`);

  let clientId: string;
  let returnTo = earlyReturnTo;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64").toString());
    clientId = parsed.clientId;
    returnTo = parsed.returnTo || "clients";
  } catch {
    return NextResponse.redirect(`${baseUrl}/clients?error=invalid_state`);
  }

  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const redirectUri = `${baseUrl}/api/auth/instagram/callback`;

  try {
    // 1. Exchange code for short-lived Facebook User Token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("FB token exchange failed:", tokenData);
      return NextResponse.redirect(`${baseUrl}/${earlyReturnTo}?error=token_failed`);
    }

    // 2. Exchange for long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longData = await longRes.json();
    const accessToken = longData.access_token || tokenData.access_token;

    // 3. Get Facebook Pages → find connected Instagram Business Account
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];

    let igAccountId: string | null = null;
    let igUsername: string | null = null;
    let igFollowers: string | null = null;
    let igProfilePhoto: string | null = null;

    for (const page of pages) {
      const igRes = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`
      );
      const igData = await igRes.json();
      if (igData.instagram_business_account?.id) {
        igAccountId = igData.instagram_business_account.id;

        // Get IG profile details
        const profileRes = await fetch(
          `https://graph.facebook.com/v19.0/${igAccountId}?fields=username,followers_count,profile_picture_url&access_token=${accessToken}`
        );
        const profile = await profileRes.json();
        igUsername = profile.username || null;
        igFollowers = profile.followers_count ? `${(profile.followers_count / 1000).toFixed(1)}K` : null;
        igProfilePhoto = profile.profile_picture_url || null;
        break;
      }
    }

    // Fallback: if no page/IG found, try getting basic FB user info
    if (!igAccountId) {
      const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=name&access_token=${accessToken}`);
      const meData = await meRes.json();
      console.error("No Instagram Business Account found for FB user:", meData);
      return NextResponse.redirect(`${baseUrl}/${earlyReturnTo}?error=no_ig_business_account`);
    }

    // 4. Save to Firestore
    const queryResult = await firestoreQuery("users", "clientId", clientId);
    const docResult = Array.isArray(queryResult) ? queryResult.find((r: { document?: unknown }) => r.document) : null;

    if (docResult?.document) {
      const docId = (docResult.document as { name: string }).name.split("/").pop()!;
      await firestoreUpdate(`users/${docId}`, {
        instagramConnected: true,
        instagramAccessToken: accessToken,
        instagramAccountId: igAccountId,
        instagramUsername: igUsername,
        followers: igFollowers,
        profilePhoto: igProfilePhoto,
        instagramConnectedAt: new Date().toISOString(),
      });
    }

    return NextResponse.redirect(`${baseUrl}/${returnTo}?success=instagram_connected&client=${clientId}`);
  } catch (err) {
    console.error("Instagram OAuth error:", err);
    return NextResponse.redirect(`${baseUrl}/${earlyReturnTo}?error=oauth_failed`);
  }
}
