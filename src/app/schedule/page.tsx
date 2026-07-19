"use client";

import { useEffect, useState, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { useAuth } from "@/lib/useAuth";
import {
  schedulePost, getScheduledPosts, deleteScheduledPost, ScheduledPost,
} from "@/lib/schedule";
import { getClients, ClientData } from "@/lib/clients";

// Maayan's "ready reels" folder (weekly subfolders live inside). Editable in the UI.
const DEFAULT_REELS_FOLDER = "1BD3zjGedpNy_X6ce8AiTas0hHxckzcYz";

type Reel = { id: string; name: string; size: string; thumbnailLink?: string };
type Folder = { id: string; name: string };
type Crumb = { id: string; name: string };

export default function SchedulePage() {
  const { user } = useAuth();
  const { data: session } = useSession();

  const [rootFolder, setRootFolder] = useState(DEFAULT_REELS_FOLDER);
  const [path, setPath] = useState<Crumb[]>([]);          // breadcrumb (excludes root)
  const [folders, setFolders] = useState<Folder[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [queue, setQueue] = useState<ScheduledPost[]>([]);

  // Which connected Instagram account we post to
  const [clients, setClients] = useState<ClientData[]>([]);
  const [account, setAccount] = useState("");
  const [postingId, setPostingId] = useState<string | null>(null);

  // The reel you clicked → schedule panel
  const [selected, setSelected] = useState<Reel | null>(null);
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState("");

  const refreshQueue = useCallback(async (acct: string) => {
    if (!acct) { setQueue([]); return; }
    setQueue(await getScheduledPosts(acct));
  }, []);

  useEffect(() => {
    if (!user) return;
    getClients().then(cs => {
      const connected = cs.filter(c => c.instagramConnected);
      setClients(connected);
      setAccount(prev => prev || connected[0]?.clientId || connected[0]?.id || "");
    });
  }, [user]);

  useEffect(() => { if (user && account) refreshQueue(account); }, [user, account, refreshQueue]);

  // Browse one folder level
  const browse = useCallback(async (folderId: string) => {
    if (!session?.accessToken || (session as { error?: string }).error === "RefreshAccessTokenError") {
      await signIn("google");
      return;
    }
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/list-reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: session.accessToken, folder: folderId }),
      });
      const data = await res.json();
      if (data.error === "auth_expired") { await signIn("google"); return; }
      if (!data.success) { setLoadError(data.error || "Failed to load"); return; }
      setFolders(data.folders || []);
      setReels(data.reels || []);
    } catch (e) {
      setLoadError(String(e));
    } finally { setLoading(false); }
  }, [session]);

  function openRoot() {
    setPath([]);
    browse(rootFolder.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1] || rootFolder.trim());
  }
  function enterFolder(f: Folder) {
    setPath(p => [...p, f]);
    browse(f.id);
  }
  function goToCrumb(idx: number) {
    // idx = -1 → root; else index in path
    if (idx < 0) { openRoot(); return; }
    const target = path[idx];
    setPath(path.slice(0, idx + 1));
    browse(target.id);
  }

  const queuedIds = new Set(queue.filter(q => q.status !== "posted" && q.status !== "failed").map(q => q.driveFileId));

  async function doSchedule() {
    if (!selected) return;
    if (!account) { alert("Pick which Instagram account to post to first."); return; }
    if (!when) { alert("Pick a date & time first."); return; }
    if (new Date(when).getTime() < Date.now()) { alert("That time is in the past — pick a future time."); return; }
    await schedulePost({
      clientId: account,
      driveFileId: selected.id,
      name: selected.name,
      thumbnailLink: selected.thumbnailLink,
      caption: caption.trim(),
      scheduledFor: new Date(when).toISOString(),
    });
    setSelected(null); setCaption(""); setWhen("");
    await refreshQueue(account);
  }

  async function doPostNow() {
    if (!selected) return;
    if (!account) { alert("Pick which Instagram account to post to first."); return; }
    if (!session?.accessToken) { await signIn("google"); return; }
    const acctName = clients.find(c => (c.clientId || c.id) === account)?.name || account;
    if (!confirm(`Post "${selected.name}" to ${acctName}'s Instagram RIGHT NOW?\n\nIt goes live immediately (no draft mode). Takes ~1-3 min to process.`)) return;
    setPostingId(selected.id);
    try {
      const res = await fetch("/api/agent/publish-reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: account, driveFileId: selected.id, caption: caption.trim(), accessToken: session.accessToken }),
      });
      const data = await res.json();
      if (data.error) { alert("Couldn't start the post: " + data.error); return; }
      alert("🚀 Posting started! Instagram is processing the reel — it'll appear on the account in ~1-3 minutes.");
      setSelected(null); setCaption(""); setWhen("");
    } catch (e) {
      alert("Post failed: " + String(e));
    } finally {
      setPostingId(null);
    }
  }

  async function removeFromQueue(id: string) {
    if (!confirm("Remove this from the schedule? (If it already posted, this won't un-post it.)")) return;
    await deleteScheduledPost(id);
    await refreshQueue(account);
  }

  const statusStyle: Record<string, string> = {
    scheduled: "bg-orange-500/20 text-orange-300",
    posting: "bg-blue-500/20 text-blue-300",
    posted: "bg-green-500/20 text-green-300",
    failed: "bg-red-500/20 text-red-300",
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">📅 Reel Scheduler</h1>
          <p className="text-white/50 text-sm">Browse Maayan&apos;s reels in Drive, click one, set a time + caption, and auto-post.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">Post to:</span>
          <select value={account} onChange={e => setAccount(e.target.value)}
            className="bg-[#111118] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50">
            {clients.length === 0 && <option value="">No connected accounts</option>}
            {clients.map(c => <option key={c.id} value={c.clientId || c.id}>📸 {c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Root folder + open */}
      <div className="flex items-center gap-2 mb-4">
        <input value={rootFolder} onChange={e => setRootFolder(e.target.value)}
          placeholder="Maayan's ready-reels Drive folder (link or ID)"
          className="flex-1 bg-[#111118] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50" />
        <button onClick={openRoot} disabled={loading}
          className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-40">
          {loading ? "Loading…" : "Open folder"}</button>
      </div>
      {loadError && <p className="text-red-400 text-sm mb-4">⚠️ {loadError}</p>}

      {/* Breadcrumb */}
      {(folders.length > 0 || reels.length > 0 || path.length > 0) && (
        <div className="flex items-center gap-1 text-sm text-white/50 mb-4 flex-wrap">
          <button onClick={() => goToCrumb(-1)} className="hover:text-white">📁 Maayan</button>
          {path.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-white/25">/</span>
              <button onClick={() => goToCrumb(i)} className="hover:text-white">{c.name}</button>
            </span>
          ))}
        </div>
      )}

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
                <span className="text-xs text-white/60 shrink-0">{new Date(p.scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                {p.status !== "posted" && <button onClick={() => p.id && removeFromQueue(p.id)} className="text-white/30 hover:text-red-400 text-sm shrink-0">🗑️</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {folders.length === 0 && reels.length === 0 && !loading && (
        <div className="text-center py-16 text-white/30">
          <div className="text-4xl mb-3">🎬</div>
          <p>Click &quot;Open folder&quot; to browse Maayan&apos;s reels in Drive.</p>
        </div>
      )}

      {/* Folders */}
      {folders.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
          {folders.map(f => (
            <button key={f.id} onClick={() => enterFolder(f)}
              className="flex items-center gap-2 bg-[#111118] border border-white/10 hover:border-orange-500/40 rounded-xl px-3 py-3 text-left transition-all">
              <span className="text-xl">📁</span>
              <span className="text-sm truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reels — just thumbnails; click to schedule */}
      {reels.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {reels.map(reel => {
            const queued = queuedIds.has(reel.id);
            return (
              <button key={reel.id}
                onClick={() => { setSelected(reel); setCaption(""); setWhen(""); }}
                className={`group relative rounded-xl overflow-hidden border text-left transition-all ${queued ? "border-orange-500/50" : "border-white/10 hover:border-orange-500/50"}`}>
                <div className="aspect-[9/16] bg-black/40 flex items-center justify-center">
                  {reel.thumbnailLink
                    ? <img src={reel.thumbnailLink} alt={reel.name} className="w-full h-full object-cover" />
                    : <span className="text-3xl">🎬</span>}
                </div>
                {queued && <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-orange-500 text-white">queued</span>}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-[11px] truncate">{reel.name}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Schedule panel (opens on reel click) */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={() => setSelected(null)}>
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-16 h-24 rounded-lg overflow-hidden bg-black/40 shrink-0 flex items-center justify-center">
                {selected.thumbnailLink ? <img src={selected.thumbnailLink} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">🎬</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selected.name}</p>
                <a href={`https://drive.google.com/file/d/${selected.id}/view`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-white/50 hover:text-white">▶ Preview in Drive ↗</a>
                <p className="text-xs text-white/30 mt-1">Posting to: <span className="text-white/60">{clients.find(c => (c.clientId || c.id) === account)?.name || "—"}</span></p>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white text-lg">✕</button>
            </div>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4} placeholder="Caption + hashtags…"
              className="w-full bg-[#0b0b10] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 resize-none mb-2" />
            <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
              className="w-full bg-[#0b0b10] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 mb-3" />
            <div className="flex gap-2">
              <button onClick={doSchedule}
                className="flex-1 px-3 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">📅 Schedule</button>
              <button onClick={doPostNow} disabled={postingId === selected.id}
                className="px-3 py-2.5 rounded-lg border border-green-500/40 bg-green-500/10 text-green-300 text-sm font-medium hover:bg-green-500/20 disabled:opacity-40">
                {postingId === selected.id ? "…" : "🚀 Post now"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
