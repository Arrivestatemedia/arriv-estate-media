import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, PhoneOff, Loader2, Check, MicOff, Mic, Clock, X } from "lucide-react";
import { format } from "date-fns";

const CALL_STATES = {
  IDLE: "idle",
  CONNECTING: "connecting",
  RINGING: "ringing",
  INCOMING: "incoming",
  IN_CALL: "in_call",
  ENDED: "ended",
  LOGGING: "logging"
};

export default function PhoneDialer({ salesMemberId }) {
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
  const [incomingCall, setIncomingCall] = useState(null);
  const [incomingFrom, setIncomingFrom] = useState("");
  const [showCallLog, setShowCallLog] = useState(false);

  const callRef = useRef(null);
  const timerRef = useRef(null);
  const callStartRef = useRef(null);
  const queryClient = useQueryClient();

  // Fetch call history from ActivityLog
  const { data: callHistory = [] } = useQuery({
    queryKey: ['callHistory', salesMemberId],
    queryFn: async () => {
      const activities = await base44.entities.ActivityLog.list('-activity_date', 50);
      return activities
        .filter(a => a.activity_type === 'call' && a.created_by)
        .slice(0, 10);
    },
    enabled: !!salesMemberId
  });

  useEffect(() => {
    if (!salesMemberId) return;
    initDevice();
    return () => {
      if (device) device.destroy();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [salesMemberId]);

  const loadTwilioSdk = () => new Promise((resolve, reject) => {
    if (window.Twilio?.Device) { resolve(); return; }
    const existing = document.getElementById('twilio-sdk-script');
    if (existing) {
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'twilio-sdk-script';
    script.src = 'https://sdk.twilio.com/js/voice/releases/2.10.0/twilio.min.js';
    script.onload = resolve;
    script.onerror = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://media.twiliocdn.com/sdk/js/voice/releases/2.10.0/twilio.min.js';
      s2.onload = resolve;
      s2.onerror = () => reject(new Error('Unable to load Twilio SDK'));
      document.head.appendChild(s2);
    };
    document.head.appendChild(script);
  });

  const initDevice = async () => {
    try {
      await loadTwilioSdk();

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
      twilioDevice.on('incoming', (call) => {
        setIncomingCall(call);
        setIncomingFrom(call.parameters?.From || 'Unknown');
        setCallState(CALL_STATES.INCOMING);
        call.on('disconnect', handleCallEnded);
        call.on('cancel', () => {
          setIncomingCall(null);
          setIncomingFrom('');
          setCallState(CALL_STATES.IDLE);
        });
      });

      await twilioDevice.register();
      setDevice(twilioDevice);
    } catch (err) {
      setError('Failed to initialize calling: ' + (err?.message || String(err)));
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
      call.on('accept', async () => {
        setCallState(CALL_STATES.IN_CALL);
        callStartRef.current = Date.now();
        timerRef.current = setInterval(() => {
          setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
        }, 1000);
        
        // Auto-log call to HubSpot immediately on connect
        try {
          await base44.functions.invoke('logCallActivity', {
            salesMemberId,
            toNumber,
            contactName,
            contactEmail,
            companyName,
            durationSeconds: 0,
            notes: `Outbound call to ${toNumber}`,
            autoLogged: true
          });
        } catch (err) {
          console.error('Failed to auto-log call:', err);
        }
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

  const acceptCall = async () => {
    if (incomingCall) {
      incomingCall.accept();
      callRef.current = incomingCall;
      setCallState(CALL_STATES.IN_CALL);
      callStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);
      setIncomingCall(null);

      // Auto-log incoming call
      try {
        await base44.functions.invoke('logCallActivity', {
          salesMemberId,
          toNumber: incomingFrom,
          contactName: 'Incoming Call',
          durationSeconds: 0,
          notes: `Incoming call from ${incomingFrom}`,
          autoLogged: true
        });
      } catch (err) {
        console.error('Failed to auto-log incoming call:', err);
      }
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      incomingCall.reject();
      setIncomingCall(null);
      setIncomingFrom('');
      setCallState(CALL_STATES.IDLE);
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
      queryClient.invalidateQueries({ queryKey: ['callHistory'] });
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

  const callNumberPad = (num) => {
    setToNumber(prev => prev + num);
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Incoming Call Alert */}
      {callState === CALL_STATES.INCOMING && (
        <div className="p-4 rounded-lg border-2 flex items-center justify-between gap-4 animate-pulse" style={{ borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)' }}>
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-700">Incoming Call</p>
              <p className="text-sm text-gray-600">{incomingFrom}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={acceptCall} className="gap-1 bg-green-600 hover:bg-green-700 text-white">
              <Phone className="w-4 h-4" /> Accept
            </Button>
            <Button onClick={rejectCall} variant="destructive" className="gap-1">
              <PhoneOff className="w-4 h-4" /> Decline
            </Button>
          </div>
        </div>
      )}

      {logged && (
        <div className="p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: 'rgba(184, 149, 106, 0.15)', borderLeft: '3px solid #B8956A' }}>
          <Check className="w-4 h-4" style={{ color: '#B8956A' }} />
          <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>Call logged & synced to HubSpot!</span>
        </div>
      )}

      {/* Dialer Display */}
      {callState === CALL_STATES.IDLE && (
        <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20' }}>
          <CardContent className="pt-6 pb-6">
            <div className="space-y-4">
              {/* Display */}
              <div className="text-center">
                <p className="text-4xl font-mono font-bold" style={{ color: '#1A1A1A' }}>
                  {toNumber || ''}
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(26, 26, 26, 0.5)' }}>
                  {deviceReady ? 'Ready to call' : 'Initializing...'}
                </p>
              </div>

              {/* Number Pad */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map((num) => (
                  <Button
                    key={num}
                    variant="outline"
                    onClick={() => callNumberPad(num)}
                    disabled={!deviceReady || callState !== CALL_STATES.IDLE}
                    className="h-12 text-lg font-semibold"
                  >
                    {num}
                  </Button>
                ))}
              </div>

              {/* Controls */}
              <div className="flex gap-2">
                <Button
                  onClick={() => setToNumber(toNumber.slice(0, -1))}
                  variant="outline"
                  className="flex-1"
                  disabled={!toNumber}
                >
                  Backspace
                </Button>
                <Button
                  onClick={startCall}
                  disabled={!deviceReady || !toNumber.trim()}
                  className="flex-1 gap-2 h-12"
                  style={{ backgroundColor: '#22c55e', color: '#fff' }}
                >
                  <Phone className="w-5 h-5" />
                  Call
                </Button>
              </div>

              {/* Contact Info */}
              <div className="border-t pt-4 space-y-3">
                <Input
                  placeholder="Contact Name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  disabled={!deviceReady}
                />
                <Input
                  type="email"
                  placeholder="Contact Email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  disabled={!deviceReady}
                />
                <Input
                  placeholder="Company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={!deviceReady}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Call */}
      {callState === CALL_STATES.IN_CALL && (
        <Card style={{ borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.05)' }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-green-600">On Call</p>
                <p className="text-3xl font-mono font-bold" style={{ color: '#1A1A1A' }}>{formatDuration(callDuration)}</p>
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

      {/* Call Ended */}
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

      {/* Connecting/Ringing */}
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

      {/* Call Log */}
      {callState === CALL_STATES.IDLE && (
        <Card>
          <CardContent className="pt-6 pb-6">
            <button
              onClick={() => setShowCallLog(!showCallLog)}
              className="w-full flex items-center justify-between font-semibold mb-4"
              style={{ color: '#1A1A1A' }}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Call Log
              </div>
              <span className="text-xs" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                {showCallLog ? 'Hide' : 'Show'}
              </span>
            </button>

            {showCallLog && (
              <div className="space-y-2">
                {callHistory.length === 0 ? (
                  <p className="text-sm text-center" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                    No calls yet
                  </p>
                ) : (
                  callHistory.map((call) => (
                    <div
                      key={call.id}
                      onClick={() => {
                        setToNumber(call.contact_name || call.contact_email || '');
                        setShowCallLog(false);
                      }}
                      className="p-3 rounded-lg cursor-pointer transition"
                      style={{ backgroundColor: 'rgba(184, 149, 106, 0.1)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate" style={{ color: '#1A1A1A' }}>
                            {call.contact_name || call.company_name || call.contact_email}
                          </p>
                          <p className="text-xs" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                            {format(new Date(call.activity_date), 'MMM d, h:mm a')}
                          </p>
                        </div>
                        {call.duration_minutes > 0 && (
                          <span className="text-xs font-mono" style={{ color: '#B8956A' }}>
                            {call.duration_minutes}m
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}