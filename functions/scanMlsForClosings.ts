import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all active closing detection records that are still in "monitoring" status
    const closingDetections = await base44.asServiceRole.entities.ClosingDetection.filter({
      status: 'monitoring'
    });

    console.log(`[INFO] Found ${closingDetections.length} properties to monitor for closing`);

    const results = [];

    for (const detection of closingDetections) {
      const { job_id, job_address, monitoring_start_date } = detection;

      // Use OpenAI to search MLS and real estate sites for sold status
      const searchResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Search the MLS databases (GAMLS, FMLS, Zillow, Redfin) for the property at "${job_address}". 
        
Has this property been sold/closed since ${monitoring_start_date}? 
        
If sold, provide:
1. Closing date
2. Final sale price
3. Verification source

If not sold, respond with "NOT_SOLD".

Be thorough and check multiple sources. Only report if you find confirmed sold status.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            sold: { type: 'boolean' },
            closing_date: { type: 'string' },
            final_sale_price: { type: 'number' },
            verification_source: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
          }
        }
      });

      console.log(`[INFO] Search result for ${job_address}:`, searchResult);

      // If sold, create the final invoice and send email
      if (searchResult.sold) {
        console.log(`[INFO] Property ${job_address} confirmed sold for $${searchResult.final_sale_price}`);

        // Get the related job
        const jobs = await base44.asServiceRole.entities.Job.filter({ id: job_id });
        const job = jobs[0];

        if (!job) {
          console.warn(`[WARN] Job ${job_id} not found`);
          results.push({
            address: job_address,
            status: 'error',
            message: 'Job not found'
          });
          continue;
        }

        // Get the related booking/invoice
        const invoices = await base44.asServiceRole.entities.Invoice.filter({
          job_id: job_id,
          pay_at_closing: true,
          invoice_type: 'deposit'
        });

        if (invoices.length === 0) {
          console.warn(`[WARN] No pay-at-closing invoice found for job ${job_id}`);
          results.push({
            address: job_address,
            status: 'error',
            message: 'No pay-at-closing invoice found'
          });
          continue;
        }

        const invoice = invoices[0];

        // Create final closing invoice record
        const finalInvoiceNumber = `FIN-${invoice.invoice_number}`;

        const newInvoice = await base44.asServiceRole.entities.Invoice.create({
          invoice_number: finalInvoiceNumber,
          invoice_type: 'final_closing',
          job_id: job_id,
          client_name: invoice.client_name,
          client_email: invoice.client_email,
          job_address: invoice.job_address,
          service_date: invoice.service_date,
          package: invoice.package,
          add_ons: invoice.add_ons || [],
          amount: 0, // Will be calculated
          deposit_amount: 50,
          payment_status: 'unpaid',
          pay_at_closing: true,
          closing_date: searchResult.closing_date,
          final_sale_price: searchResult.final_sale_price,
          pay_at_closing_rate: invoice.pay_at_closing_rate || 0.0008,
          package_minimum: invoice.package_minimum || 0
        });

        console.log(`[INFO] Created final closing invoice: ${finalInvoiceNumber}`);

        // Calculate balance due
        const baseFee = searchResult.final_sale_price * (invoice.pay_at_closing_rate || 0.0008);
        const addonTotal = (invoice.add_ons || []).reduce((sum, addon) => {
          const prices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
          return sum + (prices[addon] || 0);
        }, 0);
        const totalFee = baseFee + addonTotal;
        const balanceDue = totalFee - 50;

        // Update with calculated amount
        await base44.asServiceRole.entities.Invoice.update(newInvoice.id, {
          amount: balanceDue
        });

        // Generate and upload invoice to Google Drive (UNPAID folder)
        const invoiceHTML = await base44.asServiceRole.functions.invoke('generateFinalClosingInvoicePDF', {
          invoiceNumber: finalInvoiceNumber,
          clientName: invoice.client_name,
          jobAddress: invoice.job_address,
          serviceDate: invoice.service_date,
          packageName: invoice.package,
          addOns: invoice.add_ons || [],
          finalSalePrice: searchResult.final_sale_price,
          payAtClosingRate: invoice.pay_at_closing_rate || 0.0008,
          depositPaid: 50
        });

        const htmlContent = invoiceHTML.data?.html;
        if (!htmlContent) {
          throw new Error('Failed to generate invoice HTML');
        }

        // TODO: Convert HTML to PDF and upload to Drive UNPAID folder

        // Send email to client
        await base44.asServiceRole.functions.invoke('sendFinalClosingInvoiceEmail', {
          clientEmail: invoice.client_email,
          clientName: invoice.client_name,
          jobAddress: invoice.job_address,
          finalSalePrice: searchResult.final_sale_price,
          balanceDue: balanceDue,
          invoiceId: newInvoice.id
        });

        // Update closing detection status
        await base44.asServiceRole.entities.ClosingDetection.update(detection.id, {
          status: 'closed',
          closed_detected_at: new Date().toISOString(),
          closing_date: searchResult.closing_date,
          final_sale_price: searchResult.final_sale_price,
          detection_source: 'ai_scan',
          final_invoice_sent: true
        });

        results.push({
          address: job_address,
          status: 'success',
          finalInvoiceNumber,
          finalSalePrice: searchResult.final_sale_price,
          balanceDue,
          message: 'Final closing invoice created and email sent'
        });

      } else {
        console.log(`[INFO] Property ${job_address} not yet sold, continuing to monitor`);
        results.push({
          address: job_address,
          status: 'monitoring',
          message: 'Property not yet sold'
        });
      }
    }

    return Response.json({
      success: true,
      processedCount: closingDetections.length,
      results
    });

  } catch (error) {
    console.error('Error scanning for closings:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});