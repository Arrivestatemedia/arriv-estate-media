import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function VideoCallPanel({ 
  recipientName, 
  recipientExtension,
  onClose,
  currentUserName 
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
    setCallState("calling");
    setIsLoading(true);
    try {
      // Get video room token from backend
      const salesMemberId = localStorage.getItem('sales_member_id');
      if (!salesMemberId) {
        throw new Error('Sales member ID not found');
      }

      const response = await base44.functions.invoke('generateTwilioVideoToken', {
        salesMemberId,
        recipientExtension,
        roomName: `video-${Date.now()}`
      });

      if (!response.data?.token) {
        throw new Error('Failed to get video token');
      }

      // Load and initialize Twilio Video SDK
      const Video = window.Twilio?.Video;
      if (!Video) {
        const script = document.createElement('script');
        script.src = 'https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js';
        script.onload = () => initializeVideoRoom(response.data.token);
        document.body.appendChild(script);
      } else {
        initializeVideoRoom(response.data.token);
      }
    } catch (err) {
      setError('Failed to start video call: ' + err.message);
      setCallState("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const initializeVideoRoom = async (token) => {
    try {
      const Video = window.Twilio.Video;
      const room = await Video.connect(token, {
        name: `video-${Date.now()}`,
        audio: { echoCancellation: true },
        video: { width: 640, height: 480 },
        networkQuality: { local: 1, remote: 1 }
      });

      twilioRoomRef.current = room;
      setCallState("connected");

      // Handle remote participants
      room.on('participantConnected', participant => {
        participant.videoTracks.forEach(videoTrack => {
          if (remoteVideoRef.current) {
            const videoElement = videoTrack.attach();
            remoteVideoRef.current.innerHTML = '';
            remoteVideoRef.current.appendChild(videoElement);
          }
        });
      });

      room.on('participantDisconnected', () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.innerHTML = '';
        }
      });
    } catch (err) {
      setError('Failed to connect to video room: ' + err.message);
      setCallState("idle");
    }
  };

  const handleEndCall = () => {
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
              <p className="text-gray-300">Connecting video...</p>
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

          {callState === "idle" ? (
            <Button
              onClick={handleStartCall}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <Phone className="w-4 h-4" />
              Start Call
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