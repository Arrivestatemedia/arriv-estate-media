// supportCapabilityRegistry.ts
// Host authority resolution + host-specific capability registry.
//
// Arriv Assist is the SOLE canonical authority for:
//   - SupportAgent registry
//   - agent assignment
//   - AssistConversation / AssistTicket ownership
//
// The host retains authority ONLY for its product-specific diagnostics and
// repair capabilities. When Arriv Assist is not configured or unreachable,
// NO local agent is invented — the host app surfaces an honest
// "temporarily unavailable" state.

// Adjust this import to your own platform-authority helper.
// In Arriv One it checks if role === "admin".
function isPlatformAuthorityRole(role: string | undefined): boolean {
  return role === "admin";
}

// ============================================================
// CAPABILITY REGISTRY — ARRIV ESTATE MEDIA
// ============================================================
export interface SupportCapabilityDef {
  capability_id: string;
  level: "L0" | "L1" | "L2" | "L3";
  title: string;
  description: string;
  category: string;
  input_schema: Record<string, any>;
  max_attempts: number;
  idempotent: boolean;
  verification_capability_id: string | null;
  rollback_capability_id: string | null;
  allowed_roles: string[];
  known_error_codes: string[];
  active: boolean;
}

// Define Arriv Estate Media's own capabilities here (prefix arriv_estate_media.*)
export const CAPABILITIES: SupportCapabilityDef[] = [
  {
    capability_id: "arriv_estate_media.system_health.inspect",
    level: "L0",
    title: "System Health Inspection",
    description: "Read-only inspection of Arriv Estate Media platform health.",
    category: "system_health",
    input_schema: { type: "object", properties: { tenant_id: { type: "string" } } },
    max_attempts: 1,
    idempotent: true,
    verification_capability_id: null,
    rollback_capability_id: null,
    allowed_roles: ["admin", "tenant_admin", "user"],
    known_error_codes: ["UNAUTHORIZED", "TENANT_NOT_FOUND"],
    active: true,
  },
  // ... add more arriv_estate_media.* capabilities as needed
];

export function getCapability(capabilityId: string): SupportCapabilityDef | undefined {
  return CAPABILITIES.find((c) => c.capability_id === capabilityId && c.active);
}

export function listCapabilities(level?: string): SupportCapabilityDef[] {
  return CAPABILITIES.filter((c) => c.active && (!level || c.level === level));
}

// ============================================================
// SUPPORT AUTHORITY RESOLUTION (server-side, canonical)
// ============================================================
export interface SupportAuthority {
  actor_user_id: string;
  actor_email: string;
  actor_role: string;
  actor_display_name: string;
  user_type: "base44" | "sales_member";
  tenant_id: string;
  is_platform_authority: boolean;
  view_as_tenant_id: string | null;
  mode: "PLATFORM" | "TENANT" | "VIEW_AS_TENANT";
  ok: boolean;
  error?: string;
}

export async function resolveSupportAuthority(
  base44: any,
  options: { sales_member_id?: string; view_as_tenant_id?: string } = {}
): Promise<SupportAuthority> {
  // Path A: Base44 authenticated user
  try {
    const user = await base44.auth.me();
    if (user) {
      const isPlatform = isPlatformAuthorityRole(user.role);
      const viewAs = options.view_as_tenant_id && isPlatform ? options.view_as_tenant_id : null;
      // Estate Media is a single-tenant app — default to tnt_estate_media when
      // the Base44 user has no tenant_id, so Arriv Assist always receives a
      // valid tenant reference (empty string can cause rejection).
      let tenantId = user.data?.tenant_id || user.tenant_id || "tnt_estate_media";
      let mode: "PLATFORM" | "TENANT" | "VIEW_AS_TENANT" = isPlatform ? "PLATFORM" : "TENANT";
      if (viewAs) {
        tenantId = viewAs;
        mode = "VIEW_AS_TENANT";
      }
      return {
        actor_user_id: user.id,
        actor_email: user.email || "",
        actor_role: user.role || "user",
        actor_display_name: user.full_name || user.email || "User",
        user_type: "base44",
        tenant_id: tenantId,
        is_platform_authority: isPlatform,
        view_as_tenant_id: viewAs,
        mode,
        ok: true,
      };
    }
  } catch {}

  // Path B: Sales team member (localStorage auth) — adjust if Payroll has a different secondary auth
  if (options.sales_member_id) {
    try {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: options.sales_member_id });
      const m = members?.[0];
      if (m) {
        return {
          actor_user_id: m.id,
          actor_email: m.email || "",
          actor_role: m.role || "user",
          actor_display_name: m.full_name || m.email || "Team Member",
          user_type: "sales_member",
          tenant_id: m.tenant_id || "",
          is_platform_authority: false,
          view_as_tenant_id: null,
          mode: "TENANT",
          ok: true,
        };
      }
    } catch {}
  }

  // Path C: Guest fallback — allow unauthenticated users (e.g. on the login page)
  // to access a limited Arriv Assist flow. The Arriv Assist backend handles guest actors.
  return {
    actor_user_id: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    actor_email: "",
    actor_role: "guest",
    actor_display_name: "Guest",
    user_type: "base44",
    tenant_id: "tnt_estate_media",
    is_platform_authority: false,
    view_as_tenant_id: null,
    mode: "TENANT",
    ok: true,
  };
}

export function canInvokeCapability(
  auth: SupportAuthority,
  capability: SupportCapabilityDef,
  inputTenantId?: string
): { allowed: boolean; reason?: string } {
  if (!auth.ok) return { allowed: false, reason: "UNAUTHORIZED" };
  if (!capability.allowed_roles.includes(auth.actor_role)) {
    return { allowed: false, reason: "ROLE_NOT_PERMITTED" };
  }
  if (!auth.is_platform_authority && inputTenantId && auth.tenant_id && inputTenantId !== auth.tenant_id) {
    return { allowed: false, reason: "TENANT_MISMATCH" };
  }
  return { allowed: true };
}