// Frontend wrapper for the studioFlyerApi backend function (HMAC proxy to
// Arriv Studio's standalone flyer API). Keeps all signing server-side.
import { base44 } from "@/api/base44Client";

async function invoke(action, payload = {}) {
  const res = await base44.functions.invoke("studioFlyerApi", { action, ...payload });
  return res?.data ?? res;
}

export const listFlyers = (user_email) => invoke("list_flyers", { user_email });
export const getFlyer = (user_email, flyer_id) => invoke("get_flyer", { user_email, flyer_id });
export const saveFlyer = (user_email, data) => invoke("save_flyer", { user_email, ...data });
export const deleteFlyer = (user_email, flyer_id) => invoke("delete_flyer", { user_email, flyer_id });
export const listDriveMedia = (user_email, { folder_id, search } = {}) =>
  invoke("list_drive_media", { user_email, folder_id, search });
export const importDriveMedia = (user_email, file_id) => invoke("import_drive_media", { user_email, file_id });