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
  const [posts, setPosts] = useState<AnalyticsPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [dateRange, setDateRange] = useState("1m");
  const [contentType, setContentType] = useState("all");
  const [sortBy, setSortBy] = useState("engagementRate");
  const [freePrompt, setFreePrompt] = useState("");
  const [freeAnswer, setFreeAnswer] = useState("");
  const [freeLoading, setFreeLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<AnalyticsPost | null>(null);
  const [videoAnalyses, setVideoAnalyses] = useState<Record<string, { loading?: boolean; error?: string; data?: Record<string, unknown> }>>({});
  const [avgEngRate, setAvgEngRate] = useState("0");

  async function loadFeed(cid: string, dr = dateRange, ct = contentType, sb = sortBy) {
    setPostsLoading(true);
    const params2 = new URLSearchParams({ clientId: cid, dateRange: dr, contentType: ct, sortBy: sb });
    const res = await fetch(`/api/instagram/ai-analysis?${params2}`);
    const data = await res.json();
    if (!data.error) {
      setPosts(data.posts || []);
      setAvgEngRate(data.avgEngagementRate || "0");
    }
    setPostsLoading(false);
  }

  async function askFreePrompt() {
    if (!freePrompt.trim() || !client?.clientId) return;
    setFreeLoading(true);
    setFreeAnswer("");
    const params2 = new URLSearchParams({ clientId: client.clientId, dateRange, contentType, sortBy: "engagementRate", freePrompt: freePrompt.trim() });
    const res = await fetch(`/api/instagram/ai-analysis?${params2}`);
    const data = await res.json();
    if (data.freeAnswer) setFreeAnswer(data.freeAnswer);
    else if (data.error) setFreeAnswer(`Error: ${data.error}`);
    setFreeLoading(false);
  }

  async function analyseVideo(post: AnalyticsPost) {
    if (!client?.clientId) return;
    setVideoAnalyses(prev => ({ ...prev, [post.id]: { loading: true } }));
    try {
      const res = await fetch("/api/instagram/analyse-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, clientId: client.clientId, caption: post.caption }),
      });
      const data = await res.json();
      if (data.error) setVideoAnalyses(prev => ({ ...prev, [post.id]: { error: data.error } }));
      else setVideoAnalyses(prev => ({ ...prev, [post.id]: { data: data.analysis } }));
    } catch (e) {
      setVideoAnalyses(prev => ({ ...prev, [post.id]: { error: String(e) } }));
    }
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === "analytics" && client?.clientId && client.instagramConnected && posts.length === 0) {
      loadFeed(client.clientId);
    }
  }, [activeTab, client]);

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
            <div className="space-y-4">
              {!client.instagramConnected ? (
                <div className="text-center py-16 bg-[#111118] border border-white/10 rounded-2xl text-white/40">
                  <div className="text-4xl mb-3">📸</div>
                  <p>Connect {client.name}&apos;s Instagram first to see analytics</p>
                </div>
              ) : (
                <>
                  {/* AI Chat Bar */}
                  <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-2xl p-4">
                    <div className="flex gap-2">
                      <input
                        value={freePrompt}
                        onChange={e => setFreePrompt(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && askFreePrompt()}
                        placeholder='🤖 Ask Claude anything — "best hooks from last month", "compare reels vs carousels"...'
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50"
                      />
                      <button onClick={askFreePrompt} disabled={freeLoading || !freePrompt.trim()}
                        className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap">
                        {freeLoading ? "..." : "Ask →"}
                      </button>
                    </div>
                    {freeAnswer && (
                      <div className="mt-3 bg-black/30 rounded-xl p-4 text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                        {freeAnswer}
                      </div>
                    )}
                  </div>

                  {/* Filters row */}
                  <div className="bg-[#111118] border border-white/10 rounded-2xl p-4 flex flex-wrap gap-4 items-center">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-white/30 mr-1">Period</span>
                      {[{v:"2w",l:"2W"},{v:"1m",l:"1M"},{v:"3m",l:"3M"},{v:"6m",l:"6M"},{v:"all",l:"All"}].map(o => (
                        <button key={o.v} onClick={() => { setDateRange(o.v); if (client.clientId) loadFeed(client.clientId, o.v, contentType, sortBy); }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${dateRange===o.v?"bg-orange-500 text-white":"bg-white/5 text-white/50 hover:bg-white/10"}`}>{o.l}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-white/30 mr-1">Type</span>
                      {[{v:"all",l:"All"},{v:"VIDEO",l:"Reels"},{v:"CAROUSEL_ALBUM",l:"Carousels"},{v:"IMAGE",l:"Photos"}].map(o => (
                        <button key={o.v} onClick={() => { setContentType(o.v); if (client.clientId) loadFeed(client.clientId, dateRange, o.v, sortBy); }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${contentType===o.v?"bg-orange-500 text-white":"bg-white/5 text-white/50 hover:bg-white/10"}`}>{o.l}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center ml-auto">
                      <span className="text-xs text-white/30 mr-1">Sort</span>
                      {[{v:"likes",l:"Likes"},{v:"saves",l:"Saves"},{v:"reach",l:"Reach"},{v:"engagementRate",l:"Shares"}].map(o => (
                        <button key={o.v} onClick={() => { setSortBy(o.v); if (client.clientId) loadFeed(client.clientId, dateRange, contentType, o.v); }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${sortBy===o.v?"bg-orange-500 text-white":"bg-white/5 text-white/50 hover:bg-white/10"}`}>{o.l}</button>
                      ))}
                    </div>
                    {posts.length > 0 && (
                      <div className="flex gap-3 text-xs text-white/40 ml-2">
                        <span>{posts.length} posts</span>
                      </div>
                    )}
                  </div>

                  {/* Feed grid */}
                  {postsLoading ? (
                    <div className="text-center py-16 text-white/30 text-sm animate-pulse">Loading feed...</div>
                  ) : (
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                      {posts.map((p, i) => {
                        const isTop20 = i < Math.ceil(posts.length * 0.2);
                        return (
                          <button key={p.id} onClick={() => setSelectedPost(p)}
                            className={`relative aspect-square rounded-xl overflow-hidden bg-[#111118] border transition-all hover:scale-[1.02] ${selectedPost?.id===p.id ? "border-orange-500" : isTop20 ? "border-yellow-500/40 hover:border-yellow-500/70" : "border-white/10 hover:border-orange-500/50"}`}>
                            {p.thumbnailUrl
                              ? <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-2xl">{p.mediaType==="VIDEO"?"🎬":p.mediaType==="CAROUSEL_ALBUM"?"🖼️":"📸"}</div>
                            }
                            {/* Badges */}
                            {i === 0 && <div className="absolute top-1.5 left-1.5 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">#1</div>}
                            {isTop20 && i > 0 && <div className="absolute top-1.5 left-1.5 text-sm">🔥</div>}
                            {p.mediaType === "VIDEO" && <div className="absolute top-1.5 right-1.5 bg-black/50 text-white text-[10px] px-1 py-0.5 rounded">▶</div>}
                            {p.mediaType === "CAROUSEL_ALBUM" && <div className="absolute top-1.5 right-1.5 bg-black/50 text-white text-[10px] px-1 py-0.5 rounded">⊞</div>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected post panel */}
                  {selectedPost && (
                    <div className="bg-[#111118] border border-orange-500/30 rounded-2xl p-5 space-y-4">
                      <div className="flex gap-4">
                        {selectedPost.thumbnailUrl && (
                          <img src={selectedPost.thumbnailUrl} alt="" className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80 leading-snug line-clamp-3">{selectedPost.caption || "No caption"}</p>
                          <p className="text-xs text-white/30 mt-1">{new Date(selectedPost.timestamp).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {[
                              { icon: "❤️", label: "Likes", val: selectedPost.likes },
                              { icon: "💬", label: "Comments", val: selectedPost.comments },
                              { icon: "🔖", label: "Saves", val: selectedPost.saves },
                              { icon: "↗️", label: "Shares", val: selectedPost.shares },
                              { icon: "👁️", label: "Reach", val: selectedPost.reach },
                            ].map(s => (
                              <div key={s.label} className="bg-white/5 rounded-xl px-3 py-2 text-center min-w-[56px]">
                                <p className="text-sm">{s.icon}</p>
                                <p className="text-sm font-bold">{s.val.toLocaleString()}</p>
                                <p className="text-[10px] text-white/30">{s.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <button onClick={() => setSelectedPost(null)} className="text-white/30 hover:text-white text-lg leading-none">✕</button>
                      </div>

                      {/* Claude Vision analysis */}
                      {selectedPost.mediaType === "VIDEO" && (() => {
                        const va = videoAnalyses[selectedPost.id];
                        return (
                          <div>
                            {!va?.data && (
                              <button onClick={() => analyseVideo(selectedPost)} disabled={va?.loading}
                                className="w-full bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50">
                                {va?.loading ? "🎬 Claude is watching the video..." : "🎬 Analyse with Claude Vision"}
                              </button>
                            )}
                            {va?.error && <p className="text-xs text-red-400">{va.error}</p>}
                            {va?.data && (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                  {[
                                    { l: "Content Type", v: String(va.data.content_type || "—") },
                                    { l: "Energy", v: String(va.data.energy_level || "—") },
                                    { l: "Hook Quality", v: `${va.data.hook_quality || "—"}/10` },
                                    { l: "Usability", v: `${va.data.usability_score || "—"}/10` },
                                    { l: "Hook Type", v: String(va.data.hook_type || "—") },
                                    { l: "Setting", v: String(va.data.setting || "—") },
                                    { l: "Has Face", v: va.data.has_face ? "Yes" : "No" },
                                    { l: "Talking to Cam", v: va.data.is_talking_to_camera ? "Yes" : "No" },
                                  ].map(s => (
                                    <div key={s.l} className="bg-white/5 rounded-lg px-3 py-2 text-center">
                                      <p className="text-[10px] text-white/40 mb-0.5">{s.l}</p>
                                      <p className="text-xs font-semibold text-white capitalize">{s.v}</p>
                                    </div>
                                  ))}
                                </div>
                                {va.data.notes ? <p className="text-xs text-white/50 italic bg-white/5 rounded-xl px-3 py-2">{String(va.data.notes)}</p> : null}
                              </div>
                            )}
                          </div>
                        );
                      })()}
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
