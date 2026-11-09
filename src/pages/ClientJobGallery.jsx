import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ImageIcon, Video, FileText, Loader2, ArrowLeft, X, ChevronLeft, ChevronRight, Sparkles, Zap } from "lucide-react";
import { createPageUrl } from "../utils";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PropertyPagePrompt from "@/components/property/PropertyPagePrompt";
import MlsSubmitModal from "@/components/mls/MlsSubmitModal";
import MlsStatusCard from "@/components/mls/MlsStatusCard";
import GalleryMediaCard from "@/components/gallery/GalleryMediaCard";
import GalleryToolbar from "@/components/gallery/GalleryToolbar";
import { saveSelection, reconcileSelection } from "@/lib/gallerySelection";

export default function ClientJobGallery() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("jobId");
  const isDemo = searchParams.get("demo") === "1";
  const adminPreview = searchParams.get("adminPreview") === "1";
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [downloading, setDownloading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  // Publish to MLS state — independent of selection and downloads.
  const [mlsRequests, setMlsRequests] = useState([]);
  const [mlsConfig, setMlsConfig] = useState(null);
  const [mlsOpen, setMlsOpen] = useState(false);
  const [downloadStep, setDownloadStep] = useState(null);
  const [copiedVideo, setCopiedVideo] = useState(null);

  useEffect(() => {
    if (isDemo) {
      setUser({ email: "demo@example.com" });
      return;
    }
    if (adminPreview) {
      setUser({ email: "admin-preview", isAdmin: true });
      return;
    }
    const userEmail = localStorage.getItem("user_email") || sessionStorage.getItem("user_email");
    if (!userEmail) {
      window.location.replace(createPageUrl("SignIn"));
      return;
    }
    setUser({ email: userEmail });
  }, [isDemo, adminPreview]);

  useEffect(() => {
    if (isDemo) {
      setJob({
        title: "123 Maple Street — Photo + Video Tour",
        location: "Bethesda, MD",
        date: "2026-09-15",
      });
      setFiles([
        { id: "d1", name: "exterior_front.jpg", size: 4200000, isImage: true, thumbnailLink: "https://images.unsplash.com/photo-1564013799929-ab4427c28789?w=600" },
        { id: "d2", name: "living_room.jpg", size: 3800000, isImage: true, thumbnailLink: "https://images.unsplash.com/photo-1580587772045-0a8e2c8f3d12?w=600" },
        { id: "d3", name: "kitchen.jpg", size: 4500000, isImage: true, thumbnailLink: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600" },
        { id: "d4", name: "bedroom_master.jpg", size: 3900000, isImage: true, thumbnailLink: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe8e?w=600" },
        { id: "d5", name: "bathroom.jpg", size: 3100000, isImage: true, thumbnailLink: "https://images.unsplash.com/photo-1620626011761-996317b8d101?w=600" },
        { id: "d6", name: "backyard.jpg", size: 4700000, isImage: true, thumbnailLink: "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=600" },
        { id: "d7", name: "dining_room.jpg", size: 3600000, isImage: true, thumbnailLink: "https://images.unsplash.com/photo-1618221190208-4e8b3c3e0b1e?w=600" },
        { id: "d8", name: "home_tour.mp4", size: 85000000, isVideo: true },
        { id: "d9", name: "drone_aerial.mp4", size: 120000000, isVideo: true },
        { id: "d10", name: "floor_plan.pdf", size: 2200000 },
      ]);
      setLoading(false);
      return;
    }
    if (!user?.email || !jobId) return;
    loadMedia();
  }, [user?.email, jobId, isDemo, adminPreview]);

  const loadMedia = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = adminPreview
        ? { jobId, adminPreview: true }
        : { jobId, clientEmail: user.email };
      const res = await base44.functions.invoke("getJobMediaForClient", payload);
      const data = res.data || res;
      const loaded = data.files || [];
      setFiles(loaded);
      setJob(data.job || null);
      // Restore the customer's selection, keeping only media that is still available.
      setSelected(new Set(reconcileSelection(jobId, loaded)));
    } catch (err) {
      console.error("Failed to load media:", err);
      setError(err.message || "Failed to load your media");
    } finally {
      setLoading(false);
    }
    loadMlsState();
  };

  // MLS requests already submitted for this job, plus the unbranded video links.
  const loadMlsState = async () => {
    if (!jobId || !user?.email || isDemo || adminPreview) return;
    try {
      const res = await base44.functions.invoke("getMlsUploadRequests", {
        mode: "client",
        jobId,
        clientEmail: user.email,
      });
      const data = res?.data || res;
      if (data?.error) return;
      setMlsRequests(data.requests || []);
      setMlsConfig(data);
    } catch (err) {
      console.error("MLS state load failed:", err);
    }
  };

  const youtubeFor = (fileId) => (mlsConfig?.youtube || []).find((y) => y.drive_file_id === fileId) || null;

  const copyVideoLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedVideo(url);
      setTimeout(() => setCopiedVideo(null), 1800);
    } catch { /* clipboard unavailable */ }
  };

  // One selection, shared by Download Selected and Publish to MLS. It survives a refresh and a
  // download, so a customer never has to pick the same photographs twice.
  const persist = (next) => {
    setSelected(next);
    saveSelection(jobId, next);
  };

  const toggleSelect = (fileId) => {
    const next = new Set(selected);
    if (next.has(fileId)) next.delete(fileId);
    else next.add(fileId);
    persist(next);
  };

  const selectAll = () => {
    if (selected.size === files.length) persist(new Set());
    else persist(new Set(files.map((f) => f.id)));
  };

  const downloadFile = async (file) => {
    if (isDemo) {
      alert("Demo mode — downloads are disabled in this preview.");
      return;
    }
    if (adminPreview) {
      alert("Admin preview — downloads are disabled. Open the client gallery link to download.");
      return;
    }
    try {
      const res = await base44.functions.fetch("/downloadJobMedia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, clientEmail: user.email, fileId: file.id }),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download file");
    }
  };

  // One ZIP for photographs and documents. Videos download individually: a delivered MP4 is far
  // too large to package inside a request, and the original file is never altered either way.
  const downloadZip = async (ids) => {
    const res = await base44.functions.fetch("/downloadGalleryZip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, clientEmail: user.email, fileIds: ids }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail?.error || "Could not build your download");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(job?.title || "Arriv").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40)}_media.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadSelected = async () => {
    if (selected.size === 0) return;
    if (isDemo || adminPreview) {
      alert(isDemo
        ? "Demo mode — downloads are disabled in this preview."
        : "Admin preview — downloads are disabled. Open the client gallery link to download.");
      return;
    }

    const chosen = files.filter((f) => selected.has(f.id));
    const bulkable = chosen.filter((f) => !f.isVideo);
    const videos = chosen.filter((f) => f.isVideo);

    setDownloading(true);
    try {
      let step = 0;
      const total = (bulkable.length > 1 ? 1 : bulkable.length) + videos.length;

      if (bulkable.length > 1) {
        setDownloadStep({ label: `Packaging ${bulkable.length} files...`, done: 0, total });
        await downloadZip(bulkable.map((f) => f.id));
        step += 1;
      } else if (bulkable.length === 1) {
        setDownloadStep({ label: bulkable[0].name, done: 0, total });
        await downloadFile(bulkable[0]);
        step += 1;
      }

      for (const video of videos) {
        setDownloadStep({ label: video.name, done: step, total });
        await downloadFile(video);
        step += 1;
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.error("Download error:", err);
      alert(err.message || "Failed to download your selection");
    } finally {
      setDownloading(false);
      setDownloadStep(null);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  const openLightbox = (index) => {
    if (files[index]?.isImage) {
      setLightboxIndex(index);
    }
  };

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const navigateLightbox = useCallback((dir) => {
    setLightboxIndex((prev) => {
      if (prev === null) return prev;
      const imageFiles = files.filter((f) => f.isImage);
      const currentImage = files[prev];
      const currentIdx = imageFiles.findIndex((f) => f.id === currentImage.id);
      if (currentIdx === -1) return prev;
      const nextIdx = (currentIdx + dir + imageFiles.length) % imageFiles.length;
      const nextFile = imageFiles[nextIdx];
      return files.findIndex((f) => f.id === nextFile.id);
    });
  }, [files]);

  // Swipe left / right inside the viewer, so a client on a phone moves between photographs
  // without closing it and tapping another thumbnail.
  const touchStart = useRef({ x: 0, y: 0 });
  const handleTouchStart = (e) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e) => {
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    navigateLightbox(dx < 0 ? 1 : -1);
  };

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") navigateLightbox(-1);
      if (e.key === "ArrowRight") navigateLightbox(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, closeLightbox, navigateLightbox]);

  if (!user) return <div className="p-8 text-center text-white/60">Loading...</div>;

  const photoFiles = files.filter((f) => f.isImage);
  const videoFiles = files.filter((f) => f.isVideo);
  const docFiles = files.filter((f) => !f.isImage && !f.isVideo);

  const renderSection = (title, Icon, sectionFiles) => {
    if (sectionFiles.length === 0) return null;
    return (
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-[#B8956A]/10 border border-[#B8956A]/20 flex items-center justify-center">
            <Icon className="w-4 h-4 text-[#B8956A]" />
          </div>
          <h2 className="text-base font-semibold tracking-wide text-white/90">{title}</h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white/50 bg-white/5 border border-white/10">
            {sectionFiles.length}
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent ml-2" />
        </div>
        <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 space-y-3">
          {sectionFiles.map((file, i) => (
            <GalleryMediaCard
              key={file.id}
              file={file}
              index={i}
              isSelected={selected.has(file.id)}
              onToggleSelect={() => toggleSelect(file.id)}
              onOpen={() => openLightbox(files.indexOf(file))}
              onDownload={() => downloadFile(file)}
              formatSize={formatSize}
              youtube={youtubeFor(file.id)}
              copiedVideo={copiedVideo}
              onCopyYoutube={copyVideoLink}
              showYoutube={!isDemo && !adminPreview}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0b0f] relative overflow-hidden">
      {/* Ambient glow background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[#B8956A]/8 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-[#B8956A]/6 blur-[100px]" />
      </div>

      {/* Grid pattern overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(#B8956A 1px, transparent 1px), linear-gradient(90deg, #B8956A 1px, transparent 1px)",
        backgroundSize: "40px 40px"
      }} />

      {/* Hero Header */}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-8">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/80 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </button>
        {job && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#B8956A] to-[#8a6d4a] flex items-center justify-center shadow-lg shadow-[#B8956A]/30">
                  <Sparkles className="w-5 h-5 text-[#0a0b0f]" />
                </div>
                <div className="absolute inset-0 rounded-xl bg-[#B8956A]/40 blur-md -z-10" />
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#B8956A] block leading-none">Arriv Estate Media</span>
                <span className="text-[10px] tracking-[0.15em] uppercase text-white/30 block leading-none mt-1">Delivery Gallery</span>
              </div>
            </div>
            <h1 className="text-3xl sm:text-5xl font-serif text-white mb-3 leading-tight tracking-tight">
              {job.title || "Your Media"}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-white/50">{job.location}</span>
              {job.date && (
                <>
                  <span className="text-[#B8956A]/30">/</span>
                  <span className="text-white/30">
                    {new Date(job.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {!isDemo && !adminPreview && jobId && (
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <PropertyPagePrompt jobId={jobId} />
        </div>
      )}

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {isDemo && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-[#B8956A]/10 border border-[#B8956A]/30 flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#B8956A] text-[#0a0b0f]">DEMO</span>
            <p className="text-sm text-white/70">
              This is a preview with sample data. Real galleries show your actual job photos and videos.
            </p>
          </div>
        )}

        {adminPreview && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500 text-white">ADMIN PREVIEW</span>
            <p className="text-sm text-white/70">
              You're viewing this gallery exactly as the client sees it. Downloads are disabled in preview mode.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="relative">
              <Loader2 className="w-10 h-10 animate-spin text-[#B8956A]" />
              <div className="absolute inset-0 blur-md bg-[#B8956A]/30 rounded-full" />
            </div>
            <p className="text-white/40 mt-4 text-sm tracking-wide">Loading your media...</p>
          </div>
        ) : error ? (
          <div className="max-w-md mx-auto py-32 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-lg font-medium text-white mb-1">Something went wrong</p>
            <p className="text-sm text-white/40 mb-6">{error}</p>
            <Button onClick={loadMedia} variant="outline" className="border-[#B8956A]/40 text-[#B8956A] hover:bg-[#B8956A]/10">
              Try Again
            </Button>
          </div>
        ) : files.length === 0 ? (
          <div className="max-w-md mx-auto py-32 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#B8956A]/10 border border-[#B8956A]/20 flex items-center justify-center mx-auto mb-6">
              <ImageIcon className="w-10 h-10 text-[#B8956A]/40" />
            </div>
            <p className="text-xl font-serif text-white mb-2">No media available yet</p>
            <p className="text-sm text-white/40 max-w-xs mx-auto leading-relaxed">
              Your photos and videos will appear here once they've been uploaded. Please check back soon.
            </p>
          </div>
        ) : (
          <>
            {!isDemo && !adminPreview && (
              <MlsStatusCard requests={mlsRequests} />
            )}

            <GalleryToolbar
              photoCount={photoFiles.length}
              videoCount={videoFiles.length}
              docCount={docFiles.length}
              fileCount={files.length}
              selectedCount={selected.size}
              allSelected={selected.size === files.length && files.length > 0}
              onToggleAll={selectAll}
              onDownload={downloadSelected}
              downloading={downloading}
              downloadStep={downloadStep}
              onPublishMls={() => setMlsOpen(true)}
              canPublishMls={!isDemo && !adminPreview && mlsConfig?.routing?.can_submit === true}
            />

            {/* Sections by media type */}
            {renderSection("Photos", ImageIcon, photoFiles)}
            {renderSection("Videos", Video, videoFiles)}
            {renderSection("Documents", FileText, docFiles)}

            {/* Footer hint */}
            <div className="mt-12 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-white/30">
                <Zap className="w-3 h-3 text-[#B8956A]" />
                Click a photo to view it full size · Swipe or use the arrows to go back and forth
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && files[lightboxIndex]?.isImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center"
            onClick={closeLightbox}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <button
              onClick={closeLightbox}
              className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors z-10"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); navigateLightbox(-1); }}
              className="absolute left-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors z-10"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); navigateLightbox(1); }}
              className="absolute right-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors z-10"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>

            <motion.img
              key={files[lightboxIndex].id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              src={(files[lightboxIndex].thumbnailLink || '').replace(/=s\d+.*/, '=s0').replace(/w=600/, 'w=1920') || files[lightboxIndex].thumbnailLink}
              alt={files[lightboxIndex].name}
              className="w-full h-full max-w-[95vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
              <p className="text-sm text-white/90">
                {files[lightboxIndex].name}
                {photoFiles.length > 1 && ` · ${photoFiles.findIndex((f) => f.id === files[lightboxIndex].id) + 1} / ${photoFiles.length}`}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isDemo && !adminPreview && (
        <MlsSubmitModal
          open={mlsOpen}
          onClose={() => setMlsOpen(false)}
          jobId={jobId}
          clientEmail={user?.email}
          files={files}
          selectedIds={Array.from(selected)}
          onSubmitted={loadMlsState}
        />
      )}
    </div>
  );
}