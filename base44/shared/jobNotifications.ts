// Shared helpers for job-notification backend functions.
// Plain module — no Deno.serve. Imported by notifyContractorsNewJob and
// notifyExpandedRadiusJob so geocoding, distance, and SMS logic live in one place.

export const geocode = async (address, gmapsKey) => {
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
    console.error('Geocode failed:', e.message);
  }
  return null;
};

export const haversineMiles = (lat1, lng1, lat2, lng2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// Twilio SMS via the app's company number. Returns the message SID on success.
export const sendTwilioSms = async (to, body) => {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials not configured');
  }
  const formData = new URLSearchParams({ From: fromNumber, To: to, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Failed to send SMS');
  return result.sid;
};

export const getTwilioFromNumber = () => Deno.env.get('TWILIO_PHONE_NUMBER');

export const getGoogleMapsKey = () =>
  Deno.env.get('VITE_GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY');