import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { US_STATES } from "@/lib/usStates";

export default function CoverageAreaSettings() {
  const queryClient = useQueryClient();
  const [zip, setZip] = useState("");
  const [state, setState] = useState("");
  const [maxDistance, setMaxDistance] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const email =
    localStorage.getItem("user_email") || sessionStorage.getItem("user_email");

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!email) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const res = await base44.functions.invoke("getCoverageArea", { email });
        if (!mounted) return;
        const rec = res?.data;
        const storedZip = rec?.zip || rec?.coverage_area || "";
        setZip(/^\d{5}$/.test(storedZip) ? storedZip : "");
        setState(rec?.state || "");
        setMaxDistance(
          rec?.max_travel_distance ? String(rec.max_travel_distance) : ""
        );
      } catch (e) {
        // ignore — user may not be loaded yet
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [email]);

  const handleSave = async () => {
    setError("");
    setSuccess(false);
    if (!email) {
      setError("Please sign in to save your work area.");
      return;
    }
    const cleanZip = zip.trim();
    if (!/^\d{5}$/.test(cleanZip)) {
      setError("Please enter your 5-digit ZIP code.");
      return;
    }
    if (!state) {
      setError("Please select your state.");
      return;
    }
    const distance = Number(maxDistance);
    if (!maxDistance || isNaN(distance) || distance <= 0) {
      setError("Please enter how far you'll travel, in miles.");
      return;
    }

    setSaving(true);
    try {
      const res = await base44.functions.invoke("saveCoverageArea", {
        email,
        zip: cleanZip,
        state,
        max_travel_distance: distance,
      });
      if (!res?.data?.success) {
        setError(res?.data?.error || "Failed to save your work area.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["user-record"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["coverage-area"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to save your work area.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-[#B8956A]/20">
      <CardHeader>
        <CardTitle className="text-[#1A1A1A] flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          My Work Area
        </CardTitle>
        <CardDescription>
          Your ZIP code is the center of your work area. We'll only show you and
          notify you about gigs within the travel range you set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/60">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">ZIP Code</Label>
                <Input
                  value={zip}
                  onChange={(e) => setZip(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                  placeholder="e.g. 20886"
                  inputMode="numeric"
                  className="border-[#B8956A]/30"
                />
              </div>
              <div>
                <Label className="mb-2 block">State</Label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full h-10 rounded-md border border-[#B8956A]/30 bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#B8956A] focus:outline-none"
                >
                  <option value="">Select your state</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label className="mb-2 block">How far will you travel? (miles)</Label>
              <Input
                type="number"
                min="1"
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
                placeholder="e.g. 50"
                className="border-[#B8956A]/30"
              />
              <p className="text-xs text-[#1A1A1A]/50 mt-1">
                Gigs further than this from your ZIP code won't be shown to you or sent to you.
              </p>
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}
            {success && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Work area saved.
              </div>
            )}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {saving ? "Saving..." : "Save Work Area"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}