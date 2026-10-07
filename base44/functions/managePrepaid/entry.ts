import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  PREPAID_TIERS,
  PREPAID_CREDIT_VALUE,
  PREPAID_FEATURE_FLAG_KEY,
  getTierConfig,
  creditsRequiredForPrice,
  bookingValueForCredits,
  calculatePrepaidCommission,
  consumeFIFO,
  addMonths,
  generateId,
  round2,
  PROMOTIONAL_ADDON_CATEGORIES,
  PROMOTIONAL_MAX_BENEFIT_VALUE,
} from '../../shared/prepaidEngine.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // ── Feature flag check (global) ────────────────────────────────────────
    const flagRecords = await base44.asServiceRole.entities.AppSetting.filter(
      { key: PREPAID_FEATURE_FLAG_KEY },
      undefined,
      1
    );
    const flagArr = Array.isArray(flagRecords) ? flagRecords : (flagRecords?.data || []);
    const globalEnabled = flagArr.length > 0 ? flagArr[0].value === 'true' : false;

    // Admin-only actions: purchase, reload, redeem, admin_adjust, expire_lots
    // Customer-facing: get_wallet (also accessible by admin)
    const ADMIN_ACTIONS = ['purchase', 'reload', 'redeem', 'admin_adjust', 'expire_lots'];

    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}

    if (ADMIN_ACTIONS.includes(action)) {
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
      if (!globalEnabled) {
        return Response.json({ error: 'Prepaid feature is not enabled' }, { status: 403 });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // PURCHASE — create wallet + credit lot + commission event
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'purchase') {
      const { tier, customer_email, customer_name, customer_phone, sales_rep_id, stripe_transaction_id } = body;
      const config = getTierConfig(tier);
      if (!config) return Response.json({ error: 'Invalid tier' }, { status: 400 });
      if (!customer_email) return Response.json({ error: 'customer_email is required' }, { status: 400 });

      // Find or create Customer 360 (Contact)
      const existingContacts = await base44.asServiceRole.entities.Contact.filter(
        { email: customer_email },
        undefined,
        1
      );
      const contactArr = Array.isArray(existingContacts) ? existingContacts : (existingContacts?.data || []);
      let contact = contactArr[0];

      if (!contact) {
        const nameParts = (customer_name || '').trim().split(/\s+/);
        contact = await base44.asServiceRole.entities.Contact.create({
          email: customer_email,
          firstname: nameParts[0] || customer_name || '',
          lastname: nameParts.slice(1).join(' ') || '',
          phone: customer_phone || '',
          lifecycle_stage: 'customer',
          lead_status: 'CONNECTED',
          sales_member_id: sales_rep_id || '',
        });
      }

      // Check for existing wallet
      const existingWallets = await base44.asServiceRole.entities.PrepaidWallet.filter(
        { customer_id: contact.id },
        undefined,
        1
      );
      const walletArr = Array.isArray(existingWallets) ? existingWallets : (existingWallets?.data || []);
      if (walletArr.length > 0) {
        return Response.json({ error: 'Customer already has a prepaid wallet. Use reload action.', wallet_id: walletArr[0].id }, { status: 409 });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const expiresAt = addMonths(now, config.validity_months).toISOString();

      // Create wallet
      const wallet = await base44.asServiceRole.entities.PrepaidWallet.create({
        customer_id: contact.id,
        customer_email: contact.email,
        customer_name: customer_name || `${contact.firstname || ''} ${contact.lastname || ''}`.trim(),
        tier: config.tier,
        support_tier: config.support_tier,
        credits_balance: config.credits,
        booking_value_balance: config.booking_value,
        total_credits_issued: config.credits,
        total_booking_value_issued: config.booking_value,
        total_credits_redeemed: 0,
        total_booking_value_redeemed: 0,
        total_credits_expired: 0,
        total_booking_value_expired: 0,
        promotional_benefits_available: config.promotional_benefits_per_cycle,
        promotional_benefits_used: 0,
        sales_rep_id: sales_rep_id || '',
        sales_rep_email: '',
        status: 'active',
        feature_flag_enabled: true,
        created_at: nowIso,
        updated_at: nowIso,
      });

      // Resolve rep email if rep_id provided
      let repEmail = '';
      let repEligible = false;
      if (sales_rep_id) {
        try {
          const rep = await base44.asServiceRole.entities.SalesTeamMember.get(sales_rep_id);
          if (rep) {
            repEmail = rep.email || '';
            repEligible = rep.status === 'active' || rep.status === 'ACTIVE' || !rep.status;
          }
        } catch {}
      }

      // Update wallet with rep email
      if (repEmail) {
        await base44.asServiceRole.entities.PrepaidWallet.update(wallet.id, { sales_rep_email: repEmail });
      }

      // Create credit lot
      const lotId = generateId('lot');
      const lot = await base44.asServiceRole.entities.CreditLot.create({
        wallet_id: wallet.id,
        customer_id: contact.id,
        customer_email: contact.email,
        lot_id: lotId,
        source: 'purchase',
        source_transaction_id: '',
        tier: config.tier,
        credits_issued: config.credits,
        credits_remaining: config.credits,
        booking_value_issued: config.booking_value,
        booking_value_remaining: config.booking_value,
        expires_at: expiresAt,
        expired: false,
        fifo_order: Date.now(),
        stripe_transaction_id: stripe_transaction_id || '',
        created_at: nowIso,
      });

      // Create wallet transaction
      const txnId = generateId('ptxn');
      const txn = await base44.asServiceRole.entities.WalletTransaction.create({
        transaction_id: txnId,
        wallet_id: wallet.id,
        customer_id: contact.id,
        customer_email: contact.email,
        type: 'PREPAID_PURCHASE',
        cash_amount: config.cash_price,
        credits: config.credits,
        booking_value: config.booking_value,
        stripe_transaction_id: stripe_transaction_id || '',
        booking_id: '',
        lot_id: lotId,
        source: 'ADMIN',
        actor: user?.email || 'system',
        description: `Prepaid ${config.tier} purchase — $${config.cash_price} for ${config.credits} credits ($${config.booking_value} booking value)`,
        prepaid_tier: config.tier,
        created_at: nowIso,
      });

      // Link lot to transaction
      await base44.asServiceRole.entities.CreditLot.update(lot.id, { source_transaction_id: txnId });

      // Create commission event if rep is eligible
      let commissionEvent = null;
      if (sales_rep_id && repEligible) {
        const commissionAmount = calculatePrepaidCommission(config.cash_price);
        const sourceEventId = generateId('empe');
        commissionEvent = await base44.asServiceRole.entities.PrepaidCompensationEvent.create({
          source_event_id: sourceEventId,
          source_system: 'ARRIV_ESTATE_MEDIA',
          source_type: 'PREPAID_PURCHASE_COMMISSION',
          employee_id: sales_rep_id,
          employee_email: repEmail,
          customer_id: contact.id,
          transaction_id: txnId,
          gross_customer_cash: config.cash_price,
          commission_amount: commissionAmount,
          currency: 'USD',
          earned_at: nowIso,
          status: 'APPROVED',
          prepaid_tier: config.tier,
          delivered_to_payroll: false,
          delivery_attempts: 0,
          idempotency_key: sourceEventId,
          effective_at: nowIso,
        });
      }

      return Response.json({
        status: 'success',
        wallet_id: wallet.id,
        contact_id: contact.id,
        tier: config.tier,
        credits: config.credits,
        booking_value: config.booking_value,
        cash_collected: config.cash_price,
        lot_id: lotId,
        expires_at: expiresAt,
        commission_event: commissionEvent ? {
          source_event_id: commissionEvent.source_event_id,
          commission_amount: commissionEvent.commission_amount,
        } : null,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // RELOAD — add credit lot to existing wallet
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'reload') {
      const { wallet_id, tier, sales_rep_id, stripe_transaction_id } = body;
      const config = getTierConfig(tier);
      if (!config) return Response.json({ error: 'Invalid tier' }, { status: 400 });
      if (!wallet_id) return Response.json({ error: 'wallet_id is required' }, { status: 400 });

      const wallet = await base44.asServiceRole.entities.PrepaidWallet.get(wallet_id);
      if (!wallet) return Response.json({ error: 'Wallet not found' }, { status: 404 });
      if (wallet.status !== 'active') return Response.json({ error: 'Wallet is not active' }, { status: 400 });

      // Check rep eligibility
      let repEligible = false;
      let repEmail = wallet.sales_rep_email || '';
      const effectiveRepId = sales_rep_id || wallet.sales_rep_id;
      if (effectiveRepId) {
        try {
          const rep = await base44.asServiceRole.entities.SalesTeamMember.get(effectiveRepId);
          if (rep) {
            repEmail = rep.email || repEmail;
            repEligible = rep.status === 'active' || rep.status === 'ACTIVE' || !rep.status;
          }
        } catch {}
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const expiresAt = addMonths(now, config.validity_months).toISOString();

      // Create credit lot
      const lotId = generateId('lot');
      const lot = await base44.asServiceRole.entities.CreditLot.create({
        wallet_id: wallet.id,
        customer_id: wallet.customer_id,
        customer_email: wallet.customer_email,
        lot_id: lotId,
        source: 'reload',
        source_transaction_id: '',
        tier: config.tier,
        credits_issued: config.credits,
        credits_remaining: config.credits,
        booking_value_issued: config.booking_value,
        booking_value_remaining: config.booking_value,
        expires_at: expiresAt,
        expired: false,
        fifo_order: Date.now(),
        stripe_transaction_id: stripe_transaction_id || '',
        created_at: nowIso,
      });

      // Create wallet transaction
      const txnId = generateId('ptxn');
      const txn = await base44.asServiceRole.entities.WalletTransaction.create({
        transaction_id: txnId,
        wallet_id: wallet.id,
        customer_id: wallet.customer_id,
        customer_email: wallet.customer_email,
        type: 'RELOAD',
        cash_amount: config.cash_price,
        credits: config.credits,
        booking_value: config.booking_value,
        stripe_transaction_id: stripe_transaction_id || '',
        booking_id: '',
        lot_id: lotId,
        source: 'ADMIN',
        actor: user?.email || 'system',
        description: `Prepaid ${config.tier} reload — $${config.cash_price} for ${config.credits} credits`,
        prepaid_tier: config.tier,
        created_at: nowIso,
      });

      await base44.asServiceRole.entities.CreditLot.update(lot.id, { source_transaction_id: txnId });

      // Update wallet balances
      const newCreditsBalance = round2(wallet.credits_balance + config.credits);
      const newBvBalance = round2(wallet.booking_value_balance + config.booking_value);
      const newTotalIssued = round2(wallet.total_credits_issued + config.credits);
      const newTotalBvIssued = round2(wallet.total_booking_value_issued + config.booking_value);
      await base44.asServiceRole.entities.PrepaidWallet.update(wallet.id, {
        credits_balance: newCreditsBalance,
        booking_value_balance: newBvBalance,
        total_credits_issued: newTotalIssued,
        total_booking_value_issued: newTotalBvIssued,
        updated_at: nowIso,
      });

      // Commission event for reload
      let commissionEvent = null;
      if (effectiveRepId && repEligible) {
        const commissionAmount = calculatePrepaidCommission(config.cash_price);
        const sourceEventId = generateId('empe');
        commissionEvent = await base44.asServiceRole.entities.PrepaidCompensationEvent.create({
          source_event_id: sourceEventId,
          source_system: 'ARRIV_ESTATE_MEDIA',
          source_type: 'PREPAID_RELOAD_COMMISSION',
          employee_id: effectiveRepId,
          employee_email: repEmail,
          customer_id: wallet.customer_id,
          transaction_id: txnId,
          gross_customer_cash: config.cash_price,
          commission_amount: commissionAmount,
          currency: 'USD',
          earned_at: nowIso,
          status: 'APPROVED',
          prepaid_tier: config.tier,
          delivered_to_payroll: false,
          delivery_attempts: 0,
          idempotency_key: sourceEventId,
          effective_at: nowIso,
        });
      }

      return Response.json({
        status: 'success',
        wallet_id: wallet.id,
        tier: config.tier,
        credits_added: config.credits,
        booking_value_added: config.booking_value,
        new_credits_balance: newCreditsBalance,
        new_booking_value_balance: newBvBalance,
        lot_id: lotId,
        expires_at: expiresAt,
        commission_event: commissionEvent ? {
          source_event_id: commissionEvent.source_event_id,
          commission_amount: commissionEvent.commission_amount,
        } : null,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // REDEEM — consume credits via FIFO for a booking
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'redeem') {
      const { wallet_id, retail_price, booking_id, description } = body;
      if (!wallet_id) return Response.json({ error: 'wallet_id is required' }, { status: 400 });
      if (!retail_price || retail_price <= 0) return Response.json({ error: 'retail_price must be positive' }, { status: 400 });

      const wallet = await base44.asServiceRole.entities.PrepaidWallet.get(wallet_id);
      if (!wallet) return Response.json({ error: 'Wallet not found' }, { status: 404 });
      if (wallet.status !== 'active') return Response.json({ error: 'Wallet is not active' }, { status: 400 });

      const creditsNeeded = creditsRequiredForPrice(retail_price);
      if (wallet.credits_balance < creditsNeeded) {
        return Response.json({
          error: 'Insufficient credits for full redemption',
          credits_needed: round2(creditsNeeded),
          credits_available: wallet.credits_balance,
          credits_shortfall: round2(creditsNeeded - wallet.credits_balance),
          hint: 'Use split payment: apply available credits first, charge remainder via existing payment workflow.',
        }, { status: 422 });
      }

      // Get all eligible lots
      const lotsResponse = await base44.asServiceRole.entities.CreditLot.filter(
        { wallet_id: wallet.id, expired: false },
        'fifo_order',
        200
      );
      const lots = Array.isArray(lotsResponse) ? lotsResponse : (lotsResponse?.data || []);

      const consumptionResult = consumeFIFO(lots, creditsNeeded);
      if (consumptionResult.credits_shortfall > 0) {
        return Response.json({
          error: 'Insufficient eligible (non-expired) credits',
          credits_needed: round2(creditsNeeded),
          credits_consumed: consumptionResult.total_consumed,
          credits_shortfall: consumptionResult.credits_shortfall,
        }, { status: 422 });
      }

      const nowIso = new Date().toISOString();

      // Apply consumption to each lot
      for (const entry of consumptionResult.consumption) {
        const lot = lots.find(l => l.lot_id === entry.lot_id);
        if (lot) {
          const newRemaining = round2(lot.credits_remaining - entry.credits);
          const newBvRemaining = round2(lot.booking_value_remaining - entry.booking_value);
          await base44.asServiceRole.entities.CreditLot.update(lot.id, {
            credits_remaining: newRemaining,
            booking_value_remaining: newBvRemaining,
          });
        }
      }

      // Create wallet transaction
      const txnId = generateId('ptxn');
      await base44.asServiceRole.entities.WalletTransaction.create({
        transaction_id: txnId,
        wallet_id: wallet.id,
        customer_id: wallet.customer_id,
        customer_email: wallet.customer_email,
        type: 'BOOKING_REDEMPTION',
        cash_amount: 0,
        credits: -round2(consumptionResult.total_consumed),
        booking_value: -round2(consumptionResult.booking_value_consumed),
        stripe_transaction_id: '',
        booking_id: booking_id || '',
        lot_id: consumptionResult.consumption.length === 1 ? consumptionResult.consumption[0].lot_id : '',
        source: 'BOOKING',
        actor: user?.email || 'system',
        description: description || `Booking redemption — ${round2(consumptionResult.total_consumed)} credits ($${round2(consumptionResult.booking_value_consumed)} booking value) for booking ${booking_id || 'N/A'}`,
        prepaid_tier: wallet.tier,
        created_at: nowIso,
      });

      // Update wallet balances
      const newCreditsBalance = round2(wallet.credits_balance - consumptionResult.total_consumed);
      const newBvBalance = round2(wallet.booking_value_balance - consumptionResult.booking_value_consumed);
      const newTotalRedeemed = round2(wallet.total_credits_redeemed + consumptionResult.total_consumed);
      const newTotalBvRedeemed = round2(wallet.total_booking_value_redeemed + consumptionResult.booking_value_consumed);
      await base44.asServiceRole.entities.PrepaidWallet.update(wallet.id, {
        credits_balance: newCreditsBalance,
        booking_value_balance: newBvBalance,
        total_credits_redeemed: newTotalRedeemed,
        total_booking_value_redeemed: newTotalBvRedeemed,
        updated_at: nowIso,
      });

      return Response.json({
        status: 'success',
        wallet_id: wallet.id,
        booking_id: booking_id || '',
        retail_price: round2(retail_price),
        credits_consumed: round2(consumptionResult.total_consumed),
        booking_value_consumed: round2(consumptionResult.booking_value_consumed),
        lots_consumed: consumptionResult.consumption,
        remaining_credits: newCreditsBalance,
        remaining_booking_value: newBvBalance,
        transaction_id: txnId,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SPLIT_REDEEM — apply available wallet credits, return cash shortfall.
    // Used for checkout when wallet may not cover the full booking total.
    // Atomic: FIFO consumption + wallet transaction + balance update in one call.
    // If the Arriv Pay shortfall charge fails later, call reverse_redemption
    // with the returned transaction_id to restore wallet value.
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'split_redeem') {
      const { wallet_id, retail_price, booking_id, description, idempotency_key } = body;
      if (!wallet_id) return Response.json({ error: 'wallet_id is required' }, { status: 400 });
      if (!retail_price || retail_price <= 0) return Response.json({ error: 'retail_price must be positive' }, { status: 400 });

      // Idempotency: if idempotency_key provided, check for existing transaction
      if (idempotency_key) {
        const existing = await base44.asServiceRole.entities.WalletTransaction.filter(
          { transaction_id: idempotency_key },
          undefined,
          1
        );
        const existingArr = Array.isArray(existing) ? existing : (existing?.data || []);
        if (existingArr.length > 0) {
          return { status: 'duplicate', transaction_id: idempotency_key };
        }
      }

      const wallet = await base44.asServiceRole.entities.PrepaidWallet.get(wallet_id);
      if (!wallet) return Response.json({ error: 'Wallet not found' }, { status: 404 });
      if (wallet.status !== 'active') return Response.json({ error: 'Wallet is not active' }, { status: 400 });

      const walletBvAvailable = round2(wallet.credits_balance * PREPAID_CREDIT_VALUE);
      const walletApplied = round2(Math.min(walletBvAvailable, retail_price));
      const cashShortfall = round2(retail_price - walletApplied);

      if (walletApplied <= 0) {
        return Response.json({
          status: 'success',
          wallet_applied: 0,
          cash_shortfall: retail_price,
          transaction_id: '',
          message: 'No wallet value available. Full payment via Arriv Pay.',
        });
      }

      const creditsConsumed = creditsRequiredForPrice(walletApplied);

      // Get eligible lots (FIFO)
      const lotsResponse = await base44.asServiceRole.entities.CreditLot.filter(
        { wallet_id: wallet.id, expired: false },
        'fifo_order',
        200
      );
      const lots = Array.isArray(lotsResponse) ? lotsResponse : (lotsResponse?.data || []);
      const consumptionResult = consumeFIFO(lots, creditsConsumed);

      const nowIso = new Date().toISOString();
      const txnId = idempotency_key || generateId('ptxn');

      // Apply consumption to each lot
      for (const entry of consumptionResult.consumption) {
        const lot = lots.find(l => l.lot_id === entry.lot_id);
        if (lot) {
          await base44.asServiceRole.entities.CreditLot.update(lot.id, {
            credits_remaining: round2(lot.credits_remaining - entry.credits),
            booking_value_remaining: round2(lot.booking_value_remaining - entry.booking_value),
          });
        }
      }

      // Create wallet transaction
      await base44.asServiceRole.entities.WalletTransaction.create({
        transaction_id: txnId,
        wallet_id: wallet.id,
        customer_id: wallet.customer_id,
        customer_email: wallet.customer_email,
        type: 'BOOKING_REDEMPTION',
        cash_amount: 0,
        credits: -round2(consumptionResult.total_consumed),
        booking_value: -round2(consumptionResult.booking_value_consumed),
        stripe_transaction_id: '',
        booking_id: booking_id || '',
        lot_id: consumptionResult.consumption.length === 1 ? consumptionResult.consumption[0].lot_id : '',
        source: 'BOOKING',
        actor: user?.email || 'system',
        description: description || `Wallet split payment — $${round2(consumptionResult.booking_value_consumed)} booking value applied to $${round2(retail_price)} booking`,
        prepaid_tier: wallet.tier,
        created_at: nowIso,
      });

      // Update wallet balances
      const newCreditsBalance = round2(wallet.credits_balance - consumptionResult.total_consumed);
      const newBvBalance = round2(newCreditsBalance * PREPAID_CREDIT_VALUE);
      await base44.asServiceRole.entities.PrepaidWallet.update(wallet.id, {
        credits_balance: newCreditsBalance,
        booking_value_balance: newBvBalance,
        total_credits_redeemed: round2(wallet.total_credits_redeemed + consumptionResult.total_consumed),
        total_booking_value_redeemed: round2(wallet.total_booking_value_redeemed + consumptionResult.booking_value_consumed),
        updated_at: nowIso,
      });

      return Response.json({
        status: 'success',
        wallet_id: wallet.id,
        booking_id: booking_id || '',
        retail_price: round2(retail_price),
        wallet_applied: walletApplied,
        cash_shortfall: cashShortfall,
        credits_consumed: round2(consumptionResult.total_consumed),
        booking_value_consumed: round2(consumptionResult.booking_value_consumed),
        lots_consumed: consumptionResult.consumption,
        remaining_credits: newCreditsBalance,
        remaining_booking_value: newBvBalance,
        transaction_id: txnId,
        message: cashShortfall > 0
          ? `Wallet applied $${walletApplied}. Charge $${cashShortfall} via Arriv Pay to complete booking.`
          : `Wallet fully covered the booking. No Arriv Pay charge needed.`,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // REVERSE_REDEMPTION — restore wallet value when a split-payment Arriv Pay
    // shortfall charge fails. Creates a compensating REFUND_REVERSAL transaction
    // and restores credits to the consumed lots. Does NOT delete the original
    // BOOKING_REDEMPTION transaction (immutable ledger).
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'reverse_redemption') {
      const { transaction_id, reason } = body;
      if (!transaction_id) return Response.json({ error: 'transaction_id is required' }, { status: 400 });

      const origTxnResp = await base44.asServiceRole.entities.WalletTransaction.filter(
        { transaction_id },
        undefined,
        1
      );
      const origTxnArr = Array.isArray(origTxnResp) ? origTxnResp : (origTxnResp?.data || []);
      const origTxn = origTxnArr[0];
      if (!origTxn) return Response.json({ error: 'Original transaction not found' }, { status: 404 });
      if (origTxn.type !== 'BOOKING_REDEMPTION') return Response.json({ error: 'Can only reverse BOOKING_REDEMPTION transactions' }, { status: 400 });

      // Idempotency: check if already reversed
      const existingReversal = await base44.asServiceRole.entities.WalletTransaction.filter(
        { lot_id: origTxn.lot_id, type: 'REFUND_REVERSAL', description: `Reversal of ${transaction_id}` },
        undefined,
        1
      );
      const existingRevArr = Array.isArray(existingReversal) ? existingReversal : (existingReversal?.data || []);
      if (existingRevArr.length > 0) {
        return { status: 'duplicate', transaction_id: existingRevArr[0].transaction_id };
      }

      const creditsToRestore = round2(Math.abs(origTxn.credits));
      const bvToRestore = round2(Math.abs(origTxn.booking_value));
      const nowIso = new Date().toISOString();

      // Restore credits to the original lot (if still exists and not expired)
      if (origTxn.lot_id) {
        const lotResp = await base44.asServiceRole.entities.CreditLot.filter({ lot_id: origTxn.lot_id }, undefined, 1);
        const lotArr = Array.isArray(lotResp) ? lotResp : (lotResp?.data || []);
        const lot = lotArr[0];
        if (lot && !lot.expired) {
          await base44.asServiceRole.entities.CreditLot.update(lot.id, {
            credits_remaining: round2(lot.credits_remaining + creditsToRestore),
            booking_value_remaining: round2(lot.booking_value_remaining + bvToRestore),
          });
        }
      }

      // Create compensating transaction
      const reversalTxnId = generateId('ptxn');
      await base44.asServiceRole.entities.WalletTransaction.create({
        transaction_id: reversalTxnId,
        wallet_id: origTxn.wallet_id,
        customer_id: origTxn.customer_id,
        customer_email: origTxn.customer_email,
        type: 'REFUND_REVERSAL',
        cash_amount: 0,
        credits: creditsToRestore,
        booking_value: bvToRestore,
        stripe_transaction_id: '',
        booking_id: origTxn.booking_id || '',
        lot_id: origTxn.lot_id || '',
        source: 'BOOKING',
        actor: user?.email || 'system',
        description: `Reversal of ${transaction_id}${reason ? ` — ${reason}` : ''}`,
        prepaid_tier: origTxn.prepaid_tier || '',
        created_at: nowIso,
      });

      // Restore wallet balance
      const wallet = await base44.asServiceRole.entities.PrepaidWallet.get(origTxn.wallet_id);
      if (wallet) {
        const newCredits = round2(wallet.credits_balance + creditsToRestore);
        await base44.asServiceRole.entities.PrepaidWallet.update(origTxn.wallet_id, {
          credits_balance: newCredits,
          booking_value_balance: round2(newCredits * PREPAID_CREDIT_VALUE),
          total_credits_redeemed: round2(Math.max(0, wallet.total_credits_redeemed - creditsToRestore)),
          total_booking_value_redeemed: round2(Math.max(0, wallet.total_booking_value_redeemed - bvToRestore)),
          updated_at: nowIso,
        });
      }

      return Response.json({
        status: 'success',
        original_transaction_id: transaction_id,
        reversal_transaction_id: reversalTxnId,
        credits_restored: creditsToRestore,
        booking_value_restored: bvToRestore,
        message: 'Wallet value restored. Original redemption preserved as immutable ledger entry.',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // REDEEM_PROMOTIONAL_ADDON — Premier/Elite promotional add-on benefit.
    // Customer-facing price becomes $0 for one eligible add-on. Benefit counter
    // decrements. Media Specialist still receives payout. Arriv absorbs cost.
    // No cash value, no credit conversion, no transfer, no rollover.
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'redeem_promotional_addon') {
      const { wallet_id, addon_category, booking_id } = body;
      if (!wallet_id) return Response.json({ error: 'wallet_id is required' }, { status: 400 });
      if (!addon_category) return Response.json({ error: 'addon_category is required' }, { status: 400 });

      if (!PROMOTIONAL_ADDON_CATEGORIES.includes(addon_category)) {
        return Response.json({ error: `Add-on "${addon_category}" is not eligible for promotional redemption. Eligible: ${PROMOTIONAL_ADDON_CATEGORIES.join(', ')}` }, { status: 400 });
      }

      const wallet = await base44.asServiceRole.entities.PrepaidWallet.get(wallet_id);
      if (!wallet) return Response.json({ error: 'Wallet not found' }, { status: 404 });
      if (wallet.status !== 'active') return Response.json({ error: 'Wallet is not active' }, { status: 400 });

      const config = getTierConfig(wallet.tier);
      if (!config || config.promotional_benefits_per_cycle === 0) {
        return Response.json({ error: `${wallet.tier} tier does not include promotional add-on benefits` }, { status: 400 });
      }

      const available = (wallet.promotional_benefits_available || 0) - (wallet.promotional_benefits_used || 0);
      if (available <= 0) {
        return Response.json({ error: 'No promotional add-on benefits remaining this cycle' }, { status: 400 });
      }

      const nowIso = new Date().toISOString();

      // Decrement benefit counter
      await base44.asServiceRole.entities.PrepaidWallet.update(wallet.id, {
        promotional_benefits_used: (wallet.promotional_benefits_used || 0) + 1,
        updated_at: nowIso,
      });

      // Record immutable benefit redemption (no credits consumed, no cash)
      const txnId = generateId('ptxn');
      await base44.asServiceRole.entities.WalletTransaction.create({
        transaction_id: txnId,
        wallet_id: wallet.id,
        customer_id: wallet.customer_id,
        customer_email: wallet.customer_email,
        type: 'PROMOTIONAL_BENEFIT',
        cash_amount: 0,
        credits: 0,
        booking_value: 0,
        stripe_transaction_id: '',
        booking_id: booking_id || '',
        lot_id: '',
        source: 'BOOKING',
        actor: user?.email || 'system',
        description: `Promotional add-on redeemed: ${addon_category} (max $${PROMOTIONAL_MAX_BENEFIT_VALUE} value). Tier: ${wallet.tier}. Media Specialist payout preserved.`,
        prepaid_tier: wallet.tier,
        created_at: nowIso,
      });

      return Response.json({
        status: 'success',
        wallet_id: wallet.id,
        addon_category,
        customer_price: 0,
        max_benefit_value: PROMOTIONAL_MAX_BENEFIT_VALUE,
        benefits_remaining: available - 1,
        benefits_used: (wallet.promotional_benefits_used || 0) + 1,
        transaction_id: txnId,
        message: `${addon_category} redeemed as promotional benefit. Customer price: $0. Media Specialist payout unaffected. Arriv absorbs promotional cost.`,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ADMIN_ADJUST — admin credit adjustment
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'admin_adjust') {
      const { wallet_id, credits_delta, reason } = body;
      if (!wallet_id) return Response.json({ error: 'wallet_id is required' }, { status: 400 });
      if (!credits_delta) return Response.json({ error: 'credits_delta is required' }, { status: 400 });

      const wallet = await base44.asServiceRole.entities.PrepaidWallet.get(wallet_id);
      if (!wallet) return Response.json({ error: 'Wallet not found' }, { status: 404 });

      const nowIso = new Date().toISOString();
      const creditsDelta = round2(credits_delta);
      const bvDelta = bookingValueForCredits(Math.abs(creditsDelta)) * (creditsDelta > 0 ? 1 : -1);

      const newCreditsBalance = round2(wallet.credits_balance + creditsDelta);
      if (newCreditsBalance < 0) {
        return Response.json({ error: 'Adjustment would result in negative balance' }, { status: 400 });
      }

      // If positive adjustment, create a lot
      let lotId = '';
      if (creditsDelta > 0) {
        lotId = generateId('lot');
        const expiresAt = addMonths(new Date(), 12).toISOString();
        await base44.asServiceRole.entities.CreditLot.create({
          wallet_id: wallet.id,
          customer_id: wallet.customer_id,
          customer_email: wallet.customer_email,
          lot_id: lotId,
          source: 'admin_adjustment',
          source_transaction_id: '',
          tier: wallet.tier,
          credits_issued: creditsDelta,
          credits_remaining: creditsDelta,
          booking_value_issued: bookingValueForCredits(creditsDelta),
          booking_value_remaining: bookingValueForCredits(creditsDelta),
          expires_at: expiresAt,
          expired: false,
          fifo_order: Date.now(),
          created_at: nowIso,
        });
      }

      const txnId = generateId('ptxn');
      await base44.asServiceRole.entities.WalletTransaction.create({
        transaction_id: txnId,
        wallet_id: wallet.id,
        customer_id: wallet.customer_id,
        customer_email: wallet.customer_email,
        type: 'ADMIN_ADJUSTMENT',
        cash_amount: 0,
        credits: creditsDelta,
        booking_value: round2(bvDelta),
        stripe_transaction_id: '',
        booking_id: '',
        lot_id: lotId,
        source: 'ADMIN',
        actor: user?.email || 'admin',
        description: reason || `Admin adjustment — ${creditsDelta} credits`,
        prepaid_tier: wallet.tier,
        created_at: nowIso,
      });

      await base44.asServiceRole.entities.PrepaidWallet.update(wallet.id, {
        credits_balance: newCreditsBalance,
        booking_value_balance: round2(newCreditsBalance * PREPAID_CREDIT_VALUE),
        total_credits_issued: creditsDelta > 0 ? round2(wallet.total_credits_issued + creditsDelta) : wallet.total_credits_issued,
        total_booking_value_issued: creditsDelta > 0 ? round2(wallet.total_booking_value_issued + bvDelta) : wallet.total_booking_value_issued,
        updated_at: nowIso,
      });

      return Response.json({
        status: 'success',
        wallet_id: wallet.id,
        credits_delta: creditsDelta,
        new_credits_balance: newCreditsBalance,
        transaction_id: txnId,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // EXPIRE_LOTS — mark past-due lots as expired
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'expire_lots') {
      const nowIso = new Date().toISOString();
      const lotsResponse = await base44.asServiceRole.entities.CreditLot.filter(
        { expired: false },
        undefined,
        500
      );
      const lots = Array.isArray(lotsResponse) ? lotsResponse : (lotsResponse?.data || []);
      const now = new Date();
      const expiredLots = lots.filter(l => new Date(l.expires_at) <= now);

      let totalCreditsExpired = 0;
      let totalBvExpired = 0;
      const walletUpdates = new Map();

      for (const lot of expiredLots) {
        const expiredCredits = lot.credits_remaining;
        const expiredBv = lot.booking_value_remaining;
        if (expiredCredits <= 0) {
          await base44.asServiceRole.entities.CreditLot.update(lot.id, { expired: true, expired_at: nowIso, credits_remaining: 0, booking_value_remaining: 0 });
          continue;
        }

        await base44.asServiceRole.entities.CreditLot.update(lot.id, {
          expired: true,
          expired_at: nowIso,
          credits_remaining: 0,
          booking_value_remaining: 0,
        });

        const txnId = generateId('ptxn');
        await base44.asServiceRole.entities.WalletTransaction.create({
          transaction_id: txnId,
          wallet_id: lot.wallet_id,
          customer_id: lot.customer_id,
          customer_email: lot.customer_email,
          type: 'EXPIRATION',
          cash_amount: 0,
          credits: -round2(expiredCredits),
          booking_value: -round2(expiredBv),
          stripe_transaction_id: '',
          booking_id: '',
          lot_id: lot.lot_id,
          source: 'SYSTEM',
          actor: 'system',
          description: `Credit expiration — lot ${lot.lot_id} expired`,
          prepaid_tier: lot.tier,
          created_at: nowIso,
        });

        totalCreditsExpired += expiredCredits;
        totalBvExpired += expiredBv;
        walletUpdates.set(lot.wallet_id, (walletUpdates.get(lot.wallet_id) || 0) + expiredCredits);
      }

      // Update wallet balances
      for (const [walletId, creditsExpired] of walletUpdates) {
        const w = await base44.asServiceRole.entities.PrepaidWallet.get(walletId);
        if (w) {
          const newCreditsBalance = round2(w.credits_balance - creditsExpired);
          const bvExpired = bookingValueForCredits(creditsExpired);
          await base44.asServiceRole.entities.PrepaidWallet.update(walletId, {
            credits_balance: newCreditsBalance,
            booking_value_balance: round2(newCreditsBalance * PREPAID_CREDIT_VALUE),
            total_credits_expired: round2(w.total_credits_expired + creditsExpired),
            total_booking_value_expired: round2(w.total_booking_value_expired + bvExpired),
            updated_at: nowIso,
          });
        }
      }

      return Response.json({
        status: 'success',
        lots_expired: expiredLots.length,
        total_credits_expired: round2(totalCreditsExpired),
        total_booking_value_expired: round2(totalBvExpired),
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET_WALLET — retrieve wallet + lots + recent transactions
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'get_wallet') {
      const { wallet_id, customer_id, customer_email } = body;

      let wallet = null;
      if (wallet_id) {
        wallet = await base44.asServiceRole.entities.PrepaidWallet.get(wallet_id);
      } else if (customer_id) {
        const wallets = await base44.asServiceRole.entities.PrepaidWallet.filter({ customer_id }, undefined, 1);
        const arr = Array.isArray(wallets) ? wallets : (wallets?.data || []);
        wallet = arr[0];
      } else if (customer_email) {
        const wallets = await base44.asServiceRole.entities.PrepaidWallet.filter({ customer_email }, undefined, 1);
        const arr = Array.isArray(wallets) ? wallets : (wallets?.data || []);
        wallet = arr[0];
      }

      if (!wallet) return Response.json({ error: 'Wallet not found' }, { status: 404 });

      // RLS: customer can only see their own wallet
      if (user && user.role !== 'admin' && wallet.customer_email !== user.email) {
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }

      const lotsResponse = await base44.asServiceRole.entities.CreditLot.filter(
        { wallet_id: wallet.id },
        'fifo_order',
        200
      );
      const lots = Array.isArray(lotsResponse) ? lotsResponse : (lotsResponse?.data || []);

      const txnsResponse = await base44.asServiceRole.entities.WalletTransaction.filter(
        { wallet_id: wallet.id },
        '-created_date',
        50
      );
      const transactions = Array.isArray(txnsResponse) ? txnsResponse : (txnsResponse?.data || []);

      const config = getTierConfig(wallet.tier);
      return Response.json({
        wallet: {
          ...wallet,
          booking_value_balance: round2(wallet.credits_balance * PREPAID_CREDIT_VALUE),
        },
        tier_config: config,
        lots: lots.map(l => ({
          ...l,
          booking_value_remaining: round2(l.credits_remaining * PREPAID_CREDIT_VALUE),
        })),
        recent_transactions: transactions,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // LIST_WALLETS — admin list all wallets
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'list_wallets') {
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
      const walletsResponse = await base44.asServiceRole.entities.PrepaidWallet.filter(
        { status: 'active' },
        '-created_date',
        200
      );
      const wallets = Array.isArray(walletsResponse) ? walletsResponse : (walletsResponse?.data || []);
      return Response.json({
        wallets: wallets.map(w => ({
          ...w,
          booking_value_balance: round2(w.credits_balance * PREPAID_CREDIT_VALUE),
        })),
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}