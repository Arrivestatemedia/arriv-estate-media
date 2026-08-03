import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, MapPin, Users, Sparkles } from "lucide-react";
import { naturalLanguageSearch } from "@/lib/recruitingApi";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const SUGGESTIONS = [
  "Find real estate agents in this area who might want to transition to sales",
  "Source sales professionals with 2-5 years of experience",
  "Find people in real estate or property management looking for a career change",
  "Find commission-driven salespeople near this zip code",
];

export default function RecruitingChat({ onProspectsFound, defaultZip }) {
  const [input, setInput] = useState("");
  const [zip, setZip] = useState(defaultZip || "");
  const [radius, setRadius] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleSearch = async () => {
    if (!zip.trim()) { setError("Zip code is required for local recruiting."); return; }
    if (!input.trim()) { setError("Describe who you're looking for."); return; }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Research is taking longer than expected. Try refining your search.")), 60000)
      );
      const searchPromise = naturalLanguageSearch({ input, zipCode: zip, radiusMiles: radius });
      const data = await Promise.race([searchPromise, timeoutPromise]);
      setResult(data);
      if (onProspectsFound) onProspectsFound(data);
    } catch (err) {
      setError(err.message || "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3" style={{ backgroundColor: "rgba(184,149,106,0.1)" }}>
          <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
          <span className="text-sm font-medium" style={{ color: GOLD }}>AI Talent Sourcing</span>
        </div>
        <h2 className="text-2xl font-bold mb-1" style={{ ...SERIF, color: TEXT_DARK }}>Find your next great hire</h2>
        <p className="text-sm" style={{ color: MUTED }}>Describe the person you're looking for. We'll search the web for real, public profiles near you.</p>
      </div>

      <div className="p-5 rounded-xl mb-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="col-span-1">
            <Label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>Zip Code *</Label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: GOLD }} />
              <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="30305" className="pl-8 bg-white text-[#1A1A1A]" />
            </div>
          </div>
          <div className="col-span-1">
            <Label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>Radius (mi)</Label>
            <Input type="number" min="5" max="100" value={radius} onChange={(e) => setRadius(parseInt(e.target.value) || 25)} className="bg-white text-[#1A1A1A]" />
          </div>
          <div className="col-span-1 flex items-end">
            <Button onClick={handleSearch} disabled={loading} className="w-full" style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching...</> : <><Search className="w-4 h-4 mr-2" /> Search</>}
            </Button>
          </div>
        </div>

        <Label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>Describe who you're looking for</Label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Find real estate agents who might be interested in a sales career change"
          rows={3}
          className="w-full rounded-md p-3 text-sm bg-white text-[#1A1A1A] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#B8956A]"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => setInput(s)} className="text-xs px-3 py-1.5 rounded-full transition-colors"
              style={{ backgroundColor: "rgba(184,149,106,0.08)", color: GOLD, border: "1px solid rgba(184,149,106,0.15)" }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg mb-4 text-sm" style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }}>{error}</div>}

      {result && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Search Results</h3>
            <Button onClick={() => onProspectsFound && onProspectsFound(result)} size="sm" style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
              <Users className="w-4 h-4 mr-1" /> Review Prospects
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-2xl font-bold" style={{ color: GOLD }}>{result.fresh_prospects?.length || 0}</p><p className="text-xs" style={{ color: MUTED }}>New Prospects</p></div>
            <div><p className="text-2xl font-bold" style={{ color: MUTED }}>{result.seniority_filtered || 0}</p><p className="text-xs" style={{ color: MUTED }}>Seniority Filtered</p></div>
            <div><p className="text-2xl font-bold" style={{ color: MUTED }}>{result.location_filtered || 0}</p><p className="text-xs" style={{ color: MUTED }}>Location Filtered</p></div>
          </div>
        </div>
      )}
    </div>
  );
}