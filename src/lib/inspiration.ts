import { collection, addDoc, getDocs, getDoc, setDoc, query, where, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Named tabs (folders) per client — stored so empty ones persist (Doc-like).
export async function getInspirationCategories(clientId: string): Promise<string[]> {
  const snap = await getDoc(doc(db, "inspirationCategories", clientId));
  return snap.exists() ? (snap.data().categories as string[]) || [] : [];
}

export async function saveInspirationCategories(clientId: string, categories: string[]): Promise<void> {
  await setDoc(doc(db, "inspirationCategories", clientId), { categories, updatedAt: serverTimestamp() });
}

/**
 * Inspiration library — reel links the operator saves to MODEL later.
 * Replaces the per-client Google Doc. Each item is one reel.
 */
// A saved modeling plan — the recipe the Planner built + the library clips it matched.
export interface ReelPlan {
  description: string;          // what the operator typed to describe the reel
  clips?: number;
  pacing?: string;
  music?: string;
  captions?: string;
  structure?: string[];
  librarySearch?: string;
  matchedClips?: { id: string; name: string; tags?: string[] }[];
}

export interface InspirationItem {
  id?: string;
  clientId: string;
  url: string;
  note?: string;
  category?: string;            // named group / model type (e.g. "talking hook", "broll montage")
  source?: "external" | "own";  // someone else's reel vs the client's own winner
  modeled?: boolean;            // the "green marker" — already recreated
  analysis?: string;           // future: the AI-extracted recipe
  plan?: ReelPlan;             // saved Reel Planner output (persists between opens)
  createdAt?: unknown;
}

// Persist the Planner's recipe + matched clips onto the reel so it survives reopens.
export async function saveReelPlan(id: string, plan: ReelPlan): Promise<void> {
  // Firestore rejects `undefined` — round-trip through JSON to drop empty fields.
  const clean = JSON.parse(JSON.stringify(plan));
  await updateDoc(doc(db, "inspiration", id), { plan: clean });
}

const IG_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[A-Za-z0-9_-]+/g;

// Pull all Instagram reel/post URLs out of a pasted blob of text (the Doc).
export function extractReelUrls(text: string): string[] {
  const matches = text.match(IG_RE) || [];
  // strip query params, dedupe
  return Array.from(new Set(matches.map(u => u.split("?")[0])));
}

export async function getInspiration(clientId: string): Promise<InspirationItem[]> {
  const q = query(collection(db, "inspiration"), where("clientId", "==", clientId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as InspirationItem));
}

// Add many links at once (from a paste). Skips ones already saved for this client.
export async function addInspirationLinks(
  clientId: string,
  urls: string[],
  source: "external" | "own" = "external",
  category: string = ""
): Promise<number> {
  const existing = new Set((await getInspiration(clientId)).map(i => i.url));
  let added = 0;
  for (const url of urls) {
    if (existing.has(url)) continue;
    await addDoc(collection(db, "inspiration"), {
      clientId, url, source, category: category.trim(), modeled: false, createdAt: serverTimestamp(),
    });
    added++;
  }
  return added;
}

export async function setInspirationCategory(id: string, category: string): Promise<void> {
  await updateDoc(doc(db, "inspiration", id), { category: category.trim() });
}

export async function setModeled(id: string, modeled: boolean): Promise<void> {
  await updateDoc(doc(db, "inspiration", id), { modeled });
}

export async function setInspirationNote(id: string, note: string): Promise<void> {
  await updateDoc(doc(db, "inspiration", id), { note });
}

export async function deleteInspiration(id: string): Promise<void> {
  await deleteDoc(doc(db, "inspiration", id));
}
