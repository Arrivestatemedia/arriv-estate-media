import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function TwilioSdkLoader() {
  useEffect(() => {
    if (window.Twilio?.Device) return;
    if (window._twilioSdkLoading) return;
    window._twilioSdkLoading = true;

    // Fetch via backend proxy (bypasses CSP), then eval to inject into window
    base44.functions.invoke('twilioSdkProxy').then((res) => {
      const code = typeof res.data === 'string' ? res.data : null;
      if (!code) {
        console.error('Twilio SDK proxy returned no content');
        return;
      }
      try {
        // eslint-disable-next-line no-eval
        eval(code);
      } catch (e) {
        console.error('Failed to eval Twilio SDK:', e);
      }
    }).catch((err) => {
      console.error('Failed to fetch Twilio SDK via proxy:', err);
    });
  }, []);

  return null;
}