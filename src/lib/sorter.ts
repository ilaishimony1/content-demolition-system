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
import { FolderProtection, protectionForPath } from "@/lib/folderRules";
import { FolderKeywords } from "@/lib/folderKeywords";

export interface AutoMove {
  clipId: string;
  clip: Clip;
  folder: string;       // destination folder path
  matched: string;      // the keyword/tag that triggered it
}

export interface AutoSortResult {
  moves: AutoMove[];
  byFolder: Record<string, AutoMove[]>;
  skippedAmbiguous: number;   // matched >1 folder — left for the operator
  skippedNoMatch: number;     // matched 0 folders
}

/**
 * Auto-sort the slam-dunks ONLY. A clip is moved automatically iff its tags
 * point to EXACTLY ONE existing folder (via that folder's keywords or leaf name).
 * Ambiguous (>1 folder) or no-match clips are left untouched for the operator.
 * Never moves clips out of protected folders; never moves INTO a frozen folder.
 */
export function buildAutoSort(
  clips: Clip[],
  folderKeywords: FolderKeywords,
  rules: Record<string, FolderProtection> = {}
): AutoSortResult {
  // Build keyword → folder lookup. Include each folder's leaf name as an implicit keyword.
  const folderToTerms: { folder: string; terms: Set<string> }[] = [];
  for (const [folder, kws] of Object.entries(folderKeywords)) {
    if (protectionForPath(folder, rules) === "frozen") continue; // never auto-fill frozen
    const terms = new Set<string>(kws.map(k => k.toLowerCase()));
    terms.add(folder.split("/").pop()!.toLowerCase()); // the folder's own name
    folderToTerms.push({ folder, terms });
  }

  const moves: AutoMove[] = [];
  let skippedAmbiguous = 0;
  let skippedNoMatch = 0;

  for (const clip of clips) {
    if (!clip.aiAnalysedAt || clip.organizedPath) continue; // only unsorted, scanned clips
    const currentPath = (clip as Clip & { path?: string }).path || "";
    if (protectionForPath(currentPath, rules) !== "managed") continue; // leave protected clips

    // The clip's words: each tag AND each individual word inside multi-word tags
    // ("mountain biking" → "mountain biking", "mountain", "biking") + content type.
    const clipWords = new Set<string>();
    for (const tag of (clip.aiTags || [])) {
      const lc = tag.toLowerCase();
      clipWords.add(lc);
      for (const w of lc.split(/\s+/)) if (w) clipWords.add(w);
    }
    if (clip.aiContentType) clipWords.add(clip.aiContentType.toLowerCase());

    // A keyword matches a clip word if they're equal, or one is a prefix of the
    // other (≥3 chars). So "biking" matches the word "biking" in "mountain biking",
    // and "swim" matches "swimming". A scenery clip tagged "mountains" is NOT caught
    // by "biking" (no shared word) — key on the distinctive word, not the generic one.
    const matchesWord = (kw: string): boolean => {
      for (const w of clipWords) {
        if (w === kw) return true;
        if (kw.length >= 3 && w.startsWith(kw)) return true;   // swim → swimming
        if (w.length >= 3 && kw.startsWith(w)) return true;    // swimming → swim
      }
      return false;
    };

    // Which folders does this clip match?
    const hits: { folder: string; matched: string }[] = [];
    for (const { folder, terms } of folderToTerms) {
      let matched = "";
      for (const t of terms) {
        if (matchesWord(t)) { matched = t; break; }
      }
      if (matched) hits.push({ folder, matched });
    }

    if (hits.length === 1) {
      moves.push({ clipId: clip.id!, clip, folder: hits[0].folder, matched: hits[0].matched });
    } else if (hits.length > 1) {
      skippedAmbiguous++;
    } else {
      skippedNoMatch++;
    }
  }

  const byFolder: Record<string, AutoMove[]> = {};
  for (const m of moves) (byFolder[m.folder] ||= []).push(m);

  return { moves, byFolder, skippedAmbiguous, skippedNoMatch };
}

export interface Assignment {
  clip: Clip;
  categoryId: string | null;       // taxonomy category id, or null if unmatched
  categoryName: string;            // human label (folder name)
  subId: string | null;            // taxonomy subcategory id, or null
  subName: string | null;          // subfolder name
  confidence: "high" | "medium" | "low";
  needsReview: boolean;            // AI not sure enough — operator should confirm/place it
  reason: string;                  // why this clip landed here (for the preview)
}

export interface SortPlan {
  assignments: Assignment[];
  byFolder: Record<string, Assignment[]>;   // grouped for the preview (confident only)
  unmatched: Assignment[];
  needsReview: Assignment[];                 // AI unsure — operator places these manually
  protectedCount: number;                    // clips left untouched by protection rules
}

// Build the searchable text blob for a clip from its AI fields
function clipText(clip: Clip): string {
  return [
    clip.aiContentType,
    clip.aiTopic,
    clip.aiSetting,
    clip.aiNotes,
    ...(clip.aiTags || []),
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

export function buildSortPlan(
  clips: Clip[],
  taxonomy: ClientTaxonomy,
  rules: Record<string, FolderProtection> = {}
): SortPlan {
  const assignments: Assignment[] = [];
  let protectedCount = 0;

  for (const clip of clips) {
    if (!clip.aiAnalysedAt) continue; // can't sort what hasn't been analysed

    // Respect folder protection — frozen & additive folders never lose clips.
    // A clip already inside a protected folder stays exactly where it is.
    const currentPath = (clip as Clip & { path?: string }).path || "";
    const protection = protectionForPath(currentPath, rules);
    if (protection === "frozen" || protection === "additive") {
      protectedCount++;
      continue;
    }

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
        needsReview: true,
        reason: "AI couldn't match a topic — you decide where it goes",
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

    const hasSubs = cat.subcategories.length > 0;
    // Decide confidence + whether the operator needs to confirm:
    //  - matched a specific subfolder        → confident
    //  - category has subfolders but no match → unsure WHICH sub → needs review
    //  - category has no subfolders           → confident (nothing finer to pick)
    let confidence: "high" | "medium" | "low";
    let needsReview: boolean;
    let reason: string;
    if (bestSub) {
      confidence = "high";
      needsReview = false;
      reason = `Sure: matched "${bestSub.name}" in ${cat.name}`;
    } else if (hasSubs) {
      confidence = "low";
      needsReview = true;
      reason = `Knows it's ${cat.name} but not which subfolder — please pick`;
    } else {
      confidence = "medium";
      needsReview = false;
      reason = `Filed under ${cat.name}`;
    }

    assignments.push({
      clip,
      categoryId: cat.id,
      categoryName: cat.name,
      subId: bestSub?.id || null,
      subName: bestSub?.name || null,
      confidence,
      needsReview,
      reason,
    });
  }

  // Confident clips grouped by destination folder for the preview
  const byFolder: Record<string, Assignment[]> = {};
  for (const a of assignments) {
    if (a.needsReview) continue;
    const path = a.subName ? `${a.categoryName} / ${a.subName}` : a.categoryName;
    (byFolder[path] ||= []).push(a);
  }

  const needsReview = assignments.filter(a => a.needsReview);
  const unmatched = assignments.filter(a => a.categoryId === null);

  return { assignments, byFolder, unmatched, needsReview, protectedCount };
}
