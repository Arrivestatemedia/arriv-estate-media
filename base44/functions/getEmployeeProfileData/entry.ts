import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { sales_member_id, action } = body;

    if (!sales_member_id) {
      return Response.json({ error: 'sales_member_id is required' }, { status: 400 });
    }

    // Action: create a manager note (admin adds a note to a rep's profile)
    if (action === 'add_note') {
      const { author_id, author_name, content, note_type, is_recognition, award_title } = body;
      if (!content || !content.trim()) {
        return Response.json({ error: 'content is required' }, { status: 400 });
      }
      const created = await base44.asServiceRole.entities.ManagerNote.create({
        sales_member_id,
        author_id: author_id || '',
        author_name: author_name || 'Admin',
        content,
        note_type: note_type || 'general',
        is_recognition: is_recognition || false,
        award_title: award_title || '',
      });
      return Response.json({ success: true, note: created });
    }

    // Default action: fetch goals, notes, and training completions using
    // asServiceRole to bypass RLS (these entities are admin-only by default).
    const [goals, notes, training] = await Promise.all([
      base44.asServiceRole.entities.SalesGoal.filter({ sales_member_id, is_active: true }),
      base44.asServiceRole.entities.ManagerNote.filter({ sales_member_id }, '-created_date', 50),
      base44.asServiceRole.entities.TrainingCompletion.list('-completed_at', 20),
    ]);

    return Response.json({
      goals: goals || [],
      notes: notes || [],
      training: training || [],
    });
  } catch (error) {
    console.error('[getEmployeeProfileData] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}