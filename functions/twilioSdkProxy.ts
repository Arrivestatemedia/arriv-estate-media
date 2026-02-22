Deno.serve(async () => {
  try {
    const res = await fetch('https://sdk.twilio.com/js/voice/releases/2.10.0/twilio.min.js');
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