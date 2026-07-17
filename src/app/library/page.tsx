"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { saveClip, upsertClipsByDriveId, getClipsByClient, saveDriveFolders, getDriveFolders, saveDriveRoot, getDriveRoot, applyOrganization, moveFolderClips, deleteClip, Clip } from "@/lib/clips";
import { updateAgentMemory, logAgentEvent } from "@/lib/agentMemory";
import { getTaxonomy, saveTaxonomy, buildDefaultTaxonomy, ClientTaxonomy } from "@/lib/taxonomy";
import { buildAutoSort, AutoSortResult } from "@/lib/sorter";
import { getFolderRules, setFolderRule, protectionForPath, FolderProtection } from "@/lib/folderRules";
import { getFolderKeywords, setFolderKeywords, FolderKeywords } from "@/lib/folderKeywords";
import { clearOrganization, getScanStatus, getPushStatus, resetPushStatus, addClipsToExtraFolder } from "@/lib/clips";
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
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "image">("all");
  const [dupOnly, setDupOnly] = useState(false);
  const [selectedDriveFolder, setSelectedDriveFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const autoSyncedRef = useRef<Set<string>>(new Set());
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
  const [showTagManager, setShowTagManager] = useState(false);
  const [aiSearchIds, setAiSearchIds] = useState<Set<string> | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  const [showPushPreview, setShowPushPreview] = useState(false);
  const [pushRootFolder, setPushRootFolder] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushStatusText, setPushStatusText] = useState("");
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
        // Deep-link: /library?client=<id> opens straight to that client
        const wanted = new URLSearchParams(window.location.search).get("client");
        const match = wanted && data.find(c => (c.clientId || c.id) === wanted || c.id === wanted);
        if (match) setSelectedClient(match.clientId || match.id);
        else if (data.length > 0 && !selectedClient) setSelectedClient(data[0].clientId || data[0].id);
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
      maybeAutoSync(selectedClient);
    }
  }, [selectedClient, user, session?.accessToken]);

  // Silently pull new Drive files when you open a client (once per session per client)
  async function maybeAutoSync(clientId: string) {
    if (!session?.accessToken) return;
    if (autoSyncedRef.current.has(clientId)) return;
    const root = await getDriveRoot(clientId);
    if (!root) return; // no remembered root yet — manual Import sets it up
    autoSyncedRef.current.add(clientId);
    setAutoSyncing(true);
    try {
      const res = await fetch("/api/drive-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: session.accessToken, folderId: root, clientId }),
      });
      const data = await res.json();
      if (data.success) {
        await upsertClipsByDriveId(clientId, data.clips);
        if (data.folders) { await saveDriveFolders(clientId, data.folders); setStoredFolders(data.folders); }
        if (clientId === selectedClient) await loadClips();
      }
    } catch { /* silent — manual Import always available */ }
    finally { setAutoSyncing(false); }
  }

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

  async function executePush() {
    if (pushing) return;
    if (!session?.accessToken) { await signIn("google"); return; }
    const rootMatch = pushRootFolder.match(/folders\/([a-zA-Z0-9_-]+)/);
    const rootId = (rootMatch ? rootMatch[1] : pushRootFolder).trim();
    if (!rootId) { alert("Paste the root Drive folder (the one you imported from) first."); return; }

    const moves = clips
      .filter(c => {
        if (!c.driveFileId) return false;
        const real = (c as Clip & { path?: string }).path || "";
        const homeMove = c.organizedPath && c.organizedPath !== real;
        const hasExtras = (c.organizedExtraPaths || []).length > 0;
        return homeMove || hasExtras;
      })
      .map(c => ({
        drive_file_id: c.driveFileId,
        target_path: c.organizedPath || (c as Clip & { path?: string }).path || "",
        extra_paths: c.organizedExtraPaths || [],
        name: c.name,
        clip_id: c.id,
      }));
    if (moves.length === 0) { alert("Nothing to push."); return; }

    if (!confirm(`Move ${moves.length} files in ${currentClient?.name}'s real Google Drive to match your in-app layout?\n\nFiles are only moved (never deleted). This can't be auto-undone, but you can always re-organize and push again.`)) return;

    setPushing(true);
    setPushStatusText(`🚀 Pushing ${moves.length} files to Drive…`);
    // Clear any prior push status so polling can't read a STALE result and
    // instantly report "finished" with old numbers.
    await resetPushStatus(selectedClient, moves.length);
    try {
      const res = await fetch("/api/agent/push-to-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClient, accessToken: session.accessToken, rootFolderId: rootId, moves }),
      });
      const data = await res.json();
      if (data.error) { setPushStatusText("❌ " + data.error); setPushing(false); return; }
      await saveDriveRoot(selectedClient, rootId); // remember root for auto-sync
      const total = data.to_move ?? moves.length;
      let polls = 0;
      const poll = setInterval(async () => {
        polls++;
        const st = await getPushStatus(selectedClient);
        const done = st?.done ?? 0, errs = st?.errors ?? 0;
        setPushStatusText(`🚀 Moved ${done} / ${total}${errs ? ` · ${errs} failed (${(st?.lastError || "").slice(0, 50)})` : ""}…`);
        const finished = (st && st.running === false && (done + errs) >= (st.total ?? total)) || polls > total * 3 + 20;
        if (finished) {
          clearInterval(poll);
          setPushing(false);
          setPushStatusText(`✅ Pushed to Drive — ${done} moved${errs ? `, ${errs} failed` : ""}. Drive now matches your layout! 🎉`);
          await loadClips(); // refresh to show settled paths (won't re-push next time)
          await logAgentEvent(selectedClient, { agent: "drive-scanner", type: "push-complete", payload: { moved: done, errors: errs } });
          setTimeout(() => { setPushStatusText(""); setShowPushPreview(false); }, 10000);
        }
      }, 4000);
    } catch (err) {
      setPushStatusText("Push failed: " + String(err));
      setPushing(false);
    }
  }

  // Natural-language AI search across the clips currently in view
  async function handleAiSearch() {
    if (aiSearching) return;
    const q = searchQuery.trim();
    if (!q) return;
    // search the in-scope analysed clips (respect folder/category filters via filteredClips)
    const pool = filteredClips.filter(c => c.aiAnalysedAt && c.id).slice(0, 1200);
    if (pool.length === 0) { alert("No scanned clips in view to search. Scan first, or widen the folder."); return; }
    setAiSearching(true);
    try {
      const res = await fetch("/api/agent/find-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          clips: pool.map(c => ({ id: c.id, name: c.name, tags: c.aiTags || [], topic: c.aiTopic || "" })),
        }),
      });
      const data = await res.json();
      if (data.error) { alert("Search failed: " + data.error); setAiSearching(false); return; }
      setAiSearchIds(new Set<string>((data.ids || []).map(String)));
    } catch (err) {
      alert("Search failed: " + String(err));
    } finally {
      setAiSearching(false);
    }
  }

  // Add a tag as a keyword on a folder (the auto-sort vocabulary)
  async function assignTagToFolder(tag: string, folder: string) {
    const existing = folderKeywords[folder] || [];
    if (existing.includes(tag)) return;
    const next = await setFolderKeywords(selectedClient, folder, [...existing, tag]);
    setFolderKeywordsState(next);
  }

  async function unassignTag(tag: string, folder: string) {
    const existing = folderKeywords[folder] || [];
    const next = await setFolderKeywords(selectedClient, folder, existing.filter(k => k !== tag));
    setFolderKeywordsState(next);
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

  // Send a single auto-sorted clip back to the pile (the rest stay filed)
  async function undoOneAutoSort(clipId: string) {
    await clearOrganization([clipId]);
    await loadClips();
    setAutoSortBatch(prev => prev.filter(id => id !== clipId));
    setAutoSortResult(prev => {
      if (!prev) return prev;
      const moves = prev.moves.filter(m => m.clipId !== clipId);
      const byFolder: typeof prev.byFolder = {};
      for (const m of moves) (byFolder[m.folder] ||= []).push(m);
      return { ...prev, moves, byFolder };
    });
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

  // Remove a clip from the library (Firestore record only — does not touch the real Drive file).
  async function handleDeleteClip(clip: Clip) {
    if (!clip.id) return;
    if (!confirm(`Remove "${clip.name}" from the library?\n\nThis only removes it from the app — it does NOT touch the real Drive file.`)) return;
    try {
      await deleteClip(clip.id);
      setClips(prev => prev.filter(c => c.id !== clip.id));
    } catch (err) {
      alert("Delete failed: " + String(err));
    }
  }

  async function deleteSelectedClips() {
    const ids = clips.filter(c => c.id && selectedClipIds.has(c.id)).map(c => c.id!) ;
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} clip${ids.length > 1 ? "s" : ""} from the library?\n\nThis only removes them from the app — it does NOT touch the real Drive files.`)) return;
    setMovingBulk(true);
    try {
      for (const id of ids) await deleteClip(id);
      const removed = new Set(ids);
      setClips(prev => prev.filter(c => !(c.id && removed.has(c.id))));
      setSelectedClipIds(new Set());
      setBulkNewFolder(false);
    } catch (err) {
      alert("Delete failed: " + String(err));
    } finally {
      setMovingBulk(false);
    }
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
        // Remember the root so the app can auto-sync from it on open
        await saveDriveRoot(selectedClient, cleanFolderId);
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

  async function addSelectedToFolder(folderPath: string) {
    if (!folderPath || selectedClipIds.size === 0 || movingBulk) return;
    setMovingBulk(true);
    try {
      const targets = clips
        .filter(c => c.id && selectedClipIds.has(c.id))
        .map(c => ({ id: c.id!, current: c.organizedExtraPaths || [] }));
      const n = await addClipsToExtraFolder(targets, folderPath);
      await loadClips();
      setSelectedClipIds(new Set());
      setBulkTarget("");
      alert(`✅ Added ${n} clips to ${folderPath} (they stay in their home folder too).`);
    } catch (err) {
      alert("Add failed: " + String(err));
    } finally {
      setMovingBulk(false);
    }
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
        // Read worker scan status for errors (so a silent stall is visible)
        const st = await getScanStatus(selectedClient);
        const errs = st?.errors ?? 0;
        if (errs > 0 && (done === 0)) {
          setAiScanStatus(`⚠️ ${errs} clips failed to scan. Last error: ${st?.lastError || "unknown"}`);
        } else if (errs > 0) {
          setAiScanStatus(`🤖 Scanned ${Math.max(0, done)} / ${toScan} · ${errs} failed (last: ${(st?.lastError || "").slice(0, 60)})`);
        } else {
          setAiScanStatus(`🤖 Scanned ${Math.max(0, done)} / ${toScan}…`);
        }
        const workerDone = st && st.running === false && (st.done ?? 0) + (st.errors ?? 0) >= (st.total ?? 0);
        if (done >= toScan || workerDone || polls >= maxPolls) {
          clearInterval(poll);
          setAiScanning(false);
          setAiScanStatus(`✅ Scan finished — ${Math.max(0, done)} tagged${errs ? `, ${errs} failed (${(st?.lastError || "").slice(0, 80)})` : ""}.`);
          await updateAgentMemory(selectedClient, { lastScanAt: new Date().toISOString() });
          await logAgentEvent(selectedClient, { agent: "drive-scanner", type: "scan-complete", payload: { scanned: done } });
          setTimeout(() => setAiScanStatus(""), 12000);
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
  ].filter(cat => cat.count > 0);

  const filteredClips = clips.filter((clip) => {
    const matchesWorkflow = selectedFolder === "all" || clip.folder === selectedFolder;
    // Effective location = where it's organized to (if moved), else its real Drive path
    const clipPath = clip.organizedPath || (clip as Clip & { path?: string }).path || "";
    // Selecting a folder shows clips DIRECTLY in it (not its subfolders) — so as you
    // sort a clip into a subfolder, it leaves this view. Also shows clips linked here
    // via "also add" (multi-folder).
    const matchesDriveFolder = !selectedDriveFolder
      || clipPath === selectedDriveFolder
      || (clip.organizedExtraPaths || []).includes(selectedDriveFolder);
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

  // Duplicate detection: same file (name+size) appearing 2+ times in this client's library.
  // Different Drive files that are identical uploads — or the same clip filed into 2 folders on purpose.
  const dupMap = new Map<string, string[]>();
  for (const c of clips) {
    const key = `${c.name}||${c.size || ""}`;
    const folder = c.organizedPath || (c as Clip & { path?: string }).path || "(unsorted)";
    dupMap.set(key, [...(dupMap.get(key) || []), folder]);
  }
  const clipFolder = (c: Clip) => c.organizedPath || (c as Clip & { path?: string }).path || "(unsorted)";
  const dupFolders = (c: Clip) => dupMap.get(`${c.name}||${c.size || ""}`) || [];
  const sameFolderCopies = (c: Clip) => dupFolders(c).filter(f => f === clipFolder(c)).length;
  // INTENTIONAL = same file in different folders (duplicated on purpose to fit two categories → leave it).
  const isCrossFolderDup = (c: Clip) => dupFolders(c).length > 1 && sameFolderCopies(c) <= 1;

  // Within each same-file + same-folder group, keep ONE (the first) and mark the REST as "extra".
  // Only the extras get the badge → so you can filter, Select-all, Delete, and always keep one copy.
  const extraDupIds = new Set<string>();
  {
    const byGroup = new Map<string, Clip[]>();
    for (const c of clips) {
      if (!c.id) continue;
      const key = `${c.name}||${c.size || ""}||${clipFolder(c)}`;
      byGroup.set(key, [...(byGroup.get(key) || []), c]);
    }
    for (const group of byGroup.values()) {
      if (group.length < 2) continue;
      [...group].sort((a, b) => (a.id || "").localeCompare(b.id || "")).slice(1)
        .forEach(c => extraDupIds.add(c.id!));
    }
  }
  const isExtraDup = (c: Clip) => !!c.id && extraDupIds.has(c.id);

  // When an AI search is active, narrow the view to its matches
  const scopedClips = aiSearchIds
    ? filteredClips.filter(c => c.id && aiSearchIds.has(c.id))
    : filteredClips;

  // Photos vs videos toggle (everything not explicitly an image counts as video)
  const videoCount = scopedClips.filter(c => c.mediaType !== "image").length;
  const photoCount = scopedClips.filter(c => c.mediaType === "image").length;
  const dupCount = scopedClips.filter(isExtraDup).length;
  const mediaMatched = mediaFilter === "all"
    ? scopedClips
    : scopedClips.filter(c => mediaFilter === "image" ? c.mediaType === "image" : c.mediaType !== "image");
  const displayedClips = dupOnly
    ? mediaMatched.filter(isExtraDup)
    : mediaMatched;

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
            <button
              onClick={() => setShowTagManager(true)}
              disabled={analysedClips.length === 0}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all disabled:opacity-40"
            >
              <span className="text-xl">🏷️</span>
              <div className="text-left">
                <div className="text-sm font-medium text-amber-300">Tags → folders</div>
                <div className="text-xs text-white/40">map the AI&apos;s actual words</div>
              </div>
            </button>
            <button
              onClick={() => setShowPushPreview(true)}
              disabled={clips.filter(c => c.organizedPath).length === 0}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 transition-all disabled:opacity-40"
            >
              <span className="text-xl">🚀</span>
              <div className="text-left">
                <div className="text-sm font-medium text-orange-300">Push to Drive</div>
                <div className="text-xs text-white/40">{clips.filter(c => c.organizedPath).length} organized</div>
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

            {/* Photos / Videos toggle — makes sorting a mess folder faster */}
            <div className="flex gap-1 bg-[#111118] border border-white/10 rounded-lg p-1 shrink-0">
              {([
                { key: "all", label: "All", count: videoCount + photoCount },
                { key: "video", label: "🎬 Videos", count: videoCount },
                { key: "image", label: "📷 Photos", count: photoCount },
              ] as const).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMediaFilter(m.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    mediaFilter === m.key
                      ? "bg-orange-500 text-white"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {m.label} ({m.count})
                </button>
              ))}
            </div>

            {/* Duplicates filter — show only clips that appear more than once */}
            <button
              onClick={() => setDupOnly(v => !v)}
              title="Show only the EXTRA copies (same file, same folder) — one clean copy of each is kept off this list. Turn on → Select all → Delete = safely leaves one of each."
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                dupOnly
                  ? "bg-red-500 text-white border-red-500"
                  : "bg-[#111118] text-white/50 hover:text-white border-white/10"
              }`}
            >
              ⧉ Extra copies ({dupCount})
            </button>

            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search tags, or ask AI: 'shooting guns', 'posing in front of a mirror'…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); if (aiSearchIds) setAiSearchIds(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleAiSearch(); }}
                className="w-full bg-[#111118] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 transition-colors"
              />
            </div>
            <button
              onClick={handleAiSearch}
              disabled={aiSearching || !searchQuery.trim()}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 text-sm hover:bg-purple-500/20 disabled:opacity-40"
            >🔮 {aiSearching ? "Searching…" : "Ask AI"}</button>
          </div>

          {/* AI search result banner */}
          {aiSearchIds && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <p className="text-sm text-purple-300">🔮 AI found <b>{displayedClips.length}</b> clips for &quot;{searchQuery}&quot;</p>
              <button onClick={() => setAiSearchIds(null)} className="text-xs text-white/40 hover:text-white">✕ clear</button>
            </div>
          )}

          {/* Upload Progress */}
          {uploading && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-orange-300">{uploadProgress}</p>
            </div>
          )}

          {/* Auto-sync indicator */}
          {autoSyncing && (
            <div className="flex items-center gap-2 text-xs text-white/40">
              <div className="w-3 h-3 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
              Syncing with Drive…
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
                {displayedClips.length} clips for <span className="text-white">{currentClient?.name}</span>
                {libraryView === "drive" && selectedDriveFolder && <span className="text-orange-400"> / {selectedDriveFolder.split("/").pop()}</span>}
                {libraryView === "ai" && selectedAiCategory && selectedAiCategory !== "all" && (
                  <span className="text-purple-400"> · {aiCategories.find(c => c.id === selectedAiCategory)?.label}</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {displayedClips.length > 0 && (
                  <button
                    onClick={() => {
                      const ids = displayedClips.map(c => c.id!).filter(Boolean);
                      const allSelected = ids.every(id => selectedClipIds.has(id));
                      setSelectedClipIds(allSelected ? new Set() : new Set(ids));
                    }}
                    className="text-xs text-white/50 hover:text-white border border-white/10 rounded-lg px-2 py-1"
                  >
                    {displayedClips.every(c => c.id && selectedClipIds.has(c.id)) ? "Clear selection" : `Select all ${displayedClips.length}`}
                  </button>
                )}
                {libraryView === "ai" && (
                  <span className="text-xs text-purple-400/60 bg-purple-500/10 px-2 py-1 rounded-lg">🤖 AI tagged</span>
                )}
              </div>
            </div>
            {displayedClips.length === 0 ? (
              <div className="text-center py-16 text-white/30">
                <div className="text-4xl mb-3">🎬</div>
                <p>{aiSearchIds ? "No clips matched that search — try different words." : "No clips yet — upload your first B-roll above"}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {displayedClips.map((clip) => (
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
                      {isExtraDup(clip) ? (
                        <span
                          className="absolute bottom-2 right-2 text-xs px-1.5 py-0.5 rounded bg-red-500/90 text-white font-semibold cursor-help"
                          title={`Extra copy (${sameFolderCopies(clip)}× in this folder) — safe to delete. One clean copy is kept.`}
                        >⧉ {sameFolderCopies(clip)}✕</span>
                      ) : isCrossFolderDup(clip) ? (
                        <span
                          className="absolute bottom-2 right-2 text-xs px-1.5 py-0.5 rounded bg-white/20 text-white/70 cursor-help"
                          title={`Same file also in other folders (on purpose): ${[...new Set(dupFolders(clip))].join("  ·  ")}`}
                        >⧉ {[...new Set(dupFolders(clip))].length}</span>
                      ) : null}
                    </div>

                    <div className="p-3">
                      <p className="text-xs font-medium truncate mb-2">{clip.name}</p>
                      {clip.organizedPath && (
                        <div className="text-[10px] text-green-300/80 bg-green-500/10 rounded px-1.5 py-0.5 mb-2 truncate inline-block">
                          🗂️ {clip.organizedPath}
                        </div>
                      )}
                      {(clip.organizedExtraPaths || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {clip.organizedExtraPaths!.map(p => (
                            <span key={p} className="text-[10px] text-sky-300/80 bg-sky-500/10 rounded px-1.5 py-0.5 truncate">🔗 {p.split("/").pop()}</span>
                          ))}
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
                      {/* Activity/subject multi-tags */}
                      {clip.aiTags && clip.aiTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {clip.aiTags.slice(0, 5).map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">#{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        {clip.size ? <p className="text-xs text-white/30">{clip.size}</p> : <span />}
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClip(clip); }}
                          title="Remove from library (does not delete the Drive file)"
                          className="text-xs text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">🗑️</button>
                      </div>
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
              <span className="text-white/60">{autoSortResult.skippedNoMatch}</span> unmatched were left in your pile. Hover any thumbnail and click ✕ to send just that one back — the rest stay filed.
            </p>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {Object.entries(autoSortResult.byFolder).sort((a, b) => b[1].length - a[1].length).map(([folder, items]) => (
                <div key={folder} className="bg-white/5 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-emerald-300">📂 {folder}</span>
                    <span className="text-xs text-white/40">{items.length} clips · matched “{items[0].matched}”</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map(m => (
                      <div key={m.clipId} className="relative group/thumb">
                        <img src={m.clip.thumbnailUrl || m.clip.driveThumbnailUrl}
                          alt={m.clip.name} title={m.clip.name}
                          className="w-16 h-16 object-cover rounded-md"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        <button
                          onClick={() => undoOneAutoSort(m.clipId)}
                          title="Wrong — send back to pile"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-all shadow"
                        >✕</button>
                      </div>
                    ))}
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

      {/* Push to Drive — preview of real-Drive moves (read-only for now) */}
      {showPushPreview && (() => {
        // Push mirrors your in-app structure EXACTLY: every clip you placed
        // (organizedPath) that differs from its real Drive path moves — including
        // clips you manually added to tomcore / חיה. Protections only governed the
        // auto-sort agent, not your own deliberate placements.
        const moves = clips.filter(c => {
          const real = (c as Clip & { path?: string }).path || "";
          const target = c.organizedPath || "";
          return !!target && target !== real;
        });
        const byDest: Record<string, Clip[]> = {};
        for (const c of moves) (byDest[c.organizedPath!] ||= []).push(c);
        const newFolders = Object.keys(byDest).filter(f => !storedFolders.includes(f));
        return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={() => setShowPushPreview(false)}>
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">🚀 Push to Drive — preview</h3>
              <button onClick={() => setShowPushPreview(false)} className="text-white/30 hover:text-white text-xl">✕</button>
            </div>
            <p className="text-white/50 text-sm mb-4">
              This is what will happen in <span className="text-white">{currentClient?.name}</span>&apos;s <span className="text-orange-300">real Google Drive</span> when you push:
              <span className="text-orange-300"> {moves.length} files</span> moved into{" "}
              <span className="text-orange-300">{Object.keys(byDest).length} folders</span>
              {newFolders.length > 0 && <> ({newFolders.length} new folders created)</>}.
            </p>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-xs text-blue-300 mb-4">
              ✅ Mirrors your in-app layout exactly — including clips you manually placed in tomcore / חיה. Files only move (re-parent) — nothing is ever deleted.
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {moves.length === 0 && <p className="text-white/30 text-sm">Nothing to push — your in-app structure already matches Drive.</p>}
              {Object.entries(byDest).sort((a, b) => b[1].length - a[1].length).map(([dest, items]) => (
                <div key={dest} className="bg-white/5 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white flex items-center gap-2">
                      📂 {dest} {!storedFolders.includes(dest) && <span className="text-[10px] text-emerald-400">NEW</span>}
                    </span>
                    <span className="text-xs text-white/40">{items.length} files</span>
                  </div>
                  <div className="text-xs text-white/30 mt-1 truncate">{items.slice(0, 5).map(i => i.name).join(", ")}{items.length > 5 && ` +${items.length - 5}`}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-xs text-white/50 mb-2">
                Paste the <b className="text-white/70">root Drive folder</b> you imported from (where Tom&apos;s folders live):
              </p>
              <input
                value={pushRootFolder}
                onChange={e => setPushRootFolder(e.target.value)}
                placeholder="drive.google.com/drive/folders/… (or just the ID)"
                className="w-full bg-[#1a1a22] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 mb-2"
              />
              {(() => {
                const scope = (session as { scope?: string } | null)?.scope || "";
                const hasWrite = scope.includes("auth/drive") && !scope.includes("drive.readonly");
                return (
                  <div className="flex items-center justify-between gap-2 mb-3">
                    {hasWrite ? (
                      <p className="text-[11px] text-emerald-300/90">✅ <b>Drive write connected</b> — ready to push. Files only move, never deleted.</p>
                    ) : (
                      <p className="text-[11px] text-amber-300/70">⚠️ Needs <b>write</b> access. Click Reconnect → approve (incl. &quot;edit your Drive files&quot;).</p>
                    )}
                    <button
                      onClick={() => signIn("google")}
                      className={`shrink-0 text-[11px] px-2 py-1.5 rounded-lg border ${hasWrite ? "border-emerald-500/30 text-emerald-300/70" : "border-blue-500/30 text-blue-300 hover:bg-blue-500/10"}`}
                    >{hasWrite ? "✓ Connected" : "🔑 Reconnect (grant write)"}</button>
                  </div>
                );
              })()}
              {pushStatusText && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2 text-sm text-orange-300 mb-3 flex items-center gap-2">
                  {pushing && <div className="w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />}
                  {pushStatusText}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowPushPreview(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-sm">Close</button>
                <button
                  onClick={executePush}
                  disabled={pushing || moves.length === 0 || !pushRootFolder.trim()}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 disabled:opacity-40"
                >{pushing ? "Pushing…" : `🚀 Execute push (${moves.length})`}</button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Tag Manager — map the AI's actual tags to folders */}
      {showTagManager && (() => {
        // Count every tag across analysed, unsorted clips
        const counts: Record<string, number> = {};
        for (const c of clips) {
          if (!c.aiAnalysedAt || c.organizedPath) continue;
          for (const t of (c.aiTags || [])) counts[t] = (counts[t] || 0) + 1;
        }
        // Reverse map: tag -> folder it's a keyword for
        const tagToFolder: Record<string, string> = {};
        for (const [folder, kws] of Object.entries(folderKeywords)) {
          for (const k of kws) tagToFolder[k] = folder;
        }
        const tags = Object.entries(counts).sort((a, b) => {
          const aM = !!tagToFolder[a[0]], bM = !!tagToFolder[b[0]];
          if (aM !== bM) return aM ? 1 : -1;   // unmapped first
          return b[1] - a[1];                   // then by frequency
        });
        const unmappedCount = tags.filter(([t]) => !tagToFolder[t]).length;
        return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={() => setShowTagManager(false)}>
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">🏷️ Tags → folders</h3>
              <button onClick={() => setShowTagManager(false)} className="text-white/30 hover:text-white text-xl">✕</button>
            </div>
            <p className="text-white/50 text-sm mb-4">
              Every tag the AI actually used on your un-sorted clips. Map a tag to a folder and auto-sort will file those clips there.
              <span className="text-amber-300"> {unmappedCount} unmapped</span> (shown first).
            </p>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {tags.length === 0 && <p className="text-white/30 text-sm">No tags yet — scan some clips first.</p>}
              {tags.map(([tag, count]) => {
                const mapped = tagToFolder[tag];
                return (
                  <div key={tag} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${mapped ? "bg-emerald-500/5" : "bg-white/5"}`}>
                    <span className="text-sm text-white/80 flex-1 truncate">#{tag}</span>
                    <span className="text-xs text-white/30 shrink-0 w-14 text-right">{count} clip{count !== 1 ? "s" : ""}</span>
                    {mapped ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-emerald-300 truncate max-w-[160px]" title={mapped}>→ {mapped.split("/").pop()}</span>
                        <button onClick={() => unassignTag(tag, mapped)} className="text-white/30 hover:text-red-400 text-xs px-1" title="Unmap">✕</button>
                      </div>
                    ) : (
                      <select
                        defaultValue=""
                        onChange={e => { if (e.target.value) assignTagToFolder(tag, e.target.value); }}
                        className="bg-[#1a1a22] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-amber-500/40 shrink-0 max-w-[180px]"
                      >
                        <option value="">— assign to folder —</option>
                        {driveFolders.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex justify-end">
              <button onClick={() => setShowTagManager(false)} className="px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm hover:bg-amber-500/30">
                Done — now run Auto-sort
              </button>
            </div>
          </div>
        </div>
        );
      })()}

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
            title="Move home folder here"
          >
            {movingBulk ? "Moving…" : "Move here"}
          </button>
          <button
            onClick={() => addSelectedToFolder(bulkTarget.trim())}
            disabled={!bulkTarget.trim() || movingBulk}
            className="px-3 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 text-sm hover:bg-sky-500/20 disabled:opacity-40"
            title="Also add to this folder (keeps the clip in its current folder too)"
          >
            ➕ Also add
          </button>
          <span className="text-white/20">·</span>
          <button
            onClick={deleteSelectedClips}
            disabled={movingBulk}
            className="px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm hover:bg-red-500/20 disabled:opacity-40"
            title="Remove selected clips from the app (does NOT touch the real Drive files)"
          >
            🗑️ Delete
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
