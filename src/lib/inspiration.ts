import { collection, addDoc, getDocs, query, where, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Inspiration library — reel links the operator saves to MODEL later.
 * Replaces the per-client Google Doc. Each item is one reel.
 */
export interface InspirationItem {
  id?: string;
  clientId: string;
  url: string;
  note?: string;
  category?: string;            // named group / model type (e.g. "talking hook", "broll montage")
  source?: "external" | "own";  // someone else's reel vs the client's own winner
  modeled?: boolean;            // the "green marker" — already recreated
  analysis?: string;           // future: the AI-extracted recipe
  createdAt?: unknown;
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
