import { base44 } from '@/api/base44Client';
import { getSalesSessionToken } from '@/lib/customerSession';

/**
 * Client for the employee communications layer.
 *
 * Every call carries the representative's verified sales session token so the
 * server can prove who is asking. A member id passed in the payload is only ever
 * a target, never a credential.
 */

function sessionPayload() {
  const token = getSalesSessionToken();
  return token ? { sales_session_token: token } : {};
}

async function call(functionName, payload = {}) {
  let res;
  try {
    res = await base44.functions.invoke(functionName, { ...payload, ...sessionPayload() });
  } catch (err) {
    // A non-2xx response carries the real explanation; axios's own message
    // ("Request failed with status code 409") tells the rep nothing.
    const body = err?.response?.data;
    const error = new Error(body?.error || err?.message || 'That request could not be completed.');
    error.payload = body;
    throw error;
  }
  const data = res?.data ?? res;
  if (data?.error) {
    const error = new Error(data.error);
    error.payload = data;
    throw error;
  }
  return data ?? {};
}

export const empComm = {
  providers: () => call('empMailOAuth', { action: 'providers' }),
  status: (memberId) => call('empMailOAuth', { action: 'status', memberId }),
  connectUrl: (provider, memberId, returnTo) =>
    call('empMailOAuth', { action: 'start', provider, memberId, returnTo }),
  finishConnect: (code, state) => call('empMailOAuth', { action: 'callback', code, state }),
  disconnect: (provider, memberId) => call('empMailOAuth', { action: 'disconnect', provider, memberId }),

  inbox: ({ memberId, folder = 'inbox', limit = 25, pageToken = '' } = {}) =>
    call('empMailbox', { action: 'inbox', memberId, folder, limit, pageToken }),
  search: ({ memberId, query, folder = 'inbox', limit = 25, pageToken = '' } = {}) =>
    call('empMailbox', { action: 'search', memberId, query, folder, limit, pageToken }),
  message: ({ memberId, messageId }) => call('empMailbox', { action: 'get', memberId, messageId }),
  attachment: ({ memberId, messageId, attachmentId }) =>
    call('empMailbox', { action: 'attachment', memberId, messageId, attachmentId }),
  send: ({ memberId, ...payload }) => call('empMailbox', { action: 'send', memberId, ...payload }),
  reply: ({ memberId, ...payload }) => call('empMailbox', { action: 'reply', memberId, ...payload }),
  forward: ({ memberId, ...payload }) => call('empMailbox', { action: 'forward', memberId, ...payload }),
  saveDraft: ({ memberId, ...payload }) => call('empMailbox', { action: 'draft', memberId, ...payload }),
  discardDraft: ({ memberId, draftId }) => call('empMailbox', { action: 'discardDraft', memberId, draftId }),
  archive: ({ memberId, messageId }) => call('empMailbox', { action: 'archive', memberId, messageId }),
  trash: ({ memberId, messageId }) => call('empMailbox', { action: 'trash', memberId, messageId }),
  thread: ({ memberId, threadId }) => call('empMailbox', { action: 'thread', memberId, threadId }),

  templates: (memberId) => call('empTemplates', { action: 'list', memberId }),
  saveTemplate: ({ memberId, template }) => call('empTemplates', { action: 'save', memberId, template }),
  deleteTemplate: ({ memberId, id }) => call('empTemplates', { action: 'delete', memberId, id }),

  scheduled: (memberId) => call('empSchedule', { action: 'list', memberId }),
  schedule: ({ memberId, ...payload }) => call('empSchedule', { action: 'create', memberId, ...payload }),
  cancelScheduled: ({ memberId, id }) => call('empSchedule', { action: 'cancel', memberId, id }),

  comm: (text) => call('arrivOneComm', { text, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),

  calendar: ({ memberId, timeMin, timeMax, limit } = {}) =>
    call('empCalendar', { action: 'list', memberId, timeMin, timeMax, limit }),
  availability: ({ memberId, timeMin, timeMax, attendees } = {}) =>
    call('empCalendar', { action: 'availability', memberId, timeMin, timeMax, attendees }),
  createEvent: ({ memberId, ...payload }) => call('empCalendar', { action: 'create', memberId, ...payload }),
  updateEvent: ({ memberId, ...payload }) => call('empCalendar', { action: 'update', memberId, ...payload }),
  cancelEvent: ({ memberId, eventId }) => call('empCalendar', { action: 'cancel', memberId, eventId }),
};

/** Reads a browser file as base64 for a provider attachment. */
export function fileToAttachment(file, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`${file.name} is larger than 5 MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve({
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        content_base64: result.split(',')[1] || '',
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Prepares a draft's attachments for saving.
 *
 * The bytes go to private storage and only the reference is kept on the draft
 * record — a record is never used to hold file content. An attachment that has
 * already been uploaded keeps its reference, so re-saving a draft never uploads
 * the same file twice.
 */
export async function uploadDraftAttachments(attachments = []) {
  const out = [];
  for (const item of attachments) {
    if (item?.file_uri) {
      out.push({
        filename: item.filename,
        mime_type: item.mime_type,
        size: item.size || 0,
        file_uri: item.file_uri,
      });
      continue;
    }
    if (!item?.sourceFile) continue;
    const uploaded = await base44.integrations.Core.UploadPrivateFile({ file: item.sourceFile });
    out.push({
      filename: item.filename,
      mime_type: item.mime_type || item.sourceFile.type || 'application/octet-stream',
      size: item.sourceFile.size || 0,
      file_uri: uploaded?.file_uri || '',
    });
  }
  return out;
}

/** Reads a saved draft's attachments back out of private storage. */
export async function loadDraftAttachments(stored = []) {
  const out = [];
  for (const item of stored) {
    if (!item?.file_uri) continue;
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: item.file_uri });
    const response = await fetch(signed_url);
    if (!response.ok) throw new Error(`Could not reopen ${item.filename || 'an attachment'}.`);
    const blob = await response.blob();
    const sourceFile = new File([blob], item.filename || 'attachment', {
      type: item.mime_type || blob.type || 'application/octet-stream',
    });
    const attachment = await fileToAttachment(sourceFile);
    out.push({ ...attachment, file_uri: item.file_uri, sourceFile });
  }
  return out;
}

export default empComm;