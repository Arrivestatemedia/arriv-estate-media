import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertCircle } from "lucide-react";
import VideoCallPanelV2 from "@/components/sales/VideoCallPanelV2";
import TavusInterviewPanel from "@/components/interviews/TavusInterviewPanel";

export default function Conference() {
  const [roomName, setRoomName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [autoStart, setAutoStart] = useState(false);
  const [interviewMode, setInterviewMode] = useState("human");

  useEffect(() => {
    // Get room from URL params
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    
    console.log('Conference page loaded, room param:', room);
    
    if (!room) {
      console.error('No room parameter in URL');
      setError('No conference room specified');
      setLoading(false);
      return;
    }

    console.log('Setting room name to:', room);
    setRoomName(room);

    // Step 1: Check interview mode + ensure Twilio recording room BEFORE anyone joins
    base44.entities.Conference.filter({ room_name: room }, "-created_date", 1)
      .then(async res => {
        const confs = res?.data ?? res ?? [];
        const conf = Array.isArray(confs) ? confs[0] : null;
        if (conf?.interview_mode === "ai") {
          setInterviewMode("ai");
        } else {
          // Human interview — create the Twilio room with server-side recording
          // BEFORE the video panel connects, so recording is on from the start.
          // This must complete before autoStart is set, otherwise the participant
          // might connect to an implicitly-created room (no recording).
          try {
            await base44.functions.invoke("ensureTwilioRecordingRoom", { roomName: room });
          } catch (_) {}
        }
      })
      .catch(() => {})
      // Step 2: Check auth (only after recording room is ready)
      .then(() => base44.auth.isAuthenticated())
      .then(isAuth => {
        console.log('User authenticated:', isAuth);
        return isAuth ? base44.auth.me() : null;
      })
      .then(userData => {
        console.log('User data:', userData);
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFBF5' }}>
      {interviewMode === "ai" ? (
        <TavusInterviewPanel
          roomName={roomName}
          currentUserName={user?.full_name || 'Guest'}
          recipientName="Arriv Interview"
          onClose={() => window.history.back()}
        />
      ) : (
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
      )}
    </div>
  );
}