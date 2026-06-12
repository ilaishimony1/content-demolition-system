"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams, useRouter } from "next/navigation";

interface AnalyticsPost {
  id: string; hook: string; caption: string; thumbnailUrl?: string;
  mediaType: string; likes: number; comments: number; saves: number;
  shares: number; reach: number; engagement: number; engagementRate: number; timestamp: string;
}
interface AIInsights {
  topPatterns: string[]; bestHooks: { hook: string; why: string; engagementRate: string }[];
  worstHooks: { hook: string; why: string }[]; contentInsights: string;
  topRecommendations: string[]; avoidList: string[]; hookFormula: string;
}
interface Analytics {
  posts: AnalyticsPost[]; aiInsights: AIInsights | null;
  totalAnalysed: number; avgEngagementRate: string;
}

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
  const [activeTab, setActiveTab] = useState<"overview" | "analytics">("overview");
  // Analytics state
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [dateRange, setDateRange] = useState("1m");
  const [contentType, setContentType] = useState("all");
  const [sortBy, setSortBy] = useState("engagementRate");
  const [freePrompt, setFreePrompt] = useState("");
  const [freeAnswer, setFreeAnswer] = useState("");
  const [freeLoading, setFreeLoading] = useState(false);

  async function loadAnalytics() {
    if (!client?.clientId) return;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    const params2 = new URLSearchParams({ clientId: client.clientId, dateRange, contentType, sortBy });
    const res = await fetch(`/api/instagram/ai-analysis?${params2}`);
    const data = await res.json();
    if (data.error) setAnalyticsError(data.error);
    else setAnalytics(data);
    setAnalyticsLoading(false);
  }

  async function askFreePrompt() {
    if (!freePrompt.trim() || !client?.clientId) return;
    setFreeLoading(true);
    setFreeAnswer("");
    // Fetch posts data first, then ask Claude the custom question
    const params2 = new URLSearchParams({ clientId: client.clientId, dateRange: "all", contentType: "all", sortBy: "engagementRate", freePrompt: freePrompt.trim() });
    const res = await fetch(`/api/instagram/ai-analysis?${params2}`);
    const data = await res.json();
    if (data.freeAnswer) setFreeAnswer(data.freeAnswer);
    else if (data.error) setFreeAnswer(`Error: ${data.error}`);
    setFreeLoading(false);
  }

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

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => {
    if (user && params.id) loadClient();
  }, [user, params.id]);

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
          {/* Tab switcher */}
          <div className="flex gap-1 bg-white/5 rounded-lg p-1 ml-4">
            {(["overview", "analytics"] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${activeTab === t ? "bg-orange-500 text-white" : "text-white/40 hover:text-white"}`}>
                {t === "analytics" ? "📊 Analytics" : "👤 Overview"}
              </button>
            ))}
          </div>
          <div className={`flex items-center gap-1.5 ml-auto`}>
            <div className={`w-2 h-2 rounded-full ${client.status === "active" ? "bg-green-400" : "bg-yellow-400"}`} />
            <span className={`text-xs ${client.status === "active" ? "text-green-400" : "text-yellow-400"}`}>{client.status || "active"}</span>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          {activeTab === "analytics" && (
            <div className="space-y-6">
              {!client.instagramConnected ? (
                <div className="text-center py-16 bg-[#111118] border border-white/10 rounded-2xl text-white/40">
                  <div className="text-4xl mb-3">📸</div>
                  <p>Connect {client.name}&apos;s Instagram first to see analytics</p>
                </div>
              ) : (
                <>
                  {/* Free-text AI prompt */}
                  <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-2xl p-5">
                    <h3 className="font-semibold mb-1 text-orange-400">🤖 Ask Claude Anything</h3>
                    <p className="text-xs text-white/40 mb-3">e.g. &quot;What hooks worked best for talking reels?&quot; or &quot;Compare January vs March content&quot;</p>
                    <div className="flex gap-2">
                      <input
                        value={freePrompt}
                        onChange={e => setFreePrompt(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && askFreePrompt()}
                        placeholder="Ask anything about this client's content..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50"
                      />
                      <button
                        onClick={askFreePrompt}
                        disabled={freeLoading || !freePrompt.trim()}
                        className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                      >
                        {freeLoading ? "..." : "Ask →"}
                      </button>
                    </div>
                    {freeAnswer && (
                      <div className="mt-4 bg-black/30 rounded-xl p-4 text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                        {freeAnswer}
                      </div>
                    )}
                  </div>

                  {/* Filters */}
                  {!analytics && !analyticsLoading && (
                    <div className="bg-[#111118] border border-white/10 rounded-2xl p-5 space-y-4">
                      <h3 className="font-semibold">📊 Deep Analysis</h3>
                      <div>
                        <p className="text-xs text-white/40 mb-2">📅 Time Period</p>
                        <div className="flex flex-wrap gap-2">
                          {[{v:"2w",l:"Last 2 weeks"},{v:"1m",l:"Last month"},{v:"3m",l:"Last 3 months"},{v:"6m",l:"Last 6 months"},{v:"all",l:"All time"}].map(o => (
                            <button key={o.v} onClick={() => setDateRange(o.v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dateRange===o.v?"bg-orange-500 text-white":"bg-white/5 text-white/50 hover:bg-white/10"}`}>{o.l}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-2">🎬 Content Type</p>
                        <div className="flex flex-wrap gap-2">
                          {[{v:"all",l:"All"},{v:"VIDEO",l:"Reels"},{v:"CAROUSEL_ALBUM",l:"Carousels"},{v:"IMAGE",l:"Photos"}].map(o => (
                            <button key={o.v} onClick={() => setContentType(o.v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${contentType===o.v?"bg-orange-500 text-white":"bg-white/5 text-white/50 hover:bg-white/10"}`}>{o.l}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-2">📊 Sort By</p>
                        <div className="flex flex-wrap gap-2">
                          {[{v:"engagementRate",l:"Engagement Rate"},{v:"likes",l:"Likes"},{v:"saves",l:"Saves"},{v:"reach",l:"Reach"}].map(o => (
                            <button key={o.v} onClick={() => setSortBy(o.v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortBy===o.v?"bg-orange-500 text-white":"bg-white/5 text-white/50 hover:bg-white/10"}`}>{o.l}</button>
                          ))}
                        </div>
                      </div>
                      {analyticsError && <p className="text-red-400 text-xs">{analyticsError}</p>}
                      <button onClick={loadAnalytics} className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-all">
                        🔍 Run Analysis →
                      </button>
                    </div>
                  )}

                  {analyticsLoading && (
                    <div className="text-center py-16 bg-[#111118] border border-white/10 rounded-2xl">
                      <div className="text-4xl mb-3 animate-pulse">🤖</div>
                      <p className="text-white/60">Claude is analysing {client.name}&apos;s content...</p>
                    </div>
                  )}

                  {analytics && !analyticsLoading && (
                    <div className="space-y-5">
                      {/* Summary */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          {l:"Posts Analysed", v:analytics.totalAnalysed, i:"📸"},
                          {l:"Avg Eng. Rate", v:`${analytics.avgEngagementRate}%`, i:"🔥"},
                          {l:"Top Post Rate", v:`${analytics.posts[0]?.engagementRate||0}%`, i:"⚡"},
                        ].map(s => (
                          <div key={s.l} className="bg-[#111118] border border-white/10 rounded-xl p-4 text-center">
                            <div className="text-xl mb-1">{s.i}</div>
                            <div className="text-xl font-bold">{s.v}</div>
                            <div className="text-xs text-white/40 mt-1">{s.l}</div>
                          </div>
                        ))}
                      </div>

                      {analytics.aiInsights?.hookFormula && (
                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
                          <p className="text-xs text-orange-400 font-semibold mb-1">🎣 Hook Formula</p>
                          <p className="text-sm text-white/80">{analytics.aiInsights.hookFormula}</p>
                        </div>
                      )}
                      {analytics.aiInsights?.contentInsights && (
                        <div className="bg-[#111118] border border-white/10 rounded-xl p-4">
                          <p className="text-xs text-white/40 font-semibold mb-2">🧠 Audience Insights</p>
                          <p className="text-sm text-white/70">{analytics.aiInsights.contentInsights}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {analytics.aiInsights?.topRecommendations && (
                          <div className="bg-[#111118] border border-green-500/20 rounded-xl p-4">
                            <p className="text-xs text-green-400 font-semibold mb-3">🚀 Do More Of</p>
                            <div className="space-y-1.5">
                              {analytics.aiInsights.topRecommendations.map((r,i) => (
                                <div key={i} className="flex gap-2 text-sm text-white/70"><span className="text-green-400">→</span>{r}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {analytics.aiInsights?.avoidList && (
                          <div className="bg-[#111118] border border-red-500/20 rounded-xl p-4">
                            <p className="text-xs text-red-400 font-semibold mb-3">🛑 Stop Doing</p>
                            <div className="space-y-1.5">
                              {analytics.aiInsights.avoidList.map((r,i) => (
                                <div key={i} className="flex gap-2 text-sm text-white/70"><span className="text-red-400">✕</span>{r}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {analytics.aiInsights?.bestHooks && (
                        <div className="bg-[#111118] border border-white/10 rounded-xl p-4">
                          <p className="text-xs text-white/40 font-semibold mb-3">🔥 Best Hooks</p>
                          <div className="space-y-3">
                            {analytics.aiInsights.bestHooks.map((h,i) => (
                              <div key={i} className="border-l-2 border-orange-500/40 pl-3">
                                <p className="text-sm text-white/80">&ldquo;{h.hook}&rdquo;</p>
                                <p className="text-xs text-orange-400 mt-0.5">{h.engagementRate} · {h.why}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Posts list */}
                      <div>
                        <p className="text-xs text-white/40 mb-3">All posts ranked by {sortBy}</p>
                        <div className="space-y-2">
                          {analytics.posts.map((p,i) => (
                            <div key={p.id} className={`flex gap-3 items-center bg-[#111118] border rounded-xl p-3 ${i===0?"border-orange-500/40":"border-white/10"}`}>
                              <span className={`text-xs font-bold w-5 ${i===0?"text-orange-400":"text-white/30"}`}>#{i+1}</span>
                              {p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-white/70 truncate">{p.hook||"No caption"}</p>
                                <div className="flex gap-2 text-xs text-white/30 mt-0.5">
                                  <span>❤️{p.likes}</span><span>💬{p.comments}</span><span>🔖{p.saves}</span>
                                </div>
                              </div>
                              <span className={`text-sm font-bold ${p.engagementRate>parseFloat(analytics.avgEngagementRate)?"text-green-400":"text-white/40"}`}>{p.engagementRate}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => setAnalytics(null)} className="w-full bg-white/5 hover:bg-white/10 text-white/40 py-2.5 rounded-xl text-sm">🔄 New Analysis</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "overview" && (<>

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
          </>)}
        </div>
      </div>
    </div>
  );
}
