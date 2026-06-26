/**
 * Folder Keywords (for auto-sort)
 *
 * Maps a folder to the tag-words that mean it. Bridges English AI tags to
 * Hebrew (or any) folder names: ריצה ← ["running","jog","sprint","run"].
 * Used by the auto-sorter to confidently file clips into existing folders.
 *
 * Stored in Firestore: folderKeywords/{clientId} → { [folderPath]: string[] }
 */

import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export type FolderKeywords = Record<string, string[]>;

export async function getFolderKeywords(clientId: string): Promise<FolderKeywords> {
  const snap = await getDoc(doc(db, "folderKeywords", clientId));
  return snap.exists() ? (snap.data().keywords as FolderKeywords) || {} : {};
}

export async function setFolderKeywords(
  clientId: string,
  folderPath: string,
  keywords: string[]
): Promise<FolderKeywords> {
  const current = await getFolderKeywords(clientId);
  const next = { ...current };
  const cleaned = keywords.map(k => k.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) delete next[folderPath];
  else next[folderPath] = Array.from(new Set(cleaned));
  await setDoc(doc(db, "folderKeywords", clientId), { keywords: next, updatedAt: serverTimestamp() });
  return next;
}
