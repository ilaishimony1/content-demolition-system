import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface TranscribeStatus {
  running?: boolean;
  stage?: string;
  error?: string;
  chunksDone?: number;
  chunksTotal?: number;
  updatedAt?: string;
}

export async function getTranscribeStatus(episodeId: string): Promise<TranscribeStatus | null> {
  const snap = await getDoc(doc(db, "transcribeStatus", episodeId));
  return snap.exists() ? (snap.data() as TranscribeStatus) : null;
}

export interface TriageItem {
  start: number;
  end: number;
  why: string;
  quote?: string;
  rank?: number;
  speaker?: string;
}

export interface PodcastTriage {
  gold: TriageItem[];
  keep: TriageItem[];
  cut: TriageItem[];
  triagedAt?: string;
}

export interface TriageStatus {
  running?: boolean;
  windowsDone?: number;
  windowsTotal?: number;
  error?: string;
  updatedAt?: string;
}

export async function getTriageStatus(episodeId: string): Promise<TriageStatus | null> {
  const snap = await getDoc(doc(db, "triageStatus", episodeId));
  return snap.exists() ? (snap.data() as TriageStatus) : null;
}

export async function getPodcastTriage(episodeId: string): Promise<PodcastTriage | null> {
  const snap = await getDoc(doc(db, "podcastTriage", episodeId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    gold: JSON.parse(d.gold || "[]"),
    keep: JSON.parse(d.keep || "[]"),
    cut: JSON.parse(d.cut || "[]"),
    triagedAt: d.triagedAt,
  };
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
