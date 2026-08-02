import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon, Loader2 } from "lucide-react";
import { listProspects, geocodeLocations } from "@/lib/recruitingApi";

export default function PipelineMapView() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await listProspects({ limit: 200 });
        const all = res.prospects || [];
        setProspects(all);

        // Geocode prospects that don't have lat/lon
        const needsGeocoding = all.filter((p) => !p.lat || !p.lon);
        if (needsGeocoding.length > 0) {
          setGeocoding(true);
          const ids = needsGeocoding.slice(0, 30).map((p) => p.id); // cap at 30 for Nominatim rate limit
          try {
            const geoRes = await geocodeLocations(ids);
            if (geoRes.locations) {
              const geoMap = {};
              geoRes.locations.forEach((l) => { geoMap[l.id] = l; });
              setProspects((prev) =>
                prev.map((p) => (geoMap[p.id] ? { ...p, lat: geoMap[p.id].lat, lon: geoMap[p.id].lon } : p))
              );
            }
          } catch (e) {
            // geocoding is best-effort
          } finally {
            setGeocoding(false);
          }
        }
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const mapped = prospects.filter((p) => p.lat && p.lon);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#FFFBF5]">
        <Loader2 className="w-8 h-8 text-[#B8956A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#FFFBF5]">
      <div className="bg-white border-b border-[#B8956A]/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-[#B8956A]" />
          <h1 className="text-xl font-bold text-[#1A1A1A]">Prospect Map</h1>
          {geocoding && (
            <span className="text-sm text-[#1A1A1A]/50 flex items-center gap-1.5 ml-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Geocoding locations...
            </span>
          )}
        </div>
        <p className="text-sm text-[#1A1A1A]/60 mt-0.5">
          {mapped.length} of {prospects.length} prospects mapped
        </p>
      </div>

      <div className="flex-1 relative">
        {mapped.length > 0 ? (
          <MapContainer
            center={[mapped[0].lat, mapped[0].lon]}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            {mapped.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lon]}
                radius={7}
                fillColor="#B8956A"
                color="#1A1A1A"
                weight={1.5}
                fillOpacity={0.8}
              >
                <Popup>
                  <div style={{ minWidth: "180px" }}>
                    <strong>{p.name}</strong>
                    <br />
                    {p.title} {p.company && `· ${p.company}`}
                    <br />
                    <span style={{ color: "#666", fontSize: "12px" }}>{p.location}</span>
                    <br />
                    <span style={{ color: "#B8956A", fontSize: "11px", textTransform: "capitalize" }}>
                      Status: {p.status}
                    </span>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MapIcon className="w-10 h-10 text-[#B8956A]/30 mb-3" />
            <p className="text-[#1A1A1A] font-medium">No mapped prospects</p>
            <p className="text-sm text-[#1A1A1A]/50 mt-1">
              Prospects with location data will appear on the map after geocoding
            </p>
          </div>
        )}
      </div>
    </div>
  );
}