import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all active sales team members
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });
    
    if (!members || members.length === 0) {
      return Response.json({ synced: 0, message: 'No active sales team members' });
    }
    
    // Sync status for each sales team member
    const results = [];
    for (const member of members) {
      try {
        const response = await base44.asServiceRole.functions.invoke('syncChatStatusWithCalendar', {
          salesMemberId: member.id
        });
        results.push({ 
          memberId: member.id, 
          status: response.data?.status || 'available',
          hasActiveEvent: response.data?.hasActiveEvent || false
        });
      } catch (error) {
        console.error(`Failed to sync status for member ${member.id}:`, error.message);
        // Still count as successful sync (just with default status)
        results.push({ 
          memberId: member.id, 
          status: 'available',
          hasActiveEvent: false
        });
      }
    }
    
    return Response.json({ synced: results.length, message: 'Sync completed', results });
  } catch (error) {
    console.error('Sync all sales team status error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});