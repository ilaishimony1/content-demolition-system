/**
 * Agent Shared Memory
 *
 * All agents (Drive Scanner, Reel Builder, Auto Poster, etc.) read and write
 * to this shared Firestore layer so they can hand work off to each other.
 *
 * Schema: agent_memory/{clientId}/events (subcollection)
 *   - agent: who wrote this ("drive-scanner" | "reel-builder" | "auto-poster" | "inspiration-scout")
 *   - type: what happened ("scan-complete" | "clips-tagged" | "reel-ready" | "post-scheduled" | etc.)
 *   - payload: any JSON data
 *   - createdAt: timestamp
 *
 * Schema: agent_memory/{clientId} (doc)
 *   - lastScanAt: when Drive Scanner last ran
 *   - totalAnalysed: how many clips have been AI-tagged
 *   - lastReelBuiltAt: when Reel Builder last ran
 *   - pendingReels: clips selected for next reel
 *   - lastPostedAt: when Auto Poster last ran
 *   - inspirationTopics: topics found by Inspiration Scout
 */

import { db } from "@/lib/firebase";
import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, getDocs, query, orderBy, limit,
  serverTimestamp
} from "firebase/firestore";

export type AgentName = "drive-scanner" | "reel-builder" | "auto-poster" | "inspiration-scout" | "viral-predictor";

export interface AgentEvent {
  id?: string;
  agent: AgentName;
  type: string;
  payload: Record<string, unknown>;
  createdAt?: unknown;
}

export interface AgentMemory {
  clientId: string;
  // Drive Scanner
  lastScanAt?: string;
  totalAnalysed?: number;
  // Reel Builder
  lastReelBuiltAt?: string;
  pendingReelClipIds?: string[];
  lastReelUrl?: string;
  lastReelBrief?: string;
  // Auto Poster
  lastPostedAt?: string;
  scheduledPostIds?: string[];
  // Inspiration Scout
  inspirationTopics?: string[];
  trendingHooks?: string[];
  // Shared context
  clientNiche?: string;
  updatedAt?: unknown;
}

// Get the shared memory doc for a client
export async function getAgentMemory(clientId: string): Promise<AgentMemory | null> {
  const ref = doc(db, "agent_memory", clientId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { clientId, ...snap.data() } as AgentMemory;
}

// Write/merge fields into agent memory
export async function updateAgentMemory(clientId: string, fields: Partial<AgentMemory>) {
  const ref = doc(db, "agent_memory", clientId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { ...fields, updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, { clientId, ...fields, updatedAt: serverTimestamp() });
  }
}

// Log an event (agents hand off work via events)
export async function logAgentEvent(clientId: string, event: Omit<AgentEvent, "id" | "createdAt">) {
  const eventsRef = collection(db, "agent_memory", clientId, "events");
  await addDoc(eventsRef, { ...event, createdAt: serverTimestamp() });
}

// Get recent events (so agents can see what other agents did)
export async function getRecentAgentEvents(clientId: string, maxEvents = 20): Promise<AgentEvent[]> {
  const eventsRef = collection(db, "agent_memory", clientId, "events");
  const q = query(eventsRef, orderBy("createdAt", "desc"), limit(maxEvents));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentEvent));
}
