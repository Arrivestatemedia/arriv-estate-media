import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { encryptSmtpPassword } from "../../shared/repEmailConnection.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, memberId, smtpHost, smtpPort, smtpUsername, smtpPassword } = body;

    if (!memberId) return Response.json({ error: 'memberId is required' }, { status: 400 });

    // Verify admin via sales team member (this app uses custom auth)
    const adminId = body.adminId || body.sales_member_id;
    if (!adminId) return Response.json({ error: 'Admin access required' }, { status: 403 });
    const admin = await base44.asServiceRole.entities.SalesTeamMember.get(adminId);
    if (!admin || admin.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    if (action === 'save_smtp') {
      if (!smtpUsername) return Response.json({ error: 'SMTP username (email) is required' }, { status: 400 });
      const encryptedPassword = smtpPassword ? await encryptSmtpPassword(smtpPassword) : null;
      await base44.asServiceRole.entities.SalesTeamMember.update(memberId, {
        email_connection_type: 'smtp',
        smtp_host: smtpHost || null,
        smtp_port: smtpPort || null,
        smtp_username: smtpUsername,
        smtp_password_encrypted: encryptedPassword,
        company_email: smtpUsername,
        // Clear OAuth tokens when switching to SMTP
        gmail_access_token: null,
        gmail_refresh_token: null,
        gmail_token_expires_at: null,
        microsoft_access_token: null,
        microsoft_refresh_token: null,
        microsoft_token_expires_at: null,
        microsoft_email: null,
      });
      return Response.json({ success: true, connection_type: 'smtp' });
    }

    if (action === 'disconnect') {
      await base44.asServiceRole.entities.SalesTeamMember.update(memberId, {
        email_connection_type: 'none',
        gmail_access_token: null,
        gmail_refresh_token: null,
        gmail_token_expires_at: null,
        microsoft_access_token: null,
        microsoft_refresh_token: null,
        microsoft_token_expires_at: null,
        microsoft_email: null,
        smtp_host: null,
        smtp_port: null,
        smtp_username: null,
        smtp_password_encrypted: null,
      });
      return Response.json({ success: true, connection_type: 'none' });
    }

    if (action === 'get_status') {
      const member = await base44.asServiceRole.entities.SalesTeamMember.get(memberId);
      if (!member) return Response.json({ error: 'Member not found' }, { status: 404 });
      return Response.json({
        connection_type: member.email_connection_type || (member.gmail_access_token ? 'gmail_oauth' : 'none'),
        email: member.microsoft_email || member.company_email || member.smtp_username || null,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});