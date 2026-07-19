import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type PostStatus = "scheduled" | "posting" | "posted" | "failed";

export interface ScheduledPost {
  id?: string;
  clientId: string;          // which account this posts to (v1: "ilai")
  driveFileId: string;       // the reel's Drive file id
  name: string;              // file name (for display)
  thumbnailLink?: string;
  caption: string;
  scheduledFor: string;      // ISO datetime the post should go out
  status: PostStatus;
  igCreationId?: string;     // Instagram media container id (set when posting)
  postedAt?: string;
  error?: string;
  createdAt?: unknown;
}

// Queue a reel for posting.
export async function schedulePost(p: Omit<ScheduledPost, "id" | "status" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "scheduledPosts"), {
    ...p,
    status: "scheduled" as PostStatus,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// All scheduled posts for an account, soonest first.
export async function getScheduledPosts(clientId: string): Promise<ScheduledPost[]> {
  const q = query(
    collection(db, "scheduledPosts"),
    where("clientId", "==", clientId),
    orderBy("scheduledFor", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ScheduledPost, "id">) }));
}

export async function updateScheduledPost(id: string, patch: Partial<ScheduledPost>): Promise<void> {
  await updateDoc(doc(db, "scheduledPosts", id), patch as Record<string, unknown>);
}

// Remove a queued post (does NOT unpublish anything already posted).
export async function deleteScheduledPost(id: string): Promise<void> {
  await deleteDoc(doc(db, "scheduledPosts", id));
}
