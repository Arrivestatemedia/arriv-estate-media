import { useEffect } from 'react';

export default function GoogleMapsLoader() {
  useEffect(() => {
    if (window.google) return;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    // Skip loading if API key is not defined
    if (!apiKey) {
      console.warn("Google Maps API key not configured");
      return;
    }
    
    const scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    
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