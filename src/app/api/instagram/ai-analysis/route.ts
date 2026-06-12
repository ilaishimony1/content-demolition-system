import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;

async function getClientToken(clientId: string) {
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
    name: doc.fields?.name?.stringValue,
    niche: doc.fields?.niche?.stringValue,
  };
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const dateRange = req.nextUrl.searchParams.get("dateRange") || "all";
  const contentType = req.nextUrl.searchParams.get("contentType") || "all";
  const sortBy = req.nextUrl.searchParams.get("sortBy") || "engagementRate";
  const freePrompt = req.nextUrl.searchParams.get("freePrompt") || "";

  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const creds = await getClientToken(clientId);
  if (!creds?.token) return NextResponse.json({ error: "No Instagram token found" }, { status: 404 });

  const { token, igUserId, name, niche } = creds;

  // Calculate date filter
  const now = new Date();
  let sinceDate: Date | null = null;
  if (dateRange === "2w") sinceDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  else if (dateRange === "1m") sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  else if (dateRange === "3m") sinceDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  else if (dateRange === "6m") sinceDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  try {
    // 1. Fetch media — get more to allow for filtering
    const mediaRes = await fetch(
      `https://graph.instagram.com/v19.0/${igUserId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url&limit=50&access_token=${token}`
    );
    const mediaData = await mediaRes.json();
    if (mediaData.error) return NextResponse.json({ error: mediaData.error.message }, { status: 400 });

    let posts = mediaData.data || [];

    // Apply date filter
    if (sinceDate) {
      posts = posts.filter((p: Record<string, unknown>) => new Date(p.timestamp as string) >= sinceDate!);
    }

    // Apply content type filter
    if (contentType !== "all") {
      posts = posts.filter((p: Record<string, unknown>) => p.media_type === contentType);
    }

    // 2. Fetch insights for each post
    const postsWithInsights = await Promise.all(
      posts.slice(0, 25).map(async (post: Record<string, unknown>) => {
        try {
          const insightRes = await fetch(
            `https://graph.instagram.com/v19.0/${post.id}/insights?metric=impressions,reach,saved,shares&access_token=${token}`
          );
          const insightData = await insightRes.json();
          const metrics: Record<string, number> = {};
          if (insightData.data) {
            for (const m of insightData.data) {
              metrics[m.name] = m.values?.[0]?.value ?? m.value ?? 0;
            }
          }
          const likes = (post.like_count as number) || 0;
          const comments = (post.comments_count as number) || 0;
          const saves = metrics.saved || 0;
          const shares = metrics.shares || 0;
          const reach = metrics.reach || 1;
          const engagement = likes + comments + saves + shares;
          const engagementRate = ((engagement / reach) * 100).toFixed(2);
          const caption = (post.caption as string) || "";
          const hook = caption.split("\n")[0].slice(0, 150);

          return {
            id: post.id,
            mediaType: post.media_type,
            timestamp: post.timestamp,
            thumbnailUrl: post.thumbnail_url || post.media_url,
            caption: caption.slice(0, 500),
            hook,
            likes,
            comments,
            saves,
            shares,
            reach: metrics.reach || 0,
            impressions: metrics.impressions || 0,
            engagement,
            engagementRate: parseFloat(engagementRate),
          };
        } catch { return null; }
      })
    );

    const validPosts = postsWithInsights.filter(Boolean);
    const sorted = [...validPosts].sort((a, b) => {
      if (sortBy === "likes") return b!.likes - a!.likes;
      if (sortBy === "saves") return b!.saves - a!.saves;
      if (sortBy === "reach") return b!.reach - a!.reach;
      return b!.engagementRate - a!.engagementRate;
    });

    // 3. Send to Claude for deep analysis
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const postsSummary = sorted.slice(0, 20).map((p, i) =>
      `Post ${i + 1} [${p!.mediaType}] (${new Date(p!.timestamp).toLocaleDateString()}):
Hook: "${p!.hook}"
Engagement Rate: ${p!.engagementRate}% | Likes: ${p!.likes} | Comments: ${p!.comments} | Saves: ${p!.saves} | Shares: ${p!.shares} | Reach: ${p!.reach}
Caption excerpt: "${p!.caption.slice(0, 200)}"`
    ).join("\n\n");

    const baseContext = `You are a top Instagram growth strategist analysing the account of ${name || clientId}, a content creator in the ${niche || "general"} niche.

Filter: ${dateRange === "all" ? "All time" : dateRange === "2w" ? "Last 2 weeks" : dateRange === "1m" ? "Last month" : dateRange === "3m" ? "Last 3 months" : "Last 6 months"} | Type: ${contentType === "all" ? "All" : contentType === "VIDEO" ? "Reels/Videos" : contentType === "CAROUSEL_ALBUM" ? "Carousels" : "Photos"} | Sorted by: ${sortBy}

${sorted.length} posts data:

${postsSummary}`;

    // Free-text prompt mode — just answer the question
    if (freePrompt) {
      const freeMessage = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `${baseContext}

The operator is asking: "${freePrompt}"

Answer directly and specifically using the real data above. Be sharp, actionable, and specific — no generic advice.`
        }],
      });
      const freeAnswer = freeMessage.content[0].type === "text" ? freeMessage.content[0].text : "";
      return NextResponse.json({ freeAnswer, posts: sorted, totalAnalysed: validPosts.length });
    }

    // Standard analysis mode
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `${baseContext}

Provide a sharp, actionable analysis in JSON format with these exact keys:
{
  "topPatterns": ["3-4 bullet points about what their best content has in common"],
  "bestHooks": [{"hook": "...", "why": "why this hook worked", "engagementRate": "X%"}],
  "worstHooks": [{"hook": "...", "why": "why this underperformed"}],
  "contentInsights": "2-3 sentences about their content style and what their audience responds to",
  "topRecommendations": ["4-5 specific actionable things to do more of"],
  "avoidList": ["2-3 specific things to stop doing"],
  "hookFormula": "A 1-2 sentence formula for their best performing hook style"
}

Be specific to their actual content, not generic advice.`
      }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "";
    let aiInsights;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      aiInsights = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      aiInsights = { contentInsights: rawText };
    }

    return NextResponse.json({
      posts: sorted,
      aiInsights,
      totalAnalysed: validPosts.length,
      avgEngagementRate: validPosts.length > 0
        ? (validPosts.reduce((s, p) => s + p!.engagementRate, 0) / validPosts.length).toFixed(1)
        : "0",
    });

  } catch (err) {
    console.error("AI analysis error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Analysis failed", detail: msg }, { status: 500 });
  }
}
