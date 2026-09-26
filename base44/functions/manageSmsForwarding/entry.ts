import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

const SETTING_KEY = 'sms_forward_706_target';
const DEFAULT_TARGET = '+16786409268';

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
      const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: SETTING_KEY });
      const target = settings && settings.length > 0 ? settings[0].value : DEFAULT_TARGET;
      return Response.json({
        source_number: '+17069128967',
        target_number: target,
        default_target: DEFAULT_TARGET,
      });
    }

    if (action === 'set') {
      const target = e164(payload.target_number);
      if (!target) {
        return Response.json({ error: 'Invalid target_number' }, { status: 400 });
      }
      const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: SETTING_KEY });
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value: target });
      } else {
        await base44.asServiceRole.entities.AppSetting.create({ key: SETTING_KEY, value: target });
      }
      return Response.json({
        success: true,
        source_number: '+17069128967',
        target_number: target,
      });
    }

    return Response.json({ error: 'Unknown action. Use "get" or "set".' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});