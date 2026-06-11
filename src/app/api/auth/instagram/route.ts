import { NextRequest, NextResponse } from "next/server";

// Step 1: Redirect user to Instagram OAuth
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const appId = process.env.META_APP_ID!;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/instagram/callback`;

  const scopes = [
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
  ].join(",");

  // Store clientId in state so we know which client to update on callback
  const state = Buffer.from(JSON.stringify({ clientId })).toString("base64");

  const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  return NextResponse.redirect(url.toString());
}
