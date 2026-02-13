import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get all media partners
    const allUsers = await base44.asServiceRole.entities.User.list();
    const mediaPartners = allUsers.filter(u => u.user_type === 'media_partner');

    // Calculate dates for previous week (Sunday to Thursday, with Friday payout)
    const today = new Date();
    const lastFriday = new Date(today);
    lastFriday.setDate(today.getDate() - ((today.getDay() + 1) % 7 || 7));
    
    const periodStart = new Date(lastFriday);
    periodStart.setDate(lastFriday.getDate() - 5); // Previous Sunday
    
    const periodEnd = new Date(lastFriday);
    periodEnd.setDate(lastFriday.getDate() - 1); // Thursday

    const payoutDate = new Date(lastFriday);
    payoutDate.setDate(lastFriday.getDate() + 1); // This Friday

    const formatDate = (date) => date.toISOString().split('T')[0];

    // Generate statements for each media partner
    const statements = [];
    for (const partner of mediaPartners) {
      // Get completed jobs for this partner in the period
      const jobsInPeriod = await base44.asServiceRole.entities.Job.filter({
        booked_by: partner.email,
        status: 'archived'
      });

      // Filter jobs completed in this period
      const relevantJobs = jobsInPeriod.filter(job => {
        const jobDate = new Date(job.created_date);
        return jobDate >= periodStart && jobDate <= periodEnd;
      });

      const gigsCompleted = relevantJobs.length;
      const grossAmount = relevantJobs.reduce((sum, job) => sum + (job.pay_rate || 0), 0);

      if (gigsCompleted > 0 || grossAmount > 0) {
        // Generate PDF
        const pdfRes = await base44.functions.invoke('generatePaymentStatement', {
          media_partner_email: partner.email,
          media_partner_name: partner.full_name,
          payout_date: formatDate(payoutDate),
          period_start: formatDate(periodStart),
          period_end: formatDate(periodEnd),
          gigs_completed: gigsCompleted,
          gross_amount: grossAmount,
          payout_method: partner.payout_method || 'zelle',
          payout_destination: partner.payout_method === 'zelle' ? partner.zelle_info : `****${partner.bank_account_last4}`
        });

        // Create payment statement record
        const statement = await base44.asServiceRole.entities.PaymentStatement.create({
          media_partner_email: partner.email,
          media_partner_name: partner.full_name,
          payout_date: formatDate(payoutDate),
          period_start: formatDate(periodStart),
          period_end: formatDate(periodEnd),
          gigs_completed: gigsCompleted,
          gross_amount: grossAmount,
          payout_method: partner.payout_method || 'zelle',
          payout_destination: partner.payout_method === 'zelle' ? partner.zelle_info : `****${partner.bank_account_last4}`,
          pdf_url: pdfRes.data.pdf_url,
          is_archived: false
        });

        statements.push(statement);
      }
    }

    // Archive statements older than 1 year
    const allStatements = await base44.asServiceRole.entities.PaymentStatement.list();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    for (const statement of allStatements) {
      const statementDate = new Date(statement.payout_date);
      if (statementDate < oneYearAgo && !statement.is_archived) {
        await base44.asServiceRole.entities.PaymentStatement.update(statement.id, {
          is_archived: true
        });
      }
    }

    return Response.json({
      success: true,
      statements_created: statements.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});