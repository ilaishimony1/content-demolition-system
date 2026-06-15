"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import { saveClip, batchSaveClips, getClipsByClient, Clip } from "@/lib/clips";
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
    }
  }, [selectedClient, user]);

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

    setSyncing(true);
    setShowDriveModal(false);
    setUploadProgress("Scanning Google Drive folders...");

    try {
      const res = await fetch("/api/drive-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: session.accessToken,
          folderId: driveFolderId,
          clientId: selectedClient,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setUploadProgress(`Saving ${data.count} clips to library...`);
        await batchSaveClips(data.clips);
        await loadClips();
        setUploadProgress("");
        alert(`✅ Synced ${data.count} videos from Google Drive!`);
      } else {
        alert("Sync failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Sync error:", err);
      alert("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
      setUploadProgress("");
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
    try {
      const res = await fetch("/api/agent/scan-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClient, accessToken: session?.accessToken }),
      });
      const data = await res.json();
      if (data.error) {
        setAiScanStatus("❌ Error: " + data.error);
      } else {
        const { analysed = 0, errors = 0, skipped = 0 } = data;
        if (analysed === 0 && !session?.accessToken) {
          setAiScanStatus("⚠️ Not connected to Google — click 'Import from Drive' to sign in first, then scan again");
        } else if (analysed === 0) {
          setAiScanStatus(`⚠️ 0 analysed — ${errors} errors, ${skipped} skipped (no video URL). Check Railway logs.`);
        } else {
          setAiScanStatus(`✅ Analysed ${analysed} clips! ${errors > 0 ? `(${errors} failed)` : ""}`);
          await loadClips();
        }
      }
    } catch (err) {
      setAiScanStatus("Scan failed: " + String(err));
    } finally {
      setAiScanning(false);
      setTimeout(() => setAiScanStatus(""), 5000);
    }
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading...</div></div>;
  if (!user) return null;

  // Extract unique Drive folders from clips
  const driveFolders = Array.from(
    new Set(clips.map(c => (c as Clip & { path?: string }).path || "").filter(Boolean))
  ).sort();

  const filteredClips = clips.filter((clip) => {
    const matchesWorkflow = selectedFolder === "all" || clip.folder === selectedFolder;
    const clipPath = (clip as Clip & { path?: string }).path || "";
    const matchesDriveFolder = !selectedDriveFolder || clipPath === selectedDriveFolder || clipPath.startsWith(selectedDriveFolder + "/");
    const matchesSearch = searchQuery === "" ||
      clip.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clip.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
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
                  {aiScanning ? "Scanning..." : "Scan with AI"}
                </div>
                <div className="text-xs text-white/40">
                  {clips.filter(c => !c.aiAnalysedAt).length} unanalysed clips
                </div>
              </div>
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
              {aiScanning && <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />}
              <p className="text-sm text-purple-300">{aiScanStatus || "Scanning clips with AI..."}</p>
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
            {/* Drive Folder Panel */}
            {driveFolders.length > 0 && (
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
                      const p = (c as Clip & { path?: string }).path || "";
                      return p === folder || p.startsWith(folder + "/");
                    }).length;
                    const depth = folder.split("/").length - 1;
                    const label = folder.split("/").pop()!;
                    return (
                      <button
                        key={folder}
                        onClick={() => setSelectedDriveFolder(folder === selectedDriveFolder ? null : folder)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between ${
                          selectedDriveFolder === folder ? "bg-orange-500/20 text-orange-400" : "text-white/50 hover:bg-white/5 hover:text-white"
                        }`}
                        style={{ paddingLeft: `${12 + depth * 12}px` }}
                      >
                        <span className="flex items-center gap-2 truncate"><span>📂</span> <span className="truncate">{label}</span></span>
                        <span className="text-white/30 shrink-0">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Clips Grid */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-white/60">
                {filteredClips.length} clips for <span className="text-white">{currentClient?.name}</span>
                {selectedDriveFolder && <span className="text-orange-400"> / {selectedDriveFolder.split("/").pop()}</span>}
              </h2>
            </div>

            {filteredClips.length === 0 ? (
              <div className="text-center py-16 text-white/30">
                <div className="text-4xl mb-3">🎬</div>
                <p>No clips yet — upload your first B-roll above</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {filteredClips.map((clip) => (
                  <div key={clip.id} className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden hover:border-orange-500/30 transition-all group">
                    <div className="aspect-video bg-white/5 flex items-center justify-center relative overflow-hidden">
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
                    </div>

                    <div className="p-3">
                      <p className="text-xs font-medium truncate mb-2">{clip.name}</p>
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
                          {clip.aiContentType && <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">🤖 {clip.aiContentType}</span>}
                          {clip.aiEnergyLevel && <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">⚡ {clip.aiEnergyLevel}</span>}
                          {clip.aiHookQuality && <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300">🎣 {clip.aiHookQuality}</span>}
                          {clip.aiHasFace === "yes" && <span className="text-xs px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300">👤 face</span>}
                          {clip.aiUsabilityScore && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300">★ {clip.aiUsabilityScore}/10</span>}
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
