import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Read settings
    const allSettings = await base44.asServiceRole.entities.AppSetting.list();
    const mode = (allSettings || []).find(s => s.key === 'culture_banner_mode')?.value || 'manual';
    const source = (allSettings || []).find(s => s.key === 'culture_banner_source')?.value || 'bible';

    // Fetch all active banners
    const allBanners = await base44.asServiceRole.entities.CultureBanner.filter(
      { is_active: true }, 'display_order', 50
    );

    if (mode === 'manual') {
      const manualBanners = (allBanners || []).filter(b => !b.auto_generated);
      return Response.json({ mode, source, banners: manualBanners });
    }

    // Automated mode — look for today's AI banner
    const today = new Date().toISOString().slice(0, 10);
    const todayAi = (allBanners || []).find(b => b.auto_generated && b.generated_date === today);
    if (todayAi) {
      return Response.json({ mode, source, banners: [todayAi] });
    }

    // Generate a new AI banner
    const prompt = source === 'secular'
      ? `Generate a short motivational message for a real estate media sales team. No religious content. Return JSON with: message (1-2 sentence motivational quote about relationships, persistence, and serving clients well), verse_reference (empty string), verse_text (empty string).`
      : `Generate a short motivational message for a real estate media sales team, tied to a Bible verse. Return JSON with: message (1-2 sentence motivational quote inspired by the verse, relevant to sales professionals who build relationships and serve clients), verse_reference (a real Bible reference like "Acts 28:19" or "Philippians 4:13"), verse_text (the actual text of that verse from the Bible).`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          verse_reference: { type: 'string' },
          verse_text: { type: 'string' },
        },
        required: ['message', 'verse_reference', 'verse_text'],
      },
    });

    const data = typeof result === 'string' ? JSON.parse(result) : result;

    const saved = await base44.asServiceRole.entities.CultureBanner.create({
      message: data.message || 'Keep building relationships. Results will follow.',
      verse_reference: data.verse_reference || '',
      verse_text: data.verse_text || '',
      is_active: true,
      auto_generated: true,
      generated_date: today,
      display_order: 0,
      created_by: 'ai_automation',
    });

    // Cleanup AI banners older than 7 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (const b of (allBanners || [])) {
      if (b.auto_generated && b.generated_date && b.generated_date < cutoffStr) {
        try { await base44.asServiceRole.entities.CultureBanner.delete(b.id); } catch (e) {}
      }
    }

    return Response.json({ mode, source, banners: [saved] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}