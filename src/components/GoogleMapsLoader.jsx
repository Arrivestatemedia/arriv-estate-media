import { useEffect } from 'react';

export default function GoogleMapsLoader() {
  useEffect(() => {
    if (window.google) return;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    console.log("=== Google Maps Loader Debug ===");
    console.log("API Key value:", apiKey);
    console.log("API Key defined:", !!apiKey);
    console.log("All env vars:", import.meta.env);
    
    const scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    console.log("Script URL:", scriptUrl);
    
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    script.onerror = () => console.error("Maps script failed to load");
    script.onload = () => console.log("Maps script loaded successfully");
    document.head.appendChild(script);
  }, []);

  return null;
}