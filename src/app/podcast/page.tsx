"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { getClients, ClientData, getClientColor } from "@/lib/clients";
import { getTranscribeStatus, getPodcastTriage, formatTimestamp, TriageItem, PodcastTriage } from "@/lib/podcast";

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "episode";
}

export default function PodcastPage() {
  const { user, loading } = useAuth();
  const { data: session } = useSession();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [episodeId, setEpisodeId] = useState("");

  // Drive picker
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [videos, setVideos] = useState<{ id: string; name: string; size: string; thumbnailLink?: string; folder?: string }[]>([]);
  const [browseMsg, setBrowseMsg] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);

  const [transcribing, setTranscribing] = useState(false);
  const [transcribeMsg, setTranscribeMsg] = useState("");
  const [stage, setStage] = useState("");

  const [triaging, setTriaging] = useState(false);
  const [triage, setTriage] = useState<PodcastTriage | null>(null);
  const [triageMsg, setTriageMsg] = useState("");
  const [tab, setTab] = useState<"gold" | "keep" | "cut">("gold");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (user) getClients().then(data => {
      setClients(data);
      if (data.length && !selectedClient) setSelectedClient(data[0].clientId || data[0].id);
    });
  }, [user]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function browseDrive() {
    if (!session?.accessToken) { await signIn("google"); return; }
    setBrowsing(true); setBrowseMsg(""); setVideos([]);
    try {
      const res = await fetch("/api/drive-list-videos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: session.accessToken, query: query.trim() }),
      });
      const data = await res.json();
      if (data.videos) {
        setVideos(data.videos);
        if (data.videos.length === 0) setBrowseMsg("No videos found — try a folder name or part of the file name.");
      } else {
        setBrowseMsg(`⚠️ ${data.error || "Could not list Drive videos."}`);
      }
    } finally { setBrowsing(false); }
  }

  async function startTranscribe() {
    if (!picked || !selectedClient) return;
    if (!session?.accessToken) { await signIn("google"); return; }
    const eid = slugify(picked.name);
    setEpisodeId(eid);
    setTranscribing(true); setTranscribeMsg(""); setTriage(null); setStage("starting");

    const res = await fetch("/api/agent/transcribe-podcast", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: selectedClient, episodeId: eid, accessToken: session.accessToken,
        driveFileId: picked.id, episodeTitle: picked.name,
      }),
    });
    const data = await res.json();
    if (!data.started) {
      setTranscribing(false);
      setTranscribeMsg(`⚠️ ${data.error || "Could not start transcription."}`);
      return;
    }

    pollRef.current = setInterval(async () => {
      const st = await getTranscribeStatus(eid);
      if (!st) return;
      setStage(st.stage || "");
      if (st.chunksTotal) setTranscribeMsg(`Transcribing chunk ${st.chunksDone ?? 0}/${st.chunksTotal}…`);
      if (st.running === false) {
        if (pollRef.current) clearInterval(pollRef.current);
        setTranscribing(false);
        setTranscribeMsg(st.error ? `⚠️ ${st.error}` : "✅ Transcript ready.");
      }
    }, 4000);
  }

  async function runTriage() {
    if (!episodeId) return;
    setTriaging(true); setTriageMsg(""); setTriage(null);
    try {
      const res = await fetch("/api/agent/triage-podcast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      const data = await res.json();
      if (data.success) {
        setTriage({ gold: data.triage.gold || [], keep: data.triage.keep || [], cut: data.triage.cut || [] });
        setTab("gold");
      } else {
        setTriageMsg(`⚠️ ${data.error || data.detail || "Triage failed."}`);
      }
    } catch (e) {
      setTriageMsg(`⚠️ ${String(e)}`);
    } finally { setTriaging(false); }
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>;
  if (!user) return null;

  const currentClient = clients.find(c => (c.clientId || c.id) === selectedClient);
  const list: TriageItem[] = triage ? triage[tab] : [];

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-white">
      <Sidebar user={user} />
      <div className="flex-1">
        <div className="border-b border-white/5 px-4 md:px-8 py-5">
          <h1 className="text-2xl font-bold">🎙️ Podcast Engine</h1>
          <p className="text-white/40 text-sm">Watches the episode so you don't have to — flags the gold, skips the filler</p>
        </div>

        <div className="p-4 md:p-8 space-y-5 max-w-3xl">
          {/* Client selector */}
          <div className="flex gap-3 flex-wrap">
            {clients.map((client, index) => (
              <button key={client.id} onClick={() => setSelectedClient(client.clientId || client.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${selectedClient === (client.clientId || client.id) ? "border-orange-500/50 bg-orange-500/10" : "border-white/10 bg-[#111118] hover:border-white/20"}`}>
                {client.profilePhoto ? (
                  <img src={client.profilePhoto} alt={client.name} className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getClientColor(index)} flex items-center justify-center text-sm font-bold`}>{client.name?.[0] ?? "?"}</div>
                )}
                <span className="text-sm font-medium">{client.name}</span>
              </button>
            ))}
          </div>

          {/* Drive picker */}
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-4 space-y-3">
            <p className="text-sm font-medium">
              Episode for <span className="text-orange-400">{currentClient?.name}</span>
            </p>
            {!session?.accessToken && (
              <button onClick={() => signIn("google")} className="text-xs px-3 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30">
                🔑 Connect Google Drive first
              </button>
            )}
            <div className="flex items-center gap-2">
              <input value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") browseDrive(); }}
                placeholder="Folder name (e.g. podcast test) or part of the file name"
                className="flex-1 bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-purple-500/50" />
              <button onClick={browseDrive} disabled={browsing}
                className="px-4 py-2 rounded-lg bg-sky-500/80 text-white text-sm font-medium hover:bg-sky-500 disabled:opacity-40 shrink-0">
                {browsing ? "Loading…" : "📁 Browse Drive"}
              </button>
            </div>
            {browseMsg && <p className="text-sm text-white/50">{browseMsg}</p>}

            {/* Thumbnail grid */}
            {videos.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {videos.map(v => {
                  const on = picked?.id === v.id;
                  return (
                    <button key={v.id} onClick={() => setPicked({ id: v.id, name: v.name })}
                      className={`text-left rounded-xl border overflow-hidden transition-all ${on ? "border-purple-400 ring-2 ring-purple-500/40" : "border-white/10 hover:border-white/30"}`}>
                      <div className="aspect-video bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
                        {v.thumbnailLink ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.thumbnailLink} alt={v.name} referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <span className="text-2xl">🎙️</span>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-xs text-white/80 truncate" dir="auto">{v.name}</p>
                        <p className="text-[10px] text-white/30">{[v.folder, v.size].filter(Boolean).join(" · ")}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Transcribe the picked episode */}
            {picked && (
              <div className="flex items-center gap-3 border-t border-white/10 pt-3">
                <button onClick={startTranscribe} disabled={transcribing}
                  className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 disabled:opacity-40">
                  {transcribing ? "Transcribing…" : "🎧 Transcribe episode"}
                </button>
                <span className="text-xs text-white/50 truncate" dir="auto">{picked.name}</span>
              </div>
            )}
            {transcribing && <p className="text-xs text-white/40">{stage}</p>}
            {transcribeMsg && <p className="text-sm text-white/70">{transcribeMsg}</p>}
          </div>

          {/* Triage trigger */}
          {episodeId && !transcribing && !transcribeMsg.startsWith("⚠️") && (
            <div className="bg-[#111118] border border-white/10 rounded-2xl p-4 space-y-3">
              <button onClick={runTriage} disabled={triaging}
                className="px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-40">
                {triaging ? "Triaging…" : "🗺️ Build triage map"}
              </button>
              {triageMsg && <p className="text-sm text-white/70">{triageMsg}</p>}
            </div>
          )}

          {/* Triage map */}
          {triage && (
            <div className="bg-[#111118] border border-white/10 rounded-2xl p-4">
              <div className="flex gap-1 bg-[#0a0a0f] border border-white/10 rounded-lg p-1 text-xs w-fit mb-4">
                {([["gold", `🟢 Gold (${triage.gold.length})`], ["keep", `🟡 Keep (${triage.keep.length})`], ["cut", `🔴 Cut (${triage.cut.length})`]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setTab(v)}
                    className={`px-3 py-1.5 rounded-md transition-all ${tab === v ? "bg-purple-500 text-white" : "text-white/50 hover:text-white"}`}>{l}</button>
                ))}
              </div>
              <div className="space-y-2">
                {list.length === 0 ? (
                  <p className="text-white/30 text-sm">Nothing in this tier.</p>
                ) : list
                  .slice()
                  .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.start - b.start)
                  .map((item, i) => (
                  <div key={i} className="bg-[#0a0a0f] border border-white/10 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
                      {item.rank && <span className="text-purple-300 font-medium">#{item.rank}</span>}
                      <span>{formatTimestamp(item.start)} – {formatTimestamp(item.end)}</span>
                    </div>
                    <p className="text-sm text-white/80">{item.why}</p>
                    {item.quote && <p className="text-sm text-orange-200 mt-1" dir="rtl">"{item.quote}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
