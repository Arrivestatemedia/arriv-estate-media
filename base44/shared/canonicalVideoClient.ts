// Canonical video service client — delegates cross-product Twilio token
// minting to Arriv One (the SOLE canonical Twilio token authority for
// cross-product video).
//
// Contract #2: Estate Media must NOT mint Twilio tokens locally for
// cross-product calls. Both caller and recipient tokens are minted by
// Arriv One's canonicalVideoService. Estate Media calls the service with
// an HMAC-authenticated request and receives the token back.
//
// Canonical service endpoint:
//   POST https://arriv-one-sales-crm.base44.app/functions/canonicalVideoService
//
// Actions: video.initiate, video.token, video.guest_token, video.cancel, video.complete
//
// Cross-product rooms use: arriv-xt-<sessionId>
//
// SECURITY: tokens are NEVER persisted in PendingNotification/event_data
// and must not be logged.

import { secrets } from "base44:runtime";
import { signGetRequest } from "./syncHmacAuth.ts";

const CANONICAL_VIDEO_ENDPOINT =
  "https://arriv-one-sales-crm.base44.app/functions/canonicalVideoService";

/**
 * Returns true if a room name is a cross-product room (arriv-xt- prefix).
 * Intra-product rooms (video-call-, cross-tenant-video-) use Estate Media's
 * own Twilio credentials and do NOT delegate to Arriv One.
 */
export function isCrossProductRoom(roomName: string): boolean {
  return !!(roomName && roomName.startsWith("arriv-xt-"));
}

/**
 * Request a cross-product video token from Arriv One's canonicalVideoService.
 *
 * @param action - One of: video.initiate, video.token, video.guest_token,
 *                 video.cancel, video.complete
 * @param payload - Action-specific payload (room_name, participant_identity, etc.)
 * @param tenantId - The tenant context for the HMAC signature
 * @returns The response from canonicalVideoService (contains token for
 *          video.token/guest_token, or room info for video.initiate)
 */
export async function requestCanonicalVideoToken(
  action: string,
  payload: Record<string, any>,
  tenantId: string
): Promise<{ success: boolean; token?: string; room_name?: string; error?: string }> {
  const serviceToken = secrets.get("ARRIV_ONE_SERVICE_TOKEN");
  // Sign the request with the outbound sync secret (Estate Media → Arriv One)
  const secretName = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

  try {
    const headers = await signGetRequest({
      tenantId,
      method: "POST",
      path: "/functions/canonicalVideoService",
      secretName,
    });

    if (serviceToken) {
      headers["Authorization"] = `Bearer ${serviceToken}`;
    }

    const resp = await fetch(CANONICAL_VIDEO_ENDPOINT, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { success: false, error: data.error || `canonicalVideoService HTTP ${resp.status}` };
    }
    return {
      success: true,
      token: data.token,
      room_name: data.room_name || data.roomName,
    };
  } catch (e) {
    return { success: false, error: e.message || "canonicalVideoService request failed" };
  }
}

/**
 * Mint a cross-product recipient token by delegating to Arriv One.
 * Used when an Estate Media user accepts an incoming cross-product video call.
 *
 * @param roomName - The arriv-xt-<sessionId> room name from the call envelope
 * @param participantIdentity - The Estate Media user's identity string
 * @param tenantId - Tenant context
 * @returns { success, token } — the token is returned to the caller and
 *          NEVER persisted.
 */
export async function mintCrossProductToken(
  roomName: string,
  participantIdentity: string,
  tenantId: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  return requestCanonicalVideoToken(
    "video.token",
    { room_name: roomName, participant_identity: participantIdentity },
    tenantId
  );
}