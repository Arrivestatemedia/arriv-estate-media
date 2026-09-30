/**
 * First-Gig Onboarding Message Builder
 *
 * When a Media Specialist books their very first job, we send them a
 * step-by-step guide (SMS + branded email) explaining how to mark each
 * job milestone and how to upload footage.
 *
 * Used by: bookJobAndSendCalendarInvite (fires once, on first booking).
 */

function appUrl(): string {
  return (Deno.env.get('BASE44_APP_DOMAIN') || 'https://app.arrivestatemedia.com').replace(/\/+$/, '');
}

export function buildFirstGigOnboarding(opts: {
  firstName: string;
  listingAddress?: string;
  folderUrl?: string | null;
  accessProvider?: string;
  accessGuideUrl?: string;
  relayNumber?: string;
}): { sms: string; emailSubject: string; emailHtml: string } {
  const firstName = opts.firstName || 'there';
  const listing = opts.listingAddress || 'your listing';
  const relayNumber = opts.relayNumber || '1-855-765-4306';

  // Resolve the property-access app label for this job's region.
  // Specialists use SentriConnect (the specialist-facing app) in DMV markets.
  const accessAppLabel =
    opts.accessProvider === 'SENTRILOCK' ? 'SentriConnect'
    : opts.accessProvider === 'SUPRA' ? 'Supra eKEY'
    : 'your region\u2019s property access app (Supra or SentriConnect)';
  const accessLineSms = `Download ${accessAppLabel} so you can get inside the property.`;
  const accessLineEmail = `Download <strong>${accessAppLabel}</strong> \u2014 it\u2019s the property access app for this region, and you\u2019ll need it to get inside.`;
  const relayLineSms = relayNumber
    ? `To reach your client, text or call ${relayNumber} \u2014 it relays straight to them.`
    : `To reach your client, text or call the relay number shown in the app \u2014 it relays straight to them.`;
  const relayLineEmail = relayNumber
    ? `To reach your client, text or call <strong>${relayNumber}</strong> \u2014 it relays straight to them.`
    : `To reach your client, text or call the relay number shown in the app \u2014 it relays straight to them.`;

  const sms =
    `Welcome to your first Arriv shoot, ${firstName}! Here's exactly what to do, step by step:\n\n` +
    `BEFORE THE SHOOT\n` +
    `- Check your calendar invite for the address, date & time.\n` +
    `- ${accessLineSms}\n\n` +
    `DAY OF THE SHOOT (mark each step in the Arriv app — these buttons are on the same job card you tapped to book the job)\n` +
    `1. Tap "I'm on my way" before you leave (this button unlocks 1 hour before the shoot).\n` +
    `2. Tap "I'm here" when you reach the property.\n` +
    `3. Capture all photo/video for the package.\n` +
    `4. Tap "I've completed the job" to finish the shoot.\n\n` +
    `AFTER THE SHOOT (upload footage — also from that same job card)\n` +
    `1. Tap "Upload Footage" in the job.\n` +
    `2. Upload ALL your files right there in the Arriv app.\n` +
    `3. When every file is uploaded, tap "Yes, that's all my files."\n\n` +
    `RULES\n` +
    `- ${relayLineSms}\n` +
    `- Upload within 24 hours of the shoot.\n\n` +
    `Questions? Text "support: your message" to ${relayNumber || 'the relay number'} anytime. Welcome to the team!\n— Arriv Estate Media`;

  const emailSubject = `Your first Arriv shoot — a quick guide to getting it right`;

  const emailHtml = `
<div style="background:#FFFBF5;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;">
  <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(184,149,106,0.3);border-radius:12px;overflow:hidden;">
    <div style="background:#2a3536;padding:28px 32px;text-align:center;">
      <div style="font-size:26px;letter-spacing:1px;color:#FFFBF5;font-weight:700;">ARRIV</div>
      <div style="font-size:12px;letter-spacing:3px;color:#B8956A;text-transform:uppercase;margin-top:4px;">Estate Media</div>
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:24px;color:#2a3536;margin:0 0 8px;font-weight:700;">Welcome to your first shoot, ${firstName}!</h1>
      <p style="font-size:15px;color:#1A1A1A;opacity:0.7;margin:0 0 24px;">Your job at <strong style="color:#2a3536;">${listing}</strong> is booked. Here's exactly what to do, step by step.</p>

      <div style="border-left:3px solid #B8956A;padding-left:16px;margin:24px 0;">
        <h2 style="font-size:16px;color:#2a3536;margin:0 0 8px;">Before the shoot</h2>
        <p style="font-size:14px;line-height:1.6;margin:0;color:#1A1A1A;">Check your calendar invite for the address, date, and time. ${accessLineEmail}</p>
      </div>

      <div style="border-left:3px solid #B8956A;padding-left:16px;margin:24px 0;">
        <h2 style="font-size:16px;color:#2a3536;margin:0 0 8px;">Day of the shoot — mark each step in the Arriv app</h2>
        <p style="font-size:13px;color:#1A1A1A;opacity:0.7;margin:0 0 12px;font-style:italic;">These buttons are on the same job card you tapped to book the job.</p>
        <ol style="font-size:14px;line-height:1.7;margin:0;padding-left:20px;color:#1A1A1A;">
          <li>Tap <strong>"I'm on my way"</strong> before you leave for the property <em>(this button unlocks 1 hour before the shoot)</em>.</li>
          <li>Tap <strong>"I'm here"</strong> when you reach the property.</li>
          <li>Capture all the required photo and video for the package.</li>
          <li>Tap <strong>"I've completed the job"</strong> to finish the shoot.</li>
        </ol>
      </div>

      <div style="border-left:3px solid #B8956A;padding-left:16px;margin:24px 0;">
        <h2 style="font-size:16px;color:#2a3536;margin:0 0 8px;">After the shoot — upload your footage</h2>
        <p style="font-size:13px;color:#1A1A1A;opacity:0.7;margin:0 0 12px;font-style:italic;">Also from that same job card.</p>
        <ol style="font-size:14px;line-height:1.7;margin:0;padding-left:20px;color:#1A1A1A;">
          <li>Open the job in the Arriv app and tap <strong>"Upload Footage."</strong></li>
          <li>Upload ALL your files right there in the Arriv app.</li>
          <li>When every file is uploaded, tap <strong>"Yes, that's all my files."</strong></li>
        </ol>
      </div>

      <div style="background:#2a3536;border-radius:8px;padding:18px 20px;margin:24px 0;">
        <h2 style="font-size:14px;color:#B8956A;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">The rules</h2>
        <p style="font-size:14px;line-height:1.6;margin:0;color:#FFFBF5;">${relayLineEmail} Upload all footage within 24 hours of the shoot.</p>
      </div>

      <p style="font-size:14px;line-height:1.6;color:#1A1A1A;margin:24px 0 0;">Questions? Text <strong>"support: your message"</strong> to ${relayNumber || 'the relay number'} anytime. We've got your back.</p>
      <p style="font-size:14px;color:#B8956A;margin:20px 0 0;font-weight:600;">Welcome to the team,<br/>Arriv Estate Media</p>
      <p style="font-size:12px;color:#1A1A1A;opacity:0.5;margin:16px 0 0;"><a href="${appUrl()}" style="color:#B8956A;">${appUrl()}</a></p>
    </div>
  </div>
</div>`.trim();

  return { sms, emailSubject, emailHtml };
}