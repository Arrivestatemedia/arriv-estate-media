import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function TrackLink() {
  const [status, setStatus] = useState('redirecting');

  useEffect(() => {
    const trackAndRedirect = async () => {
      const token = window.location.pathname.split('/').pop();
      
      try {
        const response = await base44.functions.invoke('trackLinkClick', { token });
        if (response.data.redirectUrl) {
          window.location.href = response.data.redirectUrl;
        } else {
          setStatus('error');
        }
      } catch (error) {
        console.error('Error:', error);
        setStatus('error');
        setTimeout(() => {
          window.location.href = 'https://arrivestatemedia.com';
        }, 2000);
      }
    };

    trackAndRedirect();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="text-center">
        {status === 'redirecting' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-color)] mx-auto mb-4"></div>
            <p className="text-[var(--text-secondary)]">Redirecting...</p>
          </>
        )}
        {status === 'error' && (
          <p className="text-red-600">Error loading invoice. Redirecting to home...</p>
        )}
      </div>
    </div>
  );
}