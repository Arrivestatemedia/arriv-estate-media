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

export default function CoverageAreaSettings() {
  const queryClient = useQueryClient();
  const [coverageArea, setCoverageArea] = useState("");
  const [maxDistance, setMaxDistance] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!mounted) return;
        setCoverageArea(me?.coverage_area || "");
        setMaxDistance(
          me?.max_travel_distance ? String(me.max_travel_distance) : ""
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
  }, []);

  const geocode = (address) =>
    new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const tryGeocode = () => {
        if (window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ address }, (results, status) => {
            if (status === "OK" && results && results[0]) {
              const loc = results[0].geometry.location;
              resolve({ lat: loc.lat(), lng: loc.lng() });
            } else {
              reject(new Error("Could not find that address. Try being more specific."));
            }
          });
        } else if (Date.now() - startedAt > 10000) {
          reject(new Error("Maps failed to load. Please refresh the page and try again."));
        } else {
          setTimeout(tryGeocode, 400);
        }
      };
      tryGeocode();
    });

  const handleSave = async () => {
    setError("");
    setSuccess(false);
    if (!coverageArea.trim()) {
      setError("Please enter a coverage area.");
      return;
    }
    const distance = Number(maxDistance);
    if (!maxDistance || isNaN(distance) || distance <= 0) {
      setError("Please enter a valid maximum travel distance in miles.");
      return;
    }
    setSaving(true);
    try {
      // Save the preference immediately so the user is never blocked
      await base44.auth.updateMe({
        coverage_area: coverageArea.trim(),
        coverage_lat: null,
        coverage_lng: null,
        max_travel_distance: distance,
      });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      // Best-effort geocoding in the background to populate lat/lng
      geocode(coverageArea.trim())
        .then(async ({ lat, lng }) => {
          await base44.auth.updateMe({ coverage_lat: lat, coverage_lng: lng });
          queryClient.invalidateQueries({ queryKey: ["jobs"] });
        })
        .catch(() => {});
    } catch (e) {
      setError(e.message || "Failed to save coverage area.");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError("");
    try {
      await base44.auth.updateMe({
        coverage_area: "",
        coverage_lat: null,
        coverage_lng: null,
        max_travel_distance: null,
      });
      setCoverageArea("");
      setMaxDistance("");
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch (e) {
      setError(e.message || "Failed to clear coverage area.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-[#B8956A]/20">
      <CardHeader>
        <CardTitle className="text-[#1A1A1A] flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Coverage Area
        </CardTitle>
        <CardDescription>
          Set where you'll work and how far you'll travel. We'll only show you gigs
          within your selected range.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/60">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <div>
              <Label className="mb-2 block">Preferred Coverage Area</Label>
              <Input
                value={coverageArea}
                onChange={(e) => setCoverageArea(e.target.value)}
                placeholder="City, State or full address"
                className="border-[#B8956A]/30"
              />
              <p className="text-xs text-[#1A1A1A]/50 mt-1">
                Enter a city, ZIP code, or specific address as the center of your
                coverage area.
              </p>
            </div>
            <div>
              <Label className="mb-2 block">Maximum Travel Distance (miles)</Label>
              <Input
                type="number"
                min="1"
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
                placeholder="e.g. 50"
                className="border-[#B8956A]/30"
              />
              <p className="text-xs text-[#1A1A1A]/50 mt-1">
                We'll only show you gigs within this distance of your coverage area.
              </p>
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}
            {success && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Coverage preferences saved.
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {saving ? "Saving..." : "Save Preferences"}
              </Button>
              {(coverageArea || maxDistance) && (
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={saving}
                >
                  Clear
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}