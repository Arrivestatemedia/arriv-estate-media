import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { getCustomerSessionToken, setCustomerSessionValidator } from '@/lib/customerSession';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Use the SDK transport and its platform headers unchanged. The custom credential
// belongs in the JSON body, NOT in the platform's Authorization header.
const invoke = base44.functions.invoke.bind(base44.functions);
base44.functions.invoke = (name, payload = {}, ...args) => {
  const credential = getCustomerSessionToken();
  const json = payload && Object.getPrototypeOf(payload) === Object.prototype;
  return invoke(name, json && credential && name !== 'verifySignIn'
    ? { session_token: credential, ...payload } : payload, ...args);
};
setCustomerSessionValidator((sessionToken) => invoke('getMyAccount', {
  session_token: sessionToken, identity_only: true,
}));