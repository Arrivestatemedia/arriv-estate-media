import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { recordTrainingScore, getOrientationBundle, getActiveTrainingModules } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    if (!body.sales_member_id || !body.module_id) {
      return Response.json({ error: 'sales_member_id and module_id are required' }, { status: 400 });
    }
    if (!Array.isArray(body.answers)) {
      return Response.json({ error: 'answers (array of selected indices) is required' }, { status: 400 });
    }
    const bundle = await getOrientationBundle(base44, body.sales_member_id);
    const modules = await getActiveTrainingModules(base44, "orientation");
    const mod = modules.find((m) => m.module_id === body.module_id);
    if (!mod) return Response.json({ error: 'Training module not found' }, { status: 404 });
    const questions = mod.quiz_questions || [];
    let correct = 0;
    const summary = [];
    questions.forEach((q, i) => {
      const sel = body.answers[i];
      const isCorrect = typeof sel === 'number' && sel === q.correct_index;
      if (isCorrect) correct++;
      summary.push({ question_index: i, correct: isCorrect });
    });
    const score = questions.length ? Math.round((correct / questions.length) * 100) : 100;
    const passing = mod.passing_score != null ? mod.passing_score : 70;
    const passed = score >= passing;
    await recordTrainingScore(base44, {
      orientation: bundle.orientation,
      module_id: body.module_id,
      module_version: mod.version || 1,
      score,
      passed,
      answer_summary: { total: questions.length, correct, score, passing },
    });
    return Response.json({ success: true, score, passed, passing });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});