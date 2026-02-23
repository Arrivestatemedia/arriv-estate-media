import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader } from 'lucide-react';

export default function SalesGmailCallback() {
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Authorizing Gmail...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const memberId = urlParams.get('memberId');
        const error = urlParams.get('error');

        if (error) {
          setStatus('error');
          setMessage(`Authorization denied: ${error}`);
          return;
        }

        if (!code || !memberId) {
          setStatus('error');
          setMessage('Missing authorization code or member ID');
          return;
        }

        // Exchange code for token
        const response = await base44.functions.invoke('exchangeGmailCode', {
          code,
          memberId
        });

        if (response.data.success) {
          setStatus('success');
          setMessage('Gmail account authorized successfully! Redirecting to admin panel...');
          setTimeout(() => {
            window.location.href = '/AdminSalesSignup';
          }, 2000);
        } else {
          setStatus('error');
          setMessage(`Authorization failed: ${response.data.error}`);
        }
      } catch (error) {
        setStatus('error');
        setMessage(`Error: ${error.message}`);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {status === 'processing' && 'Authorizing Gmail'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Authorization Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'processing' && (
            <div className="flex justify-center">
              <Loader className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}
          <p className={`text-center ${
            status === 'success' ? 'text-green-600' : 
            status === 'error' ? 'text-red-600' : 
            'text-gray-600'
          }`}>
            {message}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}