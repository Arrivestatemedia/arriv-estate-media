import React, { useState, useEffect } from "react";
import { listProspects, geocodeLocations } from "@/lib/recruitingApi";
import { MapContainer, TileLayer, Circle, Marker, Popup } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, RefreshCw } from "lucide-react";
import L from "leaflet";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

// Fix default marker icon for Leaflet in bundler environments
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function PipelineMapView() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listProspects({ limit: 200 });
      setProspects((data.prospects || []).filter((p) => p.location_lat && p.location_lng));
    } catch (_) {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleGeocode = async () => {
    setGeocoding(true);
    try { await geocodeLocations(); await load(); } catch (_) {} finally { setGeocoding(false); }
  };

  const hasCoords = prospects.length > 0;
  const center = hasCoords ? [prospects[0].location_lat, prospects[0].location_lng] : [33.749, -84.388]; // Atlanta default

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Prospect Map</h2>
        <Button onClick={handleGeocode} disabled={geocoding} variant="outline" style={{ borderColor: GOLD, color: GOLD }}>
          {geocoding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Geocode Missing
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>
      ) : !hasCoords ? (
        <div className="text-center py-20">
          <MapPin className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="font-medium" style={{ color: TEXT_DARK }}>No geocoded prospects yet</p>
          <p className="text-sm mt-1" style={{ color: MUTED }}>Click "Geocode Missing" to map prospect locations.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(184,149,106,0.3)" }}>
          <MapContainer center={center} zoom={9} style={{ height: "500px", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
            {prospects.map((p) => (
              <Marker key={p.id} position={[p.location_lat, p.location_lng]}>
                <Popup>
                  <div>
                    <strong>{p.full_name}</strong>
                    <br />{p.current_title}
                    {p.current_company && <><br />{p.current_company}</>}
                    {p.public_location && <><br />{p.public_location}</>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}