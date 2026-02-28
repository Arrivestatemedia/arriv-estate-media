import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Mic, MicOff, Video, VideoOff, Monitor, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

export default function VideoCallPanel({ 
  recipientName, 
  recipientExtension,
  callerToken,
  roomName,
  onClose,
  currentUserName,
  isIncoming = false,
  autoStart = false
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const twilioRoomRef = useRef(null);
  const localStreamRef = useRef(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState(null);
  const [callState, setCallState] = useState("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [remoteParticipantName, setRemoteParticipantName] = useState(null);

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true }
        });

        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          await localVideoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError("Unable to access camera");
      }
    };

    initCamera();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Auto-start
  useEffect(() => {
    if (autoStart && roomName && callState === "idle") {
      setTimeout(() => handleStartCall(), 500);
    }
  }, [autoStart, roomName, callState]);

  const handleStartCall = useCallback(async () => {
    setCallState("calling");
    setIsLoading(true);
    setError(null);

    try {
      let token = callerToken;
      let room = roomName;

      if (!token && room) {
        const response = await base44.functions.invoke('generateDirectVideoToken', {
          roomName: room,
          participantName: currentUserName || 'Guest'
        });
        if (!response?.data?.token) {
          throw new Error('Failed to generate token');
        }
        token = response.data.token;
      }

      if (!token || !room) {
        throw new Error('Missing token or room name');
      }

      await connectToRoom(token, room);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
      setCallState("idle");
    } finally {
      setIsLoading(false);
    }
  }, [callerToken, roomName, currentUserName]);

  const connectToRoom = useCallback(async (token, room) => {
    try {
      if (!window.Twilio?.Video) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js';
          script.onload = () => {
            setTimeout(() => {
              if (window?.Twilio?.Video) resolve();
              else reject(new Error('Twilio.Video not loaded'));
            }, 100);
          };
          script.onerror = () => reject(new Error('Failed to load SDK'));
          document.head.appendChild(script);
        });
      }

      const Video = window?.Twilio?.Video;
      if (!Video) throw new Error('Twilio Video not available');

      const videoRoom = await Video.connect(token, {
        name: room,
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: 640 },
        dominantSpeaker: true
      });

      twilioRoomRef.current = videoRoom;

      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      setCallState("connected");

      videoRoom.participants.forEach(p => handleParticipantConnected(p));
      videoRoom.on('participantConnected', handleParticipantConnected);
      videoRoom.on('participantDisconnected', handleParticipantDisconnected);
      videoRoom.on('disconnected', () => setCallState("idle"));
    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message);
      setCallState("idle");
    }
  }, []);

  const handleParticipantConnected = useCallback((participant) => {
    console.log('Participant connected:', participant.identity);
    setRemoteParticipantName(participant.identity);

    participant.tracks.forEach(pub => {
      if (pub.isSubscribed) attachTrack(pub.track);
    });

    participant.on('trackSubscribed', attachTrack);
    participant.on('trackUnsubscribed', track => {
      try {
        track.detach().forEach(el => el?.remove?.());
      } catch (err) {
        console.warn('Detach error:', err);
      }
    });
  }, []);

  const handleParticipantDisconnected = useCallback((participant) => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.innerHTML = '';
    }
  }, []);

  const attachTrack = (track) => {
    if (track.kind === 'video' && remoteVideoRef.current) {
      const videoElement = track.attach();
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';
      remoteVideoRef.current.innerHTML = '';
      remoteVideoRef.current.appendChild(videoElement);
    } else if (track.kind === 'audio') {
      const audioElement = track.attach();
      document.body.appendChild(audioElement);
    }
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      setIsVideoOn(!isVideoOn);
    }
  };

  const handleEndCall = () => {
    setCallState("disconnecting");
    if (twilioRoomRef.current) {
      twilioRoomRef.current.disconnect();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    setCallState("idle");
    setTimeout(onClose, 100);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 border-b border-yellow-500/20 px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-lg">
            {remoteParticipantName || recipientName || 'Video Call'}
          </h3>
          {recipientExtension && <p className="text-yellow-500/70 text-xs">Ext. {recipientExtension}</p>}
          {callState === "connected" && <p className="text-green-400 text-xs font-semibold">● Connected</p>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleEndCall}
          className="text-white hover:bg-red-500/20"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Video Area */}
      <div className="flex-1 flex gap-4 p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-black overflow-hidden">
        {/* Main Video */}
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-black shadow-2xl border border-yellow-500/10">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 p-6">
              <p className="text-red-400 text-center">{error}</p>
              <Button onClick={onClose} variant="destructive">Close</Button>
            </div>
          ) : isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-white">Connecting...</p>
              </div>
            </div>
          ) : (
            <div ref={remoteVideoRef} className="w-full h-full bg-black" />
          )}

          {/* Local Video PIP */}
          {callState === "connected" && (
            <div className="absolute bottom-6 right-6 w-48 h-36 rounded-xl overflow-hidden bg-slate-900 shadow-2xl border-2 border-yellow-500/50 z-40">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: isVideoOn ? 'scaleX(-1)' : 'scaleX(-1)',
                }}
              />
              {!isVideoOn && (
                <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
                  <span className="text-white text-sm">Camera Off</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 border-t border-yellow-500/20 px-6 py-4">
        <div className="flex items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={toggleMic}
            className={`h-14 w-14 rounded-full transition-all ${
              isMuted
                ? 'bg-red-600/90 hover:bg-red-700 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-white'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </Button>

          <Button
            size="lg"
            onClick={toggleVideo}
            className={`h-14 w-14 rounded-full transition-all ${
              !isVideoOn
                ? 'bg-red-600/90 hover:bg-red-700 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-white'
            }`}
            title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {isVideoOn ? (
              <Video className="w-5 h-5" />
            ) : (
              <VideoOff className="w-5 h-5" />
            )}
          </Button>

          {callState === "idle" && !isIncoming ? (
            <Button
              onClick={handleStartCall}
              disabled={isLoading}
              size="lg"
              className="h-14 px-8 bg-green-600 hover:bg-green-700 text-white font-semibold gap-2"
            >
              <Phone className="w-5 h-5" />
              Start Call
            </Button>
          ) : callState === "idle" && isIncoming ? (
            <Button
              onClick={handleStartCall}
              disabled={isLoading}
              size="lg"
              className="h-14 px-8 bg-green-600 hover:bg-green-700 text-white font-semibold gap-2"
            >
              <Phone className="w-5 h-5" />
              Join Call
            </Button>
          ) : callState !== "idle" ? (
            <Button
              onClick={handleEndCall}
              disabled={callState === "disconnecting"}
              size="lg"
              className="h-14 px-8 bg-red-600 hover:bg-red-700 text-white font-semibold gap-2"
            >
              <PhoneOff className="w-5 h-5" />
              End Call
            </Button>
          ) : null}

          <Button
            onClick={onClose}
            size="lg"
            variant="ghost"
            className="h-14 w-14 rounded-full text-gray-300 hover:bg-slate-700/50"
            title="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}