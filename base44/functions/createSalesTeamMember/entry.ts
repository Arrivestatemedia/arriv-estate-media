import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ensureEmployeeId, enqueueSync, runSyncAttempt } from "../../shared/payrollEmployeeSync.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Try Base44 auth first (for built-in admin users)
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch (e) {
      // Base44 auth failed, check if caller is a sales admin via sales_member_id in request body
      const reqBody = await req.clone().json();
      if (reqBody.sales_member_id) {
        const member = await base44.asServiceRole.entities.SalesTeamMember.get(reqBody.sales_member_id);
        isAdmin = member?.role === 'admin';
      }
    }

    if (!isAdmin) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { email, full_name, phone_number, password } = await req.json();

    if (!email || !full_name || !password) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Hash password using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create sales team member
    const member = await base44.asServiceRole.entities.SalesTeamMember.create({
      email,
      full_name,
      phone_number: phone_number || '',
      password_hash: passwordHash,
      is_active: true
    });

    // Auto-sync the new employee to Arriv Payroll (assign ARRIV_EMPLOYEE_ID + enqueue first sync).
    // Best-effort: never blocks member creation.
    try {
      const withId = await ensureEmployeeId(base44, member);
      const queueRecord = await enqueueSync(base44, withId, "offer_accepted", []);
      await runSyncAttempt(base44, queueRecord);
    } catch (syncErr) {
      console.error("Initial employee payroll sync failed:", syncErr.message);
    }

    return Response.json({ 
      success: true,
      memberId: member.id,
      arriv_employee_id: member.arriv_employee_id,
      message: 'Sales team member created successfully'
    });

  } catch (error) {
    console.error('Create sales team member error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});