"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { saveClip, upsertClipsByDriveId, getClipsByClient, saveDriveFolders, getDriveFolders, applyOrganization, moveFolderClips, Clip } from "@/lib/clips";
import { updateAgentMemory, logAgentEvent } from "@/lib/agentMemory";
import { getTaxonomy, saveTaxonomy, buildDefaultTaxonomy, ClientTaxonomy } from "@/lib/taxonomy";
import { buildAutoSort, AutoSortResult } from "@/lib/sorter";
import { getFolderRules, setFolderRule, protectionForPath, FolderProtection } from "@/lib/folderRules";
import { getFolderKeywords, setFolderKeywords, FolderKeywords } from "@/lib/folderKeywords";
import { clearOrganization } from "@/lib/clips";
import { getClients, ClientData, getClientColor } from "@/lib/clients";
import { signIn, useSession } from "next-auth/react";

const folders = ["all", "raw", "edited", "approved"];

const tagColors: Record<string, string> = {
  "high-energy": "bg-red-500/20 text-red-400",
  "low-energy": "bg-blue-500/20 text-blue-400",
  "medium-energy": "bg-yellow-500/20 text-yellow-400",
  "outdoor": "bg-green-500/20 text-green-400",
  "indoor": "bg-purple-500/20 text-purple-400",
};

