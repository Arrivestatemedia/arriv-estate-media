import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { full_name, email } = await req.json();

    if (!full_name || !email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Terms text
    const termsText = `MEDIA PARTNER TERMS & CONDITIONS

These Media Partner Terms & Conditions ("Terms") govern the relationship between you ("Media Partner") and Arriv ("Company"). By checking the acceptance box and signing up, you agree to be bound by these Terms.

1. INDEPENDENT CONTRACTOR STATUS
You are an independent contractor, not an employee. You have full control over how you perform your work, subject to the requirements outlined herein.

2. CONFIDENTIALITY
All information, client details, and access credentials provided to you during or after jobs are strictly confidential. You agree not to disclose or share this information with any third party without prior written consent from the Company.

3. NON-CIRCUMVENTION
You agree not to circumvent the Company by directly contacting clients or attempting to establish independent relationships with clients obtained through the Company's platform. Any circumvention may result in immediate termination and legal action.

4. ACCESS CREDENTIALS
Any access credentials (keys, codes, passwords, etc.) provided for job completion must be returned immediately upon job completion. Failure to do so may result in account suspension or termination.

5. JOB COMPLETION
You agree to complete all booked jobs professionally and on time. Any cancellations must be made with reasonable notice.

6. LIABILITY
The Company is not responsible for injuries, damages, or losses incurred while performing jobs.

7. TERMINATION
The Company reserves the right to terminate your account at any time for violation of these Terms.

By signing below, you acknowledge that you have read, understand, and agree to all terms and conditions outlined above.`;

    // Create PDF
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const maxWidth = pageWidth - 2 * margin;

    // Add title
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('MEDIA PARTNER TERMS & CONDITIONS', margin, margin);

    // Add terms text
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const splitText = doc.splitTextToSize(termsText, maxWidth);
    doc.text(splitText, margin, margin + 10);

    // Add signature section
    let yPosition = doc.lastAutoTable?.finalY || pageHeight - 60;
    if (yPosition < pageHeight - 60) {
      yPosition = pageHeight - 60;
    }

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('ACCEPTANCE', margin, yPosition);

    yPosition += 8;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`I, ${full_name}, confirm that I have read, understand, and agree to the Media Partner Terms & Conditions outlined above.`, margin, yPosition, { maxWidth });

    yPosition += 15;
    doc.text(`I acknowledge that I have checked the acceptance box and agree to be bound by these terms.`, margin, yPosition, { maxWidth });

    yPosition += 15;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPosition);

    yPosition += 8;
    doc.text(`Email: ${email}`, margin, yPosition);

    yPosition += 8;
    doc.text(`Name: ${full_name}`, margin, yPosition);

    // Convert to blob and upload
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const fileName = `signed_terms_${email.replace('@', '_at_')}_${Date.now()}.pdf`;

    // Upload to private storage
    const uploadRes = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
      file: pdfBuffer
    });

    if (!uploadRes.file_uri) {
      throw new Error('Failed to upload PDF');
    }

    // Create signed terms record
    await base44.asServiceRole.entities.SignedTerms.create({
      media_partner_email: email,
      media_partner_name: full_name,
      document_url: uploadRes.file_uri,
      signed_date: new Date().toISOString()
    });

    return Response.json({
      success: true,
      message: 'Terms document signed and stored',
      file_uri: uploadRes.file_uri
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});