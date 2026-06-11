"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams, useRouter } from "next/navigation";

interface Client {
  id: string;
  name: string;
  email?: string;
  clientId?: string;
  niche?: string;
  driveFolderId?: string;
  notes?: string;
  status?: string;
  profilePhoto?: string;
  followers?: string;
  instagramConnected?: boolean;
  instagramUsername?: string;
  tiktokConnected?: boolean;
  youtubeConnected?: boolean;
  platforms?: string[];
}

export default function ClientDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [clipCount, setClipCount] = useState(0);
  const [reelCount, setReelCount] = useState(0);

  useEffect(() => {
    if (user && params.id) loadClient();
  }, [user, params.id]);

  async function loadClient() {
    const snap = await getDoc(doc(db, "users", params.id as string));
    if (!snap.exists()) return;
    const data = { id: snap.id, ...snap.data() } as Client;
    setClient(data);

    // Load clip/reel counts
    const cid = data.clientId || data.id;
    const [clips, reels] = await Promise.all([
      getDocs(query(collection(db, "clips"), where("clientId", "==", cid))),
      getDocs(query(collection(db, "reels"), where("clientId", "==", cid))),
    ]);
    setClipCount(clips.size);
    setReelCount(reels.size);
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>;
  if (!user) return null;

  if (!client) return (
    <div className="flex h-screen bg-[#0a0a0f] text-white">
      <Sidebar user={user} />
      <div className="flex-1 flex items-center justify-center text-white/40">Client not found</div>
    </div>
  );

  const platforms = [
    {
      name: "Instagram",
      icon: "📸",
      connected: client.instagramConnected,
      username: client.instagramUsername,
      followers: client.followers,
      connectUrl: `/api/auth/instagram?clientId=${client.clientId || client.id}`,
      color: "pink",
    },
    {
      name: "TikTok",
      icon: "🎵",
      connected: client.tiktokConnected,
      username: null,
      followers: null,
      connectUrl: null,
      color: "purple",
    },
    {
      name: "YouTube Shorts",
      icon: "▶️",
      connected: client.youtubeConnected,
      username: null,
      followers: null,
      connectUrl: null,
      color: "red",
    },
  ];

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <Sidebar user={user} />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/10 px-4 md:px-8 py-4 flex items-center gap-4 mt-12 md:mt-0">
          <button onClick={() => router.push("/clients")} className="text-white/40 hover:text-white text-sm">← Back</button>
          <h1 className="text-xl font-bold">{client.name}</h1>
          <div className={`flex items-center gap-1.5 ml-auto`}>
            <div className={`w-2 h-2 rounded-full ${client.status === "active" ? "bg-green-400" : "bg-yellow-400"}`} />
            <span className={`text-xs ${client.status === "active" ? "text-green-400" : "text-yellow-400"}`}>{client.status || "active"}</span>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-6">

          {/* Profile */}
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 flex items-center gap-6">
            {client.profilePhoto ? (
              <img src={client.profilePhoto} alt={client.name} className="w-20 h-20 rounded-full object-cover border-2 border-white/10" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-3xl font-bold flex-shrink-0">
                {client.name?.[0] ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold">{client.name}</h2>
              <p className="text-white/40 text-sm">{client.email}</p>
              <p className="text-white/60 text-sm mt-1">{client.niche}</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{clipCount}</p>
                <p className="text-xs text-white/40">Clips</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{reelCount}</p>
                <p className="text-xs text-white/40">Reels</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-400">{client.followers || "—"}</p>
                <p className="text-xs text-white/40">Followers</p>
              </div>
            </div>
          </div>

          {/* Social Accounts */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Social Accounts</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {platforms.map(p => (
                <div key={p.name} className={`bg-[#111118] border rounded-2xl p-5 ${p.connected ? "border-green-500/30" : "border-white/10"}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{p.icon}</span>
                      <div>
                        <p className="font-semibold text-sm">{p.name}</p>
                        {p.username && <p className="text-xs text-white/40">@{p.username}</p>}
                      </div>
                    </div>
                    {p.connected ? (
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full border border-green-500/30">✓ Connected</span>
                    ) : (
                      <span className="text-xs bg-white/5 text-white/30 px-2 py-1 rounded-full">Not connected</span>
                    )}
                  </div>

                  {p.connected && p.followers && (
                    <div className="bg-white/5 rounded-xl p-3 mb-3 text-center">
                      <p className="text-xl font-bold">{p.followers}</p>
                      <p className="text-xs text-white/40">Followers</p>
                    </div>
                  )}

                  {!p.connected && (
                    p.connectUrl ? (
                      <a href={p.connectUrl} className="block w-full text-center bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 text-white py-2 rounded-xl text-xs font-semibold transition-all">
                        Connect {p.name} →
                      </a>
                    ) : (
                      <button className="w-full bg-white/5 text-white/30 py-2 rounded-xl text-xs font-medium cursor-not-allowed">
                        Coming Soon
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Drive & Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#111118] border border-white/10 rounded-2xl p-5">
              <h3 className="font-semibold mb-3">📁 Google Drive</h3>
              {client.driveFolderId ? (
                <div>
                  <p className="text-xs text-green-400 mb-1">✓ Folder linked</p>
                  <p className="text-xs text-white/30 font-mono truncate">{client.driveFolderId}</p>
                  <a href={`https://drive.google.com/drive/folders/${client.driveFolderId}`} target="_blank" rel="noopener noreferrer"
                    className="mt-3 block text-center text-xs bg-white/5 hover:bg-white/10 text-white/60 py-2 rounded-lg">
                    Open in Drive →
                  </a>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-white/30 mb-3">No Drive folder linked</p>
                  <button
                    onClick={() => router.push(`/clients?edit=${client.id}`)}
                    className="w-full text-xs bg-white/5 hover:bg-white/10 text-white/60 py-2 rounded-lg"
                  >
                    Add Drive Folder
                  </button>
                </div>
              )}
            </div>

            <div className="bg-[#111118] border border-white/10 rounded-2xl p-5">
              <h3 className="font-semibold mb-3">📊 Quick Stats</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Total footage</span>
                  <span>{clipCount} clips</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Reels produced</span>
                  <span>{reelCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Drive folder</span>
                  <span className={client.driveFolderId ? "text-green-400" : "text-white/30"}>{client.driveFolderId ? "✓ Linked" : "Not linked"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Portal access</span>
                  <span className="text-green-400">✓ Active</span>
                </div>
              </div>
            </div>
          </div>

          {client.notes && (
            <div className="bg-[#111118] border border-white/10 rounded-2xl p-5">
              <h3 className="font-semibold mb-2">📝 Notes</h3>
              <p className="text-sm text-white/60">{client.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/library?client=${client.clientId || client.id}`)}
              className="flex-1 bg-[#111118] border border-white/10 hover:border-orange-500/30 text-white py-3 rounded-xl text-sm font-medium transition-all"
            >
              🎬 View Library
            </button>
            <button
              onClick={() => router.push("/production")}
              className="flex-1 bg-[#111118] border border-white/10 hover:border-orange-500/30 text-white py-3 rounded-xl text-sm font-medium transition-all"
            >
              🎯 Production Queue
            </button>
            <button
              onClick={() => router.push(`/clients?edit=${client.id}`)}
              className="flex-1 bg-orange-500 hover:bg-orange-400 text-white py-3 rounded-xl text-sm font-semibold transition-all"
            >
              ✏️ Edit Client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
