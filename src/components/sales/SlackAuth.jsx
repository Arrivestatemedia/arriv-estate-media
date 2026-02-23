import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle } from "lucide-react";

export default function SlackAuth({ salesMemberId, onAuthSuccess }) {
  const [slackClientId, setSlackClientId] = useState(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchClientId = async () => {
      try {
        const res = await base44.functions.invoke('getSlackClientId', {});
        setSlackClientId(res.data?.clientId);
      } catch (err) {
        console.error('Error fetching Slack client ID:', err);
        setError('Failed to load Slack integration');
      } finally {
        setLoading(false);
      }
    };

    const checkAuthStatus = async () => {
      try {
        const member = await base44.entities.SalesTeamMember.filter({}, 0, 1);
        const me = member.find(m => m.id === salesMemberId);
        if (me?.slack_token) {
          setIsAuthed(true);
        }
      } catch (err) {
        console.error('Error checking auth status:', err);
      }
    };

    fetchClientId();
    checkAuthStatus();
  }, [salesMemberId]);

  const handleSlackConnect = () => {
    if (!slackClientId) {
      setError('Slack client ID not available');
      return;
    }

    const redirectUri = 'https://app.arrivestatemedia.com/slackOAuthCallback';
    const scope = 'chat:write channels:read users:read users:read.email';
    const state = salesMemberId;

    const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${slackClientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    
    window.location.href = authUrl;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-gray-500">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (isAuthed) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <CardTitle className="text-green-900">Slack Connected</CardTitle>
          </div>
          <CardDescription>Your personal Slack account is connected</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-800">You can now send messages directly to your Slack workspace.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect Your Slack Account</CardTitle>
        <CardDescription>Sign in with your personal Slack workspace to send messages</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        <Button
          onClick={handleSlackConnect}
          className="w-full bg-[#4A90E2] hover:bg-[#3A80D2] text-white"
        >
          Connect Slack Account
        </Button>
        <p className="text-xs text-gray-500 mt-3">We'll only access your messaging permissions</p>
      </CardContent>
    </Card>
  );
}