// Catalog of all email-sending functions in the system.
// Each entry corresponds to a backend function that sends an email.
// The template_key matches the function name so saved templates can be
// looked up and used by the corresponding function.

export const EMAIL_CATALOG = [
  // Interview
  { key: "sendSalesInterviewInvitation", name: "First-Round Interview Invitation", category: "Interview", description: "Sent to sales candidates invited to a first-round AI interview with Ashley", variables: ["firstName", "portalUrl"] },
  { key: "sendSalesInterviewScheduledEmail", name: "Interview Scheduled Confirmation", category: "Interview", description: "Confirmation email with meeting details after an interview is scheduled", variables: ["firstName", "scheduledDate", "scheduledTime", "meetingLink", "portalUrl"] },
  { key: "sendInterviewReminder", name: "Interview Reminder (30 min)", category: "Interview", description: "30-minute pre-interview reminder sent to candidate and admin", variables: ["firstName", "scheduledTime", "meetingLink", "interviewMode"] },
  { key: "sendSalesInterview2Invitation", name: "Second-Round Interview Invitation", category: "Interview", description: "Invitation to a second-round human interview", variables: ["firstName", "scheduledDate", "scheduledTime", "meetingLink"] },
  { key: "sendInterviewApologyEmail", name: "Interview Apology / Reschedule", category: "Interview", description: "Sent when an interview needs to be rescheduled or apology for missed interview", variables: ["firstName", "portalUrl"] },

  // Application
  { key: "sendApplicationWelcomeEmail", name: "Application Welcome", category: "Application", description: "Welcome email when an application is first received", variables: ["firstName", "portalUrl"] },
  { key: "sendApplicationAcceptedEmail", name: "Application Accepted", category: "Application", description: "Sent when a media specialist application is accepted", variables: ["firstName", "portalUrl"] },
  { key: "sendApplicationClosedEmail", name: "Application Closed", category: "Application", description: "Sent when an application is denied or closed", variables: ["firstName", "portalUrl"] },
  { key: "sendApplicationWaitlistEmail", name: "Application Waitlist", category: "Application", description: "Sent when an applicant is placed on the waitlist", variables: ["firstName", "portalUrl"] },
  { key: "sendApplicationInvitationComing", name: "Invitation Coming Soon", category: "Application", description: "Heads-up that an interview invitation is coming soon", variables: ["firstName", "portalUrl"] },
  { key: "sendSalesOfferExtendedEmail", name: "Sales Offer Extended", category: "Application", description: "Offer email for sales growth advisor candidates", variables: ["firstName", "portalUrl", "offerDeadline"] },
  { key: "sendSalesOfferNotExtendedEmail", name: "Sales Offer Not Extended", category: "Application", description: "No-offer email for sales candidates not selected", variables: ["firstName", "portalUrl"] },

  // Booking
  { key: "sendBookingNotifications", name: "Booking Notifications", category: "Booking", description: "Booking confirmation and status notifications", variables: ["clientName", "jobDetails", "scheduledDate"] },
  { key: "sendBookingStatusEmail", name: "Booking Status Update", category: "Booking", description: "Booking status change notification to client", variables: ["clientName", "status", "jobDetails"] },
  { key: "sendReceiptToClient", name: "Receipt to Client", category: "Booking", description: "Payment receipt sent to client", variables: ["clientName", "amount", "invoiceUrl"] },
  { key: "sendClosingInvoiceEmail", name: "Closing Invoice", category: "Booking", description: "Closing invoice email with invoice attached", variables: ["clientName", "invoiceUrl", "amount"] },
  { key: "sendRefundReceipt", name: "Refund Receipt", category: "Booking", description: "Refund receipt email to client", variables: ["clientName", "amount", "refundDate"] },

  // Onboarding / Orientation
  { key: "sendOnboardingReceiptNotifications", name: "Onboarding Receipt", category: "Onboarding", description: "Onboarding receipt and welcome notification", variables: ["firstName", "receiptUrl"] },
  { key: "sendOrientationDeadlineReminders", name: "Orientation Deadline Reminder", category: "Onboarding", description: "Reminder about upcoming orientation deadlines", variables: ["firstName", "deadlineDate"] },
  { key: "sendAdminOnboardingNotification", name: "Admin Onboarding Notification", category: "Onboarding", description: "Notification to admin about new onboarding", variables: ["employeeName", "department"] },

  // Payroll
  { key: "sendPayrollSubmission", name: "Payroll Submission", category: "Payroll", description: "Payroll submission notification to payroll system", variables: ["employeeName", "payPeriod", "amount"] },

  // Sales
  { key: "sendReferenceCheckEmail", name: "Reference Check Email", category: "Sales", description: "Reference check request email to provided references", variables: ["candidateName", "referenceName", "surveyLink"] },

  // System
  { key: "sendSignupEmail", name: "Signup Email", category: "System", description: "Signup confirmation and welcome email", variables: ["firstName", "loginUrl"] },
  { key: "sendForgotPasswordEmail", name: "Forgot Password", category: "System", description: "Password reset email with reset link", variables: ["firstName", "resetUrl"] },
  { key: "sendDeletionEmail", name: "Account Deletion", category: "System", description: "Account deletion confirmation notification", variables: ["firstName", "deletionDate"] },
  { key: "sendAdminEmail", name: "Admin Email", category: "System", description: "General admin notification email", variables: ["subject", "message"] },
  { key: "sendDailySummaryEmails", name: "Daily Summary", category: "System", description: "Daily activity summary email", variables: ["summaryDate", "metrics"] },
  { key: "sendUpcomingTaskEmail", name: "Upcoming Task Reminder", category: "System", description: "Upcoming task reminder email", variables: ["firstName", "taskName", "dueDate"] },
  { key: "sendTaskFiveMinuteReminder", name: "5-Minute Task Reminder", category: "System", description: "5-minute urgent task reminder", variables: ["firstName", "taskName"] },
  { key: "sendFootageUploadReminders", name: "Footage Upload Reminder", category: "System", description: "Reminder to upload footage for completed jobs", variables: ["firstName", "jobDetails"] },
  { key: "sendJobReminders", name: "Job Reminders", category: "System", description: "Job shoot reminder emails to media partners", variables: ["firstName", "jobDetails", "scheduledDate"] },
  { key: "sendSupraAccessNotification", name: "Supra Access Notification", category: "System", description: "Supra access notification and instructions", variables: ["firstName", "accessDetails"] },
  { key: "sendVideoCallInvite", name: "Video Call Invite", category: "System", description: "Video call invitation email", variables: ["firstName", "meetingLink", "scheduledTime"] },
  { key: "sendMediaToClient", name: "Media to Client", category: "System", description: "Media delivery email with download link", variables: ["clientName", "mediaUrl"] },
  { key: "sendInvoiceEmailViaGmail", name: "Invoice via Gmail", category: "System", description: "Invoice email sent through Gmail integration", variables: ["clientName", "invoiceUrl", "amount"] },
  { key: "sendScheduledEmails", name: "Scheduled Emails", category: "System", description: "Scheduled email dispatch handler", variables: ["subject", "body"] },
];

export const EMAIL_CATEGORIES = ["Interview", "Application", "Booking", "Onboarding", "Payroll", "Sales", "System"];

export function getCatalogEntry(key) {
  return EMAIL_CATALOG.find(e => e.key === key);
}

export function getCategoryCount(category) {
  return EMAIL_CATALOG.filter(e => e.category === category).length;
}