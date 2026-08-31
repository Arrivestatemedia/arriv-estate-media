// Catalog of all email-sending functions in the system.
// Each entry corresponds to a backend function that sends an email.
// The template_key matches the function name so saved templates can be
// looked up and used by the corresponding function.

export const EMAIL_CATALOG = [
  // Interview
  { key: "sendSalesInterviewInvitation", name: "First-Round Interview Invitation", category: "Interview", description: "Sent to sales candidates invited to a first-round AI interview with Ashley", variables: ["firstName", "portalUrl"], defaultSubject: "Interview Invitation – Arriv Sales Growth Advisor" },
  { key: "sendSalesInterviewScheduledEmail", name: "Interview Scheduled Confirmation", category: "Interview", description: "Confirmation email with meeting details after an interview is scheduled", variables: ["firstName", "scheduledDate", "scheduledTime", "meetingLink", "portalUrl"], defaultSubject: "Your Interview is Scheduled – Arriv Sales Growth Advisor" },
  { key: "sendInterviewReminder", name: "Interview Reminder (30 min)", category: "Interview", description: "30-minute pre-interview reminder sent to candidate and admin", variables: ["firstName", "scheduledTime", "meetingLink", "interviewMode"], defaultSubject: "Your Arriv Estate Media Interview Starts in 30 Minutes" },
  { key: "sendSalesInterview2Invitation", name: "Second-Round Interview Invitation", category: "Interview", description: "Invitation to a second-round human interview", variables: ["firstName", "scheduledDate", "scheduledTime", "meetingLink"], defaultSubject: "Conversation with Our Founder – Arriv Sales Growth Advisor" },
  { key: "sendInterviewApologyEmail", name: "Interview Apology / Reschedule", category: "Interview", description: "Sent when an interview needs to be rescheduled or apology for missed interview", variables: ["firstName", "portalUrl"], defaultSubject: "Your Arriv Interview — Let's Pick Up Where We Left Off" },

  // Application
  { key: "sendApplicationWelcomeEmail", name: "Application Welcome", category: "Application", description: "Welcome email when an application is first received", variables: ["firstName", "portalUrl"], defaultSubject: "Thank you for applying to Arriv Estate Media" },
  { key: "sendApplicationAcceptedEmail", name: "Application Accepted", category: "Application", description: "Sent when a media specialist application is accepted", variables: ["firstName", "portalUrl"], defaultSubject: "Congratulations — You've been accepted to Arriv Estate Media" },
  { key: "sendApplicationClosedEmail", name: "Application Closed", category: "Application", description: "Sent when an application is denied or closed", variables: ["firstName", "portalUrl"], defaultSubject: "Update on Your Arriv Estate Media Application" },
  { key: "sendApplicationWaitlistEmail", name: "Application Waitlist", category: "Application", description: "Sent when an applicant is placed on the waitlist", variables: ["firstName", "portalUrl"], defaultSubject: "Welcome to the Arriv Estate Media Waitlist" },
  { key: "sendApplicationInvitationComing", name: "Invitation Coming Soon", category: "Application", description: "Heads-up that an interview invitation is coming soon", variables: ["firstName", "portalUrl"], defaultSubject: "You're Approved to Join Arriv Estate Media!" },
  { key: "sendSalesOfferExtendedEmail", name: "Sales Offer Extended", category: "Application", description: "Offer email for sales growth advisor candidates", variables: ["firstName", "portalUrl", "offerDeadline"], defaultSubject: "Congratulations! Your Offer from Arriv Estate Media" },
  { key: "sendSalesOfferNotExtendedEmail", name: "Sales Offer Not Extended", category: "Application", description: "No-offer email for sales candidates not selected", variables: ["firstName", "portalUrl"], defaultSubject: "Update on Your Application – Arriv Sales Growth Advisor" },

  // Booking
  { key: "sendBookingNotifications", name: "Booking Notifications", category: "Booking", description: "Booking confirmation and status notifications", variables: ["clientName", "jobDetails", "scheduledDate"], defaultSubject: "Your Booking Confirmation – Arriv Estate Media" },
  { key: "sendBookingStatusEmail", name: "Booking Status Update", category: "Booking", description: "Booking status change notification to client", variables: ["clientName", "status", "jobDetails"], defaultSubject: "Booking Status Update – Arriv Estate Media" },
  { key: "sendReceiptToClient", name: "Receipt to Client", category: "Booking", description: "Payment receipt sent to client", variables: ["clientName", "amount", "invoiceUrl"], defaultSubject: "Payment Receipt – Arriv Estate Media" },
  { key: "sendClosingInvoiceEmail", name: "Closing Invoice", category: "Booking", description: "Closing invoice email with invoice attached", variables: ["clientName", "invoiceUrl", "amount"], defaultSubject: "Your Closing Invoice from Arriv Estate Media" },
  { key: "sendRefundReceipt", name: "Refund Receipt", category: "Booking", description: "Refund receipt email to client", variables: ["clientName", "amount", "refundDate"], defaultSubject: "Refund Confirmation – Arriv Estate Media" },

  // Onboarding / Orientation
  { key: "sendOnboardingReceiptNotifications", name: "Onboarding Receipt", category: "Onboarding", description: "Onboarding receipt and welcome notification", variables: ["firstName", "receiptUrl"], defaultSubject: "Your Onboarding Receipt – Arriv Estate Media" },
  { key: "sendOrientationDeadlineReminders", name: "Orientation Deadline Reminder", category: "Onboarding", description: "Reminder about upcoming orientation deadlines", variables: ["firstName", "deadlineDate"], defaultSubject: "Orientation Deadline Reminder – Arriv Estate Media" },
  { key: "sendAdminOnboardingNotification", name: "Admin Onboarding Notification", category: "Onboarding", description: "Notification to admin about new onboarding", variables: ["employeeName", "department"], defaultSubject: "New Onboarding Notification – Arriv Estate Media" },

  // Payroll
  { key: "sendPayrollSubmission", name: "Payroll Submission", category: "Payroll", description: "Payroll submission notification to payroll system", variables: ["employeeName", "payPeriod", "amount"], defaultSubject: "Payroll Submission Notification – Arriv Estate Media" },

  // Sales
  { key: "sendReferenceCheckEmail", name: "Reference Check Email", category: "Sales", description: "Reference check request email to provided references", variables: ["candidateName", "referenceName", "surveyLink"], defaultSubject: "Reference Check Request – Arriv Estate Media" },

  // System
  { key: "sendSignupEmail", name: "Signup Email", category: "System", description: "Signup confirmation and welcome email", variables: ["firstName", "loginUrl"], defaultSubject: "Welcome to Arriv Estate Media" },
  { key: "sendForgotPasswordEmail", name: "Forgot Password", category: "System", description: "Password reset email with reset link", variables: ["firstName", "resetUrl"], defaultSubject: "Password Reset – Arriv Estate Media" },
  { key: "sendDeletionEmail", name: "Account Deletion", category: "System", description: "Account deletion confirmation notification", variables: ["firstName", "deletionDate"], defaultSubject: "Account Deletion Confirmation – Arriv Estate Media" },
  { key: "sendAdminEmail", name: "Admin Email", category: "System", description: "General admin notification email", variables: ["subject", "message"], defaultSubject: "Arriv Estate Media Notification" },
  { key: "sendDailySummaryEmails", name: "Daily Summary", category: "System", description: "Daily activity summary email", variables: ["summaryDate", "metrics"], defaultSubject: "Daily Activity Summary – Arriv Estate Media" },
  { key: "sendUpcomingTaskEmail", name: "Upcoming Task Reminder", category: "System", description: "Upcoming task reminder email", variables: ["firstName", "taskName", "dueDate"], defaultSubject: "Upcoming Task Reminder – Arriv Estate Media" },
  { key: "sendTaskFiveMinuteReminder", name: "5-Minute Task Reminder", category: "System", description: "5-minute urgent task reminder", variables: ["firstName", "taskName"], defaultSubject: "Starting Soon – Task Reminder" },
  { key: "sendFootageUploadReminders", name: "Footage Upload Reminder", category: "System", description: "Reminder to upload footage for completed jobs", variables: ["firstName", "jobDetails"], defaultSubject: "Footage Upload Reminder – Arriv Estate Media" },
  { key: "sendJobReminders", name: "Job Reminders", category: "System", description: "Job shoot reminder emails to media partners", variables: ["firstName", "jobDetails", "scheduledDate"], defaultSubject: "Job Reminder – Arriv Estate Media" },
  { key: "sendSupraAccessNotification", name: "Supra Access Notification", category: "System", description: "Supra access notification and instructions", variables: ["firstName", "accessDetails"], defaultSubject: "Supra Access Notification – Arriv Estate Media" },
  { key: "sendVideoCallInvite", name: "Video Call Invite", category: "System", description: "Video call invitation email", variables: ["firstName", "meetingLink", "scheduledTime"], defaultSubject: "Video Call Invitation – Arriv Estate Media" },
  { key: "sendMediaToClient", name: "Media to Client", category: "System", description: "Media delivery email with download link", variables: ["clientName", "mediaUrl"], defaultSubject: "Your Media is Ready – Arriv Estate Media" },
  { key: "sendInvoiceEmailViaGmail", name: "Invoice via Gmail", category: "System", description: "Invoice email sent through Gmail integration", variables: ["clientName", "invoiceUrl", "amount"], defaultSubject: "Invoice from Arriv Estate Media" },
  { key: "sendScheduledEmails", name: "Scheduled Emails", category: "System", description: "Scheduled email dispatch handler", variables: ["subject", "body"], defaultSubject: "Arriv Estate Media Notification" },
];

export const EMAIL_CATEGORIES = ["Interview", "Application", "Booking", "Onboarding", "Payroll", "Sales", "System"];

export function getCatalogEntry(key) {
  return EMAIL_CATALOG.find(e => e.key === key);
}

export function getCategoryCount(category) {
  return EMAIL_CATALOG.filter(e => e.category === category).length;
}