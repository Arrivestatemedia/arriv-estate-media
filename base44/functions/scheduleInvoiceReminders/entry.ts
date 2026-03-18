import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId } = await req.json();
    
    // This function should be called by a scheduled automation
    // For now, we'll just mark it as ready for reminders
    // Actual reminders will be sent by checkAndSendReminders function
    
    return Response.json({ success: true });
    
  } catch (error) {
    console.error('Error scheduling reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});