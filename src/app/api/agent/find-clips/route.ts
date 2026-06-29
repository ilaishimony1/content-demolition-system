import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Natural-language clip search. Given the user's request and a compact list of
 * clips (their AI tags + topic + name), Claude returns the IDs that match —
 * semantically, so "posing in front of a mirror" matches clips tagged
 * "mirror, selfie, gym" even without those exact words.
 */
export async function POST(req: NextRequest) {
  const { query, clips } = await req.json();
  if (!query || !Array.isArray(clips) || clips.length === 0) {
    return NextResponse.json({ error: "Missing query or clips" }, { status: 400 });
  }
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    // Compact one-line-per-clip catalogue
    const catalogue = clips
      .map((c: { id: string; name?: string; tags?: string[]; topic?: string }) =>
        `${c.id}: ${(c.tags || []).join(", ")}${c.topic ? ` | ${c.topic}` : ""}`)
      .join("\n");

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `You are searching a video B-roll library. Each line is a clip: "ID: tags | topic".

Find every clip that matches this request: "${query}"

Match by MEANING, not exact words — e.g. "posing in front of a mirror" should match clips tagged "mirror, selfie, gym, flexing". Be reasonably inclusive but don't include clearly-unrelated clips.

Clips:
${catalogue}

Respond ONLY with a JSON array of the matching clip IDs, e.g. ["abc123","def456"]. If none match, return [].`
      }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    let ids: string[] = [];
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      ids = m ? JSON.parse(m[0]) : [];
    } catch {
      ids = [];
    }
    return NextResponse.json({ ids: ids.map(String) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
