import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, Phone, PhoneOff, Mail, Loader2, RefreshCw, Navigation, ChevronDown, ChevronUp, Building2, Tag, Sparkles } from "lucide-react";

const CALL_STATES = { IDLE: "idle", CONNECTING: "connecting", RINGING: "ringing", IN_CALL: "in_call", ENDED: "ended" };

export default function ProspectingTab({ salesMemberId }) {
  const [coords, setCoords] = useState(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [realtors, setRealtors] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [geoError, setGeoError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [callState, setCallState] = useState(CALL_STATES.IDLE);
  const [callingName, setCallingName] = useState("");
  const [callError, setCallError] = useState("");

  const deviceRef = useRef(null);
  const callRef = useRef(null);

  // ── Twilio Device for click-to-call ──────────────────────────────────
  const loadTwilioSdk = () => new Promise((resolve, reject) => {
    if (window.Twilio?.Device) { resolve(); return; }
    const existing = document.getElementById('twilio-sdk-script');
    if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
    const s = document.createElement('script');
    s.id = 'twilio-sdk-script';
    s.src = 'https://sdk.twilio.com/js/voice/releases/2.10.0/twilio.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Unable to load Twilio SDK'));
    document.head.appendChild(s);
  });

  const initDevice = useCallback(async () => {
    if (!salesMemberId || deviceRef.current) return;
    try {
      await loadTwilioSdk();
      const res = await base44.functions.invoke('generateTwilioToken', { salesMemberId });
      const { token } = res.data || {};
      if (!token) { setCallError('No calling token available'); return; }
      const { Device } = window.Twilio;
      const d = new Device(token, { codecPreferences: ['opus', 'pcmu'], enableRingingState: true, logLevel: 1 });
      d.on('registered', () => {});
      d.on('error', (e) => { setCallError(e?.message || 'Twilio error'); setCallState(CALL_STATES.IDLE); });
      await d.register();
      deviceRef.current = d;
    } catch (e) {
      setCallError('Call line init failed: ' + (e?.message || String(e)));
    }
  }, [salesMemberId]);

  useEffect(() => {
    initDevice();
    return () => {
      try { deviceRef.current?.destroy?.(); } catch {}
      deviceRef.current = null;
    };
  }, [initDevice]);

  const startCall = async (realtor) => {
    const raw = (realtor.phone || '').trim();
    if (!raw || raw.toLowerCase().includes('not found')) {
      setCallError('No phone number available for ' + (realtor.name || 'this realtor'));
      return;
    }
    const digits = raw.replace(/\D/g, '');
    const phone = raw.startsWith('+') ? raw : '+1' + digits;
    if (digits.length < 10) { setCallError('Invalid phone number'); return; }

    setCallError('');
    setCallingName(realtor.name || 'realtor');
    setCallState(CALL_STATES.CONNECTING);
    try {
      const d = deviceRef.current;
      if (!d || d.state !== 'registered') { setCallError('Call line not ready yet — try again in a moment'); setCallState(CALL_STATES.IDLE); return; }
      const call = await d.connect({ params: { To: phone } });
      callRef.current = call;
      call.on('ringing', () => setCallState(CALL_STATES.RINGING));
      call.on('accept', () => setCallState(CALL_STATES.IN_CALL));
      call.on('disconnect', () => { setCallState(CALL_STATES.ENDED); callRef.current = null; });
      call.on('error', (e) => { setCallError(e.message || 'Call error'); setCallState(CALL_STATES.IDLE); callRef.current = null; });
    } catch (e) {
      setCallError('Call failed: ' + (e?.message || String(e)));
      setCallState(CALL_STATES.IDLE);
    }
  };

  const hangUp = () => { try { callRef.current?.disconnect?.(); } catch {} };

  // ── Geolocation + reverse geocode ───────────────────────────────────
  const reverseGeocode = async (lat, lng) => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10`, {
        headers: { 'Accept-Language': 'en' }
      });
      const d = await r.json();
      const a = d.address || {};
      const city = a.city || a.town || a.village || a.hamlet || a.county || '';
      const state = a.state || '';
      return [city, state].filter(Boolean).join(', ') || d.display_name?.split(',').slice(0, 3).join(',') || '';
    } catch { return ''; }
  };

  const fetchRealtors = async (lat, lng, label, nextPage, append) => {
    (append ? setLoadingMore : setLoading)(true);
    setError("");
    try {
      const res = await base44.functions.invoke('findProspectingRealtors', {
        salesMemberId, lat, lng, locationLabel: label, page: nextPage
      });
      const data = res.data || {};
      const list = data.realtors || [];
      setRealtors(prev => append ? [...prev, ...list] : list);
      setPage(nextPage);
    } catch (e) {
      setError(e?.message || 'Failed to find realtors');
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  };

  const pullNearby = () => {
    setGeoError("");
    if (!navigator.geolocation) { setGeoError("Geolocation not supported by this browser"); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      setCoords({ lat: latitude, lng: longitude });
      const label = await reverseGeocode(latitude, longitude);
      setLocationLabel(label);
      fetchRealtors(latitude, longitude, label, 1, false);
    }, (err) => {
      setGeoError(err.message || "Could not get your location. Allow location access or enter a city manually.");
    }, { enableHighAccuracy: true, timeout: 15000 });
  };

  // Auto-pull on mount using the rep's GPS
  useEffect(() => { pullNearby(); }, []);

  const handleSearchCustom = () => {
    if (!customLocation.trim()) return;
    // Geocode the typed location
    setGeoError("");
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(customLocation)}`)
      .then(r => r.json())
      .then(async (results) => {
        if (!results || results.length === 0) { setGeoError("Couldn't find that location"); return; }
        const { lat, lon } = results[0];
        setCoords({ lat: parseFloat(lat), lng: parseFloat(lon) });
        const label = customLocation.trim();
        setLocationLabel(label);
        fetchRealtors(parseFloat(lat), parseFloat(lon), label, 1, false);
      })
      .catch(() => setGeoError("Location lookup failed"));
  };

  const toggle = (idx) => setExpanded(p => ({ ...p, [idx]: !p[idx] }));

  return (
    <div className="space-y-4">
      {/* Header / controls */}
      <Card style={{ backgroundColor: '#FFFFFF' }}>
        <CardContent className="pt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                <Navigation className="w-5 h-5" style={{ color: '#B8956A' }} />
              </div>
              <div>
                <h2 className="font-bold text-lg" style={{ color: '#1A1A1A' }}>Prospecting</h2>
                <p className="text-xs" style={{ color: 'rgba(26,26,26,0.6)' }}>
                  {locationLabel ? `Realtors near ${locationLabel} (100 mi)` : 'AI finds realtors with photo/video-less listings near you'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={pullNearby} disabled={loading} className="gap-2">
                <MapPin className="w-4 h-4" /> My Location
              </Button>
              <Button size="sm" onClick={() => coords && fetchRealtors(coords.lat, coords.lng, locationLabel, 1, false)} disabled={loading || !coords} className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>

          {/* Manual location search */}
          <div className="flex gap-2">
            <Input placeholder="Or enter a city / ZIP (e.g. Lawrenceville, GA)" value={customLocation} onChange={(e) => setCustomLocation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchCustom()} className="flex-1" />
            <Button size="sm" variant="outline" onClick={handleSearchCustom} disabled={loading}>Search</Button>
          </div>

          {geoError && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{geoError}</p>}
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

          {/* Inline call status */}
          {callState !== CALL_STATES.IDLE && (
            <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: callState === CALL_STATES.IN_CALL ? '#dcfce7' : callState === CALL_STATES.ENDED ? '#f1f5f9' : '#fef3c7' }}>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4" />
                <span className="font-medium">{callingName}</span>
                <Badge variant="outline" className="ml-1 capitalize">{callState.replace('_', ' ')}</Badge>
                {callError && <span className="text-red-600">{callError}</span>}
              </div>
              {callState !== CALL_STATES.ENDED && callState !== CALL_STATES.IDLE && (
                <Button size="sm" variant="destructive" onClick={hangUp} className="gap-1"><PhoneOff className="w-3.5 h-3.5" /> Hang Up</Button>
              )}
            </div>
          )}
          {callState === CALL_STATES.IDLE && callError && (
            <p className="text-xs text-red-600">{callError}</p>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#B8956A' }} />
          <p className="mt-3 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>AI is finding realtors with photo-less listings near you…</p>
        </div>
      )}

      {/* Results */}
      {!loading && realtors.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: 'rgba(26,26,26,0.7)' }}>{realtors.length} realtor{realtors.length !== 1 ? 's' : ''} found</p>
          </div>
          <div className="grid gap-3">
            {realtors.map((r, idx) => (
              <Card key={idx} className="overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base" style={{ color: '#1A1A1A' }}>{r.name || 'Unknown agent'}</h3>
                        {r.distance_miles != null && (
                          <Badge className="gap-1" style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A' }}>
                            <MapPin className="w-3 h-3" /> {Math.round(r.distance_miles)} mi
                          </Badge>
                        )}
                      </div>
                      {r.brokerage && (
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'rgba(26,26,26,0.6)' }}>
                          <Building2 className="w-3.5 h-3.5" /> {r.brokerage}
                        </p>
                      )}
                      <div className="mt-2 space-y-1 text-sm">
                        {r.listing_address && (
                          <p className="flex items-start gap-1.5" style={{ color: 'rgba(26,26,26,0.8)' }}>
                            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#B8956A' }} />
                            <span>{r.listing_address}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {r.listing_status && (
                            <Badge variant="outline" className="text-xs">{r.listing_status}</Badge>
                          )}
                          {r.price && r.price !== 'Unknown' && (
                            <Badge variant="outline" className="text-xs gap-1"><Tag className="w-3 h-3" />{r.price}</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 md:items-end flex-shrink-0">
                      <Button size="sm" onClick={() => startCall(r)} disabled={callState !== CALL_STATES.IDLE && callState !== CALL_STATES.ENDED} className="gap-2" style={{ backgroundColor: '#16a34a', color: 'white' }}>
                        <Phone className="w-4 h-4" /> Call
                      </Button>
                      {r.email && !r.email.toLowerCase().includes('not found') && (
                        <a href={`mailto:${r.email}`} className="text-xs flex items-center gap-1 hover:underline" style={{ color: '#B8956A' }}>
                          <Mail className="w-3.5 h-3.5" /> {r.email}
                        </a>
                      )}
                      {r.phone && !r.phone.toLowerCase().includes('not found') && (
                        <p className="text-xs" style={{ color: 'rgba(26,26,26,0.6)' }}>{r.phone}</p>
                      )}
                    </div>
                  </div>

                  {/* Call script */}
                  <div className="mt-3 rounded-lg border" style={{ borderColor: 'rgba(184,149,106,0.25)', backgroundColor: 'rgba(184,149,106,0.05)' }}>
                    <button onClick={() => toggle(idx)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium" style={{ color: '#1A1A1A' }}>
                      <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" style={{ color: '#B8956A' }} /> Call Script</span>
                      {expanded[idx] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {expanded[idx] && (
                      <div className="px-3 pb-3 text-sm leading-relaxed" style={{ color: 'rgba(26,26,26,0.8)' }}>
                        {r.call_script || 'No script generated.'}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Load more (25 per page) */}
          <div className="flex justify-center pt-2 pb-4">
            <Button variant="outline" onClick={() => coords && fetchRealtors(coords.lat, coords.lng, locationLabel, page + 1, true)} disabled={loadingMore} className="gap-2">
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Find more realtors
            </Button>
          </div>
        </>
      )}

      {!loading && realtors.length === 0 && !error && !geoError && (
        <div className="text-center py-20">
          <Navigation className="w-10 h-10 mx-auto opacity-30" />
          <p className="mt-3 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>No realtors found yet. Try refreshing or searching a different area.</p>
        </div>
      )}
    </div>
  );
}