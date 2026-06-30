"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { getClients, ClientData, getClientColor } from "@/lib/clients";
import {
  InspirationItem, getInspiration, addInspirationLinks, extractReelUrls,
  setModeled, deleteInspiration, setInspirationCategory,
} from "@/lib/inspiration";

export default function InspirationPage() {
  const { user, loading } = useAuth();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [paste, setPaste] = useState("");
  const [pasteSource, setPasteSource] = useState<"external" | "own">("external");
  const [pasteCategory, setPasteCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "todo" | "done">("todo");
  const [activeCat, setActiveCat] = useState<string>("__all__");

  async function load() {
    setItems(await getInspiration(selectedClient));
  }

  useEffect(() => {
    if (user) getClients().then(data => {
      setClients(data);
      // Deep-link: /inspiration?client=<id> opens straight to that client
      const wanted = new URLSearchParams(window.location.search).get("client");
      const match = wanted && data.find(c => (c.clientId || c.id) === wanted || c.id === wanted);
      if (match) setSelectedClient(match.clientId || match.id);
      else if (data.length && !selectedClient) setSelectedClient(data[0].clientId || data[0].id);
    });
  }, [user]);

  useEffect(() => { if (user && selectedClient) load(); }, [selectedClient, user]);

  async function handleAdd() {
    const urls = extractReelUrls(paste);
    if (urls.length === 0) { alert("No Instagram reel links found in that text."); return; }
    setAdding(true);
    try {
      const n = await addInspirationLinks(selectedClient, urls, pasteSource, pasteCategory);
      setPaste("");
      await load();
      alert(`✅ Added ${n} reels${n < urls.length ? ` (${urls.length - n} already saved)` : ""}.`);
    } finally { setAdding(false); }
  }

  async function toggle(item: InspirationItem) {
    if (!item.id) return;
    await setModeled(item.id, !item.modeled);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, modeled: !i.modeled } : i));
  }

  async function remove(item: InspirationItem) {
    if (!item.id || !confirm("Remove this reel?")) return;
    await deleteInspiration(item.id);
    setItems(prev => prev.filter(i => i.id !== item.id));
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>;
  if (!user) return null;

  const shown = items.filter(i => filter === "all" || (filter === "done" ? i.modeled : !i.modeled));
  const doneCount = items.filter(i => i.modeled).length;
  const currentClient = clients.find(c => (c.clientId || c.id) === selectedClient);

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-white">
      <Sidebar user={user} />
      <div className="flex-1">
        <div className="border-b border-white/5 px-4 md:px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">🔥 Inspiration Feed</h1>
            <p className="text-white/40 text-sm">Reels to model — your saved links per client</p>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-5">
          {/* Client selector */}
          <div className="flex gap-3 flex-wrap">
            {clients.map((client, index) => (
              <button
                key={client.id}
                onClick={() => setSelectedClient(client.clientId || client.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  selectedClient === (client.clientId || client.id) ? "border-orange-500/50 bg-orange-500/10" : "border-white/10 bg-[#111118] hover:border-white/20"
                }`}
              >
                {client.profilePhoto ? (
                  <img src={client.profilePhoto} alt={client.name} className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getClientColor(index)} flex items-center justify-center text-sm font-bold`}>{client.name?.[0] ?? "?"}</div>
                )}
                <span className="text-sm font-medium">{client.name}</span>
              </button>
            ))}
          </div>

          {/* Paste box */}
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-4">
            <p className="text-sm font-medium mb-2">Paste reel links for <span className="text-orange-400">{currentClient?.name}</span></p>
            <textarea
              value={paste}
              onChange={e => setPaste(e.target.value)}
              placeholder="Paste your Doc here — any Instagram reel links get picked up automatically…"
              className="w-full h-28 bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-orange-500/50 resize-none"
            />
            <div className="flex items-center justify-between mt-2 gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1 bg-[#0a0a0f] border border-white/10 rounded-lg p-1 text-xs">
                  {(["external", "own"] as const).map(s => (
                    <button key={s} onClick={() => setPasteSource(s)}
                      className={`px-3 py-1.5 rounded-md transition-all ${pasteSource === s ? "bg-orange-500 text-white" : "text-white/50 hover:text-white"}`}>
                      {s === "external" ? "🌐 Inspiration" : "⭐ Client's own"}
                    </button>
                  ))}
                </div>
                <input
                  list="insp-cats"
                  value={pasteCategory}
                  onChange={e => setPasteCategory(e.target.value)}
                  placeholder="📁 Category (e.g. talking hook)…"
                  className="bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-orange-500/50 w-48"
                />
                <datalist id="insp-cats">
                  {Array.from(new Set(items.map(i => i.category).filter(Boolean))).map(c => <option key={c} value={c!} />)}
                </datalist>
              </div>
              <button onClick={handleAdd} disabled={adding || !paste.trim()}
                className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-40">
                {adding ? "Adding…" : `Add ${extractReelUrls(paste).length || ""} reels${pasteCategory.trim() ? ` to "${pasteCategory.trim()}"` : ""}`}
              </button>
            </div>
          </div>

          {(() => {
            const allCats = Array.from(new Set(items.map(i => i.category || "").filter(Boolean))).sort();
            const hasUncat = items.some(i => !i.category);
            // Tabs: All · <each category> · Uncategorized
            const tabs = ["__all__", ...allCats, ...(hasUncat ? ["__uncat__"] : [])];
            const countFor = (t: string) => items.filter(i =>
              t === "__all__" ? true : t === "__uncat__" ? !i.category : (i.category || "") === t).length;
            const inTab = (i: InspirationItem) =>
              activeCat === "__all__" ? true : activeCat === "__uncat__" ? !i.category : (i.category || "") === activeCat;
            const list = shown.filter(inTab);
            return (
              <>
                {/* Category tabs (like the Doc's pages) */}
                <div className="flex items-center gap-1 flex-wrap border-b border-white/10 pb-2">
                  {tabs.map(t => (
                    <button key={t} onClick={() => setActiveCat(t)}
                      className={`px-3 py-1.5 rounded-t-lg text-sm transition-all ${activeCat === t ? "bg-orange-500/15 text-orange-300 border-b-2 border-orange-500" : "text-white/50 hover:text-white"}`}>
                      {t === "__all__" ? "📋 All" : t === "__uncat__" ? "Uncategorized" : `📁 ${t}`}
                      <span className="text-xs text-white/30 ml-1.5">{countFor(t)}</span>
                    </button>
                  ))}
                </div>

                {/* Modeled filter */}
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 bg-[#111118] border border-white/10 rounded-lg p-1 text-xs">
                    {([["todo", "To model"], ["done", `Modeled (${doneCount})`], ["all", "All"]] as const).map(([v, l]) => (
                      <button key={v} onClick={() => setFilter(v)}
                        className={`px-3 py-1.5 rounded-md transition-all ${filter === v ? "bg-orange-500 text-white" : "text-white/50 hover:text-white"}`}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* List for the active tab */}
                {list.length === 0 ? (
                  <div className="text-center py-16 text-white/30">
                    <div className="text-4xl mb-3">🔥</div>
                    <p>{items.length === 0 ? "No reels saved yet — paste some links above" : "Nothing in this tab for this filter"}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {list.map(item => (
                      <div key={item.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${item.modeled ? "border-green-500/30 bg-green-500/5" : "border-white/10 bg-[#111118]"}`}>
                        <button onClick={() => toggle(item)} title={item.modeled ? "Mark as not modeled" : "Mark as modeled"}
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0 ${item.modeled ? "bg-green-500 text-white" : "border border-white/20 text-white/40 hover:border-white/40"}`}>
                          {item.modeled ? "✓" : ""}
                        </button>
                        <span className="text-[10px] shrink-0">{item.source === "own" ? "⭐" : "🌐"}</span>
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          className={`text-sm truncate flex-1 hover:underline ${item.modeled ? "text-green-300/70 line-through" : "text-sky-300"}`}>
                          {item.url.replace("https://www.instagram.com/", "")}
                        </a>
                        <select
                          value={item.category || ""}
                          onChange={async e => { if (item.id) { await setInspirationCategory(item.id, e.target.value); load(); } }}
                          className="bg-[#0a0a0f] border border-white/10 rounded px-1.5 py-1 text-[11px] text-white/60 outline-none focus:border-orange-500/40 shrink-0 max-w-[120px]"
                        >
                          <option value="">— move —</option>
                          {allCats.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={() => remove(item)} className="text-white/20 hover:text-red-400 text-sm shrink-0">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
