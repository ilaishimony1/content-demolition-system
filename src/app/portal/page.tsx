"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { getClipsByClient, Clip } from "@/lib/clips";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
// portal page — clients only, operators redirected by useAuth

export default function ClientPortalPage() {
  const { user, profile, loading } = useAuth();
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeTab, setActiveTab] = useState<"library" | "approved" | "analytics">("approved");
  const router = useRouter();

  useEffect(() => {
    if (profile?.clientId) {
      getClipsByClient(profile.clientId).then(setClips);
    }
  }, [profile]);

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

  const approvedClips = clips.filter(c => c.folder === "approved");
  const totalClips = clips.length;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-sm font-bold">
            {profile.name?.[0] || "C"}
          </div>
          <div>
            <p className="text-sm font-semibold">{profile.name}</p>
            <p className="text-xs text-white/40">Client Portal</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs text-white/40">Powered by <span className="text-orange-400">Content Demolition</span></div>
          <button
            onClick={handleSignOut}
            className="text-xs text-white/40 hover:text-white transition-colors px-3 py-1.5 border border-white/10 rounded-lg"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-1">Hey {profile.name?.split(" ")[0]} 👋</h1>
          <p className="text-white/40">Here&apos;s your content overview</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8 md:mb-10">
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6">
            <p className="text-white/40 text-xs mb-2">Total Footage</p>
            <p className="text-3xl font-bold">{totalClips}</p>
            <p className="text-white/30 text-xs mt-1">clips in library</p>
          </div>
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6">
            <p className="text-white/40 text-xs mb-2">Approved Content</p>
            <p className="text-3xl font-bold text-green-400">{approvedClips.length}</p>
            <p className="text-white/30 text-xs mt-1">ready to post</p>
          </div>
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6">
            <p className="text-white/40 text-xs mb-2">This Month</p>
            <p className="text-3xl font-bold text-orange-400">0</p>
            <p className="text-white/30 text-xs mt-1">reels posted</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#111118] border border-white/10 rounded-lg p-1 w-full md:w-fit mb-6 md:mb-8 overflow-x-auto">
          {[
            { id: "approved", label: "✅ Approved Content" },
            { id: "library", label: "🎬 My Library" },
            { id: "analytics", label: "📊 Analytics" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === tab.id ? "bg-orange-500 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === "approved" && (
          <div>
            {approvedClips.length === 0 ? (
              <div className="text-center py-20 text-white/30">
                <div className="text-5xl mb-4">🎬</div>
                <p className="text-lg">No approved content yet</p>
                <p className="text-sm mt-2">Your team is working on it!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {approvedClips.map((clip) => (
                  <div key={clip.id} className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden">
                    <div className="aspect-video bg-white/5 flex items-center justify-center">
                      {clip.thumbnailUrl || clip.driveThumbnailUrl ? (
                        <img src={clip.thumbnailUrl || clip.driveThumbnailUrl} alt={clip.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-4xl">🎬</span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-medium truncate">{clip.name}</p>
                      <p className="text-xs text-green-400 mt-1">✅ Approved</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "library" && (
          <div>
            <p className="text-white/40 text-sm mb-6">{totalClips} clips in your library</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {clips.slice(0, 20).map((clip) => (
                <div key={clip.id} className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden">
                  <div className="aspect-video bg-white/5 flex items-center justify-center">
                    {clip.driveThumbnailUrl ? (
                      <img src={clip.driveThumbnailUrl} alt={clip.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <span className="text-2xl">🎬</span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs truncate text-white/60">{clip.name}</p>
                  </div>
                </div>
              ))}
            </div>
            {totalClips > 20 && <p className="text-white/30 text-xs mt-4 text-center">Showing 20 of {totalClips} clips</p>}
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="text-center py-20 text-white/30">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-lg">Analytics coming soon</p>
            <p className="text-sm mt-2">We&apos;re connecting your Instagram & TikTok data</p>
          </div>
        )}
      </div>
    </div>
  );
}
