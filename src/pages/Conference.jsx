import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertCircle } from "lucide-react";
import VideoCallPanelV2 from "@/components/sales/VideoCallPanelV2";
import TavusInterviewPanel from "@/components/interviews/TavusInterviewPanel";

export default function Conference() {
  const [roomName, setRoomName] = useState(null);
  const [conference, setConference] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [autoStart, setAutoStart] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');

    if (!room) {
      setError('No conference room specified');
      setLoading(false);
      return;
    }

    setRoomName(room);

    // Fetch the Conference record to determine interview mode
    base44.entities.Conference.filter({ room_name: room })
      .then(res => {
        const conf = res?.data?.[0] || res?.[0];
        setConference(conf || null);
      })
      .catch(() => setConference(null));

    // Try to get current user info
    base44.auth.isAuthenticated()
      .then(isAuth => {
        if (isAuth) {
          return base44.auth.me();
        } else {
          return null;
        }
      })
      .then(userData => {
        if (userData) {
          setUser(userData);
        } else {
          setUser({ full_name: 'Guest' });
        }
        setAutoStart(true);
      })
      .catch(() => {
        setUser({ full_name: 'Guest' });
        setAutoStart(true);
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

  // ─── Route based on interview_mode ──────────────────────────────────────────
  // AI interviews render TavusInterviewPanel; everything else (human/default)
  // renders the existing VideoCallPanelV2 exactly as before.
  if (conference?.interview_mode === "ai") {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#FFFBF5' }}>
        <TavusInterviewPanel
          roomName={roomName}
          currentUserName={user?.full_name || 'Guest'}
          onClose={() => window.history.back()}
        />
      </div>
    );
  }

  // ─── Existing Twilio Video path (unchanged) ─────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFBF5' }}>
      <VideoCallPanelV2
        roomName={roomName}
        currentUserId={user?.id || localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id')}
        currentUserName={user?.full_name || 'Guest'}
        recipientName="Conference"
        onClose={() => window.history.back()}
        autoStart={autoStart}
        isVideoWindowOpen={true}
        onMinimize={() => {}}
        onChatOpenRequest={() => {}}
      />
    </div>
  );
}