import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    return Response.json({
      clientId: Deno.env.get('SLACK_CLIENT_ID')
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});