import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, PhoneOff, Loader2, Check, MicOff, Mic } from "lucide-react";

const CALL_STATES = {
  IDLE: "idle",
  CONNECTING: "connecting",
  RINGING: "ringing",
  IN_CALL: "in_call",
  ENDED: "ended",
  LOGGING: "logging"
};

export default function TwilioDialer({ salesMemberId }) {
  const [device, setDevice] = useState(null);
  const [deviceReady, setDeviceReady] = useState(false);
  const [callState, setCallState] = useState(CALL_STATES.IDLE);
  const [toNumber, setToNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [callNotes, setCallNotes] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [logged, setLogged] = useState(false);

  const callRef = useRef(null);
  const timerRef = useRef(null);
  const callStartRef = useRef(null);

  useEffect(() => {
    if (!salesMemberId) return;
    initDevice();
    return () => {
      if (device) device.destroy();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [salesMemberId]);

  const initDevice = async () => {
    try {
      // Load Twilio Voice SDK v2
      if (!window.Twilio?.Device) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://media.twiliocdn.com/sdk/js/voice/releases/2.10.0/twilio.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // Small delay to ensure SDK is fully initialized
      await new Promise(r => setTimeout(r, 200));

      const res = await base44.functions.invoke('generateTwilioToken', { salesMemberId });
      const { token } = res.data;

      if (!token) {
        setError('Failed to get access token');
        return;
      }

      const { Device } = window.Twilio;
      const twilioDevice = new Device(token, {
        codecPreferences: ['opus', 'pcmu'],
        enableRingingState: true,
        logLevel: 1
      });

      twilioDevice.on('registered', () => setDeviceReady(true));
      twilioDevice.on('error', (twilioError) => {
        setError(twilioError?.message || twilioError?.description || 'Twilio error');
        setCallState(CALL_STATES.IDLE);
      });

      await twilioDevice.register();
      setDevice(twilioDevice);
    } catch (err) {
      setError('Failed to initialize calling: ' + (err?.message || err));
    }
  };

  const handleCallEnded = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const duration = callStartRef.current
      ? Math.floor((Date.now() - callStartRef.current) / 1000)
      : 0;
    setCallDuration(duration);
    setCallState(CALL_STATES.ENDED);
    callRef.current = null;
  };

  const startCall = async () => {
    if (!toNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }
    setError('');
    setCallState(CALL_STATES.CONNECTING);

    try {
      const params = {
        To: toNumber,
        salesMemberId
      };

      const call = await device.connect({ params });
      callRef.current = call;

      call.on('ringing', () => setCallState(CALL_STATES.RINGING));
      call.on('accept', () => {
        setCallState(CALL_STATES.IN_CALL);
        callStartRef.current = Date.now();
        timerRef.current = setInterval(() => {
          setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
        }, 1000);
      });
      call.on('disconnect', handleCallEnded);
      call.on('error', (err) => {
        setError(err.message);
        setCallState(CALL_STATES.IDLE);
      });

    } catch (err) {
      setError('Call failed: ' + err.message);
      setCallState(CALL_STATES.IDLE);
    }
  };

  const hangUp = () => {
    if (callRef.current) {
      callRef.current.disconnect();
    }
  };

  const toggleMute = () => {
    if (callRef.current) {
      callRef.current.mute(!muted);
      setMuted(!muted);
    }
  };

  const logCall = async () => {
    setCallState(CALL_STATES.LOGGING);
    try {
      await base44.functions.invoke('logCallActivity', {
        salesMemberId,
        toNumber,
        contactName,
        contactEmail,
        companyName,
        durationSeconds: callDuration,
        notes: callNotes || `Outbound call to ${toNumber}`
      });
      setLogged(true);
      setCallState(CALL_STATES.IDLE);
      // Reset form
      setToNumber('');
      setContactName('');
      setContactEmail('');
      setCompanyName('');
      setCallNotes('');
      setCallDuration(0);
      setTimeout(() => setLogged(false), 3000);
    } catch (err) {
      setError('Failed to log call: ' + err.message);
      setCallState(CALL_STATES.IDLE);
    }
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {logged && (
        <div className="p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: 'rgba(184, 149, 106, 0.15)', borderLeft: '3px solid #B8956A' }}>
          <Check className="w-4 h-4" style={{ color: '#B8956A' }} />
          <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>Call logged & synced to HubSpot!</span>
        </div>
      )}

      {/* Contact Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A1A' }}>Phone Number *</label>
          <Input
            placeholder="+1 (555) 000-0000"
            value={toNumber}
            onChange={(e) => setToNumber(e.target.value)}
            disabled={callState !== CALL_STATES.IDLE}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A1A' }}>Contact Name</label>
          <Input
            placeholder="Jane Smith"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            disabled={callState !== CALL_STATES.IDLE}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A1A' }}>Contact Email</label>
          <Input
            type="email"
            placeholder="jane@example.com"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            disabled={callState !== CALL_STATES.IDLE}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A1A' }}>Company</label>
          <Input
            placeholder="Acme Realty"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={callState !== CALL_STATES.IDLE}
          />
        </div>
      </div>

      {/* Call Controls */}
      {callState === CALL_STATES.IDLE && (
        <Button
          onClick={startCall}
          disabled={!deviceReady}
          className="w-full gap-2 h-12 text-base font-medium"
          style={{ backgroundColor: '#22c55e', color: '#fff' }}
        >
          <Phone className="w-5 h-5" />
          {deviceReady ? 'Start Call' : 'Initializing...'}
        </Button>
      )}

      {(callState === CALL_STATES.CONNECTING || callState === CALL_STATES.RINGING) && (
        <Card style={{ borderColor: '#B8956A', backgroundColor: 'rgba(184, 149, 106, 0.1)' }}>
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#B8956A' }} />
              <span className="font-medium" style={{ color: '#1A1A1A' }}>
                {callState === CALL_STATES.CONNECTING ? 'Connecting...' : 'Ringing...'}
              </span>
            </div>
            <Button onClick={hangUp} variant="destructive" size="sm" className="gap-1">
              <PhoneOff className="w-4 h-4" /> Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {callState === CALL_STATES.IN_CALL && (
        <Card style={{ borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.05)' }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-green-600">On Call</p>
                <p className="text-2xl font-mono font-bold" style={{ color: '#1A1A1A' }}>{formatDuration(callDuration)}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={toggleMute} variant="outline" size="sm" className="gap-1">
                  {muted ? <MicOff className="w-4 h-4 text-red-500" /> : <Mic className="w-4 h-4" />}
                  {muted ? 'Unmute' : 'Mute'}
                </Button>
                <Button onClick={hangUp} variant="destructive" size="sm" className="gap-1">
                  <PhoneOff className="w-4 h-4" /> Hang Up
                </Button>
              </div>
            </div>
            <Textarea
              placeholder="Take notes during the call..."
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>
      )}

      {callState === CALL_STATES.ENDED && (
        <Card style={{ borderColor: '#B8956A', backgroundColor: '#FFFBF5' }}>
          <CardContent className="pt-4 pb-4 space-y-4">
            <div className="flex items-center gap-2">
              <PhoneOff className="w-4 h-4" style={{ color: '#B8956A' }} />
              <span className="font-medium" style={{ color: '#1A1A1A' }}>
                Call ended — {formatDuration(callDuration)}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A1A' }}>Call Notes</label>
              <Textarea
                placeholder="What was discussed? Next steps?"
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                rows={4}
              />
            </div>
            <Button
              onClick={logCall}
              className="w-full gap-2"
              style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
            >
              <Check className="w-4 h-4" />
              Log Call & Sync to HubSpot
            </Button>
          </CardContent>
        </Card>
      )}

      {callState === CALL_STATES.LOGGING && (
        <div className="flex items-center justify-center gap-3 py-4">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#B8956A' }} />
          <span style={{ color: '#1A1A1A' }}>Logging to HubSpot...</span>
        </div>
      )}

      {!deviceReady && callState === CALL_STATES.IDLE && !error && (
        <p className="text-xs text-center" style={{ color: 'rgba(26, 26, 26, 0.5)' }}>
          Setting up calling — please allow microphone access if prompted
        </p>
      )}
    </div>
  );
}