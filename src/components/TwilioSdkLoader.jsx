import { useEffect } from "react";

export default function TwilioSdkLoader() {
  useEffect(() => {
    if (window.Twilio?.Device) return;
    if (document.getElementById('twilio-voice-sdk')) return;

    // Use backend proxy to serve SDK from same domain (avoids CSP issues)
    const proxyUrl = `${window.location.origin}/functions/twilioSdkProxy`;

    const script = document.createElement('script');
    script.id = 'twilio-voice-sdk';
    script.src = proxyUrl;
    script.onerror = () => console.error('Failed to load Twilio SDK via proxy');
    document.head.appendChild(script);
  }, []);

  return null;
}