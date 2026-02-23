import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Eye, EyeOff } from "lucide-react";

export default function SlackAuth({ salesMemberId, onAuthSuccess }) {
  const [token, setToken] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const members = await base44.entities.SalesTeamMember.filter({ id: salesMemberId });
        if (members.length > 0 && members[0].slack_token) {
          setIsAuthed(true);
        }
      } catch (err) {
        console.error('Error checking auth status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, [salesMemberId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Please enter your Slack token');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await base44.entities.SalesTeamMember.update(salesMemberId, { slack_token: token });
      setIsAuthed(true);
      setToken("");
      if (onAuthSuccess) onAuthSuccess();
    } catch (err) {
      console.error('Error saving token:', err);
      setError('Failed to save token. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
        <CardDescription>Enter your Slack token to send messages to your workspace</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Slack Token</label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                placeholder="xoxb-your-token-here"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Get your token from slack.com/apps</p>
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Connecting..." : "Connect"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}