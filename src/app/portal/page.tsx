"use client";

import { useEffect, useState, Suspense } from "react";
import { useAuth } from "@/lib/useAuth";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, query, where, getDocs, updateDoc, doc, orderBy } from "firebase/firestore";

interface Reel {
  id: string;
  title: string;
  clientId: string;
  status: "pending" | "approved" | "rejected" | "posted";
  thumbnailUrl?: string;
  bunnyUrl?: string;
  caption?: string;
  platform?: string[];
  scheduledFor?: string;
  feedback?: string;
  createdAt?: { seconds: number };
}

interface AnalyticsPost {
  id: string;
  hook: string;
  caption: string;
  thumbnailUrl?: string;
  mediaType: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reach: number;
  engagement: number;
  engagementRate: number;
  timestamp: string;
}

interface Analytics {
  topByEngagement: AnalyticsPost[];
  topByEngagementRate: AnalyticsPost[];
  bestHours: { hour: number; avgEngagement: number }[];
  typeStats: Record<string, { count: number; totalEngagement: number }>;
  totalPosts: number;
  avgEngagementRate: string;
}

interface Clip {
  id: string;
  name: string;
  driveThumbnailUrl?: string;
  folder: string;
  status?: string;
}

function ClientPortalPageInner() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeTab, setActiveTab] = useState<"reels" | "library" | "analytics">("reels");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<Reel | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<string | null>(null);

  async function loadReels(clientId: string) {
    const snap = await getDocs(
      query(collection(db, "reels"), where("clientId", "==", clientId), orderBy("createdAt", "desc"))
    );
    setReels(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reel)));
  }

  async function loadClips(clientId: string) {
    const snap = await getDocs(
      query(collection(db, "clips"), where("clientId", "==", clientId))
    );
    setClips(snap.docs.map(d => ({ id: d.id, ...d.data() } as Clip)));
  }

  async function loadAnalytics(clientId: string) {
    setAnalyticsLoading(true);
    const res = await fetch(`/api/instagram/analytics?clientId=${clientId}`);
    const data = await res.json();
    if (!data.error) setAnalytics(data);
    setAnalyticsLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => {
    if (profile?.clientId) {
      loadReels(profile.clientId);
      loadClips(profile.clientId);
    }
  }, [profile]);

  // Handle OAuth success/error from URL params
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success === "instagram_connected") {
      setTimeout(() => {
        setToast("✅ Instagram connected successfully!");
        setTimeout(() => setToast(null), 4000);
      }, 0);
      // Refresh profile so followers/photo show immediately
      if (user) refreshProfile(user.uid);
      window.history.replaceState({}, "", "/portal");
    } else if (error) {
      setTimeout(() => {
        setToast(`❌ ${error.replace(/_/g, " ")}`);
        setTimeout(() => setToast(null), 4000);
      }, 0);
      window.history.replaceState({}, "", "/portal");
    }
  }, [searchParams]);

  async function handleApprove(reel: Reel) {
    await updateDoc(doc(db, "reels", reel.id), { status: "approved", feedback: "" });
    setReels(r => r.map(x => x.id === reel.id ? { ...x, status: "approved" } : x));
  }

  async function handleRequestChanges() {
    if (!feedbackModal || !feedbackText.trim()) return;
    setSubmitting(true);
    await updateDoc(doc(db, "reels", feedbackModal.id), { status: "rejected", feedback: feedbackText });
    setReels(r => r.map(x => x.id === feedbackModal.id ? { ...x, status: "rejected", feedback: feedbackText } : x));
    setFeedbackModal(null);
    setFeedbackText("");
    setSubmitting(false);
  }

  async function handleSignOut() {
    await signOut(auth);
    router.push("/login");
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-white/40 text-sm">Loading...</div>
    </div>
  );

  if (!user || !profile) return null;

  const firstName = profile.name?.split(" ")[0] || "there";
  const pendingReels = reels.filter(r => r.status === "pending");
  const approvedReels = reels.filter(r => r.status === "approved");
  const postedReels = reels.filter(r => r.status === "posted");

  const statusBadge = (status: Reel["status"]) => {
    const map = {
      pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      approved: "bg-green-500/20 text-green-400 border-green-500/30",
      rejected: "bg-red-500/20 text-red-400 border-red-500/30",
      posted: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
    const labels = { pending: "Awaiting Review", approved: "Approved ✓", rejected: "Changes Requested", posted: "Posted ✓" };
    return <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${map[status]}`}>{labels[status]}</span>;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#111118] border border-white/20 rounded-xl px-5 py-3 text-sm font-medium shadow-2xl animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}
      {/* Header */}
      <div className="border-b border-white/10 px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-sm font-bold">
            {profile.name?.[0] ?? "C"}
          </div>
          <div>
            <p className="text-sm font-semibold">{profile.name || "Client"}</p>
            <p className="text-xs text-white/40">Client Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <div className="hidden md:block text-xs text-white/30">Powered by <span className="text-orange-400 font-medium">Content Demolition</span></div>
          <button onClick={handleSignOut} className="text-xs text-white/40 hover:text-white transition-colors px-3 py-1.5 border border-white/10 rounded-lg">
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-12">

        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Hey {firstName} 👋</h1>
          <p className="text-white/40 text-sm">Here&apos;s your content overview</p>
        </div>

        {/* Connect Instagram banner */}
        {!profile.instagramConnected && (
          <div className="bg-pink-500/10 border border-pink-500/30 rounded-2xl p-4 mb-6 flex items-center gap-4">
            <div className="text-2xl">📸</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-pink-300">Connect your Instagram</p>
              <p className="text-xs text-pink-400/60 mt-0.5">So we can post your content automatically</p>
            </div>
            <a
              href={`/api/auth/instagram?clientId=${profile.clientId}&returnTo=portal`}
              className="text-xs bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 text-white px-4 py-2 rounded-lg font-medium transition-all"
            >
              Connect →
            </a>
          </div>
        )}

        {/* Action needed banner */}
        {pendingReels.length > 0 && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 mb-8 flex items-center gap-4">
            <div className="text-2xl">🎬</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-orange-300">
                {pendingReels.length} reel{pendingReels.length > 1 ? "s" : ""} waiting for your review
              </p>
              <p className="text-xs text-orange-400/60 mt-0.5">Review and approve before we schedule them</p>
            </div>
            <button onClick={() => setActiveTab("reels")} className="text-xs bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Review now
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Total Footage", value: clips.length, sub: "clips in library", color: "text-white" },
            { label: "Awaiting Review", value: pendingReels.length, sub: "need your approval", color: "text-yellow-400" },
            { label: "Approved", value: approvedReels.length, sub: "ready to schedule", color: "text-green-400" },
            { label: "Posted", value: postedReels.length, sub: "reels live", color: "text-blue-400" },
          ].map(s => (
            <div key={s.label} className="bg-[#111118] border border-white/10 rounded-2xl p-4 md:p-5">
              <p className="text-white/40 text-xs mb-2">{s.label}</p>
              <p className={`text-2xl md:text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-white/30 text-xs mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#111118] border border-white/10 rounded-xl p-1 w-full md:w-fit mb-6">
          {[
            { id: "reels", label: "🎬 Reels" },
            { id: "library", label: "📁 My Library" },
            { id: "analytics", label: "📊 Analytics" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id ? "bg-orange-500 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Reels Tab */}
        {activeTab === "reels" && (
          <div className="space-y-4">
            {reels.length === 0 ? (
              <div className="text-center py-20 text-white/30 bg-[#111118] border border-white/10 rounded-2xl">
                <div className="text-5xl mb-4">🎬</div>
                <p className="text-lg">No reels yet</p>
                <p className="text-sm mt-2">Your team is working on your content!</p>
              </div>
            ) : (
              reels.map(reel => (
                <div key={reel.id} className="bg-[#111118] border border-white/10 rounded-2xl p-4 md:p-6 hover:border-white/20 transition-all">
                  <div className="flex gap-4 md:gap-6">
                    {/* Thumbnail */}
                    <div className="w-20 md:w-28 aspect-[9/16] rounded-xl bg-white/5 flex-shrink-0 overflow-hidden">
                      {reel.thumbnailUrl ? (
                        <img src={reel.thumbnailUrl} alt={reel.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-sm md:text-base truncate">{reel.title}</h3>
                        {statusBadge(reel.status)}
                      </div>

                      {reel.caption && (
                        <p className="text-xs text-white/50 mb-3 line-clamp-2">{reel.caption}</p>
                      )}

                      {reel.platform && reel.platform.length > 0 && (
                        <div className="flex gap-1.5 mb-3">
                          {reel.platform.map(p => (
                            <span key={p} className="text-xs bg-white/5 text-white/40 px-2 py-0.5 rounded-full">{p}</span>
                          ))}
                        </div>
                      )}

                      {reel.feedback && reel.status === "rejected" && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 mb-3">
                          <p className="text-xs text-red-400">💬 Your feedback: &quot;{reel.feedback}&quot;</p>
                        </div>
                      )}

                      {reel.scheduledFor && reel.status === "approved" && (
                        <p className="text-xs text-blue-400 mb-3">🗓 Scheduled for {reel.scheduledFor}</p>
                      )}

                      {/* Actions — only for pending */}
                      {reel.status === "pending" && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleApprove(reel)}
                            className="flex-1 md:flex-none bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => { setFeedbackModal(reel); setFeedbackText(""); }}
                            className="flex-1 md:flex-none bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                          >
                            ✎ Request Changes
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Library Tab */}
        {activeTab === "library" && (
          <div>
            <p className="text-white/40 text-sm mb-4">{clips.length} clips in your library</p>
            {clips.length === 0 ? (
              <div className="text-center py-20 text-white/30 bg-[#111118] border border-white/10 rounded-2xl">
                <div className="text-5xl mb-4">📁</div>
                <p>No footage synced yet</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {clips.slice(0, 24).map(clip => (
                    <div key={clip.id} className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden group">
                      <div className="aspect-video bg-white/5 flex items-center justify-center overflow-hidden">
                        {clip.driveThumbnailUrl ? (
                          <img src={clip.driveThumbnailUrl} alt={clip.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <span className="text-2xl">🎬</span>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-xs truncate text-white/50">{clip.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {clips.length > 24 && (
                  <p className="text-white/30 text-xs mt-4 text-center">Showing 24 of {clips.length} clips</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {!profile.instagramConnected ? (
              <div className="text-center py-20 text-white/30 bg-[#111118] border border-white/10 rounded-2xl">
                <div className="text-5xl mb-4">📸</div>
                <p className="text-lg font-medium text-white/50">Connect Instagram to see analytics</p>
              </div>
            ) : !analytics && !analyticsLoading ? (
              <div className="text-center py-16 bg-[#111118] border border-white/10 rounded-2xl">
                <div className="text-5xl mb-4">📊</div>
                <p className="text-white/60 mb-4">Analyse your last 20 posts</p>
                <button
                  onClick={() => profile.clientId && loadAnalytics(profile.clientId)}
                  className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-all"
                >
                  Load My Analytics →
                </button>
              </div>
            ) : analyticsLoading ? (
              <div className="text-center py-20 text-white/30 bg-[#111118] border border-white/10 rounded-2xl">
                <div className="text-3xl mb-3 animate-pulse">📊</div>
                <p>Fetching your Instagram data...</p>
              </div>
            ) : analytics ? (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Posts Analysed", value: analytics.totalPosts, icon: "📸" },
                    { label: "Avg Engagement Rate", value: `${analytics.avgEngagementRate}%`, icon: "🔥" },
                    { label: "Top Post Engagement", value: analytics.topByEngagement[0]?.engagement || 0, icon: "⚡" },
                    { label: "Best Hour", value: analytics.bestHours[0] ? `${analytics.bestHours[0].hour}:00` : "—", icon: "🕐" },
                  ].map(s => (
                    <div key={s.label} className="bg-[#111118] border border-white/10 rounded-2xl p-4">
                      <div className="text-2xl mb-2">{s.icon}</div>
                      <div className="text-2xl font-bold">{s.value}</div>
                      <div className="text-xs text-white/40 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Best Hours */}
                {analytics.bestHours.length > 0 && (
                  <div className="bg-[#111118] border border-white/10 rounded-2xl p-5">
                    <h3 className="font-semibold mb-4">🕐 Best Times to Post</h3>
                    <div className="flex gap-3">
                      {analytics.bestHours.map((h, i) => (
                        <div key={h.hour} className={`flex-1 rounded-xl p-3 text-center ${i === 0 ? "bg-orange-500/20 border border-orange-500/30" : "bg-white/5"}`}>
                          <div className={`text-lg font-bold ${i === 0 ? "text-orange-400" : ""}`}>
                            {h.hour}:00
                          </div>
                          <div className="text-xs text-white/40 mt-1">avg {Math.round(h.avgEngagement)} eng</div>
                          {i === 0 && <div className="text-xs text-orange-400 mt-1">🏆 Best</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Posts by Engagement */}
                <div>
                  <h3 className="font-semibold mb-4">🔥 Top Posts by Engagement</h3>
                  <div className="space-y-3">
                    {analytics.topByEngagement.map((post, i) => (
                      <div key={post.id} className="bg-[#111118] border border-white/10 rounded-2xl p-4 flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-sm font-bold">
                          {i + 1}
                        </div>
                        {post.thumbnailUrl && (
                          <img src={post.thumbnailUrl} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate mb-1">{post.hook}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-white/50">
                            <span>❤️ {post.likes}</span>
                            <span>💬 {post.comments}</span>
                            <span>🔖 {post.saves}</span>
                            <span>↗️ {post.shares}</span>
                            <span className="text-orange-400 font-medium">📈 {post.engagementRate}% rate</span>
                          </div>
                          <div className="text-xs text-white/30 mt-1">Reach: {post.reach.toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Best Hooks */}
                <div className="bg-[#111118] border border-white/10 rounded-2xl p-5">
                  <h3 className="font-semibold mb-4">🎣 Best Hooks (from top posts)</h3>
                  <div className="space-y-3">
                    {analytics.topByEngagementRate.slice(0, 5).map((post, i) => (
                      <div key={post.id} className="flex gap-3 items-start">
                        <span className="text-xs text-white/30 w-4 mt-0.5">{i + 1}.</span>
                        <div className="flex-1">
                          <p className="text-sm text-white/80">&ldquo;{post.hook}&rdquo;</p>
                          <p className="text-xs text-orange-400 mt-0.5">{post.engagementRate}% engagement rate · {post.engagement} total</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => profile.clientId && loadAnalytics(profile.clientId)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/50 py-3 rounded-xl text-sm transition-all"
                >
                  Refresh Data
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Feedback Modal */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-50 px-4 pb-4 md:pb-0">
          <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold mb-1">Request Changes</h3>
            <p className="text-xs text-white/40 mb-4">Tell the team what to fix for &quot;{feedbackModal.title}&quot;</p>
            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="e.g. Make the hook shorter, change the music, add subtitles..."
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setFeedbackModal(null)} className="flex-1 border border-white/10 text-white/60 py-2.5 rounded-xl text-sm">
                Cancel
              </button>
              <button
                onClick={handleRequestChanges}
                disabled={!feedbackText.trim() || submitting}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm"
              >
                {submitting ? "Sending..." : "Send Feedback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientPortalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>}>
      <ClientPortalPageInner />
    </Suspense>
  );
}
