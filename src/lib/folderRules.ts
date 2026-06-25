/**
 * Folder Protection Rules
 *
 * Operators mark real Drive folders with a protection level so the Sorter agent
 * knows what it may and may not touch. Critical for personal folders the client
 * curated themselves (e.g. Tom's "tomcore" silly clips, "חיה" with his girlfriend).
 *
 * Stored in Firestore: folderRules/{clientId}
 *
 *   managed  — default. Agent freely sorts clips in and out.
 *   additive — agent may ADD matching clips, but never removes/moves any out.
 *   frozen   — completely off-limits. Agent never reads, moves, or modifies.
 */

import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export type FolderProtection = "managed" | "additive" | "frozen";

export interface FolderRules {
  clientId: string;
  rules: Record<string, FolderProtection>; // folderPath -> protection level
}

export async function getFolderRules(clientId: string): Promise<Record<string, FolderProtection>> {
  const snap = await getDoc(doc(db, "folderRules", clientId));
  return snap.exists() ? (snap.data().rules as Record<string, FolderProtection>) || {} : {};
}

export async function setFolderRule(
  clientId: string,
  folderPath: string,
  level: FolderProtection
): Promise<Record<string, FolderProtection>> {
  const current = await getFolderRules(clientId);
  const next = { ...current };
  if (level === "managed") {
    delete next[folderPath]; // managed is the default — no need to store
  } else {
    next[folderPath] = level;
  }
  await setDoc(doc(db, "folderRules", clientId), { clientId, rules: next, updatedAt: serverTimestamp() });
  return next;
}

// Resolve a clip's protection by checking its folder path against all rules.
// A clip inside a protected folder (or any subfolder of it) inherits that rule.
export function protectionForPath(
  path: string,
  rules: Record<string, FolderProtection>
): FolderProtection {
  let result: FolderProtection = "managed";
  for (const [folder, level] of Object.entries(rules)) {
    if (path === folder || path.startsWith(folder + "/")) {
      // frozen wins over additive wins over managed
      if (level === "frozen") return "frozen";
      if (level === "additive") result = "additive";
    }
  }
  return result;
}
