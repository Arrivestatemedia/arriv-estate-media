import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

const TERMS_TEXT = `ARRIV ESTATE MEDIA
Media Partner Agreement

This Media Partner Agreement ("Agreement") is entered into between Arriv Estate Media, LLC ("Arriv") and the undersigned independent contractor ("Media Partner"). By accepting this Agreement, the Media Partner agrees to the following terms.

1. Independent Contractor Relationship
The Media Partner is an independent contractor and not an employee of Arriv Estate Media. Nothing in this Agreement creates an employer-employee relationship, partnership, joint venture, or agency relationship. The Media Partner is solely responsible for: federal, state, and local taxes; self-employment taxes; insurance; licenses and permits; business expenses; equipment.

2. Scope of Services
The Media Partner may accept assignments offered through the Arriv Estate Media platform, including but not limited to: real estate photography, videography, drone photography/video, floor plans, 3D tours, twilight photography, virtual staging capture, commercial media, and other media services offered by Arriv. The Media Partner is never required to accept any assignment.

3. Assignment Acceptance
Media Partners may accept or decline any assignment, set their travel radius, and update availability. Once an assignment is accepted, the Media Partner agrees to complete the project professionally and on time. Repeated cancellations or no-shows may result in suspension or termination.

4. Professional Standards
Media Partners agree to: arrive on time; dress professionally; treat clients respectfully; protect client property; follow all property access instructions; communicate promptly; and deliver work meeting Arriv's quality standards. Smoking, illegal drug use, harassment, discrimination, or inappropriate conduct while representing Arriv is prohibited.

5. Equipment Requirements
The Media Partner is responsible for maintaining professional-grade equipment suitable for the services they provide. This may include camera bodies, lenses, drone (if applicable), gimbal, tripod, lighting, memory cards, batteries, computer, and editing software. Arriv does not provide equipment unless otherwise agreed in writing.

6. Compensation
Media Partners will receive the payout amount shown when accepting an assignment. Compensation may vary depending on property size, services ordered, travel, complexity, promotions, and marketplace pricing. Payments are processed through Stripe Connect after successful completion of the assignment and client approval, subject to Arriv's payout schedule. The Media Partner acknowledges that Arriv retains a service fee for operating the marketplace.

7. Media Ownership & License
All photographs, videos, drone footage, floor plans, and other media created for Arriv assignments become the property of Arriv Estate Media upon payment. The Media Partner grants Arriv a perpetual, worldwide, royalty-free license to use, edit, reproduce, distribute, market, and sublicense the media. Media Partners may include completed work in personal portfolios unless prohibited by a client or applicable law.

8. Confidentiality
Media Partners may have access to confidential information including client information, property access codes, pricing, business practices, platform features, and internal communications. Confidential information may not be shared with anyone outside Arriv without written permission.

9. Non-Circumvention & Non-Solicitation
Media Partners agree not to solicit Arriv clients outside the platform, accept direct payment from Arriv clients for assignments originating through Arriv, or encourage clients to bypass Arriv. This restriction applies during participation on the platform and for 12 months after the last Arriv assignment with that client. Nothing in this section restricts lawful competition unrelated to Arriv-introduced clients.

10. Insurance & Compliance
Media Partners are responsible for complying with all applicable federal, state, and local laws. Drone operators must maintain any required certifications, including FAA Part 107 certification where applicable. Media Partners are encouraged to maintain general liability insurance and are responsible for any insurance required by law or their business.

11. Platform Access
Arriv may suspend or terminate platform access at any time for reasons including poor quality work, safety concerns, fraud, repeated cancellations, violation of this Agreement, client complaints, or illegal activity. Termination does not affect payment for completed and approved assignments.

12. Limitation of Liability
To the fullest extent permitted by law, Arriv Estate Media shall not be liable for indirect, incidental, special, consequential, or punitive damages arising from participation on the platform. Arriv's total liability shall not exceed the amount owed to the Media Partner for the specific assignment giving rise to the claim.

13. Indemnification
The Media Partner agrees to defend, indemnify, and hold harmless Arriv Estate Media, its owners, employees, and affiliates from claims, damages, liabilities, or expenses arising from negligence, property damage, personal injury, violation of laws, breach of this Agreement, or unauthorized use of equipment.

14. Governing Law
This Agreement shall be governed by the laws of the State of Georgia without regard to conflict of law principles. Any legal disputes shall be resolved in the appropriate courts located in Georgia.

15. Changes to This Agreement
Arriv may update this Agreement from time to time. Material changes will be communicated through the platform or by email. Continued use of the platform after such changes constitutes acceptance of the revised Agreement.

16. Electronic Acceptance
By checking the box and clicking "I Agree," the Media Partner acknowledges that they have read this Agreement in its entirety, understand its terms, agree to be legally bound by this Agreement, and consent to the use of electronic records and electronic signatures.`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { full_name, email } = await req.json();

    if (!full_name || !email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const effectiveDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const maxWidth = pageWidth - 2 * margin;
    let y = margin;

    const ensureSpace = (needed) => {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // Title block
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    ensureSpace(10);
    doc.text('ARRIV ESTATE MEDIA', margin, y, { maxWidth });
    y += 6;
    doc.setFontSize(11);
    doc.text('Media Partner Agreement', margin, y, { maxWidth });
    y += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Effective Date: ${effectiveDate}`, margin, y, { maxWidth });
    y += 6;

    // Body
    doc.setFontSize(9);
    const paragraphs = TERMS_TEXT.split('\n');
    for (const para of paragraphs) {
      if (para.trim() === '') { y += 2; continue; }
      const lines = doc.splitTextToSize(para, maxWidth);
      for (const line of lines) {
        ensureSpace(5);
        doc.text(line, margin, y);
        y += 5;
      }
    }

    // Signature block
    y += 6;
    ensureSpace(30);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('ELECTRONIC ACCEPTANCE', margin, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    const acceptLines = doc.splitTextToSize(
      `I, ${full_name}, by checking the box and clicking "I Agree," confirm that I have read this Agreement in its entirety, understand its terms, agree to be legally bound by it, and consent to the use of electronic records and electronic signatures.`,
      maxWidth
    );
    for (const line of acceptLines) {
      ensureSpace(5);
      doc.text(line, margin, y);
      y += 5;
    }
    y += 6;
    ensureSpace(5);
    doc.text(`Signature: ${full_name}`, margin, y);
    y += 6;
    ensureSpace(5);
    doc.text(`Email: ${email}`, margin, y);
    y += 6;
    ensureSpace(5);
    doc.text(`Date: ${new Date().toLocaleString()}`, margin, y);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    const uploadRes = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
      file: pdfBuffer
    });

    if (!uploadRes.file_uri) {
      throw new Error('Failed to upload PDF');
    }

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