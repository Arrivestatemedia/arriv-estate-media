import { useEffect } from "react";

const TWILIO_URLS = [
  'https://sdk.twilio.com/js/voice/releases/2.10.0/twilio.min.js',
  'https://media.twiliocdn.com/sdk/js/voice/releases/2.10.0/twilio.min.js',
];

function tryLoadScript(urls, index = 0) {
  if (index >= urls.length) return;
  const existing = document.getElementById('twilio-voice-sdk');
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.id = 'twilio-voice-sdk';
  script.src = urls[index];
  script.crossOrigin = 'anonymous';
  script.onerror = () => tryLoadScript(urls, index + 1);
  document.head.appendChild(script);
}

export default function TwilioSdkLoader() {
  useEffect(() => {
    if (window.Twilio?.Device) return;
    tryLoadScript(TWILIO_URLS);
  }, []);

  return null;
}