/**
 * salesPhoneIdentity — rep telephony identity management.
 *
 * A representative may register their own cellphone and see their extension and
 * caller ID. Activation, extensions, caller IDs and caps are administrator-only,
 * because a rep must never be able to point another rep's calls, or the
 * company's caller ID, at themselves.
 *
 * Identities reuse the existing account's unique extension and dedicated number.
 * Creating an identity never allocates an extension or assigns a shared line.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { requireSalesSession } from '../../shared/salesSession.ts';
import { requireAdmin } from '../../shared/arrivOneAuth.ts';
import { normalizePhone } from '../../shared/salesDialOut.ts';
import { loadVoiceSettings } from '../../shared/arrivOneSettings.ts';
import { periodKey } from '../../shared/arrivOneSettings.ts';

const listOf = (v: any) => (Array.isArray(v) ? v : v?.items || []);

async function companyNumbers(base44: any) {
  const members = listOf(await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true }));
  return [...new Set(members.map((m: any) => normalizePhone(m.twilio_phone_number)).filter((n: string) => n && n !== '+18557654306'))];
}

async function identities(base44: any) {
  return listOf(await base44.asServiceRole.entities.SalesPhoneIdentity.filter({}).catch(() => []));
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'getMine';

    const settings = await loadVoiceSettings(base44);

    // ---------------- representative self-service ----------------
    if (action === 'getMine' || action === 'saveMine') {
      const session = await requireSalesSession(base44, req, body);
      if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
      const member = session.member;

      const mine = (await identities(base44)).find((i: any) => i.sales_member_id === member.id) || null;

      if (action === 'getMine') {
        return Response.json({
          identity: mine,
          member_extension: member.extension || '',
          member_twilio_number: member.twilio_phone_number || '',
          ready: {
            registered: !!mine?.cellphone,
            active: mine?.telephony_status === 'active',
            has_extension: !!mine?.extension,
            has_caller_id: !!mine?.caller_id_number,
          },
          access_number: normalizePhone(member.twilio_phone_number) || '',
        });
      }

      const cellphone = normalizePhone(body.cellphone || mine?.cellphone);
      if (!cellphone) {
        return Response.json({ error: 'Enter a valid 10-digit cellphone number.' }, { status: 400 });
      }
      const takenByOther = (await identities(base44)).find(
        (i: any) => i.sales_member_id !== member.id && String(i.cellphone || '').replace(/\D/g, '').slice(-10) === cellphone.slice(-10)
      );
      if (takenByOther) {
        return Response.json({ error: 'That cellphone is already registered to another representative.' }, { status: 409 });
      }

      const payload = {
        sales_member_id: member.id,
        sales_member_name: member.full_name || '',
        sales_member_email: member.email || '',
        cellphone,
        voicemail_enabled: body.voicemail_enabled !== false,
        telephony_status: mine?.telephony_status === 'active' ? 'active' : 'pending',
        updated_by: member.email || '',
        updated_at: new Date().toISOString(),
      };

      let saved;
      if (mine) saved = await base44.asServiceRole.entities.SalesPhoneIdentity.update(mine.id, payload);
      else saved = await base44.asServiceRole.entities.SalesPhoneIdentity.create(payload);

      return Response.json({
        success: true,
        identity: saved,
        message:
          saved.telephony_status === 'active'
            ? 'Your cellphone is registered and dial-out is live.'
            : 'Your cellphone is saved. An administrator must activate dial-out before it will work.',
      });
    }

    // ---------------- everything below is admin only ----------------
    const admin = await requireAdmin(base44);
    if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });
    const actorEmail = admin.user?.email || 'admin';

    if (action === 'list') {
      const [rows, members, numbers] = await Promise.all([
        identities(base44),
        listOf(await base44.asServiceRole.entities.SalesTeamMember.filter({}).catch(() => [])),
        companyNumbers(base44),
      ]);
      const byMember = new Map(rows.map((r: any) => [r.sales_member_id, r]));
      return Response.json({
        identities: rows,
        numbers,
        access_number: settings.access_number || '',
        settings,
        members: members.map((m: any) => ({
          id: m.id,
          full_name: m.full_name || '',
          email: m.email || '',
          is_active: m.is_active !== false,
          extension_hint: m.extension || '',
          twilio_phone_number: m.twilio_phone_number || '',
          identity: byMember.get(m.id) || null,
        })),
      });
    }

    if (action === 'seed') {
      const [rows, members] = await Promise.all([
        identities(base44),
        listOf(await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true }).catch(() => [])),
      ]);
      const taken = new Set(rows.map((r: any) => String(r.extension || '')).filter(Boolean));
      const created: any[] = [];
      for (const member of members) {
        if (rows.some((r: any) => r.sales_member_id === member.id)) continue;
        const extension = String(member.extension || '').trim();
        const number = normalizePhone(member.twilio_phone_number);
        if (!extension || taken.has(extension) || !number || number === '+18557654306') continue;
        taken.add(extension);
        const payload = {
          sales_member_id: member.id,
          sales_member_name: member.full_name || '',
          sales_member_email: member.email || '',
          cellphone: normalizePhone(member.mobile_phone_number || member.phone_number) || '',
          extension,
          caller_id_number: normalizePhone(member.twilio_phone_number) || '',
          telephony_status: 'pending',
          updated_by: actorEmail,
          updated_at: new Date().toISOString(),
        };
        created.push(await base44.asServiceRole.entities.SalesPhoneIdentity.create(payload));
      }
      return Response.json({ success: true, created, count: created.length });
    }

    if (action === 'save') {
      const target = body.identity || {};
      const memberId = target.sales_member_id || body.sales_member_id;
      if (!memberId) return Response.json({ error: 'sales_member_id is required' }, { status: 400 });
      const all = await identities(base44);
      const existing = all.find((i: any) => i.sales_member_id === memberId) || null;
      const member = await base44.asServiceRole.entities.SalesTeamMember.get(memberId)
        .catch((error: any) => error.status === 404 ? null : Promise.reject(error));
      if (!member) return Response.json({ error: 'Media Partner not found.' }, { status: 404 });

      const extension = String(target.extension ?? existing?.extension ?? '').replace(/\D/g, '').slice(0, 4);
      if (extension && all.some((i: any) => i.sales_member_id !== memberId && String(i.extension || '') === extension && i.telephony_status !== 'revoked')) {
        return Response.json({ error: `Extension ${extension} already belongs to another active representative.` }, { status: 409 });
      }

      const numbers = await companyNumbers(base44);
      const callerId = normalizePhone(target.caller_id_number || existing?.caller_id_number);
      if (callerId && !numbers.includes(callerId)) {
        return Response.json(
          { error: 'That caller ID is not one of the Arriv business numbers. A rep must never present a personal number.' },
          { status: 400 }
        );
      }

      if (callerId && (callerId !== normalizePhone(member.twilio_phone_number) || callerId === '+18557654306')) {
        return Response.json({ error: 'Use this Media Partner’s own assigned Twilio number, never the 855 main line or another partner’s number.' }, { status: 400 });
      }
      if (extension && extension !== String(member.extension || '')) {
        return Response.json({ error: 'Use the existing extension on this Media Partner account.' }, { status: 400 });
      }
      if (callerId && all.some((i: any) => i.sales_member_id !== memberId && normalizePhone(i.caller_id_number) === callerId)) {
        return Response.json({ error: 'That business number is already linked to another Media Partner.' }, { status: 409 });
      }

      const cellphone = normalizePhone(target.cellphone || existing?.cellphone);
      if (cellphone && all.some((i: any) => i.sales_member_id !== memberId && String(i.cellphone || '').replace(/\D/g, '').slice(-10) === cellphone.slice(-10))) {
        return Response.json({ error: 'That cellphone is already registered to another representative.' }, { status: 409 });
      }

      const status = ['active', 'suspended', 'revoked', 'pending'].includes(target.telephony_status)
        ? target.telephony_status
        : existing?.telephony_status || 'pending';

      if (status === 'active' && member.is_active === false) {
        return Response.json({ error: 'This Media Partner account is inactive.' }, { status: 400 });
      }
      if (status === 'active' && (!cellphone || !extension || !callerId)) {
        return Response.json(
          { error: 'To activate dial-out, the rep needs a cellphone, an extension and an Arriv caller ID.' },
          { status: 400 }
        );
      }

      const payload: any = {
        sales_member_id: memberId,
        sales_member_name: target.sales_member_name || existing?.sales_member_name || '',
        sales_member_email: target.sales_member_email || existing?.sales_member_email || '',
        cellphone,
        extension,
        caller_id_number: callerId || '',
        telephony_status: status,
        voicemail_enabled: target.voicemail_enabled !== false,
        monthly_minutes_cap: Number(target.monthly_minutes_cap ?? existing?.monthly_minutes_cap ?? 600),
        notes: target.notes ?? existing?.notes ?? '',
        updated_by: actorEmail,
        updated_at: new Date().toISOString(),
        ...(status === 'active' ? { verified_at: new Date().toISOString() } : {}),
      };
      if (existing) payload.period_key = existing.period_key || periodKey();

      const saved = existing
        ? await base44.asServiceRole.entities.SalesPhoneIdentity.update(existing.id, payload)
        : await base44.asServiceRole.entities.SalesPhoneIdentity.create(payload);

      await base44.asServiceRole.entities.IvrAuditLog.create({
        action: 'sales_phone_identity_saved',
        target_type: 'sales_phone_identity',
        target_key: memberId,
        summary: `Telephony identity ${status} — ext ${extension || 'none'}, caller ID ${callerId ? 'set' : 'none'}`,
        at: new Date().toISOString(),
      }).catch(() => {});

      return Response.json({ success: true, identity: saved });
    }

    if (action === 'revoke') {
      const memberId = body.sales_member_id;
      const all = await identities(base44);
      const existing = all.find((i: any) => i.sales_member_id === memberId);
      if (!existing) return Response.json({ error: 'No telephony identity for that rep.' }, { status: 404 });
      const saved = await base44.asServiceRole.entities.SalesPhoneIdentity.update(existing.id, {
        telephony_status: 'revoked',
        updated_by: actorEmail,
        updated_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.SalesDialSession.updateMany(
        { rep_id: memberId, status: 'active' },
        { $set: { status: 'ended', termination_reason: 'identity_revoked', ended_at: new Date().toISOString() } }
      ).catch(() => {});
      await base44.asServiceRole.entities.IvrAuditLog.create({
        action: 'sales_phone_identity_revoked',
        target_type: 'sales_phone_identity',
        target_key: memberId,
        summary: 'Dial-out revoked and open sessions ended',
        at: new Date().toISOString(),
      }).catch(() => {});
      return Response.json({ success: true, identity: saved });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('salesPhoneIdentity failed:', error);
    return Response.json({ error: error?.message || 'The request could not be completed.' }, { status: 500 });
  }
}