import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key, MapPin, Calendar, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  getPropertyAccessProvider,
  PROVIDER_SENTRILOCK,
  PROVIDER_SUPRA,
  PROVIDER_UNKNOWN,
} from "@/lib/propertyAccessProvider";

function providerLabel(provider) {
  if (provider === PROVIDER_SENTRILOCK) return "Sentri";
  if (provider === PROVIDER_SUPRA) return "Supra";
  return "lockbox";
}

function selectionDisplay(job) {
  if (job.client_access_selection === "on_site") return "The client will be on site";
  if (job.client_access_selection === "lockbox") {
    return `The client has provided access through ${providerLabel(getPropertyAccessProvider(job))}`;
  }
  return "Access selection pending";
}

export default function AccessSelectionCard({ job, clientEmail, onSubmitted }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const provider = getPropertyAccessProvider(job);
  const label = providerLabel(provider);
  const lockboxLabel =
    provider === PROVIDER_UNKNOWN ? "Grant lockbox access" : `Grant ${label} lockbox access`;

  const alreadySelected = job.client_access_selection && job.client_access_selection !== "pending";

  const handleSelect = async (selection) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("manageClientAccessSelection", {
        jobId: job.id,
        selection,
        clientEmail,
      });
      const data = res.data || res;
      setResult(data.display || selectionDisplay({ ...job, client_access_selection: selection }));
      if (onSubmitted) onSubmitted();
    } catch (e) {
      setError(e.message || "Could not submit your selection.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-2 border-[#B8956A]/40 bg-[#B8956A]/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#B8956A]/15 rounded-full flex items-center justify-center">
            <Key className="w-5 h-5 text-[#B8956A]" />
          </div>
          <div>
            <CardTitle className="text-lg text-[#1A1A1A]">Property Access Required</CardTitle>
            <p className="text-sm text-[#1A1A1A]/60">
              Let us know how your Media Specialist will access the property.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm text-[#1A1A1A]/80">
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#B8956A]" />
            {job.location}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[#B8956A]" />
            {job.date}
          </span>
          {job.start_time && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#B8956A]" />
              {job.start_time}
            </span>
          )}
        </div>

        {result || alreadySelected ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-900">{result || selectionDisplay(job)}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              onClick={() => handleSelect("on_site")}
              disabled={submitting}
              variant="outline"
              className="border-[#B8956A] text-[#1A1A1A] hover:bg-[#B8956A]/10"
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              I'll be on site
            </Button>
            <Button
              onClick={() => handleSelect("lockbox")}
              disabled={submitting}
              className="bg-[#B8956A] hover:bg-[#A68559] text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {lockboxLabel}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}