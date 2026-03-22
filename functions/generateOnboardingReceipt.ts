import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { userId, paymentIntentId, paidAt } = await req.json();

    // Get user data
    const users = await base44.asServiceRole.entities.User.filter({ id: userId });
    const user = users[0];

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate amounts
    const baseAmount = 50;
    const gearBagAmount = user.addGearBag ? 50 : 0;
    const waterBottleAmount = user.addWaterBottle ? 40 : 0;
    const totalAmount = baseAmount + gearBagAmount + waterBottleAmount;

    const paidDate = new Date(paidAt);
    const formattedDate = paidDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const fileDate = paidDate.toISOString().split('T')[0];

    // Generate receipt content using AI
    const receiptContent = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Generate a professional receipt PDF content for:

Company: Arriv Estate Media
Payer: ${user.full_name}
Receipt Type: Media Partner Onboarding Fee
Date: ${formattedDate}
Payment Method: Stripe
Transaction ID: ${paymentIntentId}

Items:
- Media Partner Onboarding Fee (Required Shirt & Jacket): $${baseAmount}.00
${user.addGearBag ? '- Gear Bag: $50.00' : ''}
${user.addWaterBottle ? '- Water Bottle: $40.00' : ''}

Total Amount: $${totalAmount}.00

Apparel Details:
- Shirt: ${user.shirtFit} - Size ${user.shirtSize}
- Jacket: Size ${user.jacketSize}
${user.addGearBag ? '- Gear Bag: Included' : ''}
${user.addWaterBottle ? '- Water Bottle: Included' : ''}

Format as a professional receipt with company header, itemized breakdown, and payment confirmation.`,
      response_json_schema: {
        type: "object",
        properties: {
          content: { type: "string" }
        }
      }
    });

    const fileName = `${user.full_name} – Onboarding Receipt – ${fileDate}.pdf`;

    // Upload to Google Drive
    const driveResponse = await base44.asServiceRole.functions.invoke('uploadOnboardingReceiptToGoogleDrive', {
      fileName,
      receiptContent: receiptContent.content,
      userId: user.id
    });

    return Response.json({
      success: true,
      fileName,
      driveUrl: driveResponse.data.driveUrl
    });

  } catch (error) {
    console.error('Error generating receipt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});