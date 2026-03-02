Deno.serve(async (req) => {
  try {
    const res = await fetch('https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js');
    const text = await res.text();
    return new Response(text, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  } catch (err) {
    console.error('Twilio SDK proxy error:', err);
    return new Response(`// Failed to load Twilio SDK: ${err.message}`, {
      status: 500,
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
});