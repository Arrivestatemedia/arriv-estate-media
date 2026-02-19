import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
const PizZip = (await import('npm:pizzip@3.1.7')).default;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const templateUrl = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/c6ccd30b6_Arriv_Estate_Media_Pay_Up_Front_Invoice.docx';
    const templateRes = await fetch(templateUrl);
    const templateBytes = new Uint8Array(await templateRes.arrayBuffer());

    const zip = new PizZip(templateBytes);
    const documentXml = zip.files['word/document.xml'].asText();

    // Find context around the PLACE_STRIP_LINK area
    const idx = documentXml.indexOf('PLACE_STRIP');
    const snippet = idx !== -1 ? documentXml.substring(Math.max(0, idx - 500), idx + 500) : 'NOT FOUND';

    return Response.json({ snippet, found: idx !== -1 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});