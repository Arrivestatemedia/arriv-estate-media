// Default email content for every template in the catalog.
// Inlined in the frontend so the Email Template Manager shows content
// instantly with no backend call or auth dependency.

const ARRIV_LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png";

const SHELL = (inner) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr><td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
          <img src="${ARRIV_LOGO}" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="padding:40px 44px;">
          ${inner}
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
</body></html>`;

const NO_DEFAULT = `<div style="padding:40px;text-align:center;font-family:sans-serif;color:#999;">
  <p style="font-size:18px;margin:0 0 12px;">Default content not yet available for this template.</p>
  <p style="font-size:14px;margin:0;">Click <strong>Save Template</strong> to create a custom version.</p>
</div>`;

export const EMAIL_DEFAULTS = {
  // ── Interview ──
  sendSalesInterviewInvitation: {
    subject: "Interview Invitation – Arriv Sales Growth Advisor",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please reply to this email with 2–3 dates and times that work best for you for an interview.</p>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1A1A1A;">Our interview availability (Eastern Time) is:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Mondays: 2:30 PM – 5:30 PM</li>
            <li>Tuesdays: 3:30 PM – 5:30 PM</li>
            <li>Wednesdays: 12:30 PM – 1:45 PM &amp; 4:00 PM</li>
            <li>Thursdays: 10:00 AM – 11:15 AM &amp; 3:30 PM – 5:30 PM</li>
            <li>Fridays: 10:15 AM</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You can also log in to your Arriv Candidate Portal at any time to view your application status and receive updates throughout the hiring process.</p>
          <p style="margin:0 0 20px;"><a href="{{portalUrl}}" style="color:#B8956A;font-weight:600;text-decoration:none;word-break:break-all;">👉 View My Candidate Portal</a></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your interest in joining Arriv Estate Media. We're looking forward to learning more about you and sharing our vision for the future.</p>`),
  },
  sendSalesInterviewScheduledEmail: {
    subject: "Your Interview is Scheduled – Arriv Sales Growth Advisor",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your interview for the <strong>Sales Growth Advisor</strong> position with Arriv Estate Media has been scheduled.</p>
          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">When</h2>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">{{scheduledDate}} {{scheduledTime}}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Duration: {{durationMinutes}} minutes</p>
          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">Where</h2>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your interview will be conducted through our built-in video calling system. Join using the link below at your scheduled time.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="{{meetingLink}}" style="display:inline-block;padding:13px 28px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">Join Interview</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#1A1A1A;word-break:break-all;">Or copy this link: <a href="{{meetingLink}}" style="color:#B8956A;">{{meetingLink}}</a></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">A calendar invitation has also been sent to your email from Google Calendar so you can add it to your schedule.</p>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please join a few minutes early and ensure you have a stable internet connection, camera, and microphone ready.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If you need to reschedule, simply reply to this email.</p>`),
  },
  sendInterviewReminder: {
    subject: "Your Arriv Estate Media Interview Starts in 30 Minutes",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Just a reminder that your first-round interview with Arriv Estate Media begins in approximately 30 minutes.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your interview will be conducted by <strong>Ashley</strong>, our Virtual Recruiting Assistant, and will take approximately 15 minutes. Ashley will guide you through a short conversational interview covering your experience, work style, and interest in the opportunity.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This first-round format allows us to provide every candidate with a consistent and fair interview experience. Your responses will be reviewed by our recruiting team, and selected candidates will be invited to a live second-round interview with Arriv Estate Media leadership.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">There's nothing special you need to prepare. Just find a quiet location, make sure your camera and microphone are available, and answer each question naturally based on your own experiences.</p>
          <table cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="{{meetingLink}}" style="display:inline-block;padding:13px 28px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">JOIN YOUR INTERVIEW</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#1A1A1A;word-break:break-all;">Or copy this link: <a href="{{meetingLink}}" style="color:#B8956A;">{{meetingLink}}</a></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We recommend opening the link a few minutes early. If you experience a technical interruption during the interview, simply use the same link above to rejoin.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We look forward to learning more about you.</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Arriv Estate Media Recruiting</strong></p>`),
  },
  sendSalesInterview2Invitation: {
    subject: "Conversation with Our Founder – Arriv Sales Growth Advisor",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Congratulations!</strong></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We were genuinely impressed by your first interview for the Sales Growth Advisor position with Arriv Estate Media, and we'd love to take the next step with you.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Our founder, <strong>Brad Burke</strong>, would like to have a personal conversation with you to learn more about your story, share his vision for the company, and explore how you could grow with our team.</p>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">This will be a relaxed, virtual conversation where we'll discuss:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Your background and what drives you</li>
            <li>Brad's vision for Arriv Estate Media and where we're headed</li>
            <li>How you could contribute and grow with us</li>
            <li>Any questions you have about the role, the team, or the journey ahead</li>
          </ul>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Next Steps</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please reply to this email with 2–3 dates and times that work best for you for this conversation.</p>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1A1A1A;">Our availability (Eastern Time) is:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Mondays: 2:30 PM – 5:30 PM</li>
            <li>Tuesdays: 3:30 PM – 5:30 PM</li>
            <li>Wednesdays: 12:30 PM – 1:45 PM &amp; 4:00 PM</li>
            <li>Thursdays: 10:00 AM – 11:15 AM &amp; 3:30 PM – 5:30 PM</li>
            <li>Fridays: 10:15 AM</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You can also log in to your Arriv Candidate Portal at any time to view your application status and receive updates throughout the hiring process.</p>
          <p style="margin:0 0 20px;"><a href="{{portalUrl}}" style="color:#B8956A;font-weight:600;text-decoration:none;word-break:break-all;">👉 View My Candidate Portal</a></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your time and interest in joining Arriv Estate Media. We're excited to continue the conversation.</p>`),
  },
  sendInterviewApologyEmail: {
    subject: "Your Arriv Interview — Let's Pick Up Where We Left Off",
    htmlBody: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid rgba(184,149,106,0.25);border-radius:12px;overflow:hidden;">
        <tr><td style="background-color:#1A1A1A;padding:24px 32px;text-align:center;">
          <span style="color:#B8956A;font-size:22px;letter-spacing:3px;font-weight:bold;">ARRIV</span>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="font-size:20px;color:#1A1A1A;margin:0 0 20px 0;font-weight:bold;">Hi {{firstName}},</p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 18px 0;">I'm really sorry about what happened this morning with your interview — the connection dropped on our end, and that's on us, not you. I know you'd set aside the time and were ready to go, and I sincerely apologize for the disruption.</p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 18px 0;">The good news: you can <strong>resume your interview right now using the same link from this morning</strong>. Everything you already covered is saved, so our AI interviewer (Ashley) will pick right back up where you left off — you won't need to start over or re-answer anything.</p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 24px 0;">Here's your link again:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr><td align="center">
              <a href="{{meetingLink}}" style="display:inline-block;background-color:#B8956A;color:#1A1A1A;font-family:Georgia,serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.5px;">Join the Interview</a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:rgba(26,26,26,0.6);margin:0 0 28px 0;text-align:center;word-break:break-all;">{{meetingLink}}</p>
          <p style="font-size:15px;line-height:1.7;color:#1A1A1A;margin:0 0 12px 0;"><strong>A few quick tips for a smooth session:</strong></p>
          <ul style="font-size:15px;line-height:1.8;color:#1A1A1A;margin:0 0 24px 0;padding-left:22px;">
            <li>Make sure you're on a stable Wi-Fi or cellular connection</li>
            <li>Find a quiet space with good lighting</li>
            <li>You can join from your phone or computer</li>
            <li>If anything hiccups, just re-click the link — the session stays open and you'll rejoin automatically</li>
          </ul>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 28px 0;">Take your time — whenever you're ready today, just click the link and Ashley will welcome you back.</p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 8px 0;">Again, I apologize for the inconvenience this morning. We're excited to hear from you.</p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:18px 0 0 0;">Best,<br><strong>Brad</strong><br><span style="color:#B8956A;">Arriv Estate Media</span></p>
        </td></tr>
        <tr><td style="background-color:#F3EFE9;padding:18px 40px;border-top:1px solid rgba(184,149,106,0.2);">
          <p style="font-size:12px;color:rgba(26,26,26,0.5);margin:0;text-align:center;">This is an automated message from Arriv Estate Media. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  },

  // ── Application ──
  sendApplicationWelcomeEmail: {
    subject: "Thank you for applying to Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for applying to become a Media Specialist with Arriv Estate Media!</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited that you're interested in joining our growing network of photographers, videographers, drone pilots, and other real estate media professionals.</p>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;letter-spacing:.2px;">What Happens Next?</h2>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">Our team will carefully review your application, portfolio, equipment, service area, and experience.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If your qualifications align with our current needs, you'll receive an invitation to begin our onboarding process.</p>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">What to Expect</h2>
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:16px;line-height:1.6;color:#1A1A1A;">
            <tr><td style="padding:6px 0;">1. Application &amp; Portfolio Review</td></tr>
            <tr><td style="padding:6px 0;">2. Selection Notification</td></tr>
            <tr><td style="padding:6px 0;">3. Onboarding &amp; Account Setup</td></tr>
            <tr><td style="padding:6px 0;">4. Profile Activation</td></tr>
            <tr><td style="padding:6px 0;">5. Begin Receiving Project Opportunities</td></tr>
          </table>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Track Your Application</h2>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">You can check the status of your application at any time by visiting your Media Specialist Application Portal.</p>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Application Portal:</strong></p>
          <p style="margin:0 0 14px;"><a href="{{portalUrl}}" style="color:#B8956A;font-weight:600;text-decoration:none;word-break:break-all;">{{portalUrl}}</a></p>
          <p style="margin:0 0 6px;font-size:15px;color:#1A1A1A;">The portal allows you to:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>View your current application status</li>
            <li>Review submitted information</li>
            <li>Upload or update requested documents (if needed)</li>
            <li>Receive important updates throughout the review process</li>
          </ul>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">How Project Opportunities Work</h2>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">Once your account is active, you'll begin receiving project opportunities within your selected service area and travel radius.</p>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">Each opportunity includes:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Property location</li>
            <li>Services requested</li>
            <li>Scheduled date and time</li>
            <li>Your payout</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You'll always have the freedom to accept or decline any project based on your availability and preferences.</p>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Getting Paid</h2>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">During onboarding, you'll choose your preferred payment method:</p>
          <ul style="margin:0 0 14px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Instant Pay (1% processing fee)</li>
            <li>Direct Deposit (No processing fee)</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Payments are processed for completed projects after delivery and client approval.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're committed to building a network of talented professionals who share our passion for quality, reliability, and exceptional service.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your interest in partnering with Arriv Estate Media. We appreciate your application and look forward to reviewing it.</p>`),
  },
  sendApplicationAcceptedEmail: {
    subject: "Congratulations — You've been accepted to Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Congratulations!</strong></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After reviewing your application, we're excited to invite you to join the Arriv Estate Media network as a Media Specialist.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">The next step is to complete your onboarding and create your Media Specialist account.</p>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Complete Your Onboarding</h2>
          <p style="margin:0 0 20px;"><a href="{{portalUrl}}" style="display:inline-block;background-color:#B8956A;color:#FFFFFF;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:16px;">Complete Onboarding</a></p>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">During Onboarding, You'll:</h2>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Create your Media Specialist account</li>
            <li>Review and accept the Independent Contractor Agreement</li>
            <li>Complete your tax information (W-9)</li>
            <li>Set up your preferred payment method</li>
            <li>Configure your service area and travel radius</li>
            <li>Upload any remaining required documents</li>
            <li>Complete your profile</li>
            <li>Review platform expectations and best practices</li>
          </ul>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Before You Can Receive Projects</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your account must be fully completed and approved before you can begin accepting project opportunities.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Once your onboarding is complete, our team will perform a final review. After approval, your account will be activated, and you'll begin receiving project requests within your selected service area.</p>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Need Help?</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If you have any questions during onboarding, simply reply to this email and a member of our team will be happy to assist you.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited to welcome you to Arriv Estate Media and look forward to partnering with you.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Welcome aboard!</strong></p>`),
  },
  sendApplicationClosedEmail: {
    subject: "Update on Your Arriv Estate Media Application",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for your interest in becoming a Media Partner with Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We truly appreciate the time and effort you put into your application. We were fortunate to receive applications from many talented photographers and videographers, and we enjoyed learning more about your work.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">As a startup, we're intentionally launching with a limited number of Media Partners to ensure we can provide consistent opportunities and maintain the highest level of service for our clients.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After careful consideration, we've decided to move forward with other applicants for our initial launch. This decision was not a reflection of your skill, talent, or potential, but rather the result of the limited number of spots available during this phase of our growth.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We sincerely appreciate your interest in Arriv Estate Media and encourage you to stay connected with us. As our platform grows and we expand into additional markets, we expect to create new opportunities and may invite qualified applicants to apply again in the future.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for considering Arriv Estate Media. We wish you continued success and appreciate your interest in being part of our journey.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Warm regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>The Arriv Estate Media Team</strong><br/>Building the future of real estate media.</p>`),
  },
  sendApplicationWaitlistEmail: {
    subject: "Welcome to the Arriv Estate Media Waitlist",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for applying to become a Media Partner with Arriv Estate Media!</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Great news! You've been approved to join Arriv Estate Media!</strong> We've reserved a future spot for you on the Arriv platform.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">As a startup, we're intentionally onboarding a limited number of Media Partners during our initial launch to ensure we deliver an exceptional experience for both our clients and our partners. Because of our phased rollout, you're currently on our approved waitlist.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We'll contact you as soon as a spot becomes available and we're ready to activate your account. At that time, you'll receive instructions to complete your onboarding, including your Media Partner Agreement, background check, payment setup, and profile activation.</p>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1A1A1A;">In the meantime, please keep an eye on your email for updates regarding:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.8;color:#1A1A1A;">
            <li>Your application status</li>
            <li>Platform news and announcements</li>
            <li>Upcoming onboarding opportunities</li>
            <li>Your invitation to join the Arriv network</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We truly appreciate your patience and your interest in being part of Arriv Estate Media. We're excited about what's ahead and look forward to welcoming you to the platform as we continue to grow.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your application—we can't wait to work with you!</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Warm regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>The Arriv Estate Media Team</strong><br/>Building the future of real estate media.</p>`),
  },
  sendApplicationInvitationComing: {
    subject: "You're Approved to Join Arriv Estate Media!",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Congratulations, {{firstName}}!</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You've been approved to join Arriv Estate Media as one of our Media Partners.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for your patience. As a startup, we're taking our time to build a strong foundation before activating new Media Partners. Over the past few weeks, we've been preparing the platform, refining our onboarding experience, and building relationships with local real estate clients. Because of that, your official invitation to create your Arriv account will be arriving soon.</p>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Once You Receive Your Invitation, You'll Be Able To:</h2>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Create your Arriv account</li>
            <li>Complete your Media Partner profile</li>
            <li>Review and accept the Media Partner Agreement</li>
            <li>Connect your payment information through Stripe</li>
            <li>Watch a welcome video from our Founder</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After your account is set up, you'll be ready to receive assignment opportunities in your service area. As with any growing marketplace, assignment volume will increase over time as we continue adding more real estate agents, brokerages, builders, and property managers. We're excited to have you join us during these early stages and look forward to growing together.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're currently targeting our first Media Partner activations for your area in mid-August and will keep you updated along the way.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for believing in Arriv. We can't wait to officially welcome you to Arriv Estate Media.</p>`),
  },
  sendSalesOfferExtendedEmail: {
    subject: "Congratulations! Your Offer from Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Congratulations!</strong></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited to offer you the position of <strong>Sales Growth Advisor</strong> with Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After reviewing your application and speaking with you during the interview process, we believe you'll be a great addition to our team. We're looking forward to having you help us grow Arriv as we continue expanding across new markets.</p>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Your Offer</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">As a Sales Growth Advisor, you'll play an important role in introducing Arriv Estate Media to real estate professionals and helping us build lasting relationships with new clients.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>Position:</strong> Sales Growth Advisor</p>
              <p style="margin:0 0 6px;"><strong>Employment Type:</strong> Independent Contractor (1099)</p>
              <p style="margin:0;"><strong>Compensation:</strong> Commission-based, plus a $500 training bonus after successfully completing your first two weeks of training and meeting the program requirements.</p>
            </td></tr>
          </table>
          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Next Steps</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">To officially accept your offer, please log in to your Arriv Candidate Portal using the button below.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="{{portalUrl}}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">Accept My Offer</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">Once logged in, you'll be able to:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Review your official offer</li>
            <li>Accept or decline the position</li>
            <li>Complete your onboarding paperwork</li>
            <li>Sign your Independent Contractor Agreement</li>
            <li>Begin your onboarding and training</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please review and respond to your offer within <strong>7 days</strong>. If you need additional time or have any questions before making your decision, simply reply to this email—we're happy to help.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited about the possibility of working together and can't wait to see the impact you'll make as part of the Arriv team.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Welcome to Arriv!</strong></p>`),
  },
  sendSalesOfferNotExtendedEmail: {
    subject: "Update on Your Application – Arriv Sales Growth Advisor",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for taking the time to apply and interview for the Sales Growth Advisor position with Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We sincerely appreciate your interest in joining our team and the opportunity to learn more about your background and experience.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After careful consideration, we've decided to move forward with other candidates whose experience and qualifications more closely align with our current needs.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This decision was not an easy one. We received applications from many talented individuals, and we truly appreciate the time and effort you invested throughout the hiring process.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">As Arriv continues to grow, new opportunities will become available, and we'd be happy to consider your application for future positions that may be a better fit.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your interest in Arriv Estate Media. We wish you the very best in your career and future endeavors.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Kind regards,</p>`),
  },

  // ── Booking ──
  sendBookingNotifications: {
    subject: "Your Booking Confirmation – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{clientName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your booking with Arriv Estate Media has been confirmed.</p>
          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">Booking Details</h2>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">{{jobDetails}}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Scheduled Date: {{scheduledDate}}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We look forward to working with you. If you have any questions, simply reply to this email.</p>`),
  },
  sendBookingStatusEmail: {
    subject: "Booking Status Update – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{clientName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your booking status has been updated to: <strong>{{status}}</strong>.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">{{jobDetails}}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If you have any questions, simply reply to this email.</p>`),
  },
  sendReceiptToClient: {
    subject: "Payment Receipt – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{clientName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for your payment. Your receipt is below.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>Amount:</strong> {{amount}}</p>
              <p style="margin:0;"><a href="{{invoiceUrl}}" style="color:#B8956A;">View Invoice</a></p>
            </td></tr>
          </table>`),
  },
  sendClosingInvoiceEmail: {
    subject: "Your Closing Invoice from Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{clientName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your closing invoice from Arriv Estate Media is ready.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>Amount:</strong> {{amount}}</p>
              <p style="margin:0;"><a href="{{invoiceUrl}}" style="color:#B8956A;">View Invoice</a></p>
            </td></tr>
          </table>`),
  },
  sendRefundReceipt: {
    subject: "Refund Confirmation – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{clientName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">A refund has been processed for your account.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>Refund Amount:</strong> {{amount}}</p>
              <p style="margin:0;"><strong>Date:</strong> {{refundDate}}</p>
            </td></tr>
          </table>`),
  },

  // ── Onboarding / Orientation ──
  sendOnboardingReceiptNotifications: {
    subject: "Your Onboarding Receipt – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your onboarding receipt is ready.</p>
          <p style="margin:0 0 20px;"><a href="{{receiptUrl}}" style="color:#B8956A;font-weight:600;text-decoration:none;">View Your Receipt</a></p>`),
  },
  sendOrientationDeadlineReminders: {
    subject: "Orientation Deadline Reminder – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This is a reminder that your orientation deadline is approaching on <strong>{{deadlineDate}}</strong>.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please complete all remaining orientation steps before this date to avoid delays in your onboarding.</p>`),
  },
  sendAdminOnboardingNotification: {
    subject: "New Onboarding Notification – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">New Onboarding</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">A new onboarding has been initiated.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>Employee:</strong> {{employeeName}}</p>
              <p style="margin:0;"><strong>Department:</strong> {{department}}</p>
            </td></tr>
          </table>`),
  },

  // ── Payroll ──
  sendPayrollSubmission: {
    subject: "Payroll Submission Notification – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Payroll Submission</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">A payroll submission has been processed.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>Employee:</strong> {{employeeName}}</p>
              <p style="margin:0 0 6px;"><strong>Pay Period:</strong> {{payPeriod}}</p>
              <p style="margin:0;"><strong>Amount:</strong> {{amount}}</p>
            </td></tr>
          </table>`),
  },

  // ── Sales ──
  sendReferenceCheckEmail: {
    subject: "Reference Check Request – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{referenceName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">{{candidateName}} has listed you as a reference for their application to Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We'd appreciate it if you could take a few minutes to complete a short reference survey.</p>
          <p style="margin:0 0 20px;"><a href="{{surveyLink}}" style="display:inline-block;background-color:#B8956A;color:#FFFFFF;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:16px;">Complete Reference Check</a></p>`),
  },

  // ── System ──
  sendSignupEmail: {
    subject: "Welcome to Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Welcome to Arriv Estate Media! Your account has been created.</p>
          <p style="margin:0 0 20px;"><a href="{{loginUrl}}" style="display:inline-block;background-color:#B8956A;color:#FFFFFF;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:16px;">Log In</a></p>`),
  },
  sendForgotPasswordEmail: {
    subject: "Password Reset – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We received a request to reset your password. Click the button below to choose a new one.</p>
          <p style="margin:0 0 20px;"><a href="{{resetUrl}}" style="display:inline-block;background-color:#B8956A;color:#FFFFFF;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:16px;">Reset Password</a></p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#1A1A1A/60;">If you didn't request this, you can safely ignore this email.</p>`),
  },
  sendDeletionEmail: {
    subject: "Account Deletion Confirmation – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your account deletion has been processed and is scheduled for <strong>{{deletionDate}}</strong>.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If you did not request this, please contact us immediately.</p>`),
  },
  sendAdminEmail: {
    subject: "Arriv Estate Media Notification",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">{{subject}}</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">{{message}}</p>`),
  },
  sendDailySummaryEmails: {
    subject: "Daily Activity Summary – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Daily Summary — {{summaryDate}}</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">{{metrics}}</p>`),
  },
  sendUpcomingTaskEmail: {
    subject: "Upcoming Task Reminder – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This is a reminder that you have an upcoming task: <strong>{{taskName}}</strong>, due on <strong>{{dueDate}}</strong>.</p>`),
  },
  sendTaskFiveMinuteReminder: {
    subject: "Starting Soon – Task Reminder",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your task <strong>{{taskName}}</strong> starts in 5 minutes.</p>`),
  },
  sendFootageUploadReminders: {
    subject: "Footage Upload Reminder – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This is a reminder to upload your footage for the following job:</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">{{jobDetails}}</p>`),
  },
  sendJobReminders: {
    subject: "Job Reminder – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This is a reminder for your upcoming job:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>Job:</strong> {{jobDetails}}</p>
              <p style="margin:0;"><strong>Scheduled:</strong> {{scheduledDate}}</p>
            </td></tr>
          </table>`),
  },
  sendSupraAccessNotification: {
    subject: "Supra Access Notification – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">{{accessDetails}}</p>`),
  },
  sendVideoCallInvite: {
    subject: "Video Call Invitation – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{firstName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You've been invited to a video call.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>When:</strong> {{scheduledTime}}</p>
              <p style="margin:0;"><a href="{{meetingLink}}" style="color:#B8956A;">Join Call</a></p>
            </td></tr>
          </table>`),
  },
  sendMediaToClient: {
    subject: "Your Media is Ready – Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{clientName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your media is ready for download.</p>
          <p style="margin:0 0 20px;"><a href="{{mediaUrl}}" style="display:inline-block;background-color:#B8956A;color:#FFFFFF;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:16px;">Download Media</a></p>`),
  },
  sendInvoiceEmailViaGmail: {
    subject: "Invoice from Arriv Estate Media",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi {{clientName}},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your invoice from Arriv Estate Media is ready.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>Amount:</strong> {{amount}}</p>
              <p style="margin:0;"><a href="{{invoiceUrl}}" style="color:#B8956A;">View Invoice</a></p>
            </td></tr>
          </table>`),
  },
  sendScheduledEmails: {
    subject: "Arriv Estate Media Notification",
    htmlBody: SHELL(`<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">{{subject}}</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">{{body}}</p>`),
  },
};

export function getEmailDefault(templateKey) {
  const def = EMAIL_DEFAULTS[templateKey];
  if (def) return def;
  return { subject: "", htmlBody: NO_DEFAULT };
}