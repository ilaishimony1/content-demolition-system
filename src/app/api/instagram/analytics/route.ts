import { NextRequest, NextResponse } from "next/server";

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
  };
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const creds = await getClientToken(clientId);
  if (!creds?.token) return NextResponse.json({ error: "No Instagram token found" }, { status: 404 });

  const { token, igUserId } = creds;

  try {
    // 1. Fetch recent media
    const mediaRes = await fetch(
      `https://graph.instagram.com/v19.0/me/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url&limit=30&access_token=${token}`
    );
    const mediaData = await mediaRes.json();

    if (mediaData.error) {
      return NextResponse.json({ error: mediaData.error.message }, { status: 400 });
    }

    const posts = mediaData.data || [];

    // 2. Fetch insights for each post (in parallel, max 20)
    const postsWithInsights = await Promise.all(
      posts.slice(0, 20).map(async (post: Record<string, unknown>) => {
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
          const engagementRate = reach > 0 ? ((engagement / reach) * 100).toFixed(1) : "0";

          // Extract hook (first line of caption)
          const caption = (post.caption as string) || "";
          const hook = caption.split("\n")[0].slice(0, 100) || "No caption";

          return {
            id: post.id,
            mediaType: post.media_type,
            timestamp: post.timestamp,
            thumbnailUrl: post.thumbnail_url || post.media_url,
            caption,
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
        } catch {
          return null;
        }
      })
    );

    const validPosts = postsWithInsights.filter(Boolean);

    // Sort by engagement
    const topByEngagement = [...validPosts].sort((a, b) => b!.engagement - a!.engagement);
    const topByEngagementRate = [...validPosts].sort((a, b) => b!.engagementRate - a!.engagementRate);

    // Best posting hours
    const hourCounts: Record<number, { total: number; count: number }> = {};
    for (const p of validPosts) {
      if (!p) continue;
      const hour = new Date(p.timestamp as string).getHours();
      if (!hourCounts[hour]) hourCounts[hour] = { total: 0, count: 0 };
      hourCounts[hour].total += p.engagement;
      hourCounts[hour].count += 1;
    }
    const bestHours = Object.entries(hourCounts)
      .map(([hour, v]) => ({ hour: parseInt(hour), avgEngagement: v.total / v.count }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3);

    // Content type breakdown
    const typeStats: Record<string, { count: number; totalEngagement: number }> = {};
    for (const p of validPosts) {
      if (!p) continue;
      const type = p.mediaType as string;
      if (!typeStats[type]) typeStats[type] = { count: 0, totalEngagement: 0 };
      typeStats[type].count += 1;
      typeStats[type].totalEngagement += p.engagement;
    }

    return NextResponse.json({
      topByEngagement: topByEngagement.slice(0, 6),
      topByEngagementRate: topByEngagementRate.slice(0, 6),
      bestHours,
      typeStats,
      totalPosts: validPosts.length,
      avgEngagementRate: validPosts.length > 0
        ? (validPosts.reduce((s, p) => s + p!.engagementRate, 0) / validPosts.length).toFixed(1)
        : "0",
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
