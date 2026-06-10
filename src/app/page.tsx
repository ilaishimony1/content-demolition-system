"use client";

import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";

const clients = [
  {
    id: "tom",
    name: "Tom Dahan",
    handle: "@tom.dahan",
    niche: "Back Pain Recovery & Elite Athletics",
    avatar: "T",
    color: "from-orange-500 to-red-600",
    reelsToday: 1,
    reelsQueued: 12,
    followers: "48.2K",
    growth: "+1.2K",
    platforms: ["IG", "TT", "YT"],
    status: "active",
  },
  {
    id: "aviv",
    name: "Aviv Bushari",
    handle: "@aviv.bushari",
    niche: "Stock Market & Ironman Athlete",
    avatar: "A",
    color: "from-blue-500 to-purple-600",
    reelsToday: 1,
    reelsQueued: 8,
    followers: "21.7K",
    growth: "+540",
    platforms: ["IG", "TT", "YT"],
    status: "active",
  },
];


const stats = [
  { label: "Total Clients", value: "2", sub: "Active retainers", icon: "👥" },
  { label: "Reels Posted Today", value: "2", sub: "1 per client", icon: "📲" },
  { label: "Queued Content", value: "20", sub: "Across all clients", icon: "🗂️" },
  { label: "MRR", value: "₪12,000", sub: "Goal: ₪100,000", icon: "💰" },
];

const recentActivity = [
  { time: "18:00", client: "Tom Dahan", action: "Reel posted to IG, TT, YT", type: "post" },
  { time: "18:00", client: "Aviv Bushari", action: "Reel posted to IG, TT, YT", type: "post" },
  { time: "14:23", client: "Tom Dahan", action: "3 reels approved for queue", type: "approve" },
  { time: "11:05", client: "Aviv Bushari", action: "New B-roll uploaded (5 clips)", type: "upload" },
  { time: "09:30", client: "Tom Dahan", action: "Inspiration reel flagged for modeling", type: "inspire" },
];

const activityColors: Record<string, string> = {
  post: "text-green-400",
  approve: "text-blue-400",
  upload: "text-orange-400",
  inspire: "text-purple-400",
};

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-white/40 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <Sidebar user={user} />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/10 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Operator Dashboard</h1>
            <p className="text-xs text-white/40">Tuesday, June 10 · All systems running</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-white/50">2 clients active</span>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
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
              <button className="text-xs text-orange-400 hover:text-orange-300">+ Add Client</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="bg-[#111118] border border-white/10 rounded-xl p-6 hover:border-orange-500/30 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${client.color} flex items-center justify-center text-lg font-bold`}
                      >
                        {client.avatar}
                      </div>
                      <div>
                        <div className="font-semibold">{client.name}</div>
                        <div className="text-xs text-white/40">{client.handle}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className="text-xs text-green-400">Active</span>
                    </div>
                  </div>

                  <div className="text-xs text-white/50 mb-4">{client.niche}</div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold">{client.followers}</div>
                      <div className="text-xs text-white/40">Followers</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold text-green-400">{client.growth}</div>
                      <div className="text-xs text-white/40">This week</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold text-orange-400">{client.reelsQueued}</div>
                      <div className="text-xs text-white/40">Queued</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      {client.platforms.map((p) => (
                        <span key={p} className="text-xs bg-white/10 px-2 py-0.5 rounded-full">
                          {p}
                        </span>
                      ))}
                    </div>
                    <button className="text-xs text-orange-400 hover:text-orange-300">Manage →</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Recent Activity */}
            <div className="bg-[#111118] border border-white/10 rounded-xl p-6">
              <h3 className="font-semibold mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xs text-white/30 w-10 shrink-0 pt-0.5">{item.time}</span>
                    <div>
                      <span className={`text-xs font-medium ${activityColors[item.type]}`}>
                        {item.client}
                      </span>
                      <p className="text-xs text-white/50">{item.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MRR Progress */}
            <div className="bg-[#111118] border border-white/10 rounded-xl p-6">
              <h3 className="font-semibold mb-4">Scale Progress</h3>
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-white/60">Current MRR</span>
                  <span className="font-bold text-orange-400">₪12,000</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-[12%] bg-gradient-to-r from-orange-500 to-red-500 rounded-full" />
                </div>
                <div className="flex justify-between text-xs text-white/30 mt-1">
                  <span>₪0</span>
                  <span>Goal: ₪100,000</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Current clients</span>
                  <span className="font-medium">2 / 17 needed</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Price per client</span>
                  <span className="font-medium">₪6,000 / mo</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Clients to goal</span>
                  <span className="font-medium text-green-400">+15 more</span>
                </div>
              </div>

              <div className="mt-6 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <p className="text-xs text-orange-300">
                  🚀 System is being built to handle 17+ clients automatically
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
