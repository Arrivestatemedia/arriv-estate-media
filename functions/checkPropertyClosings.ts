import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all closing detections that are monitoring
    const monitoringClosings = await base44.asServiceRole.entities.ClosingDetection.filter({
      status: 'monitoring'
    });
    
    for (const closing of monitoringClosings) {
      // Use AI to scan for closing information
      const scanResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Search the web for information about the property at "${closing.job_address}". 
        
Check MLS listings, real estate websites, and public records to determine:
1. Has this property been sold/closed?
2. If yes, what was the final sale price?
3. When did it close?

Return your findings.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            is_closed: { type: "boolean" },
            final_sale_price: { type: "number" },
            closing_date: { type: "string" },
            confidence: { type: "string" },
            notes: { type: "string" }
          }
        }
      });
      
      // Update closing detection record
      await base44.asServiceRole.entities.ClosingDetection.update(closing.id, {
        last_scan_at: new Date().toISOString(),
        scan_notes: scanResult.notes
      });
      
      // If property is closed, trigger final invoice
      if (scanResult.is_closed && scanResult.confidence === 'high') {
        await base44.asServiceRole.entities.ClosingDetection.update(closing.id, {
          status: 'closed',
          closed_detected_at: new Date().toISOString(),
          closing_date: scanResult.closing_date,
          final_sale_price: scanResult.final_sale_price,
          detection_source: 'ai_scan'
        });
        
        // Generate and send final invoice
        await base44.asServiceRole.functions.invoke('generateFinalClosingInvoice', {
          jobId: closing.job_id,
          finalSalePrice: scanResult.final_sale_price,
          closingDate: scanResult.closing_date
        });
      }
    }
    
    return Response.json({ success: true, scannedCount: monitoringClosings.length });
    
  } catch (error) {
    console.error('Error checking closings:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});