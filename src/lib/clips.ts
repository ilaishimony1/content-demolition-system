import { collection, addDoc, getDocs, query, where, serverTimestamp, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Clip {
  id?: string;
  clientId: string;
  name: string;
  videoId?: string;
  bunnyUrl?: string;
  thumbnailUrl?: string;
  driveThumbnailUrl?: string;
  driveFileId?: string;
  status?: "drive-only" | "uploading" | "ready";
  folder: "raw" | "edited" | "approved";
  tags: string[];
  size?: string;
  duration?: string;
  createdAt?: unknown;
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
