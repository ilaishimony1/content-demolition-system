"use client";

import { useEffect, useState, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { useAuth } from "@/lib/useAuth";
import {
  schedulePost, getScheduledPosts, deleteScheduledPost, ScheduledPost,
} from "@/lib/schedule";

// Maayan's "ready reels" folder (weekly subfolders live inside). Editable in the UI.
const DEFAULT_REELS_FOLDER = "1BD3zjGedpNy_X6ce8AiTas0hHxckzcYz";
// v1 posts to Ilai's own connected Instagram.
const ACCOUNT_ID = "ilai";

type Reel = { id: string; name: string; size: string; thumbnailLink?: string; week: string };

export default function SchedulePage() {
  const { user } = useAuth();
  const { data: session } = useSession();

  const [folder, setFolder] = useState(DEFAULT_REELS_FOLDER);
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [queue, setQueue] = useState<ScheduledPost[]>([]);

  // Per-reel drafts (caption + when)
  const [drafts, setDrafts] = useState<Record<string, { caption: string; when: string }>>({});
  const setDraft = (id: string, patch: Partial<{ caption: string; when: string }>) =>
    setDrafts(d => {
      const cur = d[id] || { caption: "", when: "" };
      return { ...d, [id]: { ...cur, ...patch } };
    });

  const refreshQueue = useCallback(async () => {
    setQueue(await getScheduledPosts(ACCOUNT_ID));
  }, []);

  useEffect(() => { if (user) refreshQueue(); }, [user, refreshQueue]);

  async function loadReels() {
    if (!session?.accessToken || (session as { error?: string }).error === "RefreshAccessTokenError") {
      await signIn("google");
      return;
    }
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/list-reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: session.accessToken, folder }),
      });
      const data = await res.json();
      if (data.error === "auth_expired") { await signIn("google"); return; }
      if (!data.success) { setLoadError(data.error || "Failed to load reels"); return; }
      setReels(data.reels || []);
    } catch (e) {
      setLoadError(String(e));
    } finally { setLoading(false); }
  }

  // Reels already queued shouldn't show in the "to schedule" list
  const queuedIds = new Set(queue.filter(q => q.status !== "posted" && q.status !== "failed").map(q => q.driveFileId));
  const unscheduled = reels.filter(r => !queuedIds.has(r.id));

  async function handleSchedule(reel: Reel) {
    const d = drafts[reel.id];
    if (!d?.when) { alert("Pick a date & time first."); return; }
    if (new Date(d.when).getTime() < Date.now()) { alert("That time is in the past — pick a future time."); return; }
    await schedulePost({
      clientId: ACCOUNT_ID,
      driveFileId: reel.id,
      name: reel.name,
      thumbnailLink: reel.thumbnailLink,
      caption: (d.caption || "").trim(),
      scheduledFor: new Date(d.when).toISOString(),
    });
    setDrafts(prev => { const n = { ...prev }; delete n[reel.id]; return n; });
    await refreshQueue();
  }

  async function removeFromQueue(id: string) {
    if (!confirm("Remove this from the schedule? (If it already posted, this won't un-post it.)")) return;
    await deleteScheduledPost(id);
    await refreshQueue();
  }

  const byWeek = unscheduled.reduce<Record<string, Reel[]>>((acc, r) => {
    (acc[r.week] ||= []).push(r); return acc;
  }, {});

  const statusStyle: Record<string, string> = {
    scheduled: "bg-orange-500/20 text-orange-300",
    posting: "bg-blue-500/20 text-blue-300",
    posted: "bg-green-500/20 text-green-300",
    failed: "bg-red-500/20 text-red-300",
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📅 Reel Scheduler</h1>
        <p className="text-white/50 text-sm">Review Maayan&apos;s finished reels, set a date/time + caption, and auto-post to Instagram.</p>
      </div>

      {/* Folder + load */}
      <div className="flex items-center gap-2 mb-6">
        <input
          value={folder}
          onChange={e => setFolder(e.target.value)}
          placeholder="Maayan's ready-reels Drive folder (link or ID)"
          className="flex-1 bg-[#111118] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50"
        />
        <button
          onClick={loadReels}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-40"
        >{loading ? "Loading…" : "Load reels"}</button>
      </div>
      {loadError && <p className="text-red-400 text-sm mb-4">⚠️ {loadError}</p>}

      {/* Scheduled queue */}
      {queue.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-white/70 mb-3">🗓️ Scheduled ({queue.length})</h2>
          <div className="space-y-2">
            {queue.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-[#111118] border border-white/10 rounded-xl px-4 py-3">
                <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${statusStyle[p.status] || ""}`}>{p.status}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{p.name}</p>
                  <p className="text-xs text-white/40 truncate">{p.caption || "(no caption)"}</p>
                </div>
                <span className="text-xs text-white/60 shrink-0">
                  {new Date(p.scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </span>
                {p.status !== "posted" && (
                  <button onClick={() => p.id && removeFromQueue(p.id)} className="text-white/30 hover:text-red-400 text-sm shrink-0">🗑️</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reels to schedule, grouped by week */}
      {reels.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <div className="text-4xl mb-3">🎬</div>
          <p>Click &quot;Load reels&quot; to pull Maayan&apos;s finished reels from Drive.</p>
        </div>
      ) : (
        Object.entries(byWeek).map(([week, weekReels]) => (
          <div key={week} className="mb-8">
            <h2 className="text-sm font-semibold text-white/70 mb-3">📁 {week} <span className="text-white/30">({weekReels.length})</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {weekReels.map(reel => {
                const d = drafts[reel.id] || { caption: "", when: "" };
                return (
                  <div key={reel.id} className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden">
                    <div className="aspect-video bg-black/40 flex items-center justify-center relative">
                      {reel.thumbnailLink
                        ? <img src={reel.thumbnailLink} alt={reel.name} className="w-full h-full object-cover" />
                        : <span className="text-4xl">🎬</span>}
                      <a href={`https://drive.google.com/file/d/${reel.id}/view`} target="_blank" rel="noopener noreferrer"
                        className="absolute bottom-2 right-2 text-[10px] px-2 py-1 rounded bg-black/60 text-white hover:bg-black/80">▶ Preview</a>
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-xs font-medium truncate">{reel.name}</p>
                      <textarea
                        value={d.caption}
                        onChange={e => setDraft(reel.id, { caption: e.target.value })}
                        placeholder="Caption + hashtags…"
                        rows={3}
                        className="w-full bg-[#0b0b10] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-orange-500/50 resize-none"
                      />
                      <input
                        type="datetime-local"
                        value={d.when}
                        onChange={e => setDraft(reel.id, { when: e.target.value })}
                        className="w-full bg-[#0b0b10] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-orange-500/50"
                      />
                      <button
                        onClick={() => handleSchedule(reel)}
                        className="w-full px-3 py-2 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600"
                      >📅 Schedule</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
