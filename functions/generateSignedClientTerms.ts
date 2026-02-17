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
    const termsText = `ARRIV Estate Media LLC
Client Terms & Conditions

1. Services
ARRIV Estate Media LLC provides real estate media services including photography, video, aerial imagery, and related deliverables as booked through ARRIV Estate Media LLC's platform or direct scheduling.

2. Booking & Scheduling
All bookings are subject to availability. Clients are responsible for ensuring timely property access and readiness. ARRIV Estate Media LLC is not responsible for delays caused by access issues, property conditions, or third-party systems.

3. Property Access Authorization
Clients authorize ARRIV Estate Media LLC and its Media Partners to access the property for the limited purpose of performing the booked services.

4. Pricing & Payment
Pricing is determined at the time of booking. Complimentary or discounted services do not establish an obligation for future free or reduced-rate services.

5. Media Delivery
Media is delivered digitally. Delivery timelines are estimates and not guaranteed. Clients are responsible for downloading and archiving delivered files.

6. Usage Rights
ARRIV Estate Media LLC grants Clients a non-exclusive, non-transferable license to use delivered media for marketing and listing purposes. ARRIV Estate Media LLC retains the right to use media for portfolio, promotional, and educational purposes unless otherwise agreed in writing.

7. Revisions
Reasonable revision requests are included when submitted promptly. Additional services or reshoots may incur additional fees.

8. Limitation of Liability
ARRIV Estate Media LLC is not responsible for third-party platform issues, listing performance, or outcomes related to the use of delivered media.

9. Cancellations
Cancellations or reschedules may be subject to fees if insufficient notice is provided or if resources have already been allocated.

10. Acceptance
By booking services with ARRIV Estate Media LLC, Clients agree to these Terms & Conditions. Continued use of the ARRIV platform constitutes acceptance of these terms.`;

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
    doc.text('ARRIV Estate Media LLC', margin, margin);
    doc.text('Client Terms & Conditions', margin, margin + 8);

    // Add terms text
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const splitText = doc.splitTextToSize(termsText, maxWidth);
    doc.text(splitText, margin, margin + 18);

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
    doc.text(`I, ${full_name}, confirm that I have read, understand, and agree to the ARRIV Estate Media LLC Client Terms & Conditions outlined above.`, margin, yPosition, { maxWidth });

    yPosition += 15;
    doc.text(`I acknowledge that I have checked the acceptance box and agree to be bound by these terms.`, margin, yPosition, { maxWidth });

    yPosition += 15;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPosition);

    yPosition += 8;
    doc.text(`Email: ${email}`, margin, yPosition);

    yPosition += 8;
    doc.text(`Name: ${full_name}`, margin, yPosition);

    // Convert to blob and upload
    const pdfArrayBuffer = doc.output('arraybuffer');
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

    // Upload to private storage
    const uploadRes = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
      file: pdfBlob
    });

    if (!uploadRes.file_uri) {
      throw new Error('Failed to upload PDF');
    }

    // Create signed terms record
    await base44.asServiceRole.entities.ClientSignedTerms.create({
      client_email: email,
      client_name: full_name,
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