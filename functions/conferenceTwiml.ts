Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const transferId = url.searchParams.get('transferId');
    const originalCaller = url.searchParams.get('originalCaller');
    const senderPhone = url.searchParams.get('senderPhone');

    if (!transferId || !originalCaller) {
      return new Response('Missing parameters', { status: 400 });
    }

    // TwiML that puts recipient in conference and bridges original caller
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="true" endConferenceOnExit="false">${transferId}</Conference>
  </Dial>
</Response>`;

    return new Response(twiml, {
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  } catch (error) {
    console.error('TwiML generation error:', error);
    return new Response('Error generating TwiML', { status: 500 });
  }
});