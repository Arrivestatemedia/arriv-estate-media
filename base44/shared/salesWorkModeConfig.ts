// ============================================================================
// SALES WORK MODE CONFIGURATION — Admin-configurable activity targets.
// Uses AppSetting entity (key/value). Falls back to DEFAULT_TARGETS.
// ============================================================================

import { DEFAULT_TARGETS, WorkModeTargets } from "./salesHealthEngine.ts";

const SETTING_KEY = "sales_work_mode_targets";

export const DEFAULT_WORK_MODE_TARGETS = DEFAULT_TARGETS;

export async function loadWorkModeTargets(base44: any): Promise<WorkModeTargets> {
  try {
    const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: SETTING_KEY });
    if (settings && settings.length > 0 && settings[0].value) {
      const parsed = JSON.parse(settings[0].value);
      return { ...DEFAULT_TARGETS, ...parsed };
    }
  } catch (_) {}
  return { ...DEFAULT_TARGETS };
}

export async function saveWorkModeTargets(base44: any, targets: Partial<WorkModeTargets>): Promise<WorkModeTargets> {
  const current = await loadWorkModeTargets(base44);
  const merged = { ...current, ...targets };
  const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: SETTING_KEY });
  const value = JSON.stringify(merged);
  if (settings && settings.length > 0) {
    await base44.asServiceRole.entities.AppSetting.update(settings[0].id, { value });
  } else {
    await base44.asServiceRole.entities.AppSetting.create({ key: SETTING_KEY, value });
  }
  return merged;
}