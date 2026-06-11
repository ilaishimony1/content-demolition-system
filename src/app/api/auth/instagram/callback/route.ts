import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/clients?error=instagram_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/clients?error=missing_params`);
  }

  let clientId: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64").toString());
    clientId = parsed.clientId;
  } catch {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/clients?error=invalid_state`);
  }

  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/instagram/callback`;

  try {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("No access token: " + JSON.stringify(tokenData));

    // Step 2: Exchange for long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longTokenData = await longTokenRes.json();
    const accessToken = longTokenData.access_token || tokenData.access_token;

    // Step 3: Get Facebook pages (to find Instagram Business Account)
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesRes.json();
    const page = pagesData.data?.[0];

    let igAccountId = null;
    let igUsername = null;
    let igFollowers = null;
    let igProfilePic = null;
    let pageAccessToken = accessToken;

    if (page) {
      pageAccessToken = page.access_token;
      // Step 4: Get Instagram Business Account connected to page
      const igRes = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${pageAccessToken}`
      );
      const igData = await igRes.json();
      igAccountId = igData.instagram_business_account?.id;

      if (igAccountId) {
        // Step 5: Get IG profile info
        const profileRes = await fetch(
          `https://graph.facebook.com/v19.0/${igAccountId}?fields=username,followers_count,profile_picture_url&access_token=${pageAccessToken}`
        );
        const profileData = await profileRes.json();
        igUsername = profileData.username;
        igFollowers = profileData.followers_count;
        igProfilePic = profileData.profile_picture_url;
      }
    }

    // Step 6: Save to Firestore — find user doc by clientId
    const snap = await getDocs(query(collection(db, "users"), where("clientId", "==", clientId)));
    if (!snap.empty) {
      await updateDoc(doc(db, "users", snap.docs[0].id), {
        instagramConnected: true,
        instagramAccessToken: pageAccessToken,
        instagramAccountId: igAccountId,
        instagramUsername: igUsername || null,
        followers: igFollowers ? `${(igFollowers / 1000).toFixed(1)}K` : null,
        profilePhoto: igProfilePic || null,
        instagramConnectedAt: new Date().toISOString(),
      });
    }

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/clients?success=instagram_connected&client=${clientId}`);
  } catch (err) {
    console.error("Instagram OAuth error:", err);
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/clients?error=oauth_failed`);
  }
}
