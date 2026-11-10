import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveVisibilityActor, rowsOf, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import { readVisibilitySwitches } from '../../shared/visibilitySwitches.ts';
import {
  publicationBlockers,
  normalizeSlug,
  profilePath,
  PROFILE_AUTHORIZATION_TEXT,
  PROFILE_DISCLOSURES,
  canManageProfile,
  canManageAgentAsBrokerage,
  isBrokerageManager,
} from '../../shared/professionalProfile.ts';
import { profileSeoPayload } from '../../shared/professionalSeo.ts';
import { planCatalog, planPriceLabel, entitlementsFor, seatAllowance } from '../../shared/visibilityPlans.ts';
import { subscriptionView } from '../../shared/visibilitySubscriptionEngine.ts';
import { publicOrigin } from '../../shared/propertyVisibility.ts';
import { requestEdgePurge } from '../../shared/edgeCache.ts';

const SAVEABLE = [
  'display_name', 'headline', 'bio', 'photo_url', 'logo_url',
  'contact_email', 'contact_phone', 'website_url',
  'city', 'state', 'zip', 'service_areas',
  'brokerage_name', 'license_number', 'license_state',
  'routing_mode', 'routing_emails', 'listing_showcase_ids',
];

function event(record, type, actor, note = '') {
  const events = Array.isArray(record?.events) ? record.events : [];
  return [...events, { type, at: new Date().toISOString(), actor, note }].slice(-60);
}

function historyFrom(record, to, actor, note = '') {
  const history = Array.isArray(record?.publication_history) ? record.publication_history : [];
  return [...history, { from_state: record?.publication_state || '', to_state: to, at: new Date().toISOString(), actor, note }].slice(-40);
}

