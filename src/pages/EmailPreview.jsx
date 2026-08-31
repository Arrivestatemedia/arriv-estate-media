import React from "react";

const EMAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr>
          <td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
          </td>
        </tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi Patrice,</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Congratulations!</strong></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After carefully reviewing your application, we're excited to invite you to move forward in the hiring process for the Sales Growth Advisor position with Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We were impressed by your background and would love the opportunity to learn more about you and discuss how you could contribute to our growing team.</p>

          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">The interview will be a virtual conversation where we'll discuss:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Your background and professional experience</li>
            <li>Why you're interested in joining Arriv Estate Media</li>
            <li>The responsibilities of the Sales Growth Advisor role</li>
            <li>Compensation, training, and growth opportunities</li>
            <li>Any questions you may have about the position or our company</li>
          </ul>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Next Steps</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please reply to this email with 2&ndash;3 dates and times that work best for you for an interview.</p>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1A1A1A;">Our interview availability (Eastern Time) is:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Mondays: 2:30 PM &ndash; 5:30 PM</li>
            <li>Tuesdays: 3:30 PM &ndash; 5:30 PM</li>
            <li>Wednesdays: 12:30 PM &ndash; 1:45 PM &amp; 4:00 PM</li>
            <li>Thursdays: 10:00 AM &ndash; 11:15 AM &amp; 3:30 PM &ndash; 5:30 PM</li>
            <li>Fridays: 10:15 AM</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">When you reply, please include your preferred dates and times within the windows above, and we'll confirm the interview as soon as possible.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Once your interview has been scheduled, you'll receive a confirmation email with your meeting details and interview link.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You can also log in to your Arriv Candidate Portal at any time to view your application status and receive updates throughout the hiring process.</p>

          <p style="margin:0 0 20px;">
            <a href="#" style="color:#B8956A;font-weight:600;text-decoration:none;word-break:break-all;">\u{1F449} View My Candidate Portal</a>
          </p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your interest in joining Arriv Estate Media. We're looking forward to learning more about you and sharing our vision for the future.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Brad Burke</strong><br/>Founder &amp; CEO<br/>Arriv Estate Media</p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

export default function EmailPreview() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Interview Invitation Email Preview</h1>
            <p className="text-sm text-[#1A1A1A]/60">Subject: Interview Invitation – Arriv Sales Growth Advisor</p>
          </div>
        </div>
        <div className="rounded-xl border border-[#B8956A]/25 bg-white overflow-hidden shadow-sm">
          <iframe
            title="Email Preview"
            srcDoc={EMAIL_HTML}
            style={{ width: "100%", height: "80vh", border: "none", display: "block" }}
          />
        </div>
      </div>
    </div>
  );
}