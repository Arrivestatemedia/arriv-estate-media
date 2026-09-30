import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, ImageIcon, Video, FileText, ExternalLink, Search, MapPin, Calendar, User, FolderOpen, ArrowLeft } from "lucide-react";
import { createPageUrl } from "../utils";
import { motion } from "framer-motion";

export default function AdminClientGalleryPreview() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const allJobs = await base44.entities.Job.list("-created_date", 200);
      const withMedia = (allJobs || []).filter(
        (j) => j.source_storage_folder_id || j.google_drive_folder_url
      );
      setJobs(withMedia);
    } catch (err) {
      console.error("Failed to load jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = jobs.filter((j) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      j.title?.toLowerCase().includes(q) ||
      j.client_name?.toLowerCase().includes(q) ||
      j.client_email?.toLowerCase().includes(q) ||
      j.location?.toLowerCase().includes(q)
    );
  });

  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="min-h-screen bg-[#0a0b0f] relative overflow-hidden">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[#B8956A]/8 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-[#B8956A]/6 blur-[100px]" />
      </div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(#B8956A 1px, transparent 1px), linear-gradient(90deg, #B8956A 1px, transparent 1px)",
        backgroundSize: "40px 40px"
      }} />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-16">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/80 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </button>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#B8956A] to-[#8a6d4a] flex items-center justify-center shadow-lg shadow-[#B8956A]/30">
                <FolderOpen className="w-5 h-5 text-[#0a0b0f]" />
              </div>
              <div className="absolute inset-0 rounded-xl bg-[#B8956A]/40 blur-md -z-10" />
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#B8956A] block leading-none">Arriv Estate Media</span>
              <span className="text-[10px] tracking-[0.15em] uppercase text-white/30 block leading-none mt-1">Client Gallery Previews</span>
            </div>
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif text-white mb-2 leading-tight tracking-tight">
            Client Media Galleries
          </h1>
          <p className="text-sm text-white/40 max-w-xl">
            Browse every job with a media folder and preview its gallery exactly as the client sees it.
          </p>
        </motion.div>

        {/* Search */}
        <div className="relative mt-8 mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by job title, client, or location..."
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#B8956A]/50 focus:bg-white/8 transition-colors"
          />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-[#B8956A]" />
            <p className="text-white/40 mt-4 text-sm tracking-wide">Loading jobs...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="max-w-md mx-auto py-32 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#B8956A]/10 border border-[#B8956A]/20 flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="w-10 h-10 text-[#B8956A]/40" />
            </div>
            <p className="text-xl font-serif text-white mb-2">No galleries found</p>
            <p className="text-sm text-white/40">
              {search ? "No jobs match your search." : "No jobs have a media folder yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((job, index) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.4), ease: [0.22, 1, 0.36, 1] }}
                className="group relative rounded-2xl bg-white/5 border border-white/10 hover:border-[#B8956A]/40 p-5 transition-all duration-300 hover:shadow-xl hover:shadow-[#B8956A]/10"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                      job.type === "video" ? "bg-purple-500/15 text-purple-300 border border-purple-500/20"
                      : job.type === "photo" ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
                      : "bg-[#B8956A]/15 text-[#B8956A] border border-[#B8956A]/20"
                    }`}>
                      {job.type === "photo_video" ? "Photo+Video" : job.type?.charAt(0).toUpperCase() + job.type?.slice(1)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      job.delivery_status === "delivered"
                        ? "bg-green-500/15 text-green-300 border border-green-500/20"
                        : "bg-white/5 text-white/40 border border-white/10"
                    }`}>
                      {job.delivery_status === "delivered" ? "Delivered" : "Pending"}
                    </span>
                  </div>
                </div>

                <h3 className="text-base font-semibold text-white mb-3 line-clamp-2 leading-snug">
                  {job.title || "Untitled Job"}
                </h3>

                <div className="space-y-2 mb-5 text-xs text-white/50">
                  {job.client_name && (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-[#B8956A]/60 shrink-0" />
                      <span className="truncate">{job.client_name}</span>
                    </div>
                  )}
                  {job.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#B8956A]/60 shrink-0" />
                      <span className="truncate">{job.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[#B8956A]/60 shrink-0" />
                    <span>{formatDate(job.date)}</span>
                  </div>
                </div>

                <Link
                  to={`/ClientJobGallery?jobId=${job.id}&adminPreview=1`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#B8956A] to-[#8a6d4a] hover:from-[#C9A87B] hover:to-[#9a7d5a] text-[#0a0b0f] text-sm font-semibold transition-all hover:shadow-lg hover:shadow-[#B8956A]/30"
                >
                  <ExternalLink className="w-4 h-4" />
                  Preview Gallery
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="mt-8 text-center">
            <span className="text-xs text-white/30">
              Showing {filtered.length} of {jobs.length} jobs with media
            </span>
          </div>
        )}
      </div>
    </div>
  );
}