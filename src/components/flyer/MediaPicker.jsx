import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { listDriveMedia, importDriveMedia } from "@/lib/studioFlyerApi";
import { Loader2, Upload, Folder, Search, Image as ImageIcon } from "lucide-react";

// Three-tab image picker: Estate Media Drive (browse/import), Upload, URL.
export default function MediaPicker({ open, onClose, onPick, userEmail }) {
  const [tab, setTab] = useState("drive");
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(null);
  const [url, setUrl] = useState("");
  const [breadcrumb, setBreadcrumb] = useState([]);

  const load = async (folderId = "", srch = "") => {
    setLoading(true);
    try {
      const res = await listDriveMedia(userEmail, { folder_id: folderId, search: srch });
      setFolders(res.folders || []);
      setFiles(res.files || []);
    } catch (e) {
      setFolders([]); setFiles([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (open && tab === "drive") { setBreadcrumb([]); setSearch(""); load("", ""); }
  }, [open, tab]);

  const openFolder = (f) => { setBreadcrumb((b) => [...b, f]); load(f.id, ""); };
  const goRoot = () => { setBreadcrumb([]); load("", ""); };
  const crumb = (idx) => {
    const b = breadcrumb.slice(0, idx + 1);
    setBreadcrumb(b);
    load(b[b.length - 1].id, "");
  };
  const doSearch = () => { setBreadcrumb([]); load("", search); };

  const pickFile = async (f) => {
    setImporting(f.id);
    try {
      const res = await importDriveMedia(userEmail, f.id);
      onPick(res.file_url);
      onClose();
    } catch (e) {
      alert("Import failed: " + e.message);
    } finally { setImporting(null); }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      onPick(res.file_url);
      onClose();
    } catch (err) { alert("Upload failed"); }
    finally { setLoading(false); }
  };

  const pickUrl = () => { if (url) { onPick(url); onClose(); } };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Choose an image</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="drive"><Folder className="w-4 h-4 mr-1" />Drive</TabsTrigger>
            <TabsTrigger value="upload"><Upload className="w-4 h-4 mr-1" />Upload</TabsTrigger>
            <TabsTrigger value="url"><ImageIcon className="w-4 h-4 mr-1" />URL</TabsTrigger>
          </TabsList>

          <TabsContent value="drive" className="mt-4">
            <div className="flex gap-2 mb-3">
              <Input placeholder="Search folders..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" onKeyDown={(e) => e.key === "Enter" && doSearch()} />
              <Button size="sm" onClick={doSearch}><Search className="w-4 h-4" /></Button>
            </div>
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1 flex-wrap">
              <button onClick={goRoot} className="hover:text-primary">My Folders</button>
              {breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span>/</span><button onClick={() => crumb(i)} className="hover:text-primary">{b.name}</button>
                </span>
              ))}
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {folders.map((f) => (
                  <button key={f.id} onClick={() => openFolder(f)} className="flex flex-col items-center gap-2 p-3 border rounded-lg hover:bg-accent">
                    <Folder className="w-8 h-8 text-[#B8956A]" />
                    <span className="text-xs text-center truncate w-full">{f.name}</span>
                  </button>
                ))}
                {files.filter((f) => f.mimeType?.startsWith("image/")).map((f) => (
                  <button key={f.id} disabled={importing === f.id} onClick={() => pickFile(f)} className="relative group border rounded-lg overflow-hidden hover:ring-2 ring-[#B8956A] disabled:opacity-50">
                    {f.thumbnail_url
                      ? <img src={f.thumbnail_url} alt={f.name} className="w-full h-24 object-cover" />
                      : <div className="w-full h-24 bg-muted flex items-center justify-center"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>}
                    <span className="text-[10px] block px-1 py-1 truncate">{f.name}</span>
                    {importing === f.id && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>}
                  </button>
                ))}
                {folders.length === 0 && files.length === 0 && (
                  <div className="col-span-3 text-center text-sm text-muted-foreground py-8">No folders or images found.</div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-accent">
              {loading ? <Loader2 className="animate-spin mb-2" /> : <Upload className="w-8 h-8 mb-2 text-muted-foreground" />}
              <span className="text-sm">Click to upload an image</span>
              <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
            </label>
          </TabsContent>

          <TabsContent value="url" className="mt-4">
            <div className="flex gap-2">
              <Input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" />
              <Button onClick={pickUrl}>Use</Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}