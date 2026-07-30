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

    // Automated mode — look for today's AI banner (America/New_York local day)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const todayAi = (allBanners || []).find(b => b.auto_generated && b.generated_date === today);
    if (todayAi) {
      return Response.json({ mode, source, banners: [todayAi] });
    }

    // Generate a new AI banner
    const sourcePrompts = {
      bible: `Generate a short motivational message for a real estate media sales team, tied to a Bible verse. Return JSON with: message (1-2 sentence motivational quote inspired by the verse, relevant to sales professionals who build relationships and serve clients), verse_reference (a real Bible reference like "Acts 28:19" or "Philippians 4:13"), verse_text (the actual text of that verse from the Bible).`,
      quran: `Generate a short motivational message for a real estate media sales team, tied to a Quran verse. Return JSON with: message (1-2 sentence motivational quote inspired by the verse, relevant to sales professionals who build relationships and serve clients), verse_reference (a real Quran reference like "Surah Al-Baqarah 2:153" or "Surah Az-Zumar 39:53"), verse_text (the actual text of that verse from the Quran).`,
      torah: `Generate a short motivational message for a real estate media sales team, tied to a Torah/Tanakh verse. Return JSON with: message (1-2 sentence motivational quote inspired by the verse, relevant to sales professionals who build relationships and serve clients), verse_reference (a real Torah/Tanakh reference like "Proverbs 16:3" or "Psalms 37:5"), verse_text (the actual text of that verse from the Torah/Tanakh).`,
      buddhist: `Generate a short motivational message for a real estate media sales team, tied to a Buddhist teaching. Return JSON with: message (1-2 sentence motivational quote inspired by the teaching, relevant to sales professionals who build relationships and serve clients), verse_reference (a real Buddhist text reference like "Dhammapada 1:1" or "Majjhima Nikaya 21"), verse_text (the actual text of that teaching).`,
      hindu: `Generate a short motivational message for a real estate media sales team, tied to a Hindu text. Return JSON with: message (1-2 sentence motivational quote inspired by the text, relevant to sales professionals who build relationships and serve clients), verse_reference (a real Hindu text reference like "Bhagavad Gita 2:47" or "Upanishads Isha 1"), verse_text (the actual text of that passage).`,
      secular: `Generate a short motivational message for a real estate media sales team. No religious content — pull from philosophers, authors, or leaders instead. Return JSON with: message (1-2 sentence motivational quote about relationships, persistence, and serving clients well), verse_reference (the author/leader name and source, e.g. "Maya Angelou" or "Marcus Aurelius, Meditations"), verse_text (the actual quote text).`,
    };
    const prompt = sourcePrompts[source] || sourcePrompts.bible;

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

    // Cleanup AI banners older than 7 days (America/New_York local day)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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