import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MapPin, AlertCircle, Check, RefreshCw, ShieldCheck } from "lucide-react";

const PROVIDER_ORDER = ["fmls", "georgia_mls", "bright_mls"];

const CERT_LABELS = [
  { key: "authentication", label: "Authentication" },
  { key: "manifest", label: "Manifest" },
  { key: "media_accessibility", label: "Media accessibility" },
  { key: "authorized_import", label: "Authorized import" },
];

const toList = (value) => String(value || "").split(",").map((v) => v.trim()).filter(Boolean);
const fromList = (list) => (Array.isArray(list) ? list.join(", ") : "");

/**
 * MlsServiceAreasPanel
 * The verified map that decides which MLS a property belongs to. Customers never see this — they
 * only ever see the route it produces. Every address has a route: matching decides the provider, and
 * anything ambiguous or not yet mapped is queued for our MLS team rather than being refused.
 */
export default function MlsServiceAreasPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [regions, setRegions] = useState([]);
  const [providers, setProviders] = useState([]);

  const applyPayload = (payload) => {
    if (payload?.regions) setRegions(payload.regions);
    if (payload?.providers) setProviders(payload.providers);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("manageMlsServiceAreas", { action: "list" });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      applyPayload(data);
    } catch (err) {
      setError(err.message || "Could not load MLS service areas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchRegion = (id, patch) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const saveRegions = async () => {
    setSaving("regions");
    setError(null);
    setNotice(null);
    try {
      const res = await base44.functions.invoke("manageMlsServiceAreas", {
        action: "save_regions",
        regions,
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      if (data?.regions) setRegions(data.regions);
      setNotice("Service areas saved");
    } catch (err) {
      setError(err.message || "Could not save the service areas");
    } finally {
      setSaving(null);
    }
  };

  const setProvider = async (providerId, patch) => {
    setSaving(providerId);
    setError(null);
    setNotice(null);
    try {
      const res = await base44.functions.invoke("manageMlsServiceAreas", {
        action: "set_provider",
        provider_id: providerId,
        ...patch,
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      applyPayload(data);
      setNotice("Provider settings saved");
    } catch (err) {
      setError(err.message || "Could not save the provider settings");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-2 text-sm text-[#1A1A1A]/50">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading service areas...
      </Card>
    );
  }

  const ordered = [...regions].sort(
    (a, b) => PROVIDER_ORDER.indexOf(a.provider_id) - PROVIDER_ORDER.indexOf(b.provider_id),
  );
  const providersNeedingCert = providers.filter((p) => p.requires_certification);

  return (
    <div className="space-y-4">
      {error && (
        <Card className="p-3 text-xs text-red-700 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
        </Card>
      )}
      {notice && (
        <Card className="p-3 text-xs text-[#8a6d4a] bg-[#B8956A]/10 border-[#B8956A]/30 flex items-center gap-2">
          <Check className="w-3.5 h-3.5" /> {notice}
        </Card>
      )}

      <Card className="p-3 text-xs text-[#1A1A1A]/60 space-y-1">
        <p className="font-medium text-[#1A1A1A]/75 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#B8956A]" /> How routing works
        </p>
        <p>
          The property's booking address is matched most-specific-first: zip prefix, then county, then city,
          then state. Every address gets a route — customers are never told MLS publishing is unavailable.
          An address that matches nothing, or matches two providers, goes to the MLS Upload Queue for a
          decision, and that is where coverage should be widened.
        </p>
      </Card>

      {ordered.map((region) => (
        <Card key={region.id} className="p-3 space-y-2.5 border-[#B8956A]/20">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-[#1A1A1A]">{region.label}</p>
              <p className="text-[11px] text-[#1A1A1A]/45">
                {region.provider_id} · {region.id}
                {region.verified && region.verified_by ? ` · verified by ${region.verified_by}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[#1A1A1A]/60">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!region.enabled}
                  onChange={(e) => patchRegion(region.id, { enabled: e.target.checked })}
                  className="w-3.5 h-3.5 accent-[#B8956A]"
                />
                Activated
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!region.verified}
                  onChange={(e) => patchRegion(region.id, { verified: e.target.checked })}
                  className="w-3.5 h-3.5 accent-[#B8956A]"
                />
                Verified
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/40 mb-1">States</p>
              <Input
                value={fromList(region.states)}
                onChange={(e) => patchRegion(region.id, { states: toList(e.target.value.toUpperCase()) })}
                placeholder="GA"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/40 mb-1">Zip prefixes</p>
              <Input
                value={fromList(region.zip_prefixes)}
                onChange={(e) => patchRegion(region.id, { zip_prefixes: toList(e.target.value) })}
                placeholder="300, 301, 302"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/40 mb-1">Counties</p>
              <Input
                value={fromList(region.counties)}
                onChange={(e) => patchRegion(region.id, { counties: toList(e.target.value) })}
                placeholder="Fulton, Gwinnett"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/40 mb-1">Cities</p>
              <Input
                value={fromList(region.cities)}
                onChange={(e) => patchRegion(region.id, { cities: toList(e.target.value) })}
                placeholder="Winder, Atlanta"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <Textarea
            value={region.notes || ""}
            onChange={(e) => patchRegion(region.id, { notes: e.target.value })}
            rows={2}
            placeholder="Verification notes — the provider documentation this coverage came from"
            className="text-xs"
          />
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={saveRegions} disabled={saving === "regions"} size="sm">
          {saving === "regions" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
          Save service areas
        </Button>
      </div>

      {providersNeedingCert.map((provider) => (
        <Card key={provider.id} className="p-3 space-y-2 border-[#B8956A]/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-[#1A1A1A] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#B8956A]" /> {provider.label} integration
              </p>
              <p className="text-[11px] text-[#1A1A1A]/45">
                {provider.live_for_customers
                  ? "Live — certified and activated"
                  : "Not automated yet. Requests are published by hand until every test below is passed."}
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-[#1A1A1A]/60">
              <input
                type="checkbox"
                checked={!!provider.enabled}
                onChange={(e) => setProvider(provider.id, { enabled: e.target.checked })}
                className="w-3.5 h-3.5 accent-[#B8956A]"
              />
              Activated
            </label>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {CERT_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 text-[11px] text-[#1A1A1A]/70">
                <input
                  type="checkbox"
                  checked={!!provider.certification?.[key]}
                  onChange={(e) => setProvider(provider.id, { certification: { [key]: e.target.checked } })}
                  className="w-3.5 h-3.5 accent-[#B8956A]"
                />
                {label}
              </label>
            ))}
          </div>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} className="border-[#B8956A]/40 text-[#8a6d4a]">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reload
        </Button>
      </div>
    </div>
  );
}