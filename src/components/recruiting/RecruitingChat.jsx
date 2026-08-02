import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, MapPin, Radius, Search, Sparkles, AlertCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { naturalLanguageSearch } from "@/lib/recruitingApi";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const SUGGESTIONS = [
  "Find real estate agents with strong sales track records",
  "Source realtors who specialize in luxury properties",
  "Find property consultants with 3+ years experience",
  "Look for real estate professionals active on LinkedIn",
];

const RADIUS_OPTIONS = [25, 50, 75, 100];

export default function RecruitingChat({ onReviewProspects, onJobSelect, selectedJobId }) {
  const [zipCode, setZipCode] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(50);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [openJobs, setOpenJobs] = useState([]);
  const timeoutRef = useRef(null);

  useEffect(() => {
    // Load open jobs for the selector
    base44.entities.HireJob
      .filter({ status: "open" }, "-created_date", 20)
      .then(setOpenJobs)
      .catch(() => {});
  }, []);

  const handleSearch = async () => {
    if (!zipCode.trim()) {
      toast.error("Zip code is required");
      return;
    }
    if (!query.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    // 60s client timeout
    const timeoutPromise = new Promise((_, reject) => {
      timeoutRef.current = setTimeout(() => reject(new Error("timeout")), 60_000);
    });

    try {
      const searchPromise = naturalLanguageSearch({
        query: query.trim(),
        zipCode: zipCode.trim(),
        radiusMiles,
        jobId: selectedJobId || null,
      });

      const res = await Promise.race([searchPromise, timeoutPromise]);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (res.success) {
        setResult(res);
        if (res.fresh_prospects.length === 0) {
          toast.info("No new prospects found — try a different query or radius");
        } else {
          toast.success(`Found ${res.fresh_prospects.length} new prospects`);
        }
      } else {
        setError(res.error || "Search failed");
      }
    } catch (err) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (err.message === "timeout") {
        setError("Research is taking longer than expected. Please try again or refine your search.");
      } else {
        setError(err.message || "Search failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (s) => {
    setQuery(s);
  };

  return (
    <div className="flex flex-col h-full bg-[#FFFBF5]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#B8956A]/20 bg-white">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-[#B8956A]" />
          <h2 className="text-lg font-semibold text-[#1A1A1A]">AI Talent Search</h2>
        </div>
        <p className="text-sm text-[#1A1A1A]/60">
          Find real candidates on the web. Enter a zip code, set your radius, and describe who you're looking for.
        </p>
      </div>

      {/* Controls */}
      <div className="px-6 py-4 border-b border-[#B8956A]/20 bg-white space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">
              Zip Code <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8956A]" />
              <Input
                type="text"
                placeholder="30301"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                className="pl-9"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <Label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Radius (miles)</Label>
            <div className="flex items-center gap-2">
              <Radius className="w-4 h-4 text-[#B8956A] shrink-0" />
              <div className="flex gap-1.5 flex-wrap">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRadiusMiles(r)}
                    disabled={loading}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      radiusMiles === r
                        ? "bg-[#B8956A] text-white"
                        : "bg-[#FFFBF5] text-[#1A1A1A]/70 border border-[#B8956A]/20 hover:bg-[#B8956A]/10"
                    }`}
                  >
                    {r} mi
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Target Job (optional)</Label>
            <select
              value={selectedJobId || ""}
              onChange={(e) => onJobSelect?.(e.target.value || null)}
              disabled={loading}
              className="w-full h-10 px-3 rounded-lg border border-[#B8956A]/20 bg-white text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#B8956A]/30"
            >
              <option value="">Any role</option>
              {openJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Query input */}
        <div>
          <Label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Describe your ideal candidate</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8956A]" />
              <Input
                type="text"
                placeholder="e.g. Find real estate agents with strong sales track records"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
                className="pl-9"
                disabled={loading}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={loading || !zipCode.trim() || !query.trim()}
              className="bg-[#B8956A] hover:bg-[#A68559] text-white px-6"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Suggestions */}
        {!loading && !result && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-[#1A1A1A]/50 self-center">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestion(s)}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#FFFBF5] border border-[#B8956A]/20 text-[#1A1A1A]/70 hover:bg-[#B8956A]/10 hover:text-[#1A1A1A] transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Loader2 className="w-10 h-10 text-[#B8956A] animate-spin mb-4" />
            <p className="text-[#1A1A1A] font-medium">Researching candidates on the web...</p>
            <p className="text-sm text-[#1A1A1A]/50 mt-1">This can take up to 55 seconds. We're finding real people.</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
            <AlertCircle className="w-10 h-10 text-amber-500 mb-4" />
            <p className="text-[#1A1A1A] font-medium mb-1">Search Issue</p>
            <p className="text-sm text-[#1A1A1A]/60">{error}</p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#B8956A]" />
                  <h3 className="font-semibold text-[#1A1A1A]">Search Results</h3>
                </div>
                <Button
                  onClick={() => onReviewProspects?.()}
                  className="bg-[#B8956A] hover:bg-[#A68559] text-white"
                >
                  Review Prospects
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#FFFBF5] rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-[#B8956A]">{result.fresh_prospects.length}</p>
                  <p className="text-xs text-[#1A1A1A]/60 mt-0.5">New Prospects</p>
                </div>
                <div className="bg-[#FFFBF5] rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{result.seniority_filtered}</p>
                  <p className="text-xs text-[#1A1A1A]/60 mt-0.5">Seniority Filtered</p>
                </div>
                <div className="bg-[#FFFBF5] rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{result.location_filtered}</p>
                  <p className="text-xs text-[#1A1A1A]/60 mt-0.5">Location Filtered</p>
                </div>
              </div>
            </div>

            {result.fresh_prospects.length > 0 && (
              <div className="space-y-2">
                {result.fresh_prospects.map((p, i) => (
                  <div key={i} className="bg-white rounded-lg border border-[#B8956A]/20 p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#B8956A]/15 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-[#B8956A]">
                        {(p.name || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#1A1A1A] truncate">{p.name}</p>
                      <p className="text-sm text-[#1A1A1A]/60 truncate">
                        {p.title} {p.company && `· ${p.company}`}
                      </p>
                      <p className="text-xs text-[#1A1A1A]/40 truncate">{p.location}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && !error && !result && (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
            <Sparkles className="w-12 h-12 text-[#B8956A]/30 mb-4" />
            <p className="text-[#1A1A1A] font-medium mb-1">Start a talent search</p>
            <p className="text-sm text-[#1A1A1A]/50">
              Enter a zip code and describe the candidate you're looking for. Our AI will search the web for real, verifiable people.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}