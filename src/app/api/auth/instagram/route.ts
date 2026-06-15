import { NextRequest, NextResponse } from "next/server";

// Facebook Login flow — gives access to Instagram Business insights
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const appId = process.env.META_APP_ID!;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/instagram/callback`;
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "clients";
  const state = Buffer.from(JSON.stringify({ clientId, returnTo })).toString("base64");

  const scopes = [
    "pages_show_list",
    "instagram_basic",
    "instagram_manage_insights",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_messages",
  ].join(",");

  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  return NextResponse.redirect(url.toString());
}
