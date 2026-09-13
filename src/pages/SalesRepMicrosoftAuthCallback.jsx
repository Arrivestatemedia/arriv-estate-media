import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function SalesRepMicrosoftAuthCallback() {
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);

  useEffect(() => {
    const processAuth = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');

        if (!code) {
          setError('Authorization cancelled');
          setStatus('error');
          return;
        }

        await base44.functions.invoke('exchangeSalesRepMicrosoftAuthCode', { code, state });
        setStatus('success');
        setTimeout(() => { window.location.href = '/AdminSalesSignup'; }, 2000);
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    };
    processAuth();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="text-center">
        {status === 'processing' && (
          <>
            <h1 className="text-2xl font-bold mb-4" style={{ color: '#1A1A1A' }}>Connecting Microsoft 365 account...</h1>
            <div className="animate-spin w-8 h-8 border-4 rounded-full mx-auto" style={{ borderColor: '#B8956A', borderTopColor: 'transparent' }}></div>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-2xl font-bold mb-2" style={{ color: '#22c55e' }}>Success!</h1>
            <p style={{ color: 'rgba(26,26,26,0.6)' }}>Microsoft 365 account authorized. Redirecting...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold mb-2" style={{ color: '#dc2626' }}>Error</h1>
            <p style={{ color: 'rgba(26,26,26,0.6)' }}>{error}</p>
          </>
        )}
      </div>
    </div>
  );
}