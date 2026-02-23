import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Check } from 'lucide-react';

export default function SlackAuthButton({ isAuthenticated, onAuthSuccess }) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    try {
      setLoading(true);
      const response = await base44.functions.invoke('generateSlackOAuthUrl', {});
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      }
    } catch (error) {
      console.error('Error generating auth URL:', error);
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <Check className="w-5 h-5" />
        <span className="text-sm font-medium">Slack Connected</span>
      </div>
    );
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={loading}
      variant="outline"
      className="gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          Connect Slack Account
        </>
      )}
    </Button>
  );
}