export default function LibraryPage() {
  const { user, loading } = useAuth();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [selectedDriveFolder, setSelectedDriveFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [libraryView, setLibraryView] = useState<"drive" | "ai">("drive");
  const [selectedAiCategory, setSelectedAiCategory] = useState<string | null>(null);
  const [taxonomy, setTaxonomy] = useState<ClientTaxonomy | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkNewFolder, setBulkNewFolder] = useState(false);
  const [movingBulk, setMovingBulk] = useState(false);
  const [storedFolders, setStoredFolders] = useState<string[]>([]);
  const [folderRules, setFolderRules] = useState<Record<string, FolderProtection>>({});
  const [rulesMenuFor, setRulesMenuFor] = useState<string | null>(null);
  const [manageFolder, setManageFolder] = useState<string | null>(null);
  const [folderOpTarget, setFolderOpTarget] = useState("");
  const [folderOpBusy, setFolderOpBusy] = useState(false);
  const [folderKeywords, setFolderKeywordsState] = useState<FolderKeywords>({});
  const [autoSortResult, setAutoSortResult] = useState<AutoSortResult | null>(null);
  const [autoSortBatch, setAutoSortBatch] = useState<string[]>([]);
  const [autoSortBusy, setAutoSortBusy] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiScanStatus, setAiScanStatus] = useState("");
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();

  useEffect(() => {
    if (user) {
      getClients().then(data => {
        setClients(data);
        if (data.length > 0 && !selectedClient) setSelectedClient(data[0].clientId || data[0].id);
      });
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedClient) {
      setTimeout(() => setSelectedDriveFolder(null), 0);
      loadClips();
      loadAllCounts();
      loadTaxonomy();
      getDriveFolders(selectedClient).then(setStoredFolders);
      getFolderRules(selectedClient).then(setFolderRules);
      getFolderKeywords(selectedClient).then(setFolderKeywordsState);
    }
  }, [selectedClient, user]);

  async function changeFolderRule(folder: string, level: FolderProtection) {
    const next = await setFolderRule(selectedClient, folder, level);
    setFolderRules(next);
    setRulesMenuFor(null);
  }

  async function deleteEmptyFolder(folder: string) {
    setFolderOpBusy(true);
    try {
      const next = storedFolders.filter(f => f !== folder && !f.startsWith(folder + "/"));
      await saveDriveFolders(selectedClient, next);
      setStoredFolders(next);
      setManageFolder(null);
    } catch (err) {
      alert("Delete failed: " + String(err));
    } finally {
      setFolderOpBusy(false);
    }
  }

  async function saveKeywords(folder: string, raw: string) {
    // Split on commas, spaces or newlines — each word is its own keyword, so it
    // matches single-word AI tags (#bicycle, #cycling).
    const kws = raw.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const next = await setFolderKeywords(selectedClient, folder, kws);
    setFolderKeywordsState(next);
  }

  async function runAutoSort() {
    if (autoSortBusy) return;
    if (Object.keys(folderKeywords).length === 0) {
      alert("Add keywords to at least one folder first (folder ⋯ → Keywords). e.g. teach ריצה = running, jog.");
      return;
    }
    setAutoSortBusy(true);
    try {
      const result = buildAutoSort(clips, folderKeywords, folderRules);
      if (result.moves.length === 0) {
        alert(`No confident matches found.\n\n${result.skippedAmbiguous} were ambiguous, ${result.skippedNoMatch} had no match — all left for you.`);
        setAutoSortBusy(false);
        return;
      }
      await applyOrganization(result.moves.map(m => ({ clipId: m.clipId, organizedPath: m.folder })));
      setAutoSortBatch(result.moves.map(m => m.clipId));
      setAutoSortResult(result);
      await loadClips();
    } catch (err) {
      alert("Auto-sort failed: " + String(err));
    } finally {
      setAutoSortBusy(false);
    }
  }

  async function undoAutoSort() {
    if (autoSortBatch.length === 0) return;
    setAutoSortBusy(true);
    try {
      await clearOrganization(autoSortBatch);
      await loadClips();
      setAutoSortResult(null);
      setAutoSortBatch([]);
    } catch (err) {
      alert("Undo failed: " + String(err));
    } finally {
      setAutoSortBusy(false);
    }
  }

  async function runFolderOp(oldPath: string, newPath: string, label: string) {
    if (!newPath || folderOpBusy) return;
    setFolderOpBusy(true);
    try {
      const n = await moveFolderClips(selectedClient, oldPath, newPath);
      await loadClips();
      setManageFolder(null);
      setFolderOpTarget("");
      if (selectedDriveFolder === oldPath) setSelectedDriveFolder(newPath);
      alert(`✅ ${label}: ${n} clips → ${newPath}`);
    } catch (err) {
      alert("Folder op failed: " + String(err));
    } finally {
      setFolderOpBusy(false);
    }
  }

  async function loadTaxonomy() {
    const existing = await getTaxonomy(selectedClient);
    setTaxonomy(existing);
  }

  async function loadClips() {
    const data = await getClipsByClient(selectedClient);
    setClips(data);
  }

  async function loadAllCounts() {
    const counts: Record<string, number> = {};
    for (const client of clients) {
      const data = await getClipsByClient(client.clientId || client.id);
      counts[client.id] = data.length;
    }
    setClientCounts(counts);
  }

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Uploading ${i + 1}/${files.length}: ${file.name}`);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", selectedClient);
      formData.append("folder", selectedFolder === "all" ? "raw" : selectedFolder);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();

        if (data.success) {
          await saveClip({
            clientId: selectedClient,
            name: file.name,
            videoId: data.videoId,
            bunnyUrl: data.bunnyUrl,
            thumbnailUrl: data.thumbnailUrl,
            folder: selectedFolder === "all" ? "raw" : selectedFolder as "raw" | "edited" | "approved",
            tags: [],
            size: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
          });
        }
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }

    setUploading(false);
    setUploadProgress("");
    loadClips();
  }

  async function handleDriveSync() {
    if (!session?.accessToken) {
      await signIn("google");
      return;
    }
    if (!driveFolderId) return;

    // Accept a full Drive URL or a bare folder ID
    const folderMatch = driveFolderId.match(/folders\/([a-zA-Z0-9_-]+)/);
    const cleanFolderId = (folderMatch ? folderMatch[1] : driveFolderId).trim();

    setSyncing(true);
    setShowDriveModal(false);
    setUploadProgress("Scanning Google Drive folders...");

    try {
      const res = await fetch("/api/drive-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: session.accessToken,
          folderId: cleanFolderId,
          clientId: selectedClient,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setUploadProgress(`Syncing ${data.count} clips (matching existing)...`);
        // Upsert by Drive file ID — no duplicates, AI tags preserved
        const result = await upsertClipsByDriveId(selectedClient, data.clips);
        // Persist the full folder structure (incl. empty folders like בלאגן)
        if (data.folders) {
          await saveDriveFolders(selectedClient, data.folders);
          setStoredFolders(data.folders);
        }
        await loadClips();
        setUploadProgress("");
        alert(`✅ Synced from Google Drive!\n\n${result.added} new · ${result.updated} re-folded · ${result.unchanged} unchanged`);
      } else {
        const msg = data.error || "Unknown error";
        // Expired/invalid Google token → force a fresh login to get new tokens
        if (/invalid authentication|access token|unauthorized|401|credential/i.test(msg)) {
          alert("Your Google connection expired. Reconnecting — please approve access, then click Import from Drive again.");
          await signIn("google");
          return;
        }
        alert("Sync failed: " + msg);
      }
    } catch (err) {
      console.error("Sync error:", err);
      alert("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
      setUploadProgress("");
    }
  }

  // Ensure taxonomy exists (auto-create from current AI labels if needed)
  function ensureTaxonomy(aiLabels: string[]): ClientTaxonomy {
    if (taxonomy) return taxonomy;
    return buildDefaultTaxonomy(selectedClient, aiLabels);
  }

  async function renameCat(catId: string, newName: string) {
    const aiLabels = analysedClips.map(c => c.aiContentType).filter(Boolean) as string[];
    const tax = ensureTaxonomy([...new Set(aiLabels)]);
    const updated: ClientTaxonomy = {
      ...tax,
      categories: tax.categories.map(c =>
        c.id === catId ? { ...c, name: newName } : c
      ),
    };
    // If this category didn't exist yet, add it
    if (!updated.categories.find(c => c.id === catId)) {
      updated.categories.push({ id: catId, name: newName, emoji: "📹", subcategories: [] });
    }
    await saveTaxonomy(updated);
    setTaxonomy(updated);
    setEditingCatId(null);
  }

  async function addSubcategory(catId: string, subName: string) {
    if (!subName.trim()) return;
    const aiLabels = analysedClips.map(c => c.aiContentType).filter(Boolean) as string[];
    const tax = ensureTaxonomy([...new Set(aiLabels)]);
    const subId = `${catId}-${subName.toLowerCase().replace(/\s+/g, "-")}`;
    const updated: ClientTaxonomy = {
      ...tax,
      categories: tax.categories.map(c =>
        c.id === catId
          ? { ...c, subcategories: [...c.subcategories, { id: subId, name: subName, keywords: [] }] }
          : c
      ),
    };
    await saveTaxonomy(updated);
    setTaxonomy(updated);
    setAddingSubTo(null);
    setNewSubName("");
  }

  async function removeSubcategory(catId: string, subId: string) {
    if (!taxonomy) return;
    const updated: ClientTaxonomy = {
      ...taxonomy,
      categories: taxonomy.categories.map(c =>
        c.id === catId
          ? { ...c, subcategories: c.subcategories.filter(s => s.id !== subId) }
          : c
      ),
    };
    await saveTaxonomy(updated);
    setTaxonomy(updated);
  }


  function toggleClipSelected(id: string) {
    setSelectedClipIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function moveSelectedTo(folderPath: string) {
    if (!folderPath || selectedClipIds.size === 0 || movingBulk) return;
    setMovingBulk(true);
    try {
      const placements = Array.from(selectedClipIds).map(clipId => ({ clipId, organizedPath: folderPath }));
      await applyOrganization(placements);
      await loadClips();
      const n = placements.length;
      setSelectedClipIds(new Set());
      setBulkTarget("");
      alert(`✅ Moved ${n} clips to ${folderPath} (in app).`);
    } catch (err) {
      alert("Move failed: " + String(err));
    } finally {
      setMovingBulk(false);
    }
  }

  async function handleAIScan() {
    if (!selectedClient || aiScanning) return;

    // Auto-prompt Google sign-in if no token
    if (!session?.accessToken) {
      setAiScanStatus("🔑 Connecting to Google Drive...");
      await signIn("google");
      return;
    }

    setAiScanning(true);
    setAiScanStatus("Starting AI scan...");

    // How many analysed in the target scope right now (baseline for progress)
    const inScope = (c: Clip) => {
      const p = (c as Clip & { path?: string }).path || "";
      return !selectedDriveFolder || p === selectedDriveFolder || p.startsWith(selectedDriveFolder + "/");
    };
    const baseline = clips.filter(c => c.aiAnalysedAt && inScope(c)).length;

    try {
      const res = await fetch("/api/agent/scan-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient,
          accessToken: session?.accessToken,
          taxonomy,
          protectedFolders: Object.keys(folderRules),
          folderFilter: selectedDriveFolder || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setAiScanStatus("❌ Error: " + data.error);
        setAiScanning(false);
        return;
      }

      const toScan: number = data.to_scan ?? 0;
      if (toScan === 0) {
        setAiScanStatus("✅ Nothing new to scan in this scope.");
        setAiScanning(false);
        setTimeout(() => setAiScanStatus(""), 5000);
        return;
      }

      // The worker scans in the background — poll Firestore to watch tags appear.
      setAiScanStatus(`🤖 Scanning ${toScan} clips in the background… tags appear as they finish.`);
      let polls = 0;
      const maxPolls = Math.ceil((toScan * 20) / 12) + 8; // generous: ~12s/clip
      const poll = setInterval(async () => {
        polls++;
        const fresh = await getClipsByClient(selectedClient);
        setClips(fresh);
        const done = fresh.filter(c => c.aiAnalysedAt && inScope(c)).length - baseline;
        setAiScanStatus(`🤖 Scanned ${Math.max(0, done)} / ${toScan}…`);
        if (done >= toScan || polls >= maxPolls) {
          clearInterval(poll);
          setAiScanning(false);
          setAiScanStatus(`✅ Scan finished — ${Math.max(0, done)} clips tagged.`);
          await updateAgentMemory(selectedClient, { lastScanAt: new Date().toISOString() });
          await logAgentEvent(selectedClient, { agent: "drive-scanner", type: "scan-complete", payload: { scanned: done } });
          setTimeout(() => setAiScanStatus(""), 8000);
        }
      }, 12000);
    } catch (err) {
      setAiScanStatus("Scan failed: " + String(err));
      setAiScanning(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>;
  if (!user) return null;

  // Extract unique Drive folders from clips
  // Build the full folder tree — include every ancestor path so parent folders
  // always show even when they only contain subfolders (not loose clips).
  const driveFolders = (() => {
    const all = new Set<string>();
    const addWithAncestors = (path: string) => {
      if (!path) return;
      const parts = path.split("/");
      for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/"));
    };
    // Folders that contain clips — use effective (organized) path so moved clips
    // relocate to their new folder
    for (const c of clips) addWithAncestors(c.organizedPath || (c as Clip & { path?: string }).path || "");
    // Plus every folder from the last Drive scan — including empty ones (בלאגן, etc.)
    for (const f of storedFolders) addWithAncestors(f);
    return Array.from(all).sort();
  })();

  // AI categories = analysed clips NOT yet filed into a folder (the sorting pile).
  // Once a clip is moved to a folder (organizedPath set) it leaves the AI Library.
  const analysedClips = clips.filter(c => c.aiAnalysedAt && !c.organizedPath);

  // Target folders an operator can move clips into — EVERY folder that exists:
  // the full effective tree (incl. folders created by moves) + taxonomy folders.
  const moveTargets: string[] = (() => {
    const set = new Set<string>(driveFolders);
    for (const cat of (taxonomy?.categories || [])) {
      set.add(cat.name);
      for (const sub of cat.subcategories) set.add(`${cat.name}/${sub.name}`);
    }
    return Array.from(set).sort();
  })();

  // Unanalysed clips the agent will actually scan — excludes protected folders
  const managedUnanalysed = clips.filter(
    c => !c.aiAnalysedAt && protectionForPath((c as Clip & { path?: string }).path || "", folderRules) === "managed"
  ).length;
  const protectedUnanalysed = clips.filter(c => !c.aiAnalysedAt).length - managedUnanalysed;
  const aiCategories = [
    { id: "all", label: "All analysed", emoji: "🤖", count: analysedClips.length },
    ...Array.from(new Set(analysedClips.map(c => c.aiContentType).filter(Boolean))).map(ct => ({
      id: `type:${ct}`, label: ct!, emoji: ct === "talking-head" ? "🗣️" : ct === "b-roll" ? "🎬" : ct === "transition" ? "⚡" : "📹",
      count: analysedClips.filter(c => c.aiContentType === ct).length,
    })),
    { id: "face:yes", label: "Has face", emoji: "👤", count: analysedClips.filter(c => c.aiHasFace === "yes" || c.aiHasFace === "True").length },
    { id: "energy:high", label: "High energy", emoji: "🔥", count: analysedClips.filter(c => c.aiEnergyLevel === "high").length },
    { id: "energy:low", label: "Calm / low energy", emoji: "🌊", count: analysedClips.filter(c => c.aiEnergyLevel === "low").length },
    { id: "score:top", label: "Top rated (8+)", emoji: "★", count: analysedClips.filter(c => parseFloat(c.aiUsabilityScore || "0") >= 8).length },
  ].filter(cat => cat.count > 0);

  const filteredClips = clips.filter((clip) => {
    const matchesWorkflow = selectedFolder === "all" || clip.folder === selectedFolder;
    // Effective location = where it's organized to (if moved), else its real Drive path
    const clipPath = clip.organizedPath || (clip as Clip & { path?: string }).path || "";
    // Selecting a folder shows clips DIRECTLY in it (not its subfolders) — so as you
    // sort a clip into a subfolder, it leaves this view.
    const matchesDriveFolder = !selectedDriveFolder || clipPath === selectedDriveFolder;
    const q = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === "" ||
      clip.name.toLowerCase().includes(q) ||
      clip.tags.some(tag => tag.toLowerCase().includes(q)) ||
      (clip.aiTags || []).some(tag => tag.toLowerCase().includes(q)) ||
      (clip.aiContentType || "").toLowerCase().includes(q) ||
      (clip.aiTopic || "").toLowerCase().includes(q);

    if (libraryView === "ai") {
      if (!clip.aiAnalysedAt) return false;
      if (clip.organizedPath) return false; // filed into a folder → leaves the AI sorting pile
      if (!selectedAiCategory || selectedAiCategory === "all") return matchesSearch;
      if (selectedAiCategory.startsWith("type:")) return clip.aiContentType === selectedAiCategory.slice(5) && matchesSearch;
      if (selectedAiCategory === "face:yes") return (clip.aiHasFace === "yes" || clip.aiHasFace === "True") && matchesSearch;
      if (selectedAiCategory === "energy:high") return clip.aiEnergyLevel === "high" && matchesSearch;
      if (selectedAiCategory === "energy:low") return clip.aiEnergyLevel === "low" && matchesSearch;
      if (selectedAiCategory === "score:top") return parseFloat(clip.aiUsabilityScore || "0") >= 8 && matchesSearch;
      // Subcategory filter — match by keyword hints in clip topic/notes
      if (selectedAiCategory.startsWith("sub:")) {
        const subId = selectedAiCategory.slice(4);
        const allSubs = taxonomy?.categories.flatMap(c => c.subcategories) || [];
        const sub = allSubs.find(s => s.id === subId);
        if (!sub) return matchesSearch;
        const clipText = `${clip.aiTopic || ""} ${clip.aiNotes || ""} ${clip.aiContentType || ""}`.toLowerCase();
        return sub.keywords.some(kw => clipText.includes(kw.toLowerCase())) || clipText.includes(sub.name.toLowerCase()) && matchesSearch;
      }
      return matchesSearch;
    }

    return matchesWorkflow && matchesDriveFolder && matchesSearch;
  });

  const currentClient = clients.find(c => (c.clientId || c.id) === selectedClient);

  const folderCounts = {
    all: clips.length,
    raw: clips.filter(c => c.folder === "raw").length,
    edited: clips.filter(c => c.folder === "edited").length,
    approved: clips.filter(c => c.folder === "approved").length,
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <Sidebar user={user} />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/10 px-4 md:px-8 py-4 flex items-center justify-between mt-12 md:mt-0">
          <div>
            <h1 className="text-xl font-bold">B-Roll Library</h1>
            <p className="text-xs text-white/40">Manage and search footage per client</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 transition-colors text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <span>+</span> Upload Clips
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        <div className="p-4 md:p-8 space-y-4 md:space-y-6">
          {/* Client Selector */}
          <div className="flex gap-3 flex-wrap">
            {clients.map((client, index) => (
              <button
                key={client.id}
                onClick={() => setSelectedClient(client.clientId || client.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  selectedClient === (client.clientId || client.id)
                    ? "border-orange-500/50 bg-orange-500/10"
                    : "border-white/10 bg-[#111118] hover:border-white/20"
                }`}
              >
                {client.profilePhoto ? (
                  <img src={client.profilePhoto} alt={client.name} className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getClientColor(index)} flex items-center justify-center text-sm font-bold`}>
                    {client.name?.[0] ?? "?"}
                  </div>
                )}
                <div className="text-left">
                  <div className="text-sm font-medium">{client.name}</div>
                  <div className="text-xs text-white/40">{clientCounts[client.id] ?? "..."} clips</div>
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowDriveModal(true)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-[#111118] hover:border-green-500/30 hover:bg-green-500/5 transition-all ml-auto"
            >
              <span className="text-xl">📁</span>
              <div className="text-left">
                <div className="text-sm font-medium">
                  {syncing ? "Syncing..." : "Import from Drive"}
                </div>
                <div className="text-xs text-white/40">
                  {session?.accessToken ? "Connected" : "Click to connect"}
                </div>
              </div>
            </button>
            <button
              onClick={handleAIScan}
              disabled={aiScanning || !selectedClient || clips.length === 0}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-all disabled:opacity-40"
            >
              <span className="text-xl">🤖</span>
              <div className="text-left">
                <div className="text-sm font-medium text-purple-300">
                  {aiScanning ? "Scanning..." : selectedDriveFolder ? `Scan "${selectedDriveFolder.split("/").pop()}"` : "Scan with AI"}
                </div>
                <div className="text-xs text-white/40">
                  {selectedDriveFolder
                    ? `${clips.filter(c => { const p = (c as Clip & {path?:string}).path||""; return (p===selectedDriveFolder||p.startsWith(selectedDriveFolder+"/")) && !c.aiAnalysedAt; }).length} unscanned in folder`
                    : `${managedUnanalysed} to scan${protectedUnanalysed > 0 ? ` · ${protectedUnanalysed} protected (skipped)` : ""}`}
                </div>
              </div>
            </button>
            <button
              onClick={runAutoSort}
              disabled={autoSortBusy || clips.filter(c => c.aiAnalysedAt && !c.organizedPath).length === 0}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all disabled:opacity-40"
            >
              <span className="text-xl">✨</span>
              <div className="text-left">
                <div className="text-sm font-medium text-emerald-300">{autoSortBusy ? "Sorting…" : "Auto-sort sure clips"}</div>
                <div className="text-xs text-white/40">
                  {Object.keys(folderKeywords).length} folders taught
                </div>
              </div>
            </button>
          </div>

          {/* View Toggle — Drive vs AI Library */}
          <div className="flex items-center gap-2 bg-[#111118] border border-white/10 rounded-xl p-1 w-fit">
            <button
              onClick={() => setLibraryView("drive")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                libraryView === "drive" ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
              }`}
            >
              <span>📁</span> Original Drive
            </button>
            <button
              onClick={async () => {
                setLibraryView("ai");
                setSelectedAiCategory("all");
                // Auto-create taxonomy from AI labels if none exists yet
                if (!taxonomy && analysedClips.length > 0) {
                  const labels = [...new Set(analysedClips.map(c => c.aiContentType).filter(Boolean))] as string[];
                  const defaultTax = buildDefaultTaxonomy(selectedClient, labels);
                  await saveTaxonomy(defaultTax);
                  setTaxonomy(defaultTax);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                libraryView === "ai" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "text-white/40 hover:text-white"
              }`}
            >
              <span>🤖</span> AI Library
              {analysedClips.length > 0 && (
                <span className="text-xs bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full">{analysedClips.length}</span>
              )}
            </button>
          </div>

          {/* Folder Tabs + Search */}
          <div className="flex items-center gap-4">
            <div className="flex gap-1 bg-[#111118] border border-white/10 rounded-lg p-1">
              {folders.map((folder) => (
                <button
                  key={folder}
                  onClick={() => setSelectedFolder(folder)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                    selectedFolder === folder
                      ? "bg-orange-500 text-white"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {folder} ({folderCounts[folder as keyof typeof folderCounts]})
                </button>
              ))}
            </div>

            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search by name or tag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#111118] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-orange-300">{uploadProgress}</p>
            </div>
          )}

          {/* AI Scan Status */}
          {(aiScanning || aiScanStatus) && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex items-center gap-3">
              {aiScanning && <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
              <p className="text-sm text-purple-300 flex-1">{aiScanStatus || "Scanning clips with AI..."}</p>
              <button onClick={() => { setAiScanning(false); setAiScanStatus(""); }} className="text-white/30 hover:text-white text-lg leading-none">✕</button>
            </div>
          )}

          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              dragOver ? "border-orange-500 bg-orange-500/10" : "border-white/10 hover:border-white/20"
            }`}
          >
            <div className="text-3xl mb-2">🎬</div>
            <p className="text-white/50 text-sm">Drag & drop video clips here or click to browse</p>
            <p className="text-white/30 text-xs mt-1">MP4, MOV, AVI supported · Auto-tagged with AI on upload</p>
          </div>

          {/* Folder Browser + Clips Grid */}
          <div className="flex gap-6">
            {/* Sidebar — Drive folders OR AI categories */}
            {libraryView === "drive" && driveFolders.length > 0 && (
              <div className="w-56 shrink-0">
                <p className="text-xs text-white/40 font-medium uppercase tracking-wider mb-2">Drive Folders</p>
                <div className="space-y-0.5">
                  <button
                    onClick={() => setSelectedDriveFolder(null)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between ${
                      !selectedDriveFolder ? "bg-orange-500/20 text-orange-400" : "text-white/50 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2"><span>📁</span> All folders</span>
                    <span className="text-white/30">{clips.length}</span>
                  </button>
                  {driveFolders.map((folder) => {
                    const count = clips.filter(c => {
                      const p = c.organizedPath || (c as Clip & { path?: string }).path || "";
                      return p === folder; // clips directly in this folder
                    }).length;
                    const depth = folder.split("/").length - 1;
                    const label = folder.split("/").pop()!;
                    const isTop = depth === 0;
                    const isSelected = selectedDriveFolder === folder;
                    const protection = folderRules[folder] || "managed";
                    return (
                      <div
                        key={folder}
                        className={`group/folder relative w-full rounded-lg text-xs transition-all flex items-center ${
                          isSelected
                            ? "bg-orange-500/20 text-orange-400"
                            : isTop
                            ? "text-white/80 font-medium hover:bg-white/5"
                            : "text-white/45 hover:bg-white/5 hover:text-white"
                        }`}
                        style={{ paddingLeft: `${10 + depth * 16}px`, paddingRight: "8px" }}
                      >
                        <button
                          onClick={() => setSelectedDriveFolder(folder === selectedDriveFolder ? null : folder)}
                          className="flex-1 text-left py-1.5 flex items-center gap-1.5 truncate min-w-0"
                        >
                          {!isTop && <span className="text-white/20">└</span>}
                          <span>{isTop ? "📁" : "📂"}</span>
                          <span className="truncate">{label}</span>
                          {protection === "frozen" && (
                            <span title="Frozen — agent never touches" className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-500/25 text-red-300 border border-red-500/40">🔒 LOCKED</span>
                          )}
                          {protection === "additive" && (
                            <span title="Additive — agent only adds, never removes" className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-500/25 text-green-300 border border-green-500/40">➕ ADD-ONLY</span>
                          )}
                        </button>
                        <span className="text-white/30 shrink-0 mr-1">{count}</span>
                        <button
                          onClick={() => { setManageFolder(folder); setFolderOpTarget(""); }}
                          className="opacity-0 group-hover/folder:opacity-100 text-white/30 hover:text-white shrink-0 px-1"
                          title="Move or merge folder"
                        >⋯</button>
                        <button
                          onClick={() => setRulesMenuFor(rulesMenuFor === folder ? null : folder)}
                          className="opacity-0 group-hover/folder:opacity-100 text-white/30 hover:text-white shrink-0 px-1"
                          title="Protection"
                        >🛡️</button>
                        {rulesMenuFor === folder && (
                          <div className="absolute right-0 top-full mt-1 z-30 bg-[#1a1a22] border border-white/10 rounded-lg shadow-xl py-1 w-44 text-left">
                            <button onClick={() => changeFolderRule(folder, "managed")} className={`w-full text-left px-3 py-1.5 hover:bg-white/5 ${protection === "managed" ? "text-orange-400" : "text-white/70"}`}>🟢 Managed (default)</button>
                            <button onClick={() => changeFolderRule(folder, "additive")} className={`w-full text-left px-3 py-1.5 hover:bg-white/5 ${protection === "additive" ? "text-orange-400" : "text-white/70"}`}>➕ Additive only</button>
                            <button onClick={() => changeFolderRule(folder, "frozen")} className={`w-full text-left px-3 py-1.5 hover:bg-white/5 ${protection === "frozen" ? "text-orange-400" : "text-white/70"}`}>🔒 Frozen (off-limits)</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {libraryView === "ai" && (
              <div className="w-64 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-purple-400/60 font-medium uppercase tracking-wider">AI Categories</p>
                  <span className="text-xs text-white/20">click name to rename</span>
                </div>
                {analysedClips.length === 0 ? (
                  <div className="text-xs text-white/30 p-3 bg-white/5 rounded-lg">
                    No clips analysed yet — click <span className="text-purple-300">Scan with AI</span> first
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* All analysed */}
                    <button
                      onClick={() => setSelectedAiCategory("all")}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between ${
                        selectedAiCategory === "all" ? "bg-purple-500/20 text-purple-300" : "text-white/50 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2">🤖 All analysed</span>
                      <span className="text-white/30">{analysedClips.length}</span>
                    </button>

                    {/* AI content-type categories — editable */}
                    {aiCategories.filter(c => c.id.startsWith("type:")).map(cat => {
                      const rawId = cat.id.slice(5); // e.g. "action_reel"
                      const taxCat = taxonomy?.categories.find(c => c.id === rawId);
                      const displayName = taxCat?.name || cat.label;
                      const isEditing = editingCatId === rawId;
                      const isSelected = selectedAiCategory === cat.id;

                      return (
                        <div key={cat.id} className="group">
                          <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all ${isSelected ? "bg-purple-500/20" : "hover:bg-white/5"}`}>
                            {/* Category row */}
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingCatName}
                                onChange={e => setEditingCatName(e.target.value)}
                                onBlur={() => renameCat(rawId, editingCatName || displayName)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") renameCat(rawId, editingCatName || displayName);
                                  if (e.key === "Escape") setEditingCatId(null);
                                }}
                                className="flex-1 bg-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded outline-none border border-purple-500/40 min-w-0"
                              />
                            ) : (
                              <button
                                onClick={() => setSelectedAiCategory(cat.id)}
                                onDoubleClick={() => { setEditingCatId(rawId); setEditingCatName(displayName); }}
                                className={`flex-1 text-left text-xs flex items-center gap-1.5 min-w-0 ${isSelected ? "text-purple-300" : "text-white/60 hover:text-white"}`}
                              >
                                <span>{cat.emoji}</span>
                                <span className="truncate">{displayName}</span>
                              </button>
                            )}
                            <span className="text-white/20 text-xs shrink-0">{cat.count}</span>
                            {/* Edit + Add sub buttons */}
                            <button
                              onClick={() => { setEditingCatId(rawId); setEditingCatName(displayName); }}
                              className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-purple-300 text-xs transition-all px-0.5"
                              title="Rename"
                            >✏️</button>
                            <button
                              onClick={() => { setAddingSubTo(rawId); setNewSubName(""); }}
                              className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-green-400 text-xs transition-all px-0.5"
                              title="Add subcategory"
                            >+</button>
                          </div>

                          {/* Subcategories */}
                          {taxCat?.subcategories.map(sub => (
                            <div key={sub.id} className="group/sub flex items-center gap-1 pl-6 pr-2 py-1 rounded-lg hover:bg-white/5 transition-all">
                              <button
                                onClick={() => setSelectedAiCategory(`sub:${sub.id}`)}
                                className={`flex-1 text-left text-xs truncate ${selectedAiCategory === `sub:${sub.id}` ? "text-purple-300" : "text-white/40 hover:text-white"}`}
                              >
                                └ {sub.name}
                              </button>
                              <button
                                onClick={() => removeSubcategory(rawId, sub.id)}
                                className="opacity-0 group-hover/sub:opacity-100 text-white/20 hover:text-red-400 text-xs"
                              >✕</button>
                            </div>
                          ))}

                          {/* Add subcategory input */}
                          {addingSubTo === rawId && (
                            <div className="pl-6 pr-2 py-1">
                              <input
                                autoFocus
                                value={newSubName}
                                onChange={e => setNewSubName(e.target.value)}
                                onBlur={() => { if (newSubName.trim()) addSubcategory(rawId, newSubName); else setAddingSubTo(null); }}
                                onKeyDown={e => {
                                  if (e.key === "Enter") addSubcategory(rawId, newSubName);
                                  if (e.key === "Escape") setAddingSubTo(null);
                                }}
                                placeholder="Subcategory name..."
                                className="w-full bg-white/5 border border-white/10 rounded text-xs px-2 py-1 text-white placeholder:text-white/20 outline-none focus:border-purple-500/40"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Fixed filters */}
                    <div className="border-t border-white/5 pt-1 mt-1 space-y-0.5">
                      {[
                        { id: "face:yes", label: "Has face", emoji: "👤" },
                        { id: "energy:high", label: "High energy", emoji: "🔥" },
                        { id: "energy:low", label: "Calm / low", emoji: "🌊" },
                        { id: "score:top", label: "Top rated (8+)", emoji: "⭐" },
                      ].map(f => {
                        const count = aiCategories.find(c => c.id === f.id)?.count || 0;
                        if (!count) return null;
                        return (
                          <button key={f.id} onClick={() => setSelectedAiCategory(f.id)}
                            className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all flex items-center justify-between ${
                              selectedAiCategory === f.id ? "bg-purple-500/20 text-purple-300" : "text-white/40 hover:bg-white/5 hover:text-white"
                            }`}>
                            <span>{f.emoji} {f.label}</span>
                            <span className="text-white/20">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* Clips Grid */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-white/60">
                {filteredClips.length} clips for <span className="text-white">{currentClient?.name}</span>
                {libraryView === "drive" && selectedDriveFolder && <span className="text-orange-400"> / {selectedDriveFolder.split("/").pop()}</span>}
                {libraryView === "ai" && selectedAiCategory && selectedAiCategory !== "all" && (
                  <span className="text-purple-400"> · {aiCategories.find(c => c.id === selectedAiCategory)?.label}</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {filteredClips.length > 0 && (
                  <button
                    onClick={() => {
                      const ids = filteredClips.map(c => c.id!).filter(Boolean);
                      const allSelected = ids.every(id => selectedClipIds.has(id));
                      setSelectedClipIds(allSelected ? new Set() : new Set(ids));
                    }}
                    className="text-xs text-white/50 hover:text-white border border-white/10 rounded-lg px-2 py-1"
                  >
                    {filteredClips.every(c => c.id && selectedClipIds.has(c.id)) ? "Clear selection" : `Select all ${filteredClips.length}`}
                  </button>
                )}
                {libraryView === "ai" && (
                  <span className="text-xs text-purple-400/60 bg-purple-500/10 px-2 py-1 rounded-lg">🤖 sorted by usability</span>
                )}
              </div>
            </div>

            {(() => {
              if (libraryView === "ai") {
                filteredClips.sort((a, b) => parseFloat(b.aiUsabilityScore || "0") - parseFloat(a.aiUsabilityScore || "0"));
              }
              return null;
            })()}
            {filteredClips.length === 0 ? (
              <div className="text-center py-16 text-white/30">
                <div className="text-4xl mb-3">🎬</div>
                <p>No clips yet — upload your first B-roll above</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {filteredClips.map((clip) => (
                  <div key={clip.id} className={`bg-[#111118] border rounded-xl overflow-hidden transition-all group ${clip.id && selectedClipIds.has(clip.id) ? "border-orange-500 ring-1 ring-orange-500/50" : "border-white/10 hover:border-orange-500/30"}`}>
                    <div className="aspect-video bg-white/5 flex items-center justify-center relative overflow-hidden">
                      {/* Selection checkbox */}
                      <button
                        onClick={(e) => { e.stopPropagation(); if (clip.id) toggleClipSelected(clip.id); }}
                        className={`absolute top-2 left-1/2 -translate-x-1/2 z-10 w-6 h-6 rounded-md flex items-center justify-center text-xs transition-all ${
                          clip.id && selectedClipIds.has(clip.id) ? "bg-orange-500 text-white opacity-100" : "bg-black/50 text-white/70 opacity-0 group-hover:opacity-100"
                        }`}
                        title="Select"
                      >{clip.id && selectedClipIds.has(clip.id) ? "✓" : "+"}</button>
                      {(clip.thumbnailUrl || clip.driveThumbnailUrl) ? (
                        <img
                          src={clip.thumbnailUrl || clip.driveThumbnailUrl}
                          alt={clip.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <span className="text-4xl">🎬</span>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                        {clip.bunnyUrl ? (
                          <a href={clip.bunnyUrl} target="_blank" rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white">▶</a>
                        ) : clip.driveFileId ? (
                          <a href={`https://drive.google.com/file/d/${clip.driveFileId}/view`} target="_blank" rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-xs">Drive</a>
                        ) : null}
                      </div>
                      <span className={`absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded capitalize ${
                        clip.folder === "approved" ? "bg-green-500/80" :
                        clip.folder === "edited" ? "bg-blue-500/80" : "bg-white/20"
                      }`}>{clip.folder}</span>
                      {clip.status === "drive-only" && (
                        <span className="absolute top-2 right-2 text-xs px-1.5 py-0.5 rounded bg-blue-600/80">📁 Drive</span>
                      )}
                      {clip.mediaType === "image" && (
                        <span className="absolute bottom-2 left-2 text-xs px-1.5 py-0.5 rounded bg-black/60">📷 Photo</span>
                      )}
                    </div>

                    <div className="p-3">
                      <p className="text-xs font-medium truncate mb-2">{clip.name}</p>
                      {clip.organizedPath && (
                        <div className="text-[10px] text-green-300/80 bg-green-500/10 rounded px-1.5 py-0.5 mb-2 truncate inline-block">
                          🗂️ {clip.organizedPath}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {clip.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className={`text-xs px-1.5 py-0.5 rounded-full ${tagColors[tag] || "bg-white/10 text-white/50"}`}>
                            {tag}
                          </span>
                        ))}
                        {clip.tags.length === 0 && !clip.aiAnalysedAt && (
                          <span className="text-xs text-white/20">No tags yet</span>
                        )}
                      </div>
                      {/* AI tags */}
                      {clip.aiAnalysedAt && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {clip.aiEnergyLevel && <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">⚡ {clip.aiEnergyLevel}</span>}
                          {clip.aiHookQuality && <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300">🎣 {clip.aiHookQuality}</span>}
                          {clip.aiHasFace === "yes" && <span className="text-xs px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300">👤 face</span>}
                          {clip.aiUsabilityScore && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300">★ {clip.aiUsabilityScore}/10</span>}
                        </div>
                      )}
                      {/* Activity/subject multi-tags */}
                      {clip.aiTags && clip.aiTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {clip.aiTags.slice(0, 5).map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">#{tag}</span>
                          ))}
                        </div>
                      )}
                      {clip.size && <p className="text-xs text-white/30">{clip.size}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div> {/* end folder browser + clips grid flex */}
        </div>
      </div>

      {/* Auto-sort result + undo */}
      {autoSortResult && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">✨ Auto-sorted {autoSortResult.moves.length} clips</h3>
              <button onClick={() => { setAutoSortResult(null); setAutoSortBatch([]); }} className="text-white/30 hover:text-white text-xl">✕</button>
            </div>
            <p className="text-white/50 text-sm mb-4">
              Only the certain matches were moved. <span className="text-yellow-300">{autoSortResult.skippedAmbiguous}</span> ambiguous and{" "}
              <span className="text-white/60">{autoSortResult.skippedNoMatch}</span> unmatched were left in your pile. Scan the thumbnails — undo if anything looks wrong.
            </p>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {Object.entries(autoSortResult.byFolder).sort((a, b) => b[1].length - a[1].length).map(([folder, items]) => (
                <div key={folder} className="bg-white/5 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-emerald-300">📂 {folder}</span>
                    <span className="text-xs text-white/40">{items.length} clips · matched “{items[0].matched}”</span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto">
                    {items.slice(0, 8).map(m => (
                      <img key={m.clipId} src={m.clip.thumbnailUrl || m.clip.driveThumbnailUrl}
                        alt="" className="w-14 h-14 object-cover rounded-md shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ))}
                    {items.length > 8 && <span className="text-xs text-white/30 self-center px-2">+{items.length - 8}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4 pt-4 border-t border-white/10">
              <button onClick={undoAutoSort} disabled={autoSortBusy}
                className="flex-1 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-300 hover:bg-red-500/10 text-sm disabled:opacity-40">
                {autoSortBusy ? "Undoing…" : "↩ Undo all"}
              </button>
              <button onClick={() => { setAutoSortResult(null); setAutoSortBatch([]); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-sm hover:bg-emerald-500/30">
                Looks good — keep
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage folder modal — move into / merge */}
      {manageFolder && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={() => setManageFolder(null)}>
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">Manage folder: <span className="text-orange-400">{manageFolder.split("/").pop()}</span></h3>
              <button onClick={() => setManageFolder(null)} className="text-white/30 hover:text-white text-xl">✕</button>
            </div>

            {/* Keywords for auto-sort */}
            <div className="mb-5 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3">
              <p className="text-xs text-purple-300 mb-1">🤖 Auto-sort keywords for <span className="font-medium">{manageFolder.split("/").pop()}</span></p>
              <p className="text-[11px] text-white/40 mb-2">Comma-separated tag-words that mean this folder. e.g. running, jog, sprint, run</p>
              <input
                defaultValue={(folderKeywords[manageFolder] || []).join(", ")}
                onBlur={e => saveKeywords(manageFolder, e.target.value)}
                placeholder="running, jog, sprint…"
                className="w-full bg-[#1a1a22] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500/50"
              />
              {folderKeywords[manageFolder]?.length > 0 && (
                <p className="text-[10px] text-purple-300/60 mt-1">✓ Auto-sort will file clips tagged with these here</p>
              )}
            </div>

            {/* Move inside another folder */}
            <div className="mb-5">
              <p className="text-xs text-white/50 mb-2">📁 Move <span className="text-white">{manageFolder.split("/").pop()}</span> inside another folder (keeps its name):</p>
              <select value={folderOpTarget} onChange={e => setFolderOpTarget(e.target.value)}
                className="w-full bg-[#1a1a22] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 mb-2">
                <option value="">Choose new parent folder…</option>
                <option value="__root__">(make it top-level)</option>
                {driveFolders.filter(f => f !== manageFolder && !f.startsWith(manageFolder + "/")).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <button
                onClick={() => {
                  const name = manageFolder.split("/").pop()!;
                  const newPath = folderOpTarget === "__root__" ? name : `${folderOpTarget}/${name}`;
                  runFolderOp(manageFolder, newPath, "Moved folder");
                }}
                disabled={!folderOpTarget || folderOpBusy}
                className="w-full px-3 py-2 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/30 text-sm hover:bg-orange-500/30 disabled:opacity-40"
              >{folderOpBusy ? "Working…" : "Move here"}</button>
            </div>

            {/* Merge into another folder */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs text-white/50 mb-2">🔗 Merge <span className="text-white">{manageFolder.split("/").pop()}</span> INTO another folder (combines clips, removes duplicate):</p>
              <select value={folderOpTarget} onChange={e => setFolderOpTarget(e.target.value)}
                className="w-full bg-[#1a1a22] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500/50 mb-2">
                <option value="">Choose folder to merge into…</option>
                {driveFolders.filter(f => f !== manageFolder && !f.startsWith(manageFolder + "/")).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <button
                onClick={() => runFolderOp(manageFolder, folderOpTarget, "Merged folder")}
                disabled={!folderOpTarget || folderOpTarget === "__root__" || folderOpBusy}
                className="w-full px-3 py-2 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-sm hover:bg-purple-500/30 disabled:opacity-40"
              >{folderOpBusy ? "Working…" : "Merge into selected"}</button>
            </div>

            {/* Delete empty folder */}
            {(() => {
              const clipCount = clips.filter(c => {
                const p = c.organizedPath || (c as Clip & { path?: string }).path || "";
                return p === manageFolder || p.startsWith(manageFolder + "/");
              }).length;
              return (
                <div className="border-t border-white/10 pt-4 mt-4">
                  {clipCount === 0 ? (
                    <button
                      onClick={() => deleteEmptyFolder(manageFolder)}
                      disabled={folderOpBusy}
                      className="w-full px-3 py-2 rounded-lg bg-red-500/15 text-red-300 border border-red-500/30 text-sm hover:bg-red-500/25 disabled:opacity-40"
                    >🗑️ Delete this empty folder</button>
                  ) : (
                    <p className="text-[11px] text-white/30 text-center">Folder has {clipCount} clips — empty it (move/merge) before deleting.</p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Bulk move action bar */}
      {selectedClipIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1a1a22] border border-orange-500/30 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium text-orange-300">{selectedClipIds.size} selected</span>
          <span className="text-white/20">→</span>
          {bulkNewFolder ? (
            <input
              autoFocus
              value={bulkTarget}
              onChange={(e) => setBulkTarget(e.target.value)}
              placeholder="e.g. ספורט/שחייה"
              className="bg-[#111118] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 w-[220px]"
            />
          ) : (
            <select
              value={bulkTarget}
              onChange={(e) => setBulkTarget(e.target.value)}
              className="bg-[#111118] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 max-w-[220px]"
            >
              <option value="">Choose folder…</option>
              {moveTargets.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          <button
            onClick={() => { setBulkNewFolder(!bulkNewFolder); setBulkTarget(""); }}
            className="text-xs text-white/50 hover:text-white border border-white/10 rounded-lg px-2 py-2"
            title="Create a new folder"
          >{bulkNewFolder ? "📋 Pick" : "+ New"}</button>
          <button
            onClick={() => moveSelectedTo(bulkTarget.trim())}
            disabled={!bulkTarget.trim() || movingBulk}
            className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-40"
          >
            {movingBulk ? "Moving…" : "Move here"}
          </button>
          <button onClick={() => { setSelectedClipIds(new Set()); setBulkNewFolder(false); }} className="text-white/40 hover:text-white text-lg px-1">✕</button>
        </div>
      )}

      {/* Drive Sync Modal */}
      {showDriveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-8 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Import from Google Drive</h3>
            <p className="text-white/50 text-sm mb-6">
              Paste the Google Drive folder ID for <span className="text-orange-400">{clients.find(c => c.id === selectedClient)?.name}</span>.
              You can find it in the folder URL: drive.google.com/drive/folders/<span className="text-white/70">FOLDER_ID</span>
            </p>

            {!session?.accessToken ? (
              <button
                onClick={() => signIn("google")}
                className="w-full bg-white text-black font-semibold py-3 rounded-lg text-sm flex items-center justify-center gap-2 mb-4"
              >
                <span>🔗</span> Connect Google Account
              </button>
            ) : (
              <div className="flex items-center gap-2 mb-4 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                <span className="text-green-400 text-xs">✓ Google account connected</span>
              </div>
            )}

            <input
              type="text"
              placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
              value={driveFolderId}
              onChange={(e) => setDriveFolderId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowDriveModal(false)}
                className="flex-1 border border-white/10 text-white/60 py-2.5 rounded-lg text-sm hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDriveSync}
                disabled={!driveFolderId || !session?.accessToken || syncing}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                {syncing ? "Syncing..." : "Start Sync"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
