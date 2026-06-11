"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { collection, addDoc, getDocs, query, orderBy, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type ReelStatus = "pending" | "approved" | "rejected";
type ReelSource = "manual" | "agent";

interface Reel {
  id?: string;
  clientId: string;
  clientName: string;
  title: string;
  caption: string;
  videoUrl: string;
  thumbnailUrl?: string;
  status: ReelStatus;
  source: ReelSource;
  platform: string[];
  scheduledFor?: string;
  rejectionNote?: string;
  createdAt?: unknown;
}

const clients = [
  { id: "tom", name: "Tom Dahan", color: "from-orange-500 to-red-600", avatar: "T" },
  { id: "aviv", name: "Aviv Bushari", color: "from-blue-500 to-purple-600", avatar: "A" },
];

const platforms = ["IG", "TT", "YT"];

export default function ProductionPage() {
  const { user, loading } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [filter, setFilter] = useState<"all" | ReelStatus>("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New reel form
  const [form, setForm] = useState({
    clientId: "tom",
    title: "",
    caption: "",
    videoUrl: "",
    platform: ["IG"],
  });

  useEffect(() => {
    if (user) loadReels();
  }, [user]);

  async function loadReels() {
    const q = query(collection(db, "reels"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setReels(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reel)));
  }

  async function handleUploadReel() {
    if (!form.title || !form.videoUrl) return;
    setUploading(true);
    const client = clients.find(c => c.id === form.clientId)!;
    await addDoc(collection(db, "reels"), {
      clientId: form.clientId,
      clientName: client.name,
      title: form.title,
      caption: form.caption,
      videoUrl: form.videoUrl,
      status: "pending",
      source: "manual",
      platform: form.platform,
      createdAt: serverTimestamp(),
    });
    setForm({ clientId: "tom", title: "", caption: "", videoUrl: "", platform: ["IG"] });
    setShowUploadModal(false);
    setUploading(false);
    loadReels();
  }

  async function handleApprove(reel: Reel) {
    await updateDoc(doc(db, "reels", reel.id!), { status: "approved" });
    setSelectedReel(null);
    loadReels();
  }

  async function handleReject(reel: Reel) {
    await updateDoc(doc(db, "reels", reel.id!), {
      status: "rejected",
      rejectionNote: rejectionNote || "No note",
    });
    setRejectionNote("");
    setShowRejectInput(false);
    setSelectedReel(null);
    loadReels();
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>;
  if (!user) return null;

  const filtered = reels.filter(r => {
    const matchesStatus = filter === "all" || r.status === filter;
    const matchesClient = clientFilter === "all" || r.clientId === clientFilter;
    return matchesStatus && matchesClient;
  });

  const counts = {
    all: reels.length,
    pending: reels.filter(r => r.status === "pending").length,
    approved: reels.filter(r => r.status === "approved").length,
    rejected: reels.filter(r => r.status === "rejected").length,
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <Sidebar user={user} />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/10 px-4 md:px-8 py-4 flex items-center justify-between mt-12 md:mt-0">
          <div>
            <h1 className="text-xl font-bold">Production Queue</h1>
            <p className="text-xs text-white/40">Review and approve reels before posting</p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 transition-colors text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <span>+</span> Add Reel
          </button>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            {/* Status tabs */}
            <div className="flex gap-1 bg-[#111118] border border-white/10 rounded-lg p-1">
              {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                    filter === s ? "bg-orange-500 text-white" : "text-white/50 hover:text-white"
                  }`}
                >
                  {s} ({counts[s]})
                </button>
              ))}
            </div>

            {/* Client filter */}
            <div className="flex gap-1 bg-[#111118] border border-white/10 rounded-lg p-1">
              <button
                onClick={() => setClientFilter("all")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${clientFilter === "all" ? "bg-white/20 text-white" : "text-white/50 hover:text-white"}`}
              >
                All Clients
              </button>
              {clients.map(c => (
                <button
                  key={c.id}
                  onClick={() => setClientFilter(c.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${clientFilter === c.id ? "bg-white/20 text-white" : "text-white/50 hover:text-white"}`}
                >
                  {c.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Reels Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-white/30">
              <div className="text-5xl mb-4">🎯</div>
              <p className="text-lg">No reels yet</p>
              <p className="text-sm mt-2">Add a reel to review or wait for the agent to produce one</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((reel) => {
                const client = clients.find(c => c.id === reel.clientId);
                return (
                  <div
                    key={reel.id}
                    onClick={() => setSelectedReel(reel)}
                    className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden hover:border-orange-500/30 transition-all cursor-pointer"
                  >
                    {/* Video Preview */}
                    <div className="aspect-video bg-white/5 flex items-center justify-center relative">
                      {reel.videoUrl ? (
                        <video src={reel.videoUrl} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-4xl">🎬</span>
                      )}
                      {/* Status badge */}
                      <span className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-full font-medium ${
                        reel.status === "approved" ? "bg-green-500/80 text-white" :
                        reel.status === "rejected" ? "bg-red-500/80 text-white" :
                        "bg-yellow-500/80 text-black"
                      }`}>
                        {reel.status === "pending" ? "⏳ Pending" : reel.status === "approved" ? "✅ Approved" : "❌ Rejected"}
                      </span>
                      {/* Source badge */}
                      {reel.source === "agent" && (
                        <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded-full bg-purple-500/80 text-white">🤖 Agent</span>
                      )}
                    </div>

                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${client?.color} flex items-center justify-center text-xs font-bold`}>
                          {client?.avatar}
                        </div>
                        <span className="text-xs text-white/50">{reel.clientName}</span>
                        <div className="ml-auto flex gap-1">
                          {reel.platform.map(p => (
                            <span key={p} className="text-xs bg-white/10 px-1.5 py-0.5 rounded">{p}</span>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm font-medium mb-1 truncate">{reel.title}</p>
                      {reel.caption && <p className="text-xs text-white/40 truncate">{reel.caption}</p>}
                      {reel.rejectionNote && (
                        <p className="text-xs text-red-400 mt-2">Note: {reel.rejectionNote}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Reel Review Modal */}
      {selectedReel && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{selectedReel.title}</h3>
                <button onClick={() => { setSelectedReel(null); setShowRejectInput(false); setRejectionNote(""); }} className="text-white/40 hover:text-white text-xl">✕</button>
              </div>

              {/* Video */}
              <div className="aspect-video bg-black rounded-xl overflow-hidden mb-4">
                {selectedReel.videoUrl ? (
                  <video src={selectedReel.videoUrl} controls className="w-full h-full" autoPlay />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30">No video URL</div>
                )}
              </div>

              {/* Info */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">Client:</span>
                  <span className="text-xs text-white">{selectedReel.clientName}</span>
                  {selectedReel.source === "agent" && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">🤖 Agent generated</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">Platforms:</span>
                  <div className="flex gap-1">
                    {selectedReel.platform.map(p => (
                      <span key={p} className="text-xs bg-white/10 px-2 py-0.5 rounded">{p}</span>
                    ))}
                  </div>
                </div>
                {selectedReel.caption && (
                  <div>
                    <span className="text-xs text-white/40 block mb-1">Caption:</span>
                    <p className="text-sm text-white/70 bg-white/5 rounded-lg p-3">{selectedReel.caption}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              {selectedReel.status === "pending" && (
                <div className="space-y-3">
                  {showRejectInput ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Rejection note (optional)..."
                        value={rejectionNote}
                        onChange={(e) => setRejectionNote(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleReject(selectedReel)} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-semibold py-2.5 rounded-lg text-sm">Confirm Reject</button>
                        <button onClick={() => setShowRejectInput(false)} className="px-4 border border-white/10 text-white/60 py-2.5 rounded-lg text-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => handleApprove(selectedReel)} className="flex-1 bg-green-500 hover:bg-green-400 text-white font-semibold py-3 rounded-xl text-sm">✅ Approve</button>
                      <button onClick={() => setShowRejectInput(true)} className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold py-3 rounded-xl text-sm border border-red-500/20">❌ Reject</button>
                    </div>
                  )}
                </div>
              )}

              {selectedReel.status !== "pending" && (
                <div className={`text-center py-3 rounded-xl text-sm font-medium ${
                  selectedReel.status === "approved" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                }`}>
                  {selectedReel.status === "approved" ? "✅ Approved — ready to schedule" : `❌ Rejected${selectedReel.rejectionNote ? ` — ${selectedReel.rejectionNote}` : ""}`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Reel Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Add Reel to Queue</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-white/40 hover:text-white text-xl">✕</button>
            </div>

            <div className="space-y-4">
              {/* Client */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Client</label>
                <div className="flex gap-2">
                  {clients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setForm(f => ({ ...f, clientId: c.id }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                        form.clientId === c.id ? "border-orange-500 bg-orange-500/20 text-orange-400" : "border-white/10 text-white/50 hover:text-white"
                      }`}
                    >
                      {c.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Back pain morning routine"
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50"
                />
              </div>

              {/* Video URL */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Video URL (Bunny / Drive / any link)</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={form.videoUrl}
                  onChange={(e) => setForm(f => ({ ...f, videoUrl: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50"
                />
              </div>

              {/* Caption */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Caption</label>
                <textarea
                  placeholder="Post caption..."
                  value={form.caption}
                  onChange={(e) => setForm(f => ({ ...f, caption: e.target.value }))}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 resize-none"
                />
              </div>

              {/* Platforms */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Platforms</label>
                <div className="flex gap-2">
                  {platforms.map(p => (
                    <button
                      key={p}
                      onClick={() => setForm(f => ({
                        ...f,
                        platform: f.platform.includes(p) ? f.platform.filter(x => x !== p) : [...f.platform, p]
                      }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                        form.platform.includes(p) ? "border-orange-500 bg-orange-500/20 text-orange-400" : "border-white/10 text-white/50 hover:text-white"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowUploadModal(false)} className="flex-1 border border-white/10 text-white/60 py-2.5 rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleUploadReel}
                disabled={!form.title || !form.videoUrl || uploading}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm"
              >
                {uploading ? "Adding..." : "Add to Queue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
