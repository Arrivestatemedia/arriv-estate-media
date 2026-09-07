import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, Phone, PhoneOff, Mail, Loader2, RefreshCw, Navigation, ChevronDown, ChevronUp, Building2, Tag, Sparkles, SlidersHorizontal, X, UserCheck, Users, UserPlus, Share2, Globe, History, Home, ExternalLink, FileText } from "lucide-react";
import InAppBrowser from "@/components/sales/InAppBrowser";
import RealtorListingsPage from "@/components/sales/RealtorListingsPage";
import ProspectBriefPanel from "@/components/sales/ProspectBriefPanel";

const CALL_STATES = { IDLE: "idle", CONNECTING: "connecting", RINGING: "ringing", IN_CALL: "in_call", ENDED: "ended" };

export default function ProspectingTab({ salesMemberId, active = true }) {
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
  const [claimingId, setClaimingId] = useState(null);
  const [claimError, setClaimError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [briefProspect, setBriefProspect] = useState(null);

  // In-app navigation history: one stack so Back/Forward move between the
  // listings view and any opened listing/website pages, exactly like a browser.
  // Each entry renders inline replacing its card.
  const [nav, setNav] = useState({ stack: [], index: -1 });
  const current = nav.index >= 0 ? nav.stack[nav.index] : null;
  const canBack = nav.index > 0;
  const canForward = nav.index >= 0 && nav.index < nav.stack.length - 1;

  // Cache of already-fetched listings per realtor, so navigating back from an
  // opened listing restores the list instantly without re-fetching.
  const listingsCacheRef = useRef({});
  const realtorKey = (r) => `${r?.name || ""}||${r?.brokerage || ""}`;
  const pushView = (entry) => setNav(prev => {
    const stack = prev.stack.slice(0, prev.index + 1);
    stack.push({ ...entry, mode: entry.mode || "inTab" });
    return { stack, index: stack.length - 1 };
  });
  const navBack = () => setNav(prev => prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
  const navForward = () => setNav(prev => (prev.index >= 0 && prev.index < prev.stack.length - 1) ? { ...prev, index: prev.index + 1 } : prev);
  const closeView = () => setNav({ stack: [], index: -1 });
  const toggleCurrentMode = () => setNav(prev => ({
    ...prev,
    stack: prev.stack.map((e, i) => i === prev.index ? { ...e, mode: e.mode === "fullPage" ? "inTab" : "fullPage" } : e)
  }));
  const hostLabel = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  const openWebsite = (url, idx) => { if (!url) return; pushView({ kind: "website", url, idx }); };
  const showListings = (r, idx) => pushView({ kind: "listings", realtor: r, idx });
  const openListingFromListings = (url, idx) => pushView({ kind: "website", url, idx });

  // Saved prospecting searches (each fetch) — persisted locally so you can pull them back up
  const [savedSearches, setSavedSearches] = useState([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('prospect_saved_searches');
      if (raw) setSavedSearches(JSON.parse(raw));
    } catch {}
  }, []);
  const persistSearches = (list) => {
    setSavedSearches(list);
    try { localStorage.setItem('prospect_saved_searches', JSON.stringify(list)); } catch {}
  };
  const saveSearch = (entry) => {
    setSavedSearches(prev => {
      const filtered = prev.filter(s => s.id !== entry.id);
      const next = [entry, ...filtered].slice(0, 12);
      persistSearches(next);
      return next;
    });
  };
  const loadSearch = (entry) => {
    setCoords(entry.coords);
    setLocationLabel(entry.locationLabel || '');
    setRadius(entry.radius ?? 100);
    setKeywords(entry.keywords ?? '');
    setMinPrice(entry.minPrice ?? '');
    setMaxPrice(entry.maxPrice ?? '');
    setRealtors(entry.realtors || []);
    setPage(1);
    setNav({ stack: [], index: -1 });
    setError('');
    setGeoError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const deleteSearch = (id) => {
    setSavedSearches(prev => {
      const next = prev.filter(s => s.id !== id);
      persistSearches(next);
      return next;
    });
  };

  // Listings + listing-detail navigation are handled by the nav stack above
  // (showListings / openListingFromListings).

  // Search-tailoring controls
  const [radius, setRadius] = useState(100);
  const [keywords, setKeywords] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const hasFetchedRef = useRef(false);
  const paramsRef = useRef({ radius: 100, keywords: "", minPrice: "", maxPrice: "" });

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

  const handleClaim = async (r, idx) => {
    setClaimError("");
    setClaimingId(idx);
    try {
      const res = await base44.functions.invoke('claimProspectingContact', {
        salesMemberId,
        realtor: {
          name: r.name,
          email: r.email && !r.email.toLowerCase().includes('not found') ? r.email : '',
          phone: r.phone && !r.phone.toLowerCase().includes('not found') ? r.phone : '',
          brokerage: r.brokerage || '',
          listing_address: r.listing_address || '',
          listing_status: r.listing_status || '',
          price: r.price || '',
          social_media: r.social_media || []
        }
      });
      const data = res.data || {};
      setRealtors(prev => prev.map((it, i) => i === idx ? {
        ...it,
        db_exists: true,
        contact_id: data.contact?.id || it.contact_id,
        owner_id: data.contact?.owner_id || it.owner_id,
        owner_name: data.owner_name || it.owner_name,
        owned_by_me: data.owned_by_me ?? it.owned_by_me
      } : it));
    } catch (e) {
      setClaimError(e?.message || 'Failed to claim contact');
    } finally {
      setClaimingId(null);
    }
  };

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

  const currentParams = () => ({
    radiusMiles: radius,
    keywords,
    minPrice: minPrice === '' ? undefined : minPrice,
    maxPrice: maxPrice === '' ? undefined : maxPrice
  });

  const fetchRealtors = async (lat, lng, label, nextPage, append) => {
    (append ? setLoadingMore : setLoading)(true);
    setError("");
    hasFetchedRef.current = true;
    paramsRef.current = { radius, keywords, minPrice, maxPrice };
    let timer = null;
    if (!append) {
      setElapsed(0);
      const start = Date.now();
      timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    }
    try {
      const res = await base44.functions.invoke('findProspectingRealtors', {
        salesMemberId, lat, lng, locationLabel: label, page: nextPage, ...currentParams()
      });
      const data = res.data || {};
      const list = data.realtors || [];
      setRealtors(prev => append ? [...prev, ...list] : list);
      if (!append) setNav({ stack: [], index: -1 });
      setPage(nextPage);
      // Save each fresh fetch (page 1, not "load more") so it can be pulled back up later
      if (!append && list.length > 0) {
        saveSearch({
          id: `${lat},${lng},${radius},${keywords || ''},${minPrice || ''},${maxPrice || ''}`,
          locationLabel: label,
          coords: { lat, lng },
          radius,
          keywords,
          minPrice,
          maxPrice,
          realtors: list,
          count: list.length,
          timestamp: Date.now()
        });
      }
    } catch (e) {
      setError(e?.message || 'Failed to find realtors');
    } finally {
      if (timer) clearInterval(timer);
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

  // Fetch once on first activation only (not on every tab click)
  useEffect(() => {
    if (!active || hasFetchedRef.current) return;
    pullNearby();
  }, [active]);

  const handleSearchCustom = () => {
    if (!customLocation.trim()) return;
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

  // Re-run search using the current location with the latest filter values
  const applyFilters = () => {
    if (!coords) { pullNearby(); return; }
    fetchRealtors(coords.lat, coords.lng, locationLabel, 1, false);
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
                  {locationLabel ? `Realtors near ${locationLabel} (${radius} mi)` : 'AI finds realtors with photo- and video-less listings near you'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowFilters(s => !s)} disabled={loading} className="gap-2">
                <SlidersHorizontal className="w-4 h-4" /> Filters
              </Button>
              <Button size="sm" variant="outline" onClick={pullNearby} disabled={loading} className="gap-2">
                <MapPin className="w-4 h-4" /> My Location
              </Button>
              <Button size="sm" onClick={applyFilters} disabled={loading || !coords} className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>

          {/* Refine search panel */}
          {showFilters && (
            <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'rgba(184,149,106,0.25)', backgroundColor: 'rgba(184,149,106,0.05)' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>Refine search</span>
                <button onClick={() => setShowFilters(false)} className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.7)' }}>Radius (miles): {radius}</label>
                  <input type="range" min={5} max={500} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-[#B8956A]" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.7)' }}>Keywords</label>
                  <Input placeholder="e.g. new construction, luxury, condo" value={keywords} onChange={(e) => setKeywords(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.7)' }}>Min price ($)</label>
                  <Input type="number" min={0} placeholder="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.7)' }}>Max price ($)</label>
                  <Input type="number" min={0} placeholder="No limit" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="h-9" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={applyFilters} disabled={loading || !coords} className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                  Apply &amp; Search
                </Button>
              </div>
            </div>
          )}

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
          {claimError && (
            <p className="text-xs text-red-600">{claimError}</p>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#B8956A' }} />
          <p className="mt-3 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>AI is finding realtors with photo- and video-less listings near you…</p>
          {elapsed > 0 && (
            <p className="mt-1 text-xs" style={{ color: 'rgba(26,26,26,0.45)' }}>
              {elapsed}s — this scans live listing sites for each agent, so it can take ~45–60s
            </p>
          )}
        </div>
      )}

      {/* Results */}
      {!loading && realtors.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: 'rgba(26,26,26,0.7)' }}>{realtors.length} realtor{realtors.length !== 1 ? 's' : ''} found</p>
          </div>

          {/* Recent searches — each saved fetch; click to restore that batch of realtors */}
          {savedSearches.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-medium flex-shrink-0 flex items-center gap-1" style={{ color: 'rgba(26,26,26,0.5)' }}>
                <History className="w-3.5 h-3.5" /> Recent:
              </span>
              {savedSearches.map((s, si) => (
                <button
                  key={si}
                  onClick={() => loadSearch(s)}
                  className="text-xs px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 flex-shrink-0 hover:bg-[rgba(184,149,106,0.1)] transition-colors"
                  style={{ borderColor: 'rgba(184,149,106,0.35)', color: '#B8956A', backgroundColor: 'rgba(184,149,106,0.06)' }}
                  title={new Date(s.timestamp).toLocaleString()}
                >
                  <MapPin className="w-3 h-3" />
                  <span className="font-medium max-w-[140px] truncate">{s.locationLabel || 'Search'}</span>
                  <span className="opacity-60">· {s.radius}mi · {s.count}</span>
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); deleteSearch(s.id); }}
                    className="ml-0.5 opacity-50 hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3">
            {realtors.map((r, idx) => (
              current && current.idx === idx && current.kind === "website" ? (
                <InAppBrowser
                  key={idx}
                  url={current.url}
                  mode={current.mode}
                  onMinimize={closeView}
                  onClose={closeView}
                  onToggleFull={toggleCurrentMode}
                  onBack={navBack}
                  onForward={navForward}
                  canBack={canBack}
                  canForward={canForward}
                />
              ) : current && current.idx === idx && current.kind === "listings" ? (
                <RealtorListingsPage
                  key={idx}
                  realtor={current.realtor}
                  salesMemberId={salesMemberId}
                  locationLabel={locationLabel}
                  lat={coords?.lat}
                  lng={coords?.lng}
                  mode={current.mode}
                  cachedListings={listingsCacheRef.current[realtorKey(current.realtor)]}
                  onCacheListings={(list) => {
                    const k = realtorKey(current.realtor);
                    listingsCacheRef.current[k] = list;
                  }}
                  onMinimize={closeView}
                  onClose={closeView}
                  onToggleFull={toggleCurrentMode}
                  onBack={navBack}
                  onForward={navForward}
                  canBack={canBack}
                  canForward={canForward}
                  onOpenListing={(url) => openListingFromListings(url, idx)}
                />
              ) : (
              <Card key={idx} className="overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => showListings(r, idx)}
                          className="font-semibold text-base text-left inline-flex items-center gap-1.5 hover:underline"
                          style={{ color: '#1A1A1A' }}
                          title="View this agent's other listings"
                        >
                          {r.name || 'Unknown agent'}
                          <Home className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                        </button>
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
                        <div className="flex flex-wrap items-center gap-2">
                          {r.listing_status && (
                            <Badge variant="outline" className="text-xs">{r.listing_status}</Badge>
                          )}
                          {r.price && r.price !== 'Unknown' && (
                            <Badge variant="outline" className="text-xs gap-1"><Tag className="w-3 h-3" />{r.price}</Badge>
                          )}
                          {(() => {
                            // STRICT: "View Listing" ONLY opens a verified Zillow.com or
                            // Realtor.com property-DETAIL page whose path matches this
                            // listing's address. ANYTHING else (other sites, search pages,
                            // wrong property, or stale cached links) falls back to a Google
                            // search for the exact address. NO EXCEPTIONS.
                            const trustedDetail = (url, addr) => {
                              try {
                                const raw = String(url || "").trim();
                                if (!raw || raw.toLowerCase().includes("not found")) return false;
                                const u = raw.toLowerCase();
                                const host = new URL(raw).hostname.replace(/^www\./, "");
                                const isZillow = host === "zillow.com" || host.endsWith(".zillow.com");
                                const isRealtor = host === "realtor.com" || host.endsWith(".realtor.com");
                                if (!isZillow && !isRealtor) return false;
                                const path = new URL(raw).pathname.toLowerCase();
                                if (isZillow && !path.includes("/homedetails/")) return false;
                                if (isRealtor && !path.includes("/realestateandhomes-detail/")) return false;
                                const full = String(addr || "").toLowerCase();
                                const street = full.split(",")[0].trim();
                                const number = (street.match(/\d+/) || [])[0] || "";
                                const toks = street.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
                                const stateMatch = full.match(/,\s*([a-z]{2})\s+\d{5}/);
                                const state = stateMatch ? stateMatch[1] : "";
                                const zipMatch = full.match(/\b(\d{5})\b/);
                                const zip = zipMatch ? zipMatch[1] : "";
                                const pathTokens = u.split(/[^a-z0-9]+/).filter(Boolean);
                                const hasNumber = number && pathTokens.includes(number);
                                const hasName = toks.length === 0 ? true : toks.some((t) => pathTokens.some((pt) => pt.includes(t)));
                                const hasState = state && pathTokens.includes(state);
                                const hasZip = zip && pathTokens.includes(zip);
                                return !!(hasNumber && hasName && hasState && hasZip);
                              } catch { return false; }
                            };
                            const direct = trustedDetail(r.listing_url, r.listing_address) ? String(r.listing_url).trim() : "";
                            const google = r.listing_address
                              ? `https://www.google.com/search?q=${encodeURIComponent(`${r.listing_address} ${r.name || ""} ${r.brokerage || ""} for sale zillow`)}`
                              : "";
                            const href = direct || google;
                            if (!href) return null;
                            // Direct anchor (target=_blank): a synchronous user-gesture
                            // navigation, so it is never popup-blocked (unlike the
                            // InAppBrowser's async window.open in a useEffect, which
                            // browsers block for Zillow/Realtor.com). Opens the exact
                            // trusted Zillow/Realtor.com page or a Google search.
                            return direct ? (
                              <a
                                href={direct}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-medium rounded-md border hover:bg-[rgba(184,149,106,0.1)] transition-colors"
                                style={{ borderColor: 'rgba(184,149,106,0.4)', color: '#B8956A' }}
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> View Listing
                              </a>
                            ) : (
                              <a
                                href={google}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-medium rounded-md border hover:bg-[rgba(184,149,106,0.08)] transition-colors"
                                style={{ borderColor: 'rgba(184,149,106,0.3)', color: 'rgba(26,26,26,0.6)' }}
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Search Listing
                              </a>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 md:items-end flex-shrink-0">
                      <Button size="sm" onClick={() => startCall(r)} disabled={callState !== CALL_STATES.IDLE && callState !== CALL_STATES.ENDED} className="gap-2" style={{ backgroundColor: '#16a34a', color: 'white' }}>
                        <Phone className="w-4 h-4" /> Call
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setBriefProspect(r)}
                        className="gap-1.5 h-8 text-xs"
                        style={{ borderColor: '#B8956A', color: '#B8956A' }}
                      >
                        <FileText className="w-3.5 h-3.5" /> Prospect Brief
                      </Button>
                      {r.email && !r.email.toLowerCase().includes('not found') && (
                        <button
                          onClick={() => window.dispatchEvent(new CustomEvent('openEmailComposer', { detail: { email: r.email } }))}
                          className="text-xs flex items-center gap-1 hover:underline"
                          style={{ color: '#B8956A', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                          title="Open in Email Hub"
                        >
                          <Mail className="w-3.5 h-3.5" /> {r.email}
                        </button>
                      )}
                      {r.phone && !r.phone.toLowerCase().includes('not found') && (
                        <p className="text-xs" style={{ color: 'rgba(26,26,26,0.6)' }}>{r.phone}</p>
                      )}
                      {r.website && !r.website.toLowerCase().includes('not found') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openWebsite(r.website, idx, r.name)}
                          className="gap-1.5 h-8 text-xs"
                          style={{ borderColor: 'rgba(184,149,106,0.4)', color: '#B8956A' }}
                        >
                          <Globe className="w-3.5 h-3.5" /> View Website
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Database ownership status */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {r.db_exists && r.owned_by_me && (
                      <Badge className="gap-1" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                        <UserCheck className="w-3 h-3" /> Owned by you
                      </Badge>
                    )}
                    {r.db_exists && !r.owned_by_me && r.owner_name && (
                      <Badge className="gap-1" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                        <Users className="w-3 h-3" /> In database · {r.owner_name}
                      </Badge>
                    )}
                    {r.db_exists && !r.owned_by_me && !r.owner_name && (
                      <>
                        <Badge className="gap-1" style={{ backgroundColor: '#f1f5f9', color: 'rgba(26,26,26,0.6)' }}>
                          <Users className="w-3 h-3" /> In database · unassigned
                        </Badge>
                        <Button size="sm" variant="outline" onClick={() => handleClaim(r, idx)} disabled={claimingId === idx} className="gap-1 h-7 text-xs" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
                          {claimingId === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />} Take Ownership
                        </Button>
                      </>
                    )}
                    {!r.db_exists && (
                      <Button size="sm" variant="outline" onClick={() => handleClaim(r, idx)} disabled={claimingId === idx} className="gap-1 h-7 text-xs" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
                        {claimingId === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />} Add to My Contacts
                      </Button>
                    )}
                  </div>

                  {/* Media verification notes */}
                  {r.verification_notes && (
                    <p className="mt-2 text-xs" style={{ color: 'rgba(26,26,26,0.55)' }}>
                      Verified: {r.verification_notes}
                    </p>
                  )}

                  {/* Social media */}
                  {r.social_media_links && r.social_media_links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.social_media_links.map((link, li) => (
                        <button
                          key={li}
                          onClick={() => openWebsite(link, idx, r.name)}
                          className="text-xs px-2 py-1 rounded-md border flex items-center gap-1 hover:bg-[rgba(184,149,106,0.1)] transition-colors"
                          style={{ borderColor: 'rgba(184,149,106,0.3)', color: '#B8956A' }}
                        >
                          <Share2 className="w-3 h-3" /> {hostLabel(link)}
                        </button>
                      ))}
                    </div>
                  )}

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
              )
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

      {/* browser renders inline within the results grid (or standalone above when opened from saved sites) */}

      {/* Prospect Brief / Call Prep modal */}
      {briefProspect && (
        <ProspectBriefPanel
          prospect={briefProspect}
          salesMemberId={salesMemberId}
          onClose={() => setBriefProspect(null)}
        />
      )}

    </div>
  );
}