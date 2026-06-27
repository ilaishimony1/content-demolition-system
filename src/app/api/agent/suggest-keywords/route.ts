import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Suggest auto-sort keywords for a folder, from its name.
 * The AI returns every word/synonym it would plausibly tag a clip with that
 * belongs in this folder — so the operator doesn't have to guess the vocabulary.
 */
export async function POST(req: NextRequest) {
  const { folderName, niche, existingTags } = await req.json();
  if (!folderName) return NextResponse.json({ error: "Missing folderName" }, { status: 400 });

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const tagHint = Array.isArray(existingTags) && existingTags.length
      ? `\n\nHere are some tags that actually appear in this library — prefer any that fit:\n${existingTags.slice(0, 80).join(", ")}`
      : "";

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `A video B-roll library has a folder named "${folderName}"${niche ? ` (creator niche: ${niche})` : ""}.
An AI tags clips with lowercase words. List the keywords/synonyms an AI would use to describe a clip that belongs in this folder — be generous and include variations someone might not think of.

Folder "${folderName}" → list 6-15 lowercase keywords.${tagHint}

Respond ONLY with a JSON array of lowercase strings, e.g. ["motorbike","motorcycle","motocross","enduro","dirt bike","moto","riding"].`
      }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    let keywords: string[] = [];
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      keywords = match ? JSON.parse(match[0]) : [];
    } catch {
      keywords = [];
    }
    keywords = keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean);
    return NextResponse.json({ keywords });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
