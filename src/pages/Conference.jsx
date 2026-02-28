import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertCircle } from "lucide-react";
import VideoCallPanel from "@/components/sales/VideoCallPanel";

export default function Conference() {
  const [roomName, setRoomName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get room from URL params
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    
    if (!room) {
      setError('No conference room specified');
      setLoading(false);
      return;
    }

    setRoomName(room);

    // Try to get current user info
    base44.auth.me()
      .then(userData => {
        setUser(userData);
      })
      .catch(() => {
        // User not authenticated, that's okay - guest join
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFBF5' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#B8956A' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FFFBF5' }}>
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p style={{ color: '#dc2626' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFBF5' }}>
      <VideoCallPanel
        roomName={roomName}
        currentUserName={user?.full_name || 'Guest'}
        recipientName="Conference"
        onClose={() => window.history.back()}
      />
    </div>
  );
}