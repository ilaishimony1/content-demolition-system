"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { getClients, ClientData, getClientColor } from "@/lib/clients";
import { getClipsByClient, Clip } from "@/lib/clips";
import {
  InspirationItem, getInspiration, addInspirationLinks, extractReelUrls,
  setModeled, deleteInspiration, setInspirationCategory,
  getInspirationCategories, saveInspirationCategories,
} from "@/lib/inspiration";

interface Recipe {
  clips?: number; pacing?: string; music?: string; captions?: string;
  structure?: string[]; librarySearch?: string;
}

export default function InspirationPage() {
  const { user, loading } = useAuth();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<string>("__all__");
  const [paste, setPaste] = useState("");
  const [pasteSource, setPasteSource] = useState<"external" | "own">("external");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "todo" | "done">("todo");

  // Reel Planner ("Model this") state
  const [modelItem, setModelItem] = useState<InspirationItem | null>(null);
  const [desc, setDesc] = useState("");
  const [planning, setPlanning] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [matched, setMatched] = useState<Clip[]>([]);

  function openPlanner(item: InspirationItem) {
    setModelItem(item); setDesc(""); setRecipe(null); setMatched([]);
  }

  async function runPlanner() {
    if (!desc.trim()) return;
    setPlanning(true); setRecipe(null); setMatched([]);
    try {
      const res = await fetch("/api/agent/model-reel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc, clientName: currentClient?.name }),
      });
      const { recipe: r } = await res.json();
      setRecipe(r || {});
      // Match the client's tagged library against the recipe's search query.
      const clips = await getClipsByClient(selectedClient);
      const analysed = clips.filter(c => (c.aiTags && c.aiTags.length) || c.aiTopic);
      if (r?.librarySearch && analysed.length) {
        const catalogue = analysed.map(c => ({ id: c.id, name: c.name, tags: c.aiTags, topic: c.aiTopic }));
        const mres = await fetch("/api/agent/find-clips", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: r.librarySearch, clips: catalogue }),
        });
        const { ids } = await mres.json();
        const idset = new Set((ids || []).map(String));
        setMatched(analysed.filter(c => idset.has(String(c.id))));
      }
    } finally { setPlanning(false); }
  }

  async function load() {
    const [its, cats] = await Promise.all([getInspiration(selectedClient), getInspirationCategories(selectedClient)]);
    setItems(its);
    // categories = stored ones ∪ any found on items
    const fromItems = its.map(i => i.category || "").filter(Boolean);
    setCategories(Array.from(new Set([...cats, ...fromItems])));
  }

  useEffect(() => {
    if (user) getClients().then(data => {
      setClients(data);
      const wanted = new URLSearchParams(window.location.search).get("client");
      const match = wanted && data.find(c => (c.clientId || c.id) === wanted || c.id === wanted);
      if (match) setSelectedClient(match.clientId || match.id);
      else if (data.length && !selectedClient) setSelectedClient(data[0].clientId || data[0].id);
    });
  }, [user]);

  useEffect(() => { if (user && selectedClient) { setActiveCat("__all__"); load(); } }, [selectedClient, user]);

  async function newCategory() {
    const name = prompt("New folder name (e.g. talking hook, מידולים חדשים):")?.trim();
    if (!name) return;
    if (categories.includes(name)) { setActiveCat(name); return; }
    const next = [...categories, name];
    setCategories(next);
    await saveInspirationCategories(selectedClient, next);
    setActiveCat(name);
  }

  async function renameCategory(oldName: string) {
    const name = prompt("Rename folder:", oldName)?.trim();
    if (!name || name === oldName) return;
    const next = categories.map(c => c === oldName ? name : c);
    setCategories(next);
    await saveInspirationCategories(selectedClient, next);
    // move items in the old category to the new name
    for (const it of items.filter(i => (i.category || "") === oldName)) {
      if (it.id) await setInspirationCategory(it.id, name);
    }
    if (activeCat === oldName) setActiveCat(name);
    load();
  }

  async function deleteCategory(name: string) {
    if (items.some(i => (i.category || "") === name)) { alert("Folder isn't empty — move or remove its reels first."); return; }
    if (!confirm(`Delete empty folder "${name}"?`)) return;
    const next = categories.filter(c => c !== name);
    setCategories(next);
    await saveInspirationCategories(selectedClient, next);
    if (activeCat === name) setActiveCat("__all__");
  }

  async function handleAdd() {
    const urls = extractReelUrls(paste);
    if (urls.length === 0) { alert("No Instagram reel links found in that text."); return; }
    const targetCat = (activeCat === "__all__" || activeCat === "__uncat__") ? "" : activeCat;
    setAdding(true);
    try {
      const n = await addInspirationLinks(selectedClient, urls, pasteSource, targetCat);
      setPaste("");
      await load();
      alert(`✅ Added ${n} reels${targetCat ? ` to "${targetCat}"` : ""}${n < urls.length ? ` (${urls.length - n} already saved)` : ""}.`);
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

  const currentClient = clients.find(c => (c.clientId || c.id) === selectedClient);
  const sortedCats = [...categories].sort();
  const hasUncat = items.some(i => !i.category);
  const tabs = ["__all__", ...sortedCats, ...(hasUncat ? ["__uncat__"] : [])];
  const countFor = (t: string) => items.filter(i =>
    t === "__all__" ? true : t === "__uncat__" ? !i.category : (i.category || "") === t).length;
  const inActiveTab = (i: InspirationItem) =>
    activeCat === "__all__" ? true : activeCat === "__uncat__" ? !i.category : (i.category || "") === activeCat;
  const doneCount = items.filter(i => i.modeled).length;
  const shown = items
    .filter(inActiveTab)
    .filter(i => filter === "all" || (filter === "done" ? i.modeled : !i.modeled));
  const isRealTab = activeCat !== "__all__" && activeCat !== "__uncat__";

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-white">
      <Sidebar user={user} />
      <div className="flex-1">
        <div className="border-b border-white/5 px-4 md:px-8 py-5">
          <h1 className="text-2xl font-bold">🔥 Inspiration Feed</h1>
          <p className="text-white/40 text-sm">Reels to model — folders per client, like your Doc</p>
        </div>

        <div className="p-4 md:p-8 space-y-5">
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

          {/* Folder tabs + New folder */}
          <div className="flex items-center gap-1 flex-wrap border-b border-white/10 pb-2">
            {tabs.map(t => (
              <button key={t} onClick={() => setActiveCat(t)}
                className={`group/tab px-3 py-1.5 rounded-t-lg text-sm transition-all flex items-center gap-1.5 ${activeCat === t ? "bg-orange-500/15 text-orange-300 border-b-2 border-orange-500" : "text-white/50 hover:text-white"}`}>
                <span>{t === "__all__" ? "📋 All" : t === "__uncat__" ? "Uncategorized" : `📁 ${t}`}</span>
                <span className="text-xs text-white/30">{countFor(t)}</span>
                {t !== "__all__" && t !== "__uncat__" && activeCat === t && (
                  <>
                    <span onClick={(e) => { e.stopPropagation(); renameCategory(t); }} className="text-white/30 hover:text-white text-xs">✏️</span>
                    <span onClick={(e) => { e.stopPropagation(); deleteCategory(t); }} className="text-white/30 hover:text-red-400 text-xs">🗑️</span>
                  </>
                )}
              </button>
            ))}
            <button onClick={newCategory} className="px-3 py-1.5 rounded-lg text-sm text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 ml-1">
              + New folder
            </button>
          </div>

          {/* Paste box — into the active folder */}
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-4">
            <p className="text-sm font-medium mb-2">
              Paste reel links into{" "}
              <span className="text-orange-400">{isRealTab ? `📁 ${activeCat}` : "Uncategorized"}</span>
              <span className="text-white/40"> · {currentClient?.name}</span>
            </p>
            <textarea value={paste} onChange={e => setPaste(e.target.value)}
              placeholder="Paste links (or your whole Doc) — Instagram reel links get picked up automatically…"
              className="w-full h-24 bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-orange-500/50 resize-none" />
            <div className="flex items-center justify-between mt-2 gap-3 flex-wrap">
              <div className="flex gap-1 bg-[#0a0a0f] border border-white/10 rounded-lg p-1 text-xs">
                {(["external", "own"] as const).map(s => (
                  <button key={s} onClick={() => setPasteSource(s)}
                    className={`px-3 py-1.5 rounded-md transition-all ${pasteSource === s ? "bg-orange-500 text-white" : "text-white/50 hover:text-white"}`}>
                    {s === "external" ? "🌐 Inspiration" : "⭐ Client's own"}
                  </button>
                ))}
              </div>
              <button onClick={handleAdd} disabled={adding || !paste.trim()}
                className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-40">
                {adding ? "Adding…" : `Add ${extractReelUrls(paste).length || ""} reels`}
              </button>
            </div>
          </div>

          {/* Modeled filter */}
          <div className="flex gap-1 bg-[#111118] border border-white/10 rounded-lg p-1 text-xs w-fit">
            {([["todo", "To model"], ["done", `Modeled (${doneCount})`], ["all", "All"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`px-3 py-1.5 rounded-md transition-all ${filter === v ? "bg-orange-500 text-white" : "text-white/50 hover:text-white"}`}>{l}</button>
            ))}
          </div>

          {/* Reels in the active folder */}
          {shown.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <div className="text-4xl mb-3">🔥</div>
              <p>{countFor(activeCat) === 0 ? "This folder is empty — paste links above" : "Nothing here for this filter"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map(item => (
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
                  <button onClick={() => openPlanner(item)} title="Model this reel"
                    className="text-xs shrink-0 px-2 py-1 rounded-md bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 border border-purple-500/30">
                    🎬 Model
                  </button>
                  <select value={item.category || ""}
                    onChange={async e => { if (item.id) { await setInspirationCategory(item.id, e.target.value); load(); } }}
                    className="bg-[#0a0a0f] border border-white/10 rounded px-1.5 py-1 text-[11px] text-white/60 outline-none focus:border-orange-500/40 shrink-0 max-w-[130px]">
                    <option value="">— move to —</option>
                    {sortedCats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={() => remove(item)} className="text-white/20 hover:text-red-400 text-sm shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reel Planner modal */}
      {modelItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setModelItem(null)}>
          <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">🎬 Model this reel</h2>
              <button onClick={() => setModelItem(null)} className="text-white/40 hover:text-white text-xl">✕</button>
            </div>
            <a href={modelItem.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-300 hover:underline break-all">
              {modelItem.url}
            </a>

            <p className="text-sm text-white/60 mt-4 mb-1">Describe the reel in a sentence — structure, pacing, captions, music.</p>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="e.g. 5 fast b-roll clips of training, hard cuts on the beat, bold caption every 2s, hype trap music"
              className="w-full h-20 bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-purple-500/50 resize-none" />
            <button onClick={runPlanner} disabled={planning || !desc.trim()}
              className="mt-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 disabled:opacity-40">
              {planning ? "Planning…" : "✨ Build recipe + find clips"}
            </button>

            {recipe && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-[#0a0a0f] border border-white/10 rounded-lg p-3"><span className="text-white/40 text-xs">Clips</span><div>{recipe.clips ?? "—"}</div></div>
                  <div className="bg-[#0a0a0f] border border-white/10 rounded-lg p-3"><span className="text-white/40 text-xs">Pacing</span><div>{recipe.pacing || "—"}</div></div>
                  <div className="bg-[#0a0a0f] border border-white/10 rounded-lg p-3"><span className="text-white/40 text-xs">Music</span><div>{recipe.music || "—"}</div></div>
                  <div className="bg-[#0a0a0f] border border-white/10 rounded-lg p-3"><span className="text-white/40 text-xs">Captions</span><div>{recipe.captions || "—"}</div></div>
                </div>
                {recipe.structure && recipe.structure.length > 0 && (
                  <div>
                    <p className="text-white/40 text-xs mb-1">Structure</p>
                    <ol className="list-decimal list-inside text-sm text-white/80 space-y-1">
                      {recipe.structure.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                )}
                <div>
                  <p className="text-white/40 text-xs mb-2">
                    Matched clips from {currentClient?.name}&apos;s library {matched.length > 0 && `(${matched.length})`}
                  </p>
                  {matched.length === 0 ? (
                    <p className="text-sm text-white/30">No matching clips found in the library yet — scan more footage or refine the description.</p>
                  ) : (
                    <div className="space-y-1">
                      {matched.map(c => (
                        <div key={c.id} className="flex items-center gap-2 bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-sm">
                          <span className="shrink-0">🎞️</span>
                          <span className="truncate flex-1">{c.name}</span>
                          <span className="text-white/30 text-xs truncate max-w-[45%]">{(c.aiTags || []).slice(0, 3).join(", ")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
