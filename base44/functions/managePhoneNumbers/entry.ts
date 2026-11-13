import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

const SETTING_KEY_706 = 'sms_forward_706_target';
const DEFAULT_706_TARGET = '+16786409268';
const NUMBER_706 = '+17069128967';

const e164 = (n) => {
  if (!n) return '';
  let d = String(n).replace(/\D/g, '');
  if (d.length === 10) d = '1' + d;
  return d ? '+' + d : '';
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const action = payload.action || 'get';

    if (action === 'get') {
      let forward706 = DEFAULT_706_TARGET;
      try {
        const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: SETTING_KEY_706 });
        if (settings && settings.length > 0 && settings[0].value) {
          forward706 = settings[0].value;
        }
      } catch (e) {
        console.error('Failed to read 706 target:', e.message);
      }

      const numbers = [
        {
          number: Deno.env.get('TWILIO_PHONE_NUMBER') || '',
          label: 'Main SMS & Voice Line',
          function: 'Inbound SMS relay (client ↔ media specialist) and inbound voice calls',
          pointing_type: 'webhook',
          pointing_to: 'twilioSmsWebhook / twilioVoiceHandler',
          editable: false,
        },
        {
          number: Deno.env.get('TWILIO_CALLING_PHONE_NUMBER') || '',
          label: 'Outbound Calling Line',
          function: 'Outbound sales calls via TwiML app',
          pointing_type: 'twiml_app',
          pointing_to: Deno.env.get('TWILIO_TWIML_APP_SID') || '',
          editable: false,
        },
        {
          number: NUMBER_706,
          label: '706 SMS Forwarding Line',
          function: 'Forwards inbound SMS to a designated specialist number',
          pointing_type: 'phone',
          pointing_to: forward706,
          editable: true,
        },
      ];

      return Response.json({ numbers });
    }

    if (action === 'set_forward') {
      const target = e164(payload.target_number);
      if (!target) return Response.json({ error: 'Invalid target_number' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: SETTING_KEY_706 });
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value: target });
      } else {
        await base44.asServiceRole.entities.AppSetting.create({ key: SETTING_KEY_706, value: target });
      }
      return Response.json({ success: true, number: NUMBER_706, target_number: target });
    }

    return Response.json({ error: 'Unknown action. Use "get" or "set_forward".' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});