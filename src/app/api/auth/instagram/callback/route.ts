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

  // Try to extract returnTo from state early so error redirects go to the right page
  let earlyReturnTo = "clients";
  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64").toString());
      earlyReturnTo = parsed.returnTo || "clients";
    } catch { /* ignore */ }
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
    // 1. Exchange code for short-lived token (Instagram Business API)
    const formData = new URLSearchParams();
    formData.append("client_id", appId);
    formData.append("client_secret", appSecret);
    formData.append("grant_type", "authorization_code");
    formData.append("redirect_uri", redirectUri);
    formData.append("code", code);

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: formData,
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return NextResponse.redirect(`${baseUrl}/clients?error=token_failed`);
    }

    const shortToken = tokenData.access_token;
    const igUserId = tokenData.user_id;

    // 2. Exchange for long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`
    );
    const longData = await longRes.json();
    const accessToken = longData.access_token || shortToken;

    // 3. Get Instagram profile
    const profileRes = await fetch(
      `https://graph.instagram.com/v19.0/me?fields=username,followers_count,profile_picture_url,account_type&access_token=${accessToken}`
    );
    const profile = await profileRes.json();

    // 4. Save to Firestore
    const queryResult = await firestoreQuery("users", "clientId", clientId);
    const docResult = Array.isArray(queryResult) ? queryResult.find((r: { document?: unknown }) => r.document) : null;

    if (docResult?.document) {
      const docId = (docResult.document as { name: string }).name.split("/").pop()!;
      await firestoreUpdate(`users/${docId}`, {
        instagramConnected: true,
        instagramAccessToken: accessToken,
        instagramAccountId: String(igUserId),
        instagramUsername: profile.username || null,
        followers: profile.followers_count ? `${(profile.followers_count / 1000).toFixed(1)}K` : null,
        profilePhoto: profile.profile_picture_url || null,
        instagramConnectedAt: new Date().toISOString(),
      });
    }

    return NextResponse.redirect(`${baseUrl}/${returnTo}?success=instagram_connected&client=${clientId}`);
  } catch (err) {
    console.error("Instagram OAuth error:", err);
    return NextResponse.redirect(`${baseUrl}/${earlyReturnTo}?error=oauth_failed`);
  }
}
