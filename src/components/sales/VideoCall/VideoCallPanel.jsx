import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Phone, PhoneOff, Mic, MicOff, Monitor, MessageSquare, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import ChatPanel from "./ChatPanel";
import VideoCallControls from "./VideoCallControls";
import ParticipantVideo from "./ParticipantVideo";

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
  const screenStreamRef = useRef(null);
  const twilioRoomRef = useRef(null);
  const localStreamRef = useRef(null);
  const videoTrackPublicationRef = useRef(null);
  const audioTrackPublicationRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState(null);
  const [callState, setCallState] = useState("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [blurEnabled, setBlurEnabled] = useState(false);
  const [remoteParticipantName, setRemoteParticipantName] = useState(null);

  // Initialize camera stream
  useEffect(() => {
    const initCamera = async () => {
      try {
        console.log('🎥 Initializing camera...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true }
        });

        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        
        if (videoTracks.length === 0) {
          throw new Error('No video tracks in stream');
        }

        console.log('✅ Camera initialized with', videoTracks.length, 'video and', audioTracks.length, 'audio tracks');
        
        localStreamRef.current = stream;
        setLocalStream(stream);

        // Attach to video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          localVideoRef.current.autoplay = true;
          localVideoRef.current.playsInline = true;
          await localVideoRef.current.play().catch(err => console.warn('Play error:', err));
        }
      } catch (err) {
        console.error('❌ Camera error:', err);
        setError("Camera access denied: " + err.message);
      }
    };

    initCamera();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Auto-start call if needed
  useEffect(() => {
    if (autoStart && roomName && !recipientExtension && callState === "idle" && localStream) {
      console.log('🔄 Auto-starting call...');
      setTimeout(handleStartCall, 100);
    }
  }, [autoStart, roomName, callState, localStream]);

  const handleStartCall = useCallback(async () => {
    console.log('📞 Starting call...');
    setCallState("calling");
    setIsLoading(true);
    setError(null);

    try {
      let token = callerToken;
      let room = roomName;

      // If no token provided, generate one
      if (!token && room) {
        console.log('🔐 Generating token...');
        const response = await base44.functions.invoke('generateDirectVideoToken', {
          roomName: room,
          participantName: currentUserName || 'Guest'
        });

        if (!response.data?.token) {
          throw new Error('Failed to generate token');
        }
        token = response.data.token;
      }

      if (!token || !room) {
        throw new Error('Missing token or room name');
      }

      await connectToRoom(token, room);
    } catch (err) {
      console.error('❌ Call start error:', err);
      setError("Failed to start call: " + err.message);
      setCallState("idle");
    } finally {
      setIsLoading(false);
    }
  }, [callerToken, roomName, currentUserName]);

  const connectToRoom = useCallback(async (token, room) => {
    try {
      console.log('🌐 Connecting to room:', room);
      
      // Load Twilio SDK if needed
      if (!window.Twilio?.Video) {
        console.log('📦 Loading Twilio SDK...');
        const Video = await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js';
          script.onload = () => {
            setTimeout(() => {
              if (window.Twilio?.Video) resolve(window.Twilio.Video);
              else reject(new Error('Twilio not loaded'));
            }, 100);
          };
          script.onerror = () => reject(new Error('Failed to load SDK'));
          document.head.appendChild(script);
        });
      }

      const Video = window.Twilio.Video;
      
      const connectOptions = {
        name: room,
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: 640 },
        networkQuality: { local: 1, remote: 1 },
        dominantSpeaker: true
      };

      const videoRoom = await Video.connect(token, connectOptions);
      console.log('✅ Connected to room:', videoRoom.name);
      twilioRoomRef.current = videoRoom;

      // Store track publications for later access
      const localParticipant = videoRoom.localParticipant;
      videoTrackPublicationRef.current = Array.from(localParticipant.videoTracks.values())[0] || null;
      audioTrackPublicationRef.current = Array.from(localParticipant.audioTracks.values())[0] || null;

      console.log('📺 Video tracks:', localParticipant.videoTracks.size);
      console.log('🔊 Audio tracks:', localParticipant.audioTracks.size);

      // Ensure local video is playing
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.muted = true;
        try {
          await localVideoRef.current.play();
        } catch (err) {
          console.warn('Local video play:', err);
        }
      }

      setCallState("connected");

      // Handle existing participants
      videoRoom.participants.forEach(handleParticipantConnected);

      // Handle new participants
      videoRoom.on('participantConnected', handleParticipantConnected);
      videoRoom.on('participantDisconnected', handleParticipantDisconnected);
      videoRoom.on('disconnected', () => {
        console.log('📴 Room disconnected');
        setCallState("idle");
      });
    } catch (err) {
      console.error('❌ Connection error:', err);
      setError("Connection failed: " + err.message);
      setCallState("idle");
    }
  }, []);

  const handleParticipantConnected = useCallback((participant) => {
    console.log('👤 Participant connected:', participant.name);
    setRemoteParticipantName(participant.name);

    // Handle existing tracks
    participant.tracks.forEach(publication => {
      if (publication.isSubscribed) {
        attachTrack(publication.track);
      }
    });

    // Handle new tracks
    participant.on('trackSubscribed', track => {
      console.log('📥 Track subscribed:', track.kind);
      attachTrack(track);
    });

    participant.on('trackUnsubscribed', track => {
      console.log('📤 Track unsubscribed:', track.kind);
      detachTrack(track);
    });
  }, []);

  const attachTrack = useCallback((track) => {
    if (track.kind === 'video' && remoteVideoRef.current) {
      console.log('🎬 Attaching video track');
      const videoElement = track.attach();
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';
      remoteVideoRef.current.innerHTML = '';
      remoteVideoRef.current.appendChild(videoElement);
    } else if (track.kind === 'audio') {
      console.log('🔊 Attaching audio track');
      const audioElement = track.attach();
      audioElement.autoplay = true;
      document.body.appendChild(audioElement);
    }
  }, []);

  const detachTrack = useCallback((track) => {
    console.log('🔌 Detaching track:', track.kind);
    track.detach().forEach(el => el?.remove?.());
  }, []);

  const handleParticipantDisconnected = useCallback((participant) => {
    console.log('👋 Participant disconnected:', participant.name);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.innerHTML = '';
    }
  }, []);

  const toggleMic = useCallback(() => {
    console.log('🎤 Toggling mic...');
    try {
      if (localStreamRef.current) {
        const audioTracks = localStreamRef.current.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = !track.enabled;
        });
        setIsMuted(!isMuted);
        console.log('✅ Mic toggled:', !isMuted ? 'OFF' : 'ON');
      } else if (twilioRoomRef.current?.localParticipant?.audioTracks?.size > 0) {
        const audioTrackPub = Array.from(twilioRoomRef.current.localParticipant.audioTracks.values())[0];
        if (audioTrackPub?.track) {
          audioTrackPub.track.enable(!isMuted);
          setIsMuted(!isMuted);
          console.log('✅ Twilio mic toggled:', !isMuted ? 'OFF' : 'ON');
        }
      }
    } catch (err) {
      console.error('❌ Mic toggle error:', err);
      setError('Mic control failed');
    }
  }, [isMuted]);

  const toggleVideo = useCallback(() => {
    console.log('📹 Toggling video...');
    try {
      if (localStreamRef.current) {
        const videoTracks = localStreamRef.current.getVideoTracks();
        videoTracks.forEach(track => {
          track.enabled = !track.enabled;
        });
        setIsVideoOn(!isVideoOn);
        console.log('✅ Video toggled:', !isVideoOn ? 'OFF' : 'ON');
      } else if (twilioRoomRef.current?.localParticipant?.videoTracks?.size > 0) {
        const videoTrackPub = Array.from(twilioRoomRef.current.localParticipant.videoTracks.values())[0];
        if (videoTrackPub?.track) {
          videoTrackPub.track.enable(!isVideoOn);
          setIsVideoOn(!isVideoOn);
          console.log('✅ Twilio video toggled:', !isVideoOn ? 'OFF' : 'ON');
        }
      }
    } catch (err) {
      console.error('❌ Video toggle error:', err);
      setError('Video control failed');
    }
  }, [isVideoOn]);

  const toggleScreenShare = useCallback(async () => {
    console.log('🖥️ Toggling screen share...');
    
    if (!twilioRoomRef.current?.localParticipant) {
      setError('Not connected to call');
      return;
    }

    try {
      if (isScreenSharing) {
        // Stop screen share
        console.log('🛑 Stopping screen share...');
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(t => t.stop());
          screenStreamRef.current = null;
        }

        // Switch back to camera
        if (localStreamRef.current) {
          const cameraTrack = localStreamRef.current.getVideoTracks()[0];
          if (cameraTrack && videoTrackPublicationRef.current?.track) {
            await videoTrackPublicationRef.current.track.replaceTrack(cameraTrack);
            console.log('✅ Switched back to camera');
          }
        }
        setIsScreenSharing(false);
      } else {
        // Start screen share
        console.log('📺 Starting screen share...');
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack) throw new Error('No screen track');

        screenStreamRef.current = screenStream;

        // Replace camera with screen
        const videoTrackPub = Array.from(twilioRoomRef.current.localParticipant.videoTracks.values())[0];
        if (!videoTrackPub?.track) {
          throw new Error('No video track publication found');
        }

        await videoTrackPub.track.replaceTrack(screenTrack);
        console.log('✅ Screen share started');
        setIsScreenSharing(true);

        // Listen for when user stops sharing
        screenTrack.onended = async () => {
          console.log('📵 Screen share stopped by user');
          if (localStreamRef.current) {
            const cameraTrack = localStreamRef.current.getVideoTracks()[0];
            if (cameraTrack && videoTrackPub?.track) {
              await videoTrackPub.track.replaceTrack(cameraTrack);
            }
          }
          setIsScreenSharing(false);
        };
      }
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('❌ Screen share error:', err);
        setError('Screen share failed: ' + err.message);
      }
      setIsScreenSharing(false);
    }
  }, [isScreenSharing]);

  const toggleBlur = useCallback(() => {
    console.log('✨ Toggling blur...');
    setBlurEnabled(!blurEnabled);
    // TODO: Implement actual blur effect using canvas/WebGL
  }, [blurEnabled]);

  const handleEndCall = useCallback(() => {
    console.log('🏁 Ending call...');
    setCallState("disconnecting");

    try {
      if (twilioRoomRef.current) {
        twilioRoomRef.current.disconnect();
        twilioRoomRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }

      setCallState("idle");
      setIsScreenSharing(false);
      setLocalStream(null);
    } catch (err) {
      console.error('❌ End call error:', err);
    }

    setTimeout(() => handleClose(), 100);
  }, []);

  const handleClose = useCallback(() => {
    console.log('❌ Closing video panel...');
    try {
      if (twilioRoomRef.current) {
        twilioRoomRef.current.disconnect();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
      }
      setCallState("idle");
      if (onClose) onClose();
    } catch (err) {
      console.error('❌ Close error:', err);
      if (onClose) onClose();
    }
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <style>{`
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        .video-frame {
          border: 1px solid rgba(139, 92, 246, 0.3);
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.2), inset 0 0 20px rgba(139, 92, 246, 0.05);
        }
        .control-button {
          transition: all 0.2s ease;
          border: 1px solid rgba(139, 92, 246, 0.5);
        }
        .control-button:hover {
          border-color: rgba(139, 92, 246, 0.8);
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
        }
      `}</style>

      <div className="w-full h-full bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 flex flex-col">
        {/* Header */}
        <div className="bg-black/60 backdrop-blur-lg border-b border-purple-500/20 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold text-lg">
              {remoteParticipantName || recipientName || 'Video Call'}
            </h3>
            {recipientExtension && <p className="text-purple-300 text-xs">Ext. {recipientExtension}</p>}
            {callState === "connected" && <p className="text-green-400 text-xs">● Connected</p>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-white hover:bg-red-500/20 hover:text-red-300"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Video Area */}
          <div className="flex-1 flex flex-col gap-4">
            {/* Remote Video */}
            <div className="flex-1 relative rounded-xl overflow-hidden video-frame bg-black">
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 p-4">
                  <p className="text-red-400 text-center">{error}</p>
                  <Button onClick={handleClose} variant="destructive">Close</Button>
                </div>
              ) : isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-white">Connecting...</p>
                </div>
              ) : (
                <div ref={remoteVideoRef} className="w-full h-full bg-black" />
              )}
            </div>

            {/* Local PIP - Shows when in call */}
            {localStream && callState === "connected" && !isScreenSharing && (
              <div className="absolute top-6 right-6 w-40 h-28 rounded-lg overflow-hidden video-frame bg-black shadow-2xl z-40">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            {/* Screen Share Indicator */}
            {isScreenSharing && (
              <div className="absolute top-6 right-6 bg-blue-500/90 backdrop-blur px-4 py-2 rounded-lg text-white text-sm flex items-center gap-2 z-40">
                <Monitor className="w-4 h-4" />
                Sharing Screen
              </div>
            )}
          </div>

          {/* Chat Sidebar */}
          {showChat && <ChatPanel remoteParticipantName={remoteParticipantName} />}
        </div>

        {/* Controls */}
        <VideoCallControls
          callState={callState}
          isMuted={isMuted}
          isVideoOn={isVideoOn}
          isScreenSharing={isScreenSharing}
          isLoading={isLoading}
          blurEnabled={blurEnabled}
          showChat={showChat}
          onToggleMic={toggleMic}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onToggleBlur={toggleBlur}
          onToggleChat={() => setShowChat(!showChat)}
          onStartCall={handleStartCall}
          onEndCall={handleEndCall}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}