import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const results = { notifications_sent: 0, errors: [] };

    const now = new Date();
    const orgs = await base44.asServiceRole.entities.B2BOrganization.list('-created_date', 200);

    for (const org of orgs) {
      if (!org.renewal_date) continue;

      const renewDate = new Date(org.renewal_date);
      const daysUntil = Math.floor((renewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Send notifications at 120, 90, 60, 30 days
      if ([120, 90, 60, 30].includes(daysUntil)) {
        try {
          // Send email via Brevo
          const subject = `Renewal Coming Up — ${org.display_name || org.legal_name} (${daysUntil} days)`;
          const body = `Your contract renewal is coming up in ${daysUntil} days. Please contact your sales representative to discuss renewal options.`;

          await base44.asServiceRole.integrations.Core.SendEmail({
            to: org.billing_contact_email || org.primary_admin_email,
            subject,
            body,
          });
          results.notifications_sent++;
        } catch (e) {
          results.errors.push(`Renewal notification ${org.id}: ${e.message}`);
        }
      }
    }

    // Check credit/capacity usage thresholds
    const creditPeriods = await base44.asServiceRole.entities.B2BMediaCreditPeriod.filter({ status: 'active' });
    for (const p of creditPeriods) {
      const allocated = p.credits_allocated_units || 0;
      const consumed = p.credits_consumed_units || 0;
      if (allocated > 0) {
        const usagePct = (consumed / allocated) * 100;
        if (usagePct >= 80 && usagePct < 100 && !p.usage_80_notified) {
          try {
            const org = await base44.asServiceRole.entities.B2BOrganization.get(p.organization_id);
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: org?.billing_contact_email || org?.primary_admin_email || '',
              subject: `80% Credit Usage — ${org?.display_name || org?.legal_name}`,
              body: `You've used 80% of your monthly Media Credits. You may want to consider an expansion.`,
            });
            await base44.asServiceRole.entities.B2BMediaCreditPeriod.update(p.id, { usage_80_notified: true });
            results.notifications_sent++;
          } catch (e) {
            results.errors.push(`Credit 80% notification: ${e.message}`);
          }
        }
        if (usagePct >= 100 && !p.usage_100_notified) {
          try {
            const org = await base44.asServiceRole.entities.B2BOrganization.get(p.organization_id);
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: org?.billing_contact_email || org?.primary_admin_email || '',
              subject: `100% Credit Usage — ${org?.display_name || org?.legal_name}`,
              body: `You've used all your monthly Media Credits. Additional bookings will require cash payment or an expansion.`,
            });
            await base44.asServiceRole.entities.B2BMediaCreditPeriod.update(p.id, { usage_100_notified: true });
            results.notifications_sent++;
          } catch (e) {
            results.errors.push(`Credit 100% notification: ${e.message}`);
          }
        }
      }
    }

    return Response.json({ status: 'OK', data: results });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});