Deno.serve(async () => {
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/@twilio/voice-sdk@2.10.0/dist/twilio.min.js');
    const text = await res.text();
    return new Response(text, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  } catch (err) {
    return new Response(`// Failed to load Twilio SDK: ${err.message}`, {
      status: 500,
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
});