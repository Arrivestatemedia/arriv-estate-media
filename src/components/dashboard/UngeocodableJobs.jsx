import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPinOff } from "lucide-react";

function waitForGoogle() {
  return new Promise((resolve) => {
    if (window.google?.maps?.Geocoder) return resolve(true);
    let tries = 0;
    const t = setInterval(() => {
      if (window.google?.maps?.Geocoder) {
        clearInterval(t);
        resolve(true);
      } else if (++tries > 40) {
        clearInterval(t);
        resolve(false);
      }
    }, 250);
  });
}

async function geocodeAddress(address) {
  const ok = await waitForGoogle();
  if (!ok) return null;
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

// Surfaces open jobs whose address Google can't geocode, so the admin can
// fix the address or manually decide which partners should see each job.
// (Un-geocodable jobs are hidden from coverage-filtered partners by JobBoard.)
export default function UngeocodableJobs({ jobs }) {
  const [failed, setFailed] = useState([]);
  const [checking, setChecking] = useState(true);
  const cache = useRef({});

  useEffect(() => {
    let cancelled = false;
    const openJobs = (jobs || []).filter((j) => j.status === "open" && j.location);
    (async () => {
      setChecking(true);
      const failures = [];
      for (const job of openJobs) {
        if (cancelled) return;
        if (cache.current[job.location] === undefined) {
          cache.current[job.location] = await geocodeAddress(job.location);
        }
        if (!cache.current[job.location]) failures.push(job);
      }
      if (!cancelled) {
        setFailed(failures);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  if (!checking && failed.length === 0) return null;

  return (
    <Card className="border-2 border-amber-300 bg-amber-50 mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-amber-900 flex items-center gap-2">
          <MapPinOff className="w-4 h-4" />
          {checking
            ? "Checking job locations…"
            : `Jobs with unverifiable locations (${failed.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-amber-800/80">
          These jobs' addresses couldn't be confirmed on the map, so they won't
          show up for partners filtered by coverage area. Fix the address, or
          tell us which partners should see each one.
        </p>
        {failed.map((job) => (
          <div
            key={job.id}
            className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1A1A1A] truncate">
                {job.title}
              </p>
              <p className="text-xs text-[#1A1A1A]/60 truncate">
                📍 {job.location}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}