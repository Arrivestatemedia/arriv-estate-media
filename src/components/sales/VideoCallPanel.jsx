import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function VideoCallPanel({ 
  recipientName, 
  recipientExtension,
  callerToken,
  roomName,
  onClose,
  currentUserName,
  isIncoming = false
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [error, setError] = useState(null);
  const [callState, setCallState] = useState("idle"); // idle, calling, connected
  const twilioRoomRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError("Unable to access camera: " + err.message);
      }
    };

    initCamera();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOn(!isVideoOn);
    }
  };

  const handleStartCall = async () => {
    // If we already have a token and room name (incoming call or token was provided), connect directly
    if (callerToken && roomName) {
      console.log('Using provided token and room name');
      initializeVideoRoom(callerToken);
      return;
    }

    setCallState("calling");
    setIsLoading(true);
    setError(null);
    try {
      const salesMemberId = localStorage.getItem('sales_member_id');
      if (!salesMemberId) {
        throw new Error('Sales member ID not found');
      }

      const response = await base44.functions.invoke('initiateVideoCall', {
        salesMemberId: salesMemberId.trim(),
        recipientExtension: parseInt(recipientExtension)
      });

      if (!response.data?.roomName || !response.data?.caller?.token) {
        throw new Error('Failed to initiate video call: ' + JSON.stringify(response.data));
      }

      console.log('Video call initiated, connecting...');
      initializeVideoRoom(response.data.caller.token, response.data.roomName);
    } catch (err) {
      setError('Failed to start video call: ' + err.message);
      setCallState("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const initializeVideoRoom = async (token, room) => {
    try {
      // Ensure SDK is loaded
      if (!window.Twilio?.Video) {
        const Video = await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js';
          script.onload = () => {
            setTimeout(() => resolve(window.Twilio.Video), 100);
          };
          script.onerror = () => reject(new Error('Failed to load Twilio Video SDK'));
          document.head.appendChild(script);
        });
      }

      const Video = window.Twilio.Video;
      console.log('Connecting to video room:', room || 'generated-room');

      const connectOptions = {
        name: room || `video-${Date.now()}`,
        audio: { echoCancellation: true },
        video: { width: 640, height: 480 },
        networkQuality: { local: 1, remote: 1 },
        maxAudioBitrate: 50000
      };

      const videoRoom = await Video.connect(token, connectOptions);
      console.log('Connected to room:', videoRoom.name);
      twilioRoomRef.current = videoRoom;
      setCallState("connected");

      // Handle existing participants
      videoRoom.participants.forEach(participantConnected);

      // Handle new participants
      videoRoom.on('participantConnected', participantConnected);
      videoRoom.on('participantDisconnected', participantDisconnected);
      videoRoom.on('disconnected', () => {
        console.log('Disconnected from room');
        setCallState("idle");
      });
    } catch (err) {
      console.error('Video room connection error:', err);
      setError('Failed to connect: ' + err.message);
      setCallState("idle");
    }
  };

  const participantConnected = (participant) => {
    console.log('Participant connected:', participant.name, participant.sid);
    participant.videoTracks.forEach(videoTrackSubscription => {
      const videoElement = videoTrackSubscription.track.attach();
      if (remoteVideoRef.current) {
        remoteVideoRef.current.innerHTML = '';
        remoteVideoRef.current.appendChild(videoElement);
      }
    });
    participant.on('trackSubscribed', track => {
      if (track.kind === 'video' && remoteVideoRef.current) {
        const videoElement = track.attach();
        remoteVideoRef.current.innerHTML = '';
        remoteVideoRef.current.appendChild(videoElement);
      }
    });
  };

  const participantDisconnected = (participant) => {
    console.log('Participant disconnected:', participant.sid);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.innerHTML = '';
    }
  };

  const handleEndCall = () => {
    try {
      if (twilioRoomRef.current) {
        twilioRoomRef.current.localParticipant.videoTracks.forEach(trackSubscription => {
          trackSubscription.track.stop();
        });
        twilioRoomRef.current.localParticipant.audioTracks.forEach(trackSubscription => {
          trackSubscription.track.stop();
        });
        twilioRoomRef.current.disconnect();
        twilioRoomRef.current = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.innerHTML = '';
      }
      setCallState("idle");
    } catch (err) {
      console.error('Error ending call:', err);
      setCallState("idle");
    }
  };

  const handleClose = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-lg overflow-hidden w-full max-w-2xl">
        {/* Header */}
        <div className="bg-gray-800 p-4 flex items-center justify-between border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold">{recipientName}</h3>
            <p className="text-gray-400 text-xs">Ext. {recipientExtension}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-white hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Video Area */}
        <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="text-center p-4">
              <p className="text-red-400 mb-4">{error}</p>
              <Button onClick={handleClose} variant="destructive">
                Close
              </Button>
            </div>
          ) : isLoading ? (
            <div className="text-center">
              <p className="text-gray-300 flex items-center justify-center gap-2">
                <span className="animate-spin inline-block">⟳</span>
                Connecting...
              </p>
            </div>
          ) : (
            <>
              {/* Remote video (full screen) */}
              <div 
                ref={remoteVideoRef} 
                className="absolute inset-0 w-full h-full"
              />
              
              {/* Local video (picture-in-picture) */}
              <div className="absolute bottom-4 right-4 w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-600 bg-black">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!isVideoOn && (
                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                    <span className="text-xs">📷 Off</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="bg-gray-800 p-4 flex items-center justify-center gap-4 border-t border-gray-700">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleMic}
            className={`h-10 w-10 p-0 ${isMuted ? "bg-red-500 hover:bg-red-600 border-red-600" : ""}`}
          >
            {isMuted ? (
              <MicOff className="w-5 h-5 text-white" />
            ) : (
              <Mic className="w-5 h-5 text-white" />
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={toggleVideo}
            className={`h-10 w-10 p-0 ${!isVideoOn ? "bg-red-500 hover:bg-red-600 border-red-600" : ""}`}
          >
            {isVideoOn ? "📹" : "🚫"}
          </Button>

          {callState === "idle" && !isIncoming ? (
            <Button
              onClick={handleStartCall}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <Phone className="w-4 h-4" />
              Start Call
            </Button>
          ) : callState === "idle" && isIncoming ? (
            <Button
              onClick={handleStartCall}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <Phone className="w-4 h-4" />
              {isLoading ? "Connecting..." : "Join Call"}
            </Button>
          ) : (
            <Button
              onClick={handleEndCall}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              <PhoneOff className="w-4 h-4" />
              End Call
            </Button>
          )}

          <Button
            onClick={handleClose}
            variant="outline"
            className="text-gray-300 border-gray-600 hover:bg-gray-700"
          >
            Close
          </Button>
        </div>

        {/* Status */}
        {callState !== "idle" && (
          <div className="bg-gray-700 px-4 py-2 text-center text-white text-sm">
            {callState === "calling" ? "Calling..." : "Connected"}
          </div>
        )}
      </div>
    </div>
  );
}