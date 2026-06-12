"use client";

import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getClients, ClientData, getClientColor } from "@/lib/clients";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function Home() {
  const { user, loading } = useAuth();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [pendingReels, setPendingReels] = useState(0);
  const [approvedReels, setApprovedReels] = useState(0);

  useEffect(() => {
    if (user) {
      getClients().then(setClients);
      getDocs(query(collection(db, "reels"), where("status", "==", "pending"))).then(s => setPendingReels(s.size));
      getDocs(query(collection(db, "reels"), where("status", "==", "approved"))).then(s => setApprovedReels(s.size));
    }
  }, [user]);

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>;
  if (!user) return null;

  const stats = [
    { label: "Total Clients", value: clients.length.toString(), sub: "Active retainers", icon: "👥" },
    { label: "Pending Review", value: pendingReels.toString(), sub: "Reels awaiting approval", icon: "🎯" },
    { label: "Approved Queue", value: approvedReels.toString(), sub: "Ready to schedule", icon: "✅" },
    { label: "MRR", value: `₪${clients.reduce((s, c) => s + (parseInt(c.monthlyRate || "0")), 0).toLocaleString()}`, sub: "Goal: ₪100,000", icon: "💰" },
  ];

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <Sidebar user={user} />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/10 px-4 md:px-8 py-4 flex items-center justify-between mt-12 md:mt-0">
          <div>
            <h1 className="text-xl font-bold">Operator Dashboard</h1>
            <p className="text-xs text-white/40">All systems running</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-white/50">{clients.length} clients active</span>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-6 md:space-y-8">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-[#111118] border border-white/10 rounded-xl p-5">
                <div className="text-2xl mb-2">{stat.icon}</div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-sm font-medium text-white/80 mt-1">{stat.label}</div>
                <div className="text-xs text-white/40 mt-0.5">{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Clients Row */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Clients</h2>
              <Link href="/clients" className="text-xs text-orange-400 hover:text-orange-300">Manage →</Link>
            </div>
            {clients.length === 0 ? (
              <div className="text-center py-12 text-white/30 bg-[#111118] border border-white/10 rounded-xl">
                <p>No clients yet — <Link href="/clients" className="text-orange-400">add your first client</Link></p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {clients.map((client, index) => (
                  <a href={`/clients/${client.id}`} key={client.id} className="bg-[#111118] border border-white/10 rounded-xl p-6 hover:border-orange-500/30 transition-all block">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {client.profilePhoto ? (
                          <img src={client.profilePhoto} alt={client.name} className="w-12 h-12 rounded-xl object-cover" />
                        ) : (
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getClientColor(index)} flex items-center justify-center text-lg font-bold`}>
                            {client.name?.[0] ?? "?"}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold">{client.name}</div>
                          <div className="text-xs text-white/40">{client.handle || client.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${client.status === "active" ? "bg-green-400" : "bg-yellow-400"}`} />
                        <span className={`text-xs ${client.status === "active" ? "text-green-400" : "text-yellow-400"}`}>
                          {client.status || "active"}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-white/50 mb-4">{client.niche}</div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white/5 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">{client.followers || "—"}</div>
                        <div className="text-xs text-white/40">Followers</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-orange-400">
                          {client.instagramConnected ? "✓" : "—"}
                        </div>
                        <div className="text-xs text-white/40">Instagram</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-blue-400">
                          {client.driveFolderId ? "✓" : "—"}
                        </div>
                        <div className="text-xs text-white/40">Drive</div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Scale Progress */}
          <div className="bg-[#111118] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold mb-4">Scale Progress</h3>
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-white/60">Current MRR</span>
                <span className="font-bold text-orange-400">
                  ₪{clients.reduce((s, c) => s + (parseInt(c.monthlyRate || "0")), 0).toLocaleString()}
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                  style={{ width: `${Math.min((clients.reduce((s, c) => s + (parseInt(c.monthlyRate || "0")), 0) / 100000) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/30 mt-1">
                <span>₪0</span>
                <span>Goal: ₪100,000</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex justify-between">
                <span className="text-white/60 text-sm">Current clients</span>
                <span className="font-medium text-sm">{clients.length} / 17 needed</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60 text-sm">Avg per client</span>
                <span className="font-medium text-sm">
                  ₪{clients.length > 0 ? Math.round(clients.reduce((s, c) => s + (parseInt(c.monthlyRate || "0")), 0) / clients.length).toLocaleString() : 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60 text-sm">Clients to goal</span>
                <span className="font-medium text-sm text-green-400">+{Math.max(17 - clients.length, 0)} more</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