async function nextSlug(base44, type, desired, excludeId = '') {
  const base = normalizeSlug(desired) || `profile-${Date.now()}`;
  const found = await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_type: type }, { limit: 400 });
  const taken = new Set(
    rowsOf(found).filter((p) => p.id !== excludeId).map((p) => String(p.slug || '')),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 300; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function latestSubscription(base44, profileId) {
  if (!profileId) return null;
  const found = await base44.asServiceRole.entities.VisibilitySubscription.filter(
    { profile_id: profileId },
    { sort: '-created_date', limit: 1 },
  );
  return rowsOf(found)[0] || null;
}

function decorate(profile, subscription, plans) {
  const view = subscriptionView(subscription);
  const plan = plans.find((p) => p.product_key === (subscription?.plan_key || profile?.plan_key || '')) || null;
  return {
    profile,
    path: profilePath(profile),
    authorization_text: PROFILE_AUTHORIZATION_TEXT,
    disclosures: PROFILE_DISCLOSURES,
    subscription: view,
    plan: plan
      ? { product_key: plan.product_key, name: plan.name, price_label: planPriceLabel(plan.price_cents), seats_included: plan.seats_included }
      : null,
    entitlements: entitlementsFor(profile?.plan_key, view.status),
    seats: seatAllowance(plan, subscription?.seats_purchased || 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const base44 = createClientFromRequest(req);
    const action = String(body?.action || 'get');
    const actor = await resolveVisibilityActor(base44, body);
    const switches = await readVisibilitySwitches(base44);
    const origin = publicOrigin();
    const plans = planCatalog(rowsOf(await base44.asServiceRole.entities.VisibilityPlanProduct.list('-created_date', 50)));

    // The dashboard holds the public profile id (prof_...), not the record id, so both are accepted:
    // looking up only the record id would treat an existing profile as new and lose the edit.
    const loadProfile = async (id) => {
      if (!id) return null;
      const byProfileId = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: String(id) }))[0];
      if (byProfileId) return byProfileId;
      const byRecordId = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ id: String(id) }))[0];
      return byRecordId || null;
    };

    // ---- read ---------------------------------------------------------------------------------
    if (action === 'get') {
      let profile = await loadProfile(body?.profileId);
      if (!profile && actor.email) {
        const found = await base44.asServiceRole.entities.ProfessionalProfile.filter(
          { owner_email: actor.email },
          { sort: '-created_date', limit: 1 },
        );
        profile = rowsOf(found)[0] || null;
      }
      if (!profile) return jsonResponse({ ok: true, profile: null, plans, switches, origin });
      if (!canManageProfile(profile, actor)) return jsonResponse({ ok: false, error: 'Not authorized for this profile.' }, 403);
      const subscription = await latestSubscription(base44, profile.profile_id);
      const brokerage = profile.profile_type === 'agent' && profile.brokerage_profile_id
        ? rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: profile.brokerage_profile_id }))[0] || null
        : null;
      return jsonResponse({ ok: true, ...decorate(profile, subscription, plans), switches, origin, brokerage });
    }

    // ---- create / update the draft --------------------------------------------------------------
    if (action === 'save') {
      const type = String(body?.profile_type || 'agent') === 'brokerage' ? 'brokerage' : 'agent';
      let profile = await loadProfile(body?.profileId);
      const isNew = !profile;

      if (isNew) {
        if (!actor.email) return jsonResponse({ ok: false, error: 'Sign in to create a profile.' }, 401);
        const displayName = String(body?.display_name || '').trim();
        if (!displayName) return jsonResponse({ ok: false, error: 'A display name is required.' }, 400);
        const slug = await nextSlug(base44, type, body?.slug || displayName);
        profile = await base44.asServiceRole.entities.ProfessionalProfile.create({
          profile_id: `prof_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          profile_type: type,
          slug,
          canonical_url: `${publicOrigin()}${type === 'brokerage' ? '/brokerages' : '/agents'}/${slug}`,
          display_name: displayName,
          owner_email: actor.email,
          contact_email: String(body?.contact_email || actor.email).toLowerCase(),
          publication_state: 'DRAFT',
          indexing: 'noindex',
          routing_mode: 'owner',
          events: [{ type: 'created', at: new Date().toISOString(), actor: actor.email, note: type }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else if (!canManageProfile(profile, actor)) {
        return jsonResponse({ ok: false, error: 'Not authorized for this profile.' }, 403);
      }

      const patch = { updated_at: new Date().toISOString() };
      for (const field of SAVEABLE) {
        if (body[field] === undefined) continue;
        if (field === 'service_areas' || field === 'routing_emails' || field === 'listing_showcase_ids') {
          patch[field] = (Array.isArray(body[field]) ? body[field] : []).map((v) => String(v || '').trim()).filter(Boolean).slice(0, 50);
        } else if (field === 'state') {
          patch[field] = String(body[field] || '').trim().toUpperCase().slice(0, 2);
        } else if (field === 'contact_email') {
          patch[field] = String(body[field] || '').trim().toLowerCase().slice(0, 200);
        } else if (field === 'routing_mode') {
          patch[field] = body[field] === 'team' ? 'team' : 'owner';
        } else {
          patch[field] = String(body[field] ?? '').slice(0, 4000);
        }
      }
      if (body?.team_emails !== undefined) {
        if (!actor.isAdmin && !isBrokerageManager(profile, actor)) {
          return jsonResponse({ ok: false, error: 'Only the profile owner or an administrator can change team access.' }, 403);
        }
        patch.team_emails = (Array.isArray(body.team_emails) ? body.team_emails : [])
          .map((e) => String(e || '').trim().toLowerCase())
          .filter((e) => e.includes('@'))
          .slice(0, 25);
      }

      // A changed credential or affiliation is unverified again until an administrator checks it.
      if (patch.license_number !== undefined && patch.license_number !== (profile.license_number || '')) {
        patch.license_verified = false;
        patch.license_verified_at = undefined;
        patch.license_verified_by = undefined;
      }
      if (patch.license_state !== undefined && patch.license_state !== (profile.license_state || '')) {
        patch.license_verified = false;
      }
      if (patch.brokerage_name !== undefined && patch.brokerage_name !== (profile.brokerage_name || '')) {
        patch.brokerage_affiliation_verified = false;
        patch.brokerage_verified_at = undefined;
        patch.brokerage_profile_id = '';
      }

      const merged = { ...profile, ...patch };
      const seo = profileSeoPayload(merged, origin);
      patch.seo_title = seo.title;
      patch.meta_description = seo.meta_description;
      patch.structured_data = seo.structured_data;
      patch.canonical_url = seo.canonical_url;

      await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, patch);
      const updated = { ...merged, ...patch };
      const subscription = await latestSubscription(base44, updated.profile_id);
      return jsonResponse({ ok: true, ...decorate(updated, subscription, plans), switches, origin });
    }

    // ---- owner authorization -------------------------------------------------------------------
    if (action === 'authorize') {
      const profile = await loadProfile(body?.profileId);
      if (!profile) return jsonResponse({ ok: false, error: 'Profile not found.' }, 404);
      if (!canManageProfile(profile, actor)) return jsonResponse({ ok: false, error: 'Not authorized for this profile.' }, 403);
      if (body?.confirm !== true) return jsonResponse({ ok: false, error: 'Explicit confirmation is required.' }, 400);
      const patch = {
        authorization_confirmed: true,
        authorization_snapshot: PROFILE_AUTHORIZATION_TEXT,
        authorized_at: new Date().toISOString(),
        authorized_by_email: actor.email,
        updated_at: new Date().toISOString(),
        events: event(profile, 'owner_authorized', actor.email),
      };
      await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, patch);
      return jsonResponse({ ok: true, profile: { ...profile, ...patch } });
    }

    if (action === 'submit') {
      const profile = await loadProfile(body?.profileId);
      if (!profile) return jsonResponse({ ok: false, error: 'Profile not found.' }, 404);
      if (!canManageProfile(profile, actor)) return jsonResponse({ ok: false, error: 'Not authorized for this profile.' }, 403);
      if (!profile.authorization_confirmed) {
        return jsonResponse({ ok: false, error: 'Authorize the profile before submitting it for review.' }, 400);
      }
      const patch = {
        publication_state: 'READY_FOR_REVIEW',
        publication_history: historyFrom(profile, 'READY_FOR_REVIEW', actor.email),
        updated_at: new Date().toISOString(),
      };
      await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, patch);
      return jsonResponse({ ok: true, profile: { ...profile, ...patch } });
    }

    if (action === 'unpublish') {
      const profile = await loadProfile(body?.profileId);
      if (!profile) return jsonResponse({ ok: false, error: 'Profile not found.' }, 404);
      if (!canManageProfile(profile, actor)) return jsonResponse({ ok: false, error: 'Not authorized for this profile.' }, 403);
      const patch = {
        publication_state: 'UNPUBLISHED',
        indexing: 'noindex',
        publication_history: historyFrom(profile, 'UNPUBLISHED', actor.email, 'owner request'),
        updated_at: new Date().toISOString(),
        events: event(profile, 'unpublished', actor.email),
      };
      await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, patch);
      await requestEdgePurge({ paths: [profilePath(profile), '/sitemap.xml'] });
      return jsonResponse({ ok: true, profile: { ...profile, ...patch } });
    }

    // ---- brokerage roster ----------------------------------------------------------------------
    if (action === 'roster_add' || action === 'roster_remove') {
      const brokerage = await loadProfile(body?.profileId);
      if (!brokerage || brokerage.profile_type !== 'brokerage') {
        return jsonResponse({ ok: false, error: 'Brokerage profile not found.' }, 404);
      }
      if (!isBrokerageManager(brokerage, actor) && !actor.isAdmin) {
        return jsonResponse({ ok: false, error: 'Only an authorized brokerage administrator can change the roster.' }, 403);
      }
      const found = await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: String(body?.agentProfileId || '') });
      const agent = rowsOf(found)[0];
      if (!agent || agent.profile_type !== 'agent') return jsonResponse({ ok: false, error: 'Agent profile not found.' }, 404);

      if (action === 'roster_add') {
        const subscription = await latestSubscription(base44, brokerage.profile_id);
        const plan = plans.find((p) => p.product_key === (subscription?.plan_key || '')) || null;
        const seats = seatAllowance(plan, subscription?.seats_purchased || 0);
        const roster = Array.isArray(brokerage.managed_agent_profile_ids) ? brokerage.managed_agent_profile_ids : [];
        if (!roster.includes(agent.profile_id) && roster.length >= seats.total) {
          return jsonResponse({
            ok: false,
            error: `This brokerage plan includes ${seats.total} agent seat${seats.total === 1 ? '' : 's'}. Add a seat or remove an agent before adding another.`,
            seats,
          }, 400);
        }
        const nextRoster = [...new Set([...roster, agent.profile_id])];
        await base44.asServiceRole.entities.ProfessionalProfile.update(brokerage.id, {
          managed_agent_profile_ids: nextRoster,
          updated_at: new Date().toISOString(),
          events: event(brokerage, 'roster_agent_added', actor.email, agent.profile_id),
        });
        // The affiliation stays unverified until an administrator confirms it.
        await base44.asServiceRole.entities.ProfessionalProfile.update(agent.id, {
          brokerage_profile_id: brokerage.profile_id,
          brokerage_name: brokerage.display_name,
          brokerage_affiliation_verified: false,
          updated_at: new Date().toISOString(),
          events: event(agent, 'brokerage_linked_pending_verification', actor.email, brokerage.profile_id),
        });
        return jsonResponse({ ok: true, roster: nextRoster, verification: 'pending_admin' });
      }

      const nextRoster = (Array.isArray(brokerage.managed_agent_profile_ids) ? brokerage.managed_agent_profile_ids : [])
        .filter((id) => id !== agent.profile_id);
      await base44.asServiceRole.entities.ProfessionalProfile.update(brokerage.id, {
        managed_agent_profile_ids: nextRoster,
        updated_at: new Date().toISOString(),
        events: event(brokerage, 'roster_agent_removed', actor.email, agent.profile_id),
      });
      await base44.asServiceRole.entities.ProfessionalProfile.update(agent.id, {
        brokerage_profile_id: '',
        brokerage_affiliation_verified: false,
        updated_at: new Date().toISOString(),
        events: event(agent, 'brokerage_unlinked', actor.email, brokerage.profile_id),
      });
      return jsonResponse({ ok: true, roster: nextRoster });
    }

    // ---- administration ------------------------------------------------------------------------
    if (action === 'admin_list') {
      if (!actor.isAdmin) return jsonResponse({ ok: false, error: 'Administrator access required.' }, 403);
      const query = {};
      if (body?.profile_type) query.profile_type = body.profile_type;
      if (body?.publication_state) query.publication_state = body.publication_state;
      const found = await base44.asServiceRole.entities.ProfessionalProfile.filter(query, { sort: '-updated_at', limit: 100 });
      return jsonResponse({ ok: true, profiles: rowsOf(found) });
    }

    if (action === 'admin_approve' || action === 'admin_publish' || action === 'admin_unpublish' ||
        action === 'admin_verify_brokerage' || action === 'admin_verify_license' || action === 'admin_reject') {
      if (!actor.isAdmin) return jsonResponse({ ok: false, error: 'Administrator access required.' }, 403);
      const profile = await loadProfile(body?.profileId);
      if (!profile) return jsonResponse({ ok: false, error: 'Profile not found.' }, 404);

      if (action === 'admin_verify_license') {
        const patch = {
          license_verified: body?.verified !== false,
          license_verified_at: new Date().toISOString(),
          license_verified_by: actor.email,
          updated_at: new Date().toISOString(),
          events: event(profile, body?.verified !== false ? 'license_verified' : 'license_unverified', actor.email, String(body?.note || '')),
        };
        await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, patch);
        return jsonResponse({ ok: true, profile: { ...profile, ...patch } });
      }

      if (action === 'admin_verify_brokerage') {
        const patch = {
          brokerage_affiliation_verified: body?.verified !== false,
          brokerage_verified_at: new Date().toISOString(),
          brokerage_verified_by: actor.email,
          brokerage_evidence: String(body?.note || ''),
          updated_at: new Date().toISOString(),
          events: event(profile, body?.verified !== false ? 'brokerage_verified' : 'brokerage_unverified', actor.email, String(body?.note || '')),
        };
        await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, patch);
        return jsonResponse({ ok: true, profile: { ...profile, ...patch } });
      }

      if (action === 'admin_reject') {
        const patch = {
          publication_state: 'DRAFT',
          review_required: false,
          attention_reason: String(body?.reason || '').slice(0, 500),
          publication_history: historyFrom(profile, 'DRAFT', actor.email, String(body?.reason || 'rejected')),
          updated_at: new Date().toISOString(),
          events: event(profile, 'admin_rejected', actor.email, String(body?.reason || '')),
        };
        await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, patch);
        return jsonResponse({ ok: true, profile: { ...profile, ...patch } });
      }

      if (action === 'admin_unpublish') {
        const patch = {
          publication_state: 'UNPUBLISHED',
          indexing: 'noindex',
          publication_history: historyFrom(profile, 'UNPUBLISHED', actor.email, 'administrator'),
          updated_at: new Date().toISOString(),
          events: event(profile, 'admin_unpublished', actor.email),
        };
        await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, patch);
        await requestEdgePurge({ paths: [profilePath(profile), '/sitemap.xml'] });
        return jsonResponse({ ok: true, profile: { ...profile, ...patch } });
      }

      const approved = action === 'admin_publish'
        ? { ...profile, admin_approved_at: profile.admin_approved_at || new Date().toISOString(), admin_approved_by: profile.admin_approved_by || actor.email }
        : profile;
      const approvePatch = {
        admin_approved_at: approved.admin_approved_at || new Date().toISOString(),
        admin_approved_by: approved.admin_approved_by || actor.email,
        publication_state: action === 'admin_publish' ? 'APPROVED' : 'APPROVED',
        updated_at: new Date().toISOString(),
        events: event(profile, 'admin_approved', actor.email),
      };
      let merged = { ...profile, ...approvePatch };

      if (action === 'admin_publish') {
        const blockers = publicationBlockers(merged, { switchOn: switches.profile_publication });
        if (blockers.length) return jsonResponse({ ok: false, error: 'Not publishable yet.', blockers }, 400);
        const seo = profileSeoPayload({ ...merged, indexing: 'index' }, origin);
        Object.assign(approvePatch, {
          publication_state: 'PUBLISHED',
          indexing: 'index',
          canonical_url: seo.canonical_url,
          seo_title: seo.title,
          meta_description: seo.meta_description,
          structured_data: seo.structured_data,
          publication_history: historyFrom(profile, 'PUBLISHED', actor.email),
        });
        merged = { ...profile, ...approvePatch };
      }

      await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, approvePatch);
      if (action === 'admin_publish') {
        // Drops the cached page and the sitemap so a newly published profile is visible immediately.
        await requestEdgePurge({ paths: [profilePath(merged), '/sitemap.xml'] });
      }
      return jsonResponse({ ok: true, profile: merged });
    }

    return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});