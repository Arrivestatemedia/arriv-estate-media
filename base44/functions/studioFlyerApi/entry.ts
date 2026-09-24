// Estate Media → Arriv Studio standalone flyer API proxy.
// Frontend calls this with an `action`; this function signs the request with
// the HMAC secret and forwards it to Studio, so the secret never reaches the
// browser. The calling user's email is taken from the Base44 session when
// available, falling back to a client-supplied user_email (custom-auth users).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.49";
import { callStudio } from "../../shared/studioStandaloneClient.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    let userEmail = null;
    try {
      const u = await base44.auth.me();
      userEmail = u?.email || null;
    } catch (e) {
      // custom-auth (sales session) users may not have a Base44 session
    }
    if (!userEmail) userEmail = body.user_email;
    if (!userEmail) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const action = body.action;
    let result;

    switch (action) {
      case "list_flyers":
        result = await callStudio("listFlyersStandalone", { user_email: userEmail });
        break;
      case "get_flyer":
        result = await callStudio("getFlyerStandalone", { user_email: userEmail, flyer_id: body.flyer_id });
        break;
      case "save_flyer": {
        const p = { user_email: userEmail };
        if (body.flyer_id) p.flyer_id = body.flyer_id;
        if (body.name) p.name = body.name;
        if (body.template) p.template = body.template;
        if (body.content) p.content = body.content;
        if (body.status) p.status = body.status;
        result = await callStudio("saveFlyerStandalone", p);
        break;
      }
      case "delete_flyer":
        result = await callStudio("deleteFlyerStandalone", { user_email: userEmail, flyer_id: body.flyer_id });
        break;
      case "list_drive_media": {
        const p = { user_email: userEmail };
        if (body.folder_id) p.folder_id = body.folder_id;
        if (body.search) p.search = body.search;
        result = await callStudio("listDriveMediaStandalone", p);
        break;
      }
      case "import_drive_media":
        result = await callStudio("importDriveMediaStandalone", { user_email: userEmail, file_id: body.file_id });
        break;
      default:
        return Response.json({ error: "Unknown action: " + action }, { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}