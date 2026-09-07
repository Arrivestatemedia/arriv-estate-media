import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

// Check whether a customer qualifies for the $40 new-customer MLS sales bonus.
//
// Conditions (ALL must be true):
// - customer is a qualifying brand-new Estate Media customer/account
// - this is their first qualifying completed/paid Estate Media purchase
// - package = MLS Walkthrough
// - property tier = 0–2,500 sq ft (TIER_1)
// - base eligible MLS service = the $100 tier
// - bonus has not previously been consumed for this customer/account
//
// The bonus REPLACES normal 15% transaction commission for that qualifying first order.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { contact_id, contact_email, package_id, property_pricing_tier, sales_member_id } = body;

    if (!package_id || !property_pricing_tier) {
      return Response.json({ error: "package_id and property_pricing_tier are required" }, { status: 400 });
    }

    // Must be MLS Walkthrough at TIER_1 (0-2,500 sq ft, $100 base)
    if (package_id !== "mls_walkthrough" || property_pricing_tier !== "TIER_1") {
      return Response.json({
        success: true,
        eligible: false,
        reason: "New-customer MLS bonus requires MLS Walkthrough at 0-2,500 sq ft tier",
      });
    }

    // Find the contact by ID or email
    let contact = null;
    if (contact_id) {
      try {
        contact = await base44.asServiceRole.entities.Contact.get(contact_id);
      } catch (e) { /* ignore */ }
    }
    if (!contact && contact_email) {
      const contacts = await base44.asServiceRole.entities.Contact.filter({
        email: contact_email,
      });
      contact = (contacts || []).find(
        (c) => c.email?.toLowerCase() === contact_email.toLowerCase()
      );
    }

    if (!contact) {
      // No contact record — treat as brand-new customer (eligible)
      return Response.json({
        success: true,
        eligible: true,
        reason: "No existing contact record — brand-new customer",
        contact_id: null,
      });
    }

    // Check if bonus has already been consumed
    if (contact.new_customer_bonus_consumed) {
      return Response.json({
        success: true,
        eligible: false,
        reason: "New-customer MLS bonus already consumed for this customer",
        contact_id: contact.id,
        consumed_at: contact.new_customer_bonus_consumed_at,
        consumed_by_order: contact.new_customer_bonus_order_id,
      });
    }

    // Check if the contact is eligible (default true for new contacts)
    if (contact.new_customer_bonus_eligible === false) {
      return Response.json({
        success: true,
        eligible: false,
        reason: "Customer is not eligible for new-customer bonus (admin-disabled)",
        contact_id: contact.id,
      });
    }

    // Check if this customer has any previous completed/booked bookings
    // (a brand-new customer has no prior purchases)
    let hasPreviousBookings = false;
    try {
      const previousBookings = await base44.asServiceRole.entities.Booking.filter({
        client_email: contact.email,
      });
      // Check if any previous booking is in a "completed" or "approved" state
      hasPreviousBookings = (previousBookings || []).some(
        (b) => b.status === "completed" || b.status === "approved"
      );
    } catch (e) {
      // If we can't check, be conservative and allow eligibility
    }

    if (hasPreviousBookings) {
      return Response.json({
        success: true,
        eligible: false,
        reason: "Customer has previous completed bookings — not a brand-new customer",
        contact_id: contact.id,
      });
    }

    return Response.json({
      success: true,
      eligible: true,
      reason: "Brand-new customer with MLS Walkthrough at 0-2,500 sq ft — $40 bonus applies",
      contact_id: contact.id,
    });
  } catch (error) {
    console.error("checkNewCustomerMlsBonus error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}