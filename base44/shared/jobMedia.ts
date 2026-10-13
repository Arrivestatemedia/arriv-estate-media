// Shared access to a job's delivered media in its existing private Google Drive folder.
//
// The delivery pipeline (getJobMediaForClient / downloadJobMedia) already owns this folder.
// Property Visibility reuses it instead of copying or re-uploading anything: the folder
// listing is the allow-list of what a property page may ever reference, and file bytes are
// read straight from Drive when a public asset is requested.

export function driveFolderIdFromJob(job: any): string | null {
  if (!job) return null;
  if (job.source_storage_folder_id) return String(job.source_storage_folder_id);
  const url = job.google_drive_folder_url || job.final_edits_folder_url;
  const match = String(url || "").match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export interface JobFile {
  id: string;
  name: string;
  mimeType: string;
  isImage: boolean;
  isVideo: boolean;
}

export async function listJobFiles(client: any, job: any): Promise<{ folderId: string | null; files: JobFile[] }> {
  const folderId = driveFolderIdFromJob(job);
  if (!folderId) return { folderId: null, files: [] };

  const accessToken = await client.asServiceRole.connectors.getAccessToken("googledrive");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&orderBy=modifiedTime+desc&pageSize=1000`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error("Failed to list the job's delivered media folder");
  const data = await res.json();
  const files: JobFile[] = (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isImage: String(f.mimeType || "").startsWith("image/"),
    isVideo: String(f.mimeType || "").startsWith("video/"),
  }));
  return { folderId, files };
}

// A web-sized derivative of a delivered photograph.
//
// A delivered original is tens of megabytes. A property page showing twenty of them never finishes
// loading on a phone, so the page streams the resized preview Drive already generates for every
// image instead of the original. It is the same private file in the same private folder read with
// the same credentials — nothing is copied, re-uploaded, or made publicly addressable. The
// originals remain exactly what the client downloads from their delivery gallery.
// Drive's own preview link for a delivered photograph, sized for the web.
//
// Reading this link needs none of our credentials, which is what lets another service look at the
// photograph itself: the copywriter is handed these links so its words describe the picture that was
// actually taken rather than the file name. The link is short-lived, it points at the same private
// original Drive is already holding, and nothing is copied into storage of ours.
export async function jobPhotoPreviewUrl(client: any, fileId: string, width = 1600): Promise<string> {
  const accessToken = await client.asServiceRole.connectors.getAccessToken("googledrive");
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) return "";
  const meta = await metaRes.json();
  const link = String(meta?.thumbnailLink || "");
  if (!link) return "";
  return /=s\d+/.test(link) ? link.replace(/=s\d+.*/, `=w${width}`) : `${link}=w${width}`;
}

export async function fetchJobPhotoPreview(client: any, fileId: string, width = 1600) {
  const sized = await jobPhotoPreviewUrl(client, fileId, width);
  if (!sized) return null;

  const res = await fetch(sized);
  if (!res.ok) return null;

  const contentType = String(res.headers.get("content-type") || "");
  return {
    bytes: await res.arrayBuffer(),
    mimeType: contentType.startsWith("image/") ? contentType : "image/jpeg",
  };
}

export async function fetchJobFile(client: any, fileId: string) {
  const accessToken = await client.asServiceRole.connectors.getAccessToken("googledrive");
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) return null;
  const meta = await metaRes.json();

  const binRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!binRes.ok) return null;

  return {
    bytes: await binRes.arrayBuffer(),
    mimeType: meta.mimeType || "application/octet-stream",
    name: meta.name || "asset",
  };
}