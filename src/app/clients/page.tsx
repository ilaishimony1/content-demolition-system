"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { collection, addDoc, getDocs, updateDoc, doc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useSearchParams } from "next/navigation";

interface Client {
  id?: string;
  clientId?: string;
  name: string;
  handle: string;
  email: string;
  profilePhoto: string;
  niche: string;
  platforms: string[];
  driveFolderId: string;
  followers: string;
  monthlyRate: string;
  status: "active" | "paused";
  instagramConnected: boolean;
  tiktokConnected: boolean;
  youtubeConnected: boolean;
  notes: string;
  createdAt?: unknown;
}

const platformOptions = ["IG", "TT", "YT"];

const emptyClient: Omit<Client, "id" | "createdAt"> = {
  name: "",
  handle: "",
  email: "",
  profilePhoto: "",
  niche: "",
  platforms: ["IG"],
  driveFolderId: "",
  followers: "",
  monthlyRate: "",
  status: "active",
  instagramConnected: false,
  tiktokConnected: false,
  youtubeConnected: false,
  notes: "",
};

const emptyPassword = "";

function ClientsPage() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [password, setPassword] = useState(emptyPassword);
  const [saving, setSaving] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  useEffect(() => {
    if (user) loadClients();
  }, [user]);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success === "instagram_connected") {
      setToast({ msg: "✅ Instagram connected successfully!", type: "success" });
      loadClients();
      setTimeout(() => setToast(null), 4000);
    } else if (error) {
      setToast({ msg: `❌ Connection failed: ${error}`, type: "error" });
      setTimeout(() => setToast(null), 4000);
    }
  }, [searchParams]);

  async function loadClients() {
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "client")));
    setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
  }

  function openAddModal() {
    setEditingClient(null);
    setForm(emptyClient);
    setPassword("");
    setShowModal(true);
  }

  function openEditModal(client: Client) {
    setEditingClient(client);
    setForm({ ...client });
    setShowModal(true);
    setSelectedClient(null);
  }

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    try {
      if (editingClient?.id) {
        // Edit existing client — just update Firestore
        await updateDoc(doc(db, "users", editingClient.id), { ...form });
      } else {
        // New client — create Firebase Auth account + Firestore doc via API
        if (!form.email || !password) {
          setToast({ msg: "❌ Email and password are required for new clients", type: "error" });
          setSaving(false);
          return;
        }
        const res = await fetch("/api/clients/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password,
            niche: form.niche,
            driveFolderId: form.driveFolderId,
            notes: form.notes,
          }),
        });
        const data = await res.json();
        if (data.error) {
          setToast({ msg: `❌ ${data.error}`, type: "error" });
          setSaving(false);
          return;
        }
        setToast({ msg: `✅ Client created! They can log in with ${form.email}`, type: "success" });
        setTimeout(() => setToast(null), 5000);
      }
    } catch {
      setToast({ msg: "❌ Something went wrong", type: "error" });
    }
    setSaving(false);
    setShowModal(false);
    loadClients();
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>;
  if (!user) return null;

  const totalMRR = clients.reduce((sum, c) => sum + (parseInt(c.monthlyRate) || 0), 0);

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <Sidebar user={user} />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${toast.type === "success" ? "bg-green-500/20 border border-green-500/30 text-green-400" : "bg-red-500/20 border border-red-500/30 text-red-400"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/10 px-4 md:px-8 py-4 flex items-center justify-between mt-12 md:mt-0">
          <div>
            <h1 className="text-xl font-bold">Clients</h1>
            <p className="text-xs text-white/40">{clients.length} clients · ₪{totalMRR.toLocaleString()} MRR</p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 transition-colors text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <span>+</span> Add Client
          </button>
        </div>

        <div className="p-4 md:p-8">
          {clients.length === 0 ? (
            <div className="text-center py-20 text-white/30">
              <div className="text-5xl mb-4">👥</div>
              <p className="text-lg">No clients yet</p>
              <p className="text-sm mt-2">Add your first client to get started</p>
              <button onClick={openAddModal} className="mt-6 bg-orange-500 hover:bg-orange-400 text-white px-6 py-2.5 rounded-lg text-sm font-medium">
                + Add Client
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => setSelectedClient(client)}
                  className="bg-[#111118] border border-white/10 rounded-2xl p-6 hover:border-orange-500/30 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      {client.profilePhoto ? (
                        <img src={client.profilePhoto} alt={client.name} className="w-14 h-14 rounded-full object-cover border-2 border-white/10" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-xl font-bold">
                          {client.name?.[0] ?? "?"}
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-lg">{client.name}</h3>
                        <p className="text-sm text-white/50">{client.handle}</p>
                        <p className="text-xs text-white/30 mt-0.5">{client.niche}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${client.status === "active" ? "bg-green-400" : "bg-yellow-400"}`} />
                      <span className={`text-xs ${client.status === "active" ? "text-green-400" : "text-yellow-400"}`}>
                        {client.status}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <p className="text-sm font-bold">{client.followers || "—"}</p>
                      <p className="text-xs text-white/40">Followers</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <p className="text-sm font-bold text-orange-400">₪{parseInt(client.monthlyRate || "0").toLocaleString()}</p>
                      <p className="text-xs text-white/40">Monthly</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <p className="text-sm font-bold text-blue-400">{(client.platforms || []).join(", ")}</p>
                      <p className="text-xs text-white/40">Platforms</p>
                    </div>
                  </div>

                  {/* Connections */}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${client.instagramConnected ? "bg-pink-500/20 text-pink-400" : "bg-white/5 text-white/30"}`}>
                      📸 {client.instagramConnected ? "IG Connected" : "IG Not connected"}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full ${client.driveFolderId ? "bg-green-500/20 text-green-400" : "bg-white/5 text-white/30"}`}>
                      📁 {client.driveFolderId ? "Drive linked" : "No Drive"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Client Detail Modal */}
      {selectedClient && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">Client Details</h3>
                <button onClick={() => setSelectedClient(null)} className="text-white/40 hover:text-white text-xl">✕</button>
              </div>

              <div className="flex items-center gap-4 mb-6">
                {selectedClient.profilePhoto ? (
                  <img src={selectedClient.profilePhoto} alt={selectedClient.name} className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-2xl font-bold">
                    {selectedClient.name?.[0] ?? "?"}
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold">{selectedClient.name}</h2>
                  <p className="text-white/50">{selectedClient.handle}</p>
                  <p className="text-white/30 text-sm">{selectedClient.email}</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">Niche</span>
                  <span className="text-sm">{selectedClient.niche || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">Followers</span>
                  <span className="text-sm">{selectedClient.followers || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">Monthly Rate</span>
                  <span className="text-sm text-orange-400">₪{parseInt(selectedClient.monthlyRate || "0").toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">Drive Folder</span>
                  <span className="text-sm text-green-400">{selectedClient.driveFolderId ? "✓ Linked" : "Not linked"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">Instagram</span>
                  <span className={`text-sm ${selectedClient.instagramConnected ? "text-pink-400" : "text-white/30"}`}>
                    {selectedClient.instagramConnected ? "✓ Connected" : "Not connected"}
                  </span>
                </div>
                {selectedClient.notes && (
                  <div className="py-2">
                    <span className="text-white/40 text-sm block mb-1">Notes</span>
                    <p className="text-sm text-white/70">{selectedClient.notes}</p>
                  </div>
                )}
              </div>

              {/* Instagram connection */}
              <div className={`rounded-xl p-4 mb-4 border ${selectedClient.instagramConnected ? "bg-green-500/10 border-green-500/20" : "bg-pink-500/10 border-pink-500/20"}`}>
                {selectedClient.instagramConnected ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xl">✅</span>
                    <div>
                      <p className="text-sm font-medium text-green-400">Instagram Connected</p>
                      {(selectedClient as Client & { instagramUsername?: string }).instagramUsername && (
                        <p className="text-xs text-green-400/60">@{(selectedClient as Client & { instagramUsername?: string }).instagramUsername}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-pink-300 mb-2">📸 Connect Instagram to enable auto-posting and analytics</p>
                    <a
                      href={`/api/auth/instagram?clientId=${selectedClient.clientId || selectedClient.id}`}
                      className="block w-full text-center bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white border-0 py-2.5 rounded-lg text-sm font-semibold transition-all"
                    >
                      Connect Instagram →
                    </a>
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => openEditModal(selectedClient)}
                  className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-semibold py-3 rounded-xl text-sm"
                >
                  Edit Client
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ${selectedClient.name}? This cannot be undone.`)) return;
                    await import("firebase/firestore").then(({ deleteDoc, doc: firestoreDoc }) =>
                      deleteDoc(firestoreDoc(db, "users", selectedClient.id!))
                    );
                    setSelectedClient(null);
                    loadClients();
                    setToast({ msg: "✅ Client deleted", type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  }}
                  className="px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-semibold py-3 rounded-xl text-sm"
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">{editingClient ? "Edit Client" : "Add New Client"}</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white text-xl">✕</button>
              </div>

              <div className="space-y-4">
                {/* Profile Photo Preview */}
                {form.profilePhoto && (
                  <div className="flex justify-center">
                    <img src={form.profilePhoto} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-orange-500/50" />
                  </div>
                )}

                <div>
                  <label className="text-xs text-white/40 mb-1 block">Full Name *</label>
                  <input type="text" placeholder="Tom Dahan" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-2 block">Social Accounts</label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span>📸</span>
                        <div>
                          <p className="text-sm font-medium">Instagram</p>
                          <p className="text-xs text-white/30">Profile, followers, publishing</p>
                        </div>
                      </div>
                      <span className="text-xs bg-white/10 text-white/40 px-3 py-1 rounded-full">Coming soon</span>
                    </div>
                    <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span>🎵</span>
                        <div>
                          <p className="text-sm font-medium">TikTok</p>
                          <p className="text-xs text-white/30">Publishing & analytics</p>
                        </div>
                      </div>
                      <span className="text-xs bg-white/10 text-white/40 px-3 py-1 rounded-full">Coming soon</span>
                    </div>
                    <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span>▶️</span>
                        <div>
                          <p className="text-sm font-medium">YouTube Shorts</p>
                          <p className="text-xs text-white/30">Publishing & analytics</p>
                        </div>
                      </div>
                      <span className="text-xs bg-white/10 text-white/40 px-3 py-1 rounded-full">Coming soon</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1 block">Email</label>
                  <input type="email" placeholder="tom@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
                </div>

                {!editingClient && (
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Password <span className="text-orange-400">(you set this for them)</span></label>
                    <input type="password" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
                  </div>
                )}


                <div>
                  <label className="text-xs text-white/40 mb-1 block">Niche</label>
                  <input type="text" placeholder="Back Pain Recovery & Elite Athletics" value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
                </div>


                <div>
                  <label className="text-xs text-white/40 mb-1 block">Google Drive Folder ID</label>
                  <input type="text" placeholder="1MbACBeoRLlPXcuKX-UMDb5e1qyMLDhRn" value={form.driveFolderId} onChange={e => setForm(f => ({ ...f, driveFolderId: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
                </div>


                <div>
                  <label className="text-xs text-white/40 mb-1 block">Notes</label>
                  <textarea placeholder="Any notes about this client..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 resize-none" />
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1 block">Status</label>
                  <div className="flex gap-2">
                    {(["active", "paused"] as const).map(s => (
                      <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all capitalize ${form.status === s ? "border-orange-500 bg-orange-500/20 text-orange-400" : "border-white/10 text-white/50 hover:text-white"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="flex-1 border border-white/10 text-white/60 py-2.5 rounded-lg text-sm">Cancel</button>
                <button onClick={handleSave} disabled={!form.name || saving}
                  className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm">
                  {saving ? "Saving..." : editingClient ? "Save Changes" : "Add Client"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { Suspense } from "react";
export default function ClientsPageWrapper() {
  return <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>}><ClientsPage /></Suspense>;
}
