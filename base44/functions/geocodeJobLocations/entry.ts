import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Server-side batch geocoder for the Job Board. Uses the same Google Maps
// REST endpoint that notifyContractorsNewJob uses successfully — this avoids
// the client-side JS Geocoder, which fails when the API key has HTTP referrer
// restrictions that don't include the app domain.
// Input:  { addresses: ["20886", "9809 DellCastle Rd., Gaithersburg, MD", ...] }
// Output: { results: { "<address>": { lat, lng } | null, ... } }

const geocode = async (address, gmapsKey) => {
  if (!gmapsKey || !address) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${gmapsKey}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 'OK' && json.results && json.results[0]) {
      const loc = json.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch (e) {
    console.error('Geocode failed for', address, ':', e.message);
  }
  return null;
};

Deno.serve(async (req) => {
  try {
    let addresses = [];
    try {
      const body = await req.json();
      addresses = Array.isArray(body?.addresses) ? body.addresses : [];
    } catch (_e) {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const gmapsKey = Deno.env.get('VITE_GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY');
    const unique = [...new Set(addresses.filter(Boolean))];
    const results = {};
    await Promise.all(unique.map(async (addr) => {
      results[addr] = await geocode(addr, gmapsKey);
    }));
    return Response.json({ results });
  } catch (error) {
    console.error('geocodeJobLocations error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});