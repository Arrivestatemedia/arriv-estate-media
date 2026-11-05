/**
 * Second-Job Apparel Notice
 *
 * A Media Specialist may work their first two jobs in their own clothes.
 * Once they have completed two jobs, the Arriv shirt & jacket become required
 * for any further bookings. This module builds the congratulations email that
 * explains that requirement and how to pay for it (out of pocket or from their
 * balance).
 *
 * Used by: notifyClientJobCompleted (fires once, when the 2nd job is completed).
 */

function appUrl(): string {
  return (Deno.env.get('BASE44_APP_DOMAIN') || 'https://app.arrivestatemedia.com').replace(/\/+$/, '');
}

export function buildApparelRequirementEmail(opts: {
  firstName?: string;
  completedJobs?: number;
}): { subject: string; html: string } {
  const firstName = opts.firstName || 'there';
  const completedJobs = opts.completedJobs || 2;
  const purchaseUrl = `${appUrl()}/PurchaseApparel`;

  const subject = `Congrats on ${completedJobs} jobs, ${firstName} \u2014 your shirt & jacket`;

  const html = `
<div style="background:#FFFBF5;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;">
  <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(184,149,106,0.3);border-radius:12px;overflow:hidden;">
    <div style="background:#2a3536;padding:28px 32px;text-align:center;">
      <div style="font-size:26px;letter-spacing:1px;color:#FFFBF5;font-weight:700;">ARRIV</div>
      <div style="font-size:12px;letter-spacing:3px;color:#B8956A;text-transform:uppercase;margin-top:4px;">Estate Media</div>
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:24px;color:#2a3536;margin:0 0 8px;font-weight:700;">Nice work, ${firstName} \u2014 that's ${completedJobs} jobs done.</h1>
      <p style="font-size:15px;color:#1A1A1A;opacity:0.75;margin:0 0 24px;line-height:1.6;">
        Thank you for the work you've put in. Your first two shoots were on us to get you started \u2014 from here, the official Arriv shirt &amp; jacket are required before you book another job, so our specialists are recognisable on every property.
      </p>

      <div style="background:#2a3536;border-radius:8px;padding:20px;margin:0 0 24px;">
        <h2 style="font-size:13px;color:#B8956A;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">What's required</h2>
        <p style="font-size:15px;line-height:1.6;margin:0;color:#FFFBF5;">
          Arriv shirt &amp; jacket \u2014 <strong>$50.00</strong> one time. You pick your fit and sizes when you order.
        </p>
      </div>

      <h2 style="font-size:16px;color:#2a3536;margin:0 0 10px;">Two ways to pay</h2>
      <ul style="font-size:15px;line-height:1.7;margin:0 0 8px;padding-left:20px;color:#1A1A1A;">
        <li><strong>From your balance</strong> \u2014 $50 is deducted from your earnings.</li>
        <li><strong>Out of pocket</strong> \u2014 pay by card inside the app.</li>
      </ul>
      <p style="font-size:13px;color:#1A1A1A;opacity:0.6;margin:0 0 24px;line-height:1.6;">
        Your balance option works once your completed job earnings have cleared.
      </p>

      <div style="text-align:center;margin:0 0 24px;">
        <a href="${purchaseUrl}" style="display:inline-block;background:#B8956A;color:#FFFFFF;font-family:Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:6px;">
          Order your shirt &amp; jacket
        </a>
      </div>

      <p style="font-size:14px;line-height:1.6;color:#1A1A1A;margin:0;">
        You can keep uploading footage and closing out the jobs you already have. The requirement starts with your next booking.
      </p>
      <p style="font-size:14px;color:#B8956A;margin:20px 0 0;font-weight:600;">Thanks for being on the team,<br/>Arriv Estate Media</p>
      <p style="font-size:12px;color:#1A1A1A;opacity:0.5;margin:16px 0 0;"><a href="${appUrl()}" style="color:#B8956A;">${appUrl()}</a></p>
    </div>
  </div>
</div>`.trim();

  return { subject, html };
}