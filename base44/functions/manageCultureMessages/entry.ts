import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case "list": {
        const messages = await base44.asServiceRole.entities.CultureBanner.list("-display_order", 200);
        const enriched = (messages || []).map((m) => ({
          id: m.id,
          message: m.message,
          verse_reference: m.verse_reference,
          verse_text: m.verse_text,
          active: m.is_active,
          ai_generated: m.auto_generated,
          display_date: m.generated_date,
        }));
        return Response.json({ messages: enriched });
      }
      case "create": {
        const msg = await base44.asServiceRole.entities.CultureBanner.create({
          message: body.message,
          verse_reference: body.verse_reference || "",
          verse_text: body.verse_text || "",
          auto_generated: false,
          is_active: true,
        });
        return Response.json({ message: msg });
      }
      case "update": {
        await base44.asServiceRole.entities.CultureBanner.update(body.id, { is_active: body.active });
        return Response.json({ ok: true });
      }
      case "delete": {
        await base44.asServiceRole.entities.CultureBanner.delete(body.id);
        return Response.json({ ok: true });
      }
      case "getAiSetting": {
        const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: "culture_banner_mode" });
        const mode = rows?.[0]?.value || "manual";
        return Response.json({ ai_enabled: mode === "ai" });
      }
      case "setAiSetting": {
        const mode = body.ai_enabled ? "ai" : "manual";
        const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: "culture_banner_mode" });
        if (existing?.[0]) {
          await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value: mode });
        } else {
          await base44.asServiceRole.entities.AppSetting.create({ key: "culture_banner_mode", value: mode });
        }
        return Response.json({ ok: true });
      }
      case "getCultureSource": {
        const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: "culture_banner_source" });
        const source = rows?.[0]?.value || "bible";
        return Response.json({ source });
      }
      case "setCultureSource": {
        const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: "culture_banner_source" });
        if (existing?.[0]) {
          await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value: body.source });
        } else {
          await base44.asServiceRole.entities.AppSetting.create({ key: "culture_banner_source", value: body.source });
        }
        return Response.json({ ok: true });
      }
      case "generateNow": {
        const sourceRows = await base44.asServiceRole.entities.AppSetting.filter({ key: "culture_banner_source" });
        const source = sourceRows?.[0]?.value || body.source || "bible";

        const sourcePrompts = {
          bible: `Generate a short motivational message for a real estate media sales team, tied to a Bible verse. Return JSON with: message (1-2 sentence motivational quote inspired by the verse, relevant to sales professionals who build relationships and serve clients), verse_reference (a real Bible reference like "Acts 28:19" or "Philippians 4:13"), verse_text (the actual text of that verse from the Bible).`,
          quran: `Generate a short motivational message for a real estate media sales team, tied to a Quran verse. Return JSON with: message (1-2 sentence motivational quote inspired by the verse, relevant to sales professionals who build relationships and serve clients), verse_reference (a real Quran reference like "Surah Al-Baqarah 2:153"), verse_text (the actual text of that verse from the Quran).`,
          torah: `Generate a short motivational message for a real estate media sales team, tied to a Torah/Tanakh verse. Return JSON with: message, verse_reference (a real Torah/Tanakh reference like "Proverbs 16:3"), verse_text (the actual text of that verse).`,
          buddhist: `Generate a short motivational message for a real estate media sales team, tied to a Buddhist teaching. Return JSON with: message, verse_reference (a real Buddhist text reference like "Dhammapada 1:1"), verse_text (the actual text of that teaching).`,
          hindu: `Generate a short motivational message for a real estate media sales team, tied to a Hindu text. Return JSON with: message, verse_reference (a real Hindu text reference like "Bhagavad Gita 2:47"), verse_text (the actual text of that passage).`,
          secular: `Generate a short motivational message for a real estate media sales team. No religious content — pull from philosophers, authors, or leaders instead. Return JSON with: message, verse_reference (the author/leader name and source), verse_text (the actual quote text).`,
        };
        const prompt = sourcePrompts[source] || sourcePrompts.bible;

        const result = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              message: { type: "string" },
              verse_reference: { type: "string" },
              verse_text: { type: "string" },
            },
            required: ["message", "verse_reference", "verse_text"],
          },
        });

        const data = typeof result === "string" ? JSON.parse(result) : result;
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

        const msg = await base44.asServiceRole.entities.CultureBanner.create({
          message: data.message || "Keep building relationships. Results will follow.",
          verse_reference: data.verse_reference || "",
          verse_text: data.verse_text || "",
          source,
          is_active: true,
          auto_generated: true,
          generated_date: today,
          display_order: 0,
          created_by: "ai_manual",
        });
        return Response.json({ message: msg });
      }
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});