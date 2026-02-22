import { useEffect } from "react";

export default function TwilioSdkLoader() {
  useEffect(() => {
    if (window.Twilio?.Device) return;
    const existing = document.getElementById('twilio-voice-sdk');
    if (existing) return;
    const script = document.createElement('script');
    script.id = 'twilio-voice-sdk';
    script.src = 'https://sdk.twilio.com/js/voice/releases/2.10.0/twilio.min.js';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  return null;
}