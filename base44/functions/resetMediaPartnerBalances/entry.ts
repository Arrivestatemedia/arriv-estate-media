import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all users
    const users = await base44.asServiceRole.entities.User.list();
    
    let resetCount = 0;
    for (const user of users) {
      if (user.current_balance && user.current_balance > 0) {
        // Reset balance to 0
        await base44.asServiceRole.entities.User.update(user.id, {
          current_balance: 0,
          last_balance_reset: new Date().toISOString()
        });
        resetCount++;
      }
    }

    return Response.json({ 
      success: true, 
      message: `Reset balances for ${resetCount} users`,
      resetCount 
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});