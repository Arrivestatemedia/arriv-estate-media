import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { CANONICAL_MODULES, CANONICAL_MODULE_IDS, isCanonicalModuleId } from "../../shared/canonicalCurriculum.ts";
import { MODULE_ID_ALIASES, resolveModuleId } from "../../shared/salesTrainingShared.ts";

/**
 * Curriculum Migration: Reconciles legacy TrainingModule records with the
 * canonical E0–E19 curriculum.
 *
 * Safe migration — never deletes records:
 * 1. Audits all TrainingModule records (canonical / legacy / duplicate canonical)
 * 2. Creates canonical E0–E19 modules if they don't exist
 * 3. Archives legacy modules (active=false) — preserves records for history
 * 4. Maps historical TrainingCompletion module_id via resolveModuleId()
 * 5. Maps SalesCertification.modules_completed arrays via resolveModuleId()
 * 6. Returns evidence report
 */

function isLegacyModuleId(moduleId: string): boolean {
  if (!moduleId) return false;
  if (isCanonicalModuleId(moduleId)) return false;
  // Legacy patterns: mod_XX, orient_XX, or anything not E0–E19
  return /^(mod_|orient_)/.test(moduleId) || !/^E\d{1,2}$/.test(moduleId);
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Admin auth ──
    let isAdmin = false;
    let body: any = null;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch (_e) {
      body = await req.clone().json();
      if (body?.sales_member_id) {
        const m = await base44.asServiceRole.entities.SalesTeamMember.get(body.sales_member_id);
        isAdmin = m?.role === 'admin';
      }
    }
    if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });

    if (!body) body = await req.json();
    const dryRun = body?.dry_run === true;

    // ── 1. Audit existing modules ──
    const allModules = await base44.asServiceRole.entities.TrainingModule.list('order', 200);

    const audit = {
      canonical: [] as any[],
      legacy: [] as any[],
      duplicateCanonical: [] as any[],
    };

    const canonicalById: Record<string, any[]> = {};
    for (const m of allModules) {
      if (isCanonicalModuleId(m.module_id)) {
        if (!canonicalById[m.module_id]) canonicalById[m.module_id] = [];
        canonicalById[m.module_id].push(m);
      } else if (isLegacyModuleId(m.module_id)) {
        audit.legacy.push({ id: m.id, module_id: m.module_id, title: m.title, active: m.active });
      } else {
        // Unknown — treat as legacy
        audit.legacy.push({ id: m.id, module_id: m.module_id, title: m.title, active: m.active });
      }
    }

    // Identify duplicate canonical (more than one record per E-ID)
    for (const [eid, recs] of Object.entries(canonicalById)) {
      audit.canonical.push({ id: recs[0].id, module_id: eid, title: recs[0].title, active: recs[0].active });
      if (recs.length > 1) {
        for (let i = 1; i < recs.length; i++) {
          audit.duplicateCanonical.push({ id: recs[i].id, module_id: eid, title: recs[i].title, active: recs[i].active });
        }
      }
    }

    // ── 2. Create missing canonical modules ──
    const existingCanonicalIds = Object.keys(canonicalById);
    const missingCanonical = CANONICAL_MODULES.filter(
      cm => !existingCanonicalIds.includes(cm.module_id)
    );

    const createdModules: string[] = [];
    if (!dryRun) {
      for (const cm of missingCanonical) {
        const criticalIndices = cm.quiz_questions
          .map((q, i) => q.is_critical ? i : -1)
          .filter(i => i >= 0);

        await base44.asServiceRole.entities.TrainingModule.create({
          module_id: cm.module_id,
          module_type: cm.module_type,
          title: cm.title,
          description: cm.description,
          order: cm.order,
          requires_watching: true,
          min_watch_percentage: 95,
          quiz_questions: cm.quiz_questions,
          critical_question_indices: criticalIndices,
          passing_score: 95,
          prerequisites: cm.prerequisites,
          competency_tags: cm.competency_tags,
          certification_phase: cm.certification_phase,
          is_critical_boundary: cm.is_critical_boundary,
          active: true,
          version: 1,
          updated_at: new Date().toISOString(),
        });
        createdModules.push(cm.module_id);
      }
    }

    // ── 3. Archive legacy modules + duplicate canonical ──
    const archivedLegacy: string[] = [];
    const archivedDuplicates: string[] = [];

    if (!dryRun) {
      // Archive legacy modules (set active=false, preserve record)
      for (const legacy of audit.legacy) {
        if (legacy.active !== false) {
          await base44.asServiceRole.entities.TrainingModule.update(legacy.id, {
            active: false,
            updated_at: new Date().toISOString(),
          });
          archivedLegacy.push(legacy.module_id);
        }
      }

      // Archive duplicate canonical records (keep the first, archive the rest)
      for (const dup of audit.duplicateCanonical) {
        await base44.asServiceRole.entities.TrainingModule.update(dup.id, {
          active: false,
          updated_at: new Date().toISOString(),
        });
        archivedDuplicates.push(dup.module_id);
      }
    }

    // ── 4. Map historical TrainingCompletion records ──
    const completions = await base44.asServiceRole.entities.TrainingCompletion.list('created_date', 200);
    let completionsMapped = 0;
    const completionMappings: Array<{ from: string; to: string; record_id: string }> = [];

    if (!dryRun) {
      for (const c of completions) {
        const resolved = resolveModuleId(c.module_id);
        if (resolved && resolved !== c.module_id) {
          await base44.asServiceRole.entities.TrainingCompletion.update(c.id, {
            module_id: resolved,
          });
          completionsMapped++;
          completionMappings.push({ from: c.module_id, to: resolved, record_id: c.id });
        }
      }
    }

    // ── 5. Map SalesCertification.modules_completed arrays ──
    const certs = await base44.asServiceRole.entities.SalesCertification.list('created_date', 100);
    let certsMapped = 0;
    const certMappings: Array<{ cert_id: string; from: string[]; to: string[] }> = [];

    if (!dryRun) {
      for (const cert of certs) {
        const original = cert.modules_completed || [];
        const resolved = original.map((id: string) => resolveModuleId(id) || id);
        const changed = JSON.stringify(original) !== JSON.stringify(resolved);
        if (changed) {
          await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
            modules_completed: resolved,
          });
          certsMapped++;
          certMappings.push({ cert_id: cert.id, from: original, to: resolved });
        }
      }
    }

    // ── 6. Verify post-migration state ──
    const postModules = dryRun ? allModules : await base44.asServiceRole.entities.TrainingModule.list('order', 200);
    const activePost = postModules.filter(m => m.active !== false);
    const activeCanonicalPost = activePost.filter(m => isCanonicalModuleId(m.module_id));
    const activeLegacyPost = activePost.filter(m => !isCanonicalModuleId(m.module_id));
    const activeCanonicalIds = activeCanonicalPost.map(m => m.module_id).sort();
    const expectedIds = [...CANONICAL_MODULE_IDS].sort();
    const idsMatch = JSON.stringify(activeCanonicalIds) === JSON.stringify(expectedIds);

    // Check for orphaned completions (completions whose module_id doesn't resolve to a canonical module)
    const postCompletions = dryRun ? completions : await base44.asServiceRole.entities.TrainingCompletion.list('created_date', 200);
    const orphanedCompletions = postCompletions.filter(c => {
      const resolved = resolveModuleId(c.module_id);
      return !resolved || !isCanonicalModuleId(resolved);
    });

    // ── Evidence Report ──
    const report = {
      migration_mode: dryRun ? 'DRY_RUN' : 'EXECUTED',
      timestamp: new Date().toISOString(),

      // Pre-migration audit
      pre_migration: {
        total_modules: allModules.length,
        canonical_found: audit.canonical.length,
        legacy_found: audit.legacy.length,
        duplicate_canonical_found: audit.duplicateCanonical.length,
        canonical_ids_present: existingCanonicalIds,
        canonical_ids_missing: CANONICAL_MODULES
          .filter(cm => !existingCanonicalIds.includes(cm.module_id))
          .map(cm => cm.module_id),
      },

      // Actions taken
      actions: {
        canonical_modules_created: dryRun ? missingCanonical.map(cm => cm.module_id) : createdModules,
        legacy_modules_archived: dryRun ? audit.legacy.map(l => l.module_id) : archivedLegacy,
        duplicate_canonical_archived: dryRun ? audit.duplicateCanonical.map(d => d.module_id) : archivedDuplicates,
        completions_mapped: completionsMapped,
        completion_mappings: completionMappings,
        certifications_mapped: certsMapped,
        cert_mappings: certMappings,
      },

      // Post-migration verification
      post_migration: {
        total_modules: postModules.length,
        active_modules: activePost.length,
        active_canonical_count: activeCanonicalPost.length,
        active_legacy_count: activeLegacyPost.length,
        active_canonical_ids: activeCanonicalIds,
        expected_canonical_ids: expectedIds,
        ids_match_exactly: idsMatch,
        orphaned_completions: orphanedCompletions.length,
        orphaned_completion_details: orphanedCompletions.map(c => ({
          record_id: c.id,
          module_id: c.module_id,
          resolved: resolveModuleId(c.module_id),
        })),
      },

      // Integrity checks
      integrity: {
        active_module_count_is_20: activeCanonicalPost.length === 20,
        active_ids_are_E0_through_E19_exactly_once: idsMatch,
        zero_orphaned_completions: orphanedCompletions.length === 0,
        zero_active_legacy_modules: activeLegacyPost.length === 0,
        historical_completions_preserved: completions.length === postCompletions.length,
        no_records_deleted: true, // migration only sets active=false, never deletes
      },
    };

    return Response.json(report);
  } catch (error) {
    console.error('migrateCanonicalCurriculum error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}