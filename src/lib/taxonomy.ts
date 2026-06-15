/**
 * Client Taxonomy
 *
 * Users define their own category structure. The agent learns it and
 * uses it when tagging new clips — so "action_reel" becomes "Sports > Gym"
 * based on whatever the operator decides to call it.
 *
 * Stored in Firestore: taxonomies/{clientId}
 */

import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export interface TaxonomyCategory {
  id: string;           // original AI label e.g. "action_reel" — never changes
  name: string;         // user-facing name e.g. "Sports"
  emoji: string;        // e.g. "🏋️"
  subcategories: TaxonomySubcategory[];
}

export interface TaxonomySubcategory {
  id: string;           // e.g. "sports-gym"
  name: string;         // e.g. "Gym"
  keywords: string[];   // hints for the agent: ["weights", "barbell", "treadmill"]
}

export interface ClientTaxonomy {
  clientId: string;
  categories: TaxonomyCategory[];
  updatedAt?: string;
}

// Default taxonomy built from AI labels — used until the user customises
const DEFAULT_EMOJIS: Record<string, string> = {
  action_reel: "⚡",
  broll: "🎬",
  vlog: "📱",
  tutorial: "📚",
  talking_reel: "🗣️",
  talking_head: "🗣️",
  transition: "✨",
};

export function buildDefaultTaxonomy(clientId: string, aiLabels: string[]): ClientTaxonomy {
  return {
    clientId,
    categories: aiLabels.map(label => ({
      id: label,
      name: label.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      emoji: DEFAULT_EMOJIS[label] || "📹",
      subcategories: [],
    })),
  };
}

export async function getTaxonomy(clientId: string): Promise<ClientTaxonomy | null> {
  const ref = doc(db, "taxonomies", clientId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as ClientTaxonomy;
}

export async function saveTaxonomy(taxonomy: ClientTaxonomy): Promise<void> {
  const ref = doc(db, "taxonomies", taxonomy.clientId);
  await setDoc(ref, { ...taxonomy, updatedAt: new Date().toISOString() });
}
