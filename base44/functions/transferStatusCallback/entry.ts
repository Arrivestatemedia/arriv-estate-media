import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const formData = new URLSearchParams(await req.text());
    const status = formData.get('CallStatus');
    const transferId = formData.get('CallSid');

    console.log('Transfer status callback:', { status, transferId });

    // Log transfer status for debugging
    // Could store in database or send notifications here

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Status callback error:', error);
    return new Response('Error', { status: 500 });
  }
});