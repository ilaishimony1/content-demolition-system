import { collection, addDoc, getDocs, getDoc, setDoc, query, where, serverTimestamp, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Persist the full Drive folder structure (incl. empty folders) for a client,
// so folders like בלאגן stay visible even when they contain no media.
export async function saveDriveFolders(clientId: string, folders: string[]): Promise<void> {
  await setDoc(doc(db, "driveStructure", clientId), { folders, updatedAt: serverTimestamp() });
}

export async function getDriveFolders(clientId: string): Promise<string[]> {
  const snap = await getDoc(doc(db, "driveStructure", clientId));
  return snap.exists() ? (snap.data().folders as string[]) || [] : [];
}

export interface ScanStatus {
  running?: boolean;
  total?: number;
  done?: number;
  errors?: number;
  lastError?: string;
  updatedAt?: string;
}

export async function getScanStatus(clientId: string): Promise<ScanStatus | null> {
  const snap = await getDoc(doc(db, "scanStatus", clientId));
  return snap.exists() ? (snap.data() as ScanStatus) : null;
}

export async function getPushStatus(clientId: string): Promise<ScanStatus | null> {
  const snap = await getDoc(doc(db, "pushStatus", clientId));
  return snap.exists() ? (snap.data() as ScanStatus) : null;
}

export interface SyncResult {
  added: number;
  updated: number;
  unchanged: number;
}

export interface Clip {
  id?: string;
  clientId: string;
  name: string;
  videoId?: string;
  bunnyUrl?: string;
  thumbnailUrl?: string;
  driveThumbnailUrl?: string;
  driveFileId?: string;
  driveUrl?: string;
  status?: "drive-only" | "uploading" | "ready";
  folder: "raw" | "edited" | "approved";
  tags: string[];
  size?: string;
  duration?: string;
  mediaType?: "video" | "image";
  organizedPath?: string;   // in-app target folder (source of truth before Drive push)
  organizedAt?: string;     // when it was placed
  createdAt?: unknown;
  // AI analysis fields
  aiContentType?: string;
  aiEnergyLevel?: string;
  aiHookQuality?: string;
  aiUsabilityScore?: string;
  aiTopic?: string;
  aiSetting?: string;
  aiHasFace?: string;
  aiIsTalking?: string;
  aiNotes?: string;
  aiTags?: string[];   // multi-label: format + every activity/subject (e.g. ["vlog","cycling","outdoor"])
  aiAnalysedAt?: string;
}

// Save a single clip to Firestore
export async function saveClip(clip: Omit<Clip, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "clips"), {
    ...clip,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// Batch save many clips at once (much faster for Drive sync)
export async function batchSaveClips(clips: Omit<Clip, "id" | "createdAt">[]) {
  const BATCH_SIZE = 500;
  for (let i = 0; i < clips.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = clips.slice(i, i + BATCH_SIZE);
    for (const clip of chunk) {
      const ref = doc(collection(db, "clips"));
      batch.set(ref, { ...clip, createdAt: serverTimestamp() });
    }
    await batch.commit();
  }
}

/**
 * Apply an in-app organization: write each clip's target folder to organizedPath.
 * Reversible (clear with clearOrganization). Does NOT touch the real Drive path —
 * the eventual Drive push reconciles real folders to match these.
 */
export async function applyOrganization(
  placements: { clipId: string; organizedPath: string }[]
): Promise<number> {
  const now = new Date().toISOString();
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < placements.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const p of placements.slice(i, i + BATCH_SIZE)) {
      batch.update(doc(db, "clips", p.clipId), { organizedPath: p.organizedPath, organizedAt: now });
      written++;
    }
    await batch.commit();
  }
  return written;
}

/**
 * Move or merge a folder: re-path every clip under `oldPath` to `newPath`.
 * - Move "swimming" into Sports → newPath "ספורט/swimming"
 * - Merge duplicate "ספורט/ריצה" (typo) into the real one → same newPath, clips join it
 * Writes organizedPath so the change is in-app and reversible. Returns count moved.
 */
export async function moveFolderClips(
  clientId: string,
  oldPath: string,
  newPath: string
): Promise<number> {
  if (!oldPath || !newPath || oldPath === newPath) return 0;
  const all = await getClipsByClient(clientId);
  const updates: { id: string; path: string }[] = [];
  for (const c of all) {
    const eff = c.organizedPath || (c as Clip & { path?: string }).path || "";
    let next: string | null = null;
    if (eff === oldPath) next = newPath;
    else if (eff.startsWith(oldPath + "/")) next = newPath + eff.slice(oldPath.length);
    if (next && next !== eff && c.id) updates.push({ id: c.id, path: next });
  }
  const now = new Date().toISOString();
  const BATCH = 400;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const u of updates.slice(i, i + BATCH)) {
      batch.update(doc(db, "clips", u.id), { organizedPath: u.path, organizedAt: now });
    }
    await batch.commit();
  }
  return updates.length;
}

// Undo an organization: clear organizedPath on these clips (back into the pile)
export async function clearOrganization(clipIds: string[]): Promise<number> {
  const BATCH = 400;
  let n = 0;
  for (let i = 0; i < clipIds.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const id of clipIds.slice(i, i + BATCH)) {
      batch.update(doc(db, "clips", id), { organizedPath: "" });
      n++;
    }
    await batch.commit();
  }
  return n;
}

// Get all clips for a client
export async function getClipsByClient(clientId: string): Promise<Clip[]> {
  const q = query(collection(db, "clips"), where("clientId", "==", clientId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Clip));
}

/**
 * Upsert clips from a Drive re-sync — matches existing clips by driveFileId.
 * - New file  → created
 * - Existing file with changed folder/name → updated (AI tags preserved)
 * - Existing file unchanged → left alone
 * Never duplicates, never wipes AI analysis.
 */
export async function upsertClipsByDriveId(
  clientId: string,
  incoming: Omit<Clip, "id" | "createdAt">[]
): Promise<SyncResult> {
  // Index existing clips by their Drive file ID
  const existing = await getClipsByClient(clientId);
  const byDriveId = new Map<string, Clip>();
  for (const c of existing) {
    if (c.driveFileId) byDriveId.set(c.driveFileId, c);
  }

  let added = 0, updated = 0, unchanged = 0;
  const BATCH_SIZE = 400;

  for (let i = 0; i < incoming.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = incoming.slice(i, i + BATCH_SIZE);

    for (const clip of chunk) {
      const match = clip.driveFileId ? byDriveId.get(clip.driveFileId) : undefined;
      if (!match) {
        // New clip
        const ref = doc(collection(db, "clips"));
        batch.set(ref, { ...clip, createdAt: serverTimestamp() });
        added++;
      } else {
        const pathChanged = (match as Clip & { path?: string }).path !== (clip as Clip & { path?: string }).path;
        const nameChanged = match.name !== clip.name;
        if (pathChanged || nameChanged) {
          // Update only the folder structure + name; preserve AI fields, tags, etc.
          const ref = doc(db, "clips", match.id!);
          batch.update(ref, {
            path: (clip as Clip & { path?: string }).path ?? "",
            name: clip.name,
            driveThumbnailUrl: clip.driveThumbnailUrl ?? match.driveThumbnailUrl,
          });
          updated++;
        } else {
          unchanged++;
        }
      }
    }
    await batch.commit();
  }

  return { added, updated, unchanged };
}
