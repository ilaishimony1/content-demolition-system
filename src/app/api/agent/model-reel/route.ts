import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Reel Planner. Given a one-line description of a reel the operator wants to
 * MODEL (recreate), Claude returns a production recipe: structure, pacing,
 * music vibe, caption style, plus a short library-search query the app uses to
 * pull matching b-roll from the client's tagged footage.
 */
export async function POST(req: NextRequest) {
  const { description, clientName } = await req.json();
  if (!description || typeof description !== "string") {
    return NextResponse.json({ error: "Missing description" }, { status: 400 });
  }
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      messages: [{
        role: "user",
        content: `You are a short-form video editor planning how to RECREATE ("model") an Instagram reel using a client's own b-roll footage. The client is${clientName ? ` "${clientName}"` : " a fitness/lifestyle creator"}.

Here is the operator's description of the reel to model:
"${description}"

Produce a concrete production recipe. Respond ONLY with JSON in exactly this shape:
{
  "clips": <integer, how many b-roll clips this reel needs>,
  "pacing": "<short phrase, e.g. 'hard cuts on the beat, ~1.5s per clip'>",
  "music": "<short phrase describing the music/sound vibe>",
  "captions": "<short phrase describing the on-screen text style>",
  "structure": ["<beat 1 — what happens>", "<beat 2>", "..."],
  "librarySearch": "<a short natural-language query describing the KIND of b-roll clips needed, used to search the client's footage library>"
}

Keep every field tight and practical. 3-6 structure beats.`
      }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    let recipe: unknown = {};
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      recipe = m ? JSON.parse(m[0]) : {};
    } catch {
      recipe = {};
    }
    return NextResponse.json({ recipe });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
