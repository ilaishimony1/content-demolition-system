import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Clip {
  id?: string;
  clientId: string;
  name: string;
  videoId: string;
  bunnyUrl: string;
  thumbnailUrl: string;
  folder: "raw" | "edited" | "approved";
  tags: string[];
  size?: string;
  duration?: string;
  createdAt?: unknown;
}

// Save clip metadata to Firestore after upload
export async function saveClip(clip: Omit<Clip, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "clips"), {
    ...clip,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// Get all clips for a client
export async function getClipsByClient(clientId: string): Promise<Clip[]> {
  const q = query(collection(db, "clips"), where("clientId", "==", clientId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Clip));
}
