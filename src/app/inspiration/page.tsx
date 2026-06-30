"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { getClients, ClientData, getClientColor } from "@/lib/clients";
import {
  InspirationItem, getInspiration, addInspirationLinks, extractReelUrls,
  setModeled, deleteInspiration, setInspirationCategory,
  getInspirationCategories, saveInspirationCategories,
} from "@/lib/inspiration";

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
    </div>
  );
}
