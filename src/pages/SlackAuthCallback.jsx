import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function SlackAuthCallback() {
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Authenticating with Slack...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const response = await fetch('/functions/handleSlackAuthCallback' + window.location.search, {
          method: 'POST',
        });
        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setMessage('Successfully connected to Slack! Redirecting...');
          setTimeout(() => {
            window.location.href = '/HubSpotActivityLog';
          }, 2000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to authenticate with Slack');
        }
      } catch (error) {
        setStatus('error');
        setMessage(error.message || 'An error occurred');
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FFFBF5' }}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className={status === 'success' ? 'text-green-600' : status === 'error' ? 'text-red-600' : ''}>
            {status === 'processing' && 'Connecting to Slack'}
            {status === 'success' && 'Connected!'}
            {status === 'error' && 'Connection Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {status === 'processing' && <Loader2 className="w-5 h-5 animate-spin" />}
            <p>{message}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}