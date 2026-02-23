import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function SalesRepGmailAuthCallback() {
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

        const response = await base44.functions.invoke('exchangeSalesRepGmailAuthCode', { code, state });
        setStatus('success');
        
        setTimeout(() => {
          window.location.href = '/AdminSalesSignup';
        }, 2000);
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    };

    processAuth();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        {status === 'processing' && (
          <>
            <h1 className="text-2xl font-bold mb-4">Connecting to Gmail...</h1>
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-2xl font-bold text-green-600 mb-2">Success!</h1>
            <p className="text-gray-600">Gmail authorized. Redirecting...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-red-600 mb-2">Error</h1>
            <p className="text-gray-600">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}