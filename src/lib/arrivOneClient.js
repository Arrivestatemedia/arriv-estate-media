import { base44 } from '@/api/base44Client';
import { getSalesSessionToken } from '@/lib/customerSession';

const session = () => {
  const token = getSalesSessionToken();
  return token ? { sales_session_token: token } : {};
};

async function call(functionName, payload) {
  let res;
  try {
    res = await base44.functions.invoke(functionName, { ...payload, ...session() });
  } catch (err) {
    // Surface what the server actually said instead of "status code 409".
    const body = err?.response?.data;
    const error = new Error(body?.error || err?.message || 'That command could not be completed.');
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

/** Private audio upload for voice commands; returns a file_uri (never public). */
export async function uploadVoiceCommand(blob) {
  const file = new File([blob], `command-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
  const res = await base44.integrations.Core.UploadPrivateFile({ file });
  const data = res?.data ?? res;
  if (!data?.file_uri) throw new Error('The recording could not be uploaded.');
  return data.file_uri;
}

export const arrivOne = {
  // AI command
  interpret: ({ text, source = 'text' }) =>
    call('arrivOneAiCommand', {
      action: 'interpret',
      text,
      source,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    }),
  transcribe: ({ file_uri }) => call('arrivOneAiCommand', { action: 'transcribe', file_uri }),
  apply: ({ execution_id, edits }) => call('arrivOneAiCommand', { action: 'apply', execution_id, edits }),
  cancel: ({ execution_id }) => call('arrivOneAiCommand', { action: 'cancel', execution_id }),
  history: () => call('arrivOneAiCommand', { action: 'history' }),

  // Live individual prospect search
  searchPerson: (query) => call('arrivOneProspectSearch', { action: 'search', ...query }),
  lookupEmail: (query) => call('arrivOneProspectSearch', { action: 'email', ...query }),
  addProspect: ({ person, overrides, contact_id }) =>
    call('arrivOneProspectSearch', { action: 'addProspect', person, overrides, contact_id }),

  // Rep telephony identity
  getIdentity: () => call('salesPhoneIdentity', { action: 'getMine' }),
  saveIdentity: (payload) => call('salesPhoneIdentity', { action: 'saveMine', ...payload }),
  adminIdentities: () => call('salesPhoneIdentity', { action: 'list' }),
  adminSaveIdentity: (payload) => call('salesPhoneIdentity', { action: 'save', ...payload }),
  seedIdentities: () => call('salesPhoneIdentity', { action: 'seed' }),
  revokeIdentity: (sales_member_id) => call('salesPhoneIdentity', { action: 'revoke', sales_member_id }),

  // Call review, metrics and voice settings
  analyze: (payload) => call('arrivOneCallReview', { action: 'analyze', ...payload }),
  correctAnalysis: (payload) => call('arrivOneCallReview', { action: 'correct', ...payload }),
  reviewQueue: () => call('arrivOneCallReview', { action: 'queue' }),
  metrics: () => call('arrivOneCallReview', { action: 'metrics' }),
  voiceSettings: () => call('arrivOneCallReview', { action: 'settings' }),
  saveVoiceSettings: (settings) => call('arrivOneCallReview', { action: 'saveSettings', settings }),
};

export default arrivOne;