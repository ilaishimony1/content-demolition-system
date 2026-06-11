import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ClientData {
  id: string;
  name: string;
  handle?: string;
  email?: string;
  profilePhoto?: string;
  niche?: string;
  platforms?: string[];
  driveFolderId?: string;
  followers?: string;
  monthlyRate?: string;
  status?: "active" | "paused";
  instagramConnected?: boolean;
  notes?: string;
}

export async function getClients(): Promise<ClientData[]> {
  const snap = await getDocs(collection(db, "clients"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClientData));
}

export function getClientColor(index: number): string {
  const colors = [
    "from-orange-500 to-red-600",
    "from-blue-500 to-purple-600",
    "from-green-500 to-teal-600",
    "from-pink-500 to-rose-600",
    "from-yellow-500 to-orange-600",
    "from-cyan-500 to-blue-600",
  ];
  return colors[index % colors.length];
}
