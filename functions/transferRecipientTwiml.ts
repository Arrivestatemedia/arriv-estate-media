Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const transferId = url.searchParams.get('transferId');

    if (!transferId) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Transfer failed: missing transfer ID</Say></Response>',
        { headers: { 'Content-Type': 'application/xml' } }
      );
    }

    // Recipient joins the same conference as sender and original caller
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference>${transferId}</Conference>
  </Dial>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' }
    });
  } catch (error) {
    console.error('Transfer recipient TwiML error:', error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Transfer conference connection failed</Say></Response>',
      { headers: { 'Content-Type': 'application/xml' }, status: 500 }
    );
  }
});