/**
 * Drive Sorter — assignment engine
 *
 * Takes AI-analysed clips + the client's taxonomy and proposes which
 * topic folder (and subfolder) each clip belongs in. Pure read-only logic:
 * produces a PLAN. Nothing is moved until the operator approves and the
 * apply step runs.
 *
 * Two phases share this engine:
 *   - Onboarding: assign the whole library (e.g. Tom's 1762 clips)
 *   - Steady state: assign only clips sitting in the בלאגן ("mess") intake folder
 */

import { Clip } from "@/lib/clips";
import { ClientTaxonomy, TaxonomyCategory, TaxonomySubcategory } from "@/lib/taxonomy";

export interface Assignment {
  clip: Clip;
  categoryId: string | null;       // taxonomy category id, or null if unmatched
  categoryName: string;            // human label (folder name)
  subId: string | null;            // taxonomy subcategory id, or null
  subName: string | null;          // subfolder name
  confidence: "high" | "medium" | "low";
  reason: string;                  // why this clip landed here (for the preview)
}

export interface SortPlan {
  assignments: Assignment[];
  byFolder: Record<string, Assignment[]>;   // grouped for the preview
  unmatched: Assignment[];
}

// Build the searchable text blob for a clip from its AI fields
function clipText(clip: Clip): string {
  return [
    clip.aiContentType,
    clip.aiTopic,
    clip.aiSetting,
    clip.aiNotes,
    clip.name,
  ].filter(Boolean).join(" ").toLowerCase();
}

// Score how well a clip matches a subcategory by its keyword/name hints
function subMatchScore(text: string, sub: TaxonomySubcategory): number {
  let score = 0;
  if (text.includes(sub.name.toLowerCase())) score += 2;
  for (const kw of sub.keywords) {
    if (kw && text.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}

// Decide the best category for a clip: first by AI content_type matching a
// category id, otherwise by topic/setting text matching the category name.
function pickCategory(clip: Clip, taxonomy: ClientTaxonomy): TaxonomyCategory | null {
  // 1. Direct match: AI content_type == category id (e.g. "action_reel")
  const byId = taxonomy.categories.find(c => c.id === clip.aiContentType);
  if (byId) return byId;

  // 2. Fuzzy: category name or id appears in the clip text
  const text = clipText(clip);
  for (const cat of taxonomy.categories) {
    if (text.includes(cat.name.toLowerCase()) || text.includes(cat.id.toLowerCase())) {
      return cat;
    }
  }
  return null;
}

export function buildSortPlan(clips: Clip[], taxonomy: ClientTaxonomy): SortPlan {
  const assignments: Assignment[] = [];

  for (const clip of clips) {
    if (!clip.aiAnalysedAt) continue; // can't sort what hasn't been analysed

    const text = clipText(clip);
    const cat = pickCategory(clip, taxonomy);

    if (!cat) {
      assignments.push({
        clip,
        categoryId: null,
        categoryName: "Unsorted",
        subId: null,
        subName: null,
        confidence: "low",
        reason: "No matching topic — needs manual review",
      });
      continue;
    }

    // Find best subcategory within the chosen category
    let bestSub: TaxonomySubcategory | null = null;
    let bestScore = 0;
    for (const sub of cat.subcategories) {
      const s = subMatchScore(text, sub);
      if (s > bestScore) { bestScore = s; bestSub = sub; }
    }

    const matchedById = cat.id === clip.aiContentType;
    assignments.push({
      clip,
      categoryId: cat.id,
      categoryName: cat.name,
      subId: bestSub?.id || null,
      subName: bestSub?.name || null,
      confidence: bestSub ? "high" : matchedById ? "medium" : "low",
      reason: bestSub
        ? `Matched "${bestSub.name}" in ${cat.name}`
        : matchedById
        ? `AI tagged as ${cat.name}`
        : `Topic mentions ${cat.name}`,
    });
  }

  // Group by destination folder path for the preview
  const byFolder: Record<string, Assignment[]> = {};
  for (const a of assignments) {
    const path = a.subName ? `${a.categoryName} / ${a.subName}` : a.categoryName;
    (byFolder[path] ||= []).push(a);
  }

  const unmatched = assignments.filter(a => a.categoryId === null);

  return { assignments, byFolder, unmatched };
}
