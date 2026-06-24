import { collection, addDoc, getDocs, query, where, serverTimestamp, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
