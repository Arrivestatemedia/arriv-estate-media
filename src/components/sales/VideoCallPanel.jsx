import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, Phone, PhoneOff, Mic, MicOff, Monitor, Settings, Send, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import VideoDisplay from "./VideoDisplay";
import VideoControls from "./VideoControls";
import ChatPanel from "./ChatPanel";

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
  
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isBlurring, setIsBlurring] = useState(false);
  const [error, setError] = useState(null);
  const [callState, setCallState] = useState("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [remoteParticipant, setRemoteParticipant] = useState(null);

  // Initialize camera
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
          localVideoRef.current.play().catch(err => console.warn('Local video play error:', err));
        }
      } catch (err) {
        console.error('Camera access error:', err);
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

  // Auto-start call if needed
  useEffect(() => {
    if (autoStart && roomName && !recipientExtension && callState === "idle" && localStream) {
      setTimeout(() => handleStartCall(), 100);
    }
  }, [autoStart, roomName, callState, localStream]);

  const handleStartCall = async () => {
    if (roomName && !recipientExtension) {
      setCallState("calling");
      setIsLoading(true);
      setError(null);
      try {
        const response = await base44.functions.invoke('generateDirectVideoToken', {
          roomName: roomName,
          participantName: currentUserName || 'Guest'
        });
        
        if (response?.status >= 400 || !response.data?.token) {
          throw new Error(response?.data?.error || 'Failed to generate token');
        }

        await initializeVideoRoom(response.data.token, roomName);
      } catch (err) {
        console.error('Failed to generate token:', err);
        setError(`Connection failed: ${err.message}`);
        setCallState("idle");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (callerToken && roomName) {
      setCallState("connecting");
      await initializeVideoRoom(callerToken, roomName);
      return;
    }

    setCallState("calling");
    setIsLoading(true);
    setError(null);
    try {
      const salesMemberId = localStorage.getItem('sales_member_id');
      const salesMemberName = localStorage.getItem('sales_member_name');
      if (!salesMemberId) throw new Error('Sales member ID not found');

      const response = await base44.functions.invoke('initiateVideoCall', {
        salesMemberId: salesMemberId.trim(),
        recipientExtension: parseInt(recipientExtension),
        callerName: salesMemberName
      });

      if (response?.status >= 400 || !response.data?.roomName) {
        throw new Error('Failed to initiate video call');
      }

      await base44.functions.invoke('sendVideoCallInvite', {
        salesMemberId: salesMemberId.trim(),
        recipientExtension: parseInt(recipientExtension),
        recipientToken: response.data.recipient.token,
        roomName: response.data.roomName,
        callerName: salesMemberName
      }).catch(err => console.warn('Failed to send invite:', err));

      await initializeVideoRoom(response.data.caller.token, response.data.roomName);
    } catch (err) {
      console.error('Failed to start video call:', err);
      setError('Failed to start video call: ' + err.message);
      setCallState("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const initializeVideoRoom = async (token, room) => {
    try {
      if (!window.Twilio?.Video) {
        const script = document.createElement('script');
        script.src = 'https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js';
        script.onload = () => {
          setTimeout(() => {
            if (!window.Twilio?.Video) throw new Error('Twilio.Video not available after SDK load');
          }, 100);
        };
        script.onerror = () => { throw new Error('Failed to load Twilio Video SDK'); };
        document.head.appendChild(script);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const Video = window.Twilio.Video;
      const videoRoom = await Video.connect(token, {
        name: room,
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: 640, height: 480 },
        networkQuality: { local: 1, remote: 1 },
      });

      twilioRoomRef.current = videoRoom;

      // Ensure local video plays after connection
      if (localVideoRef.current && localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(err => console.warn('Local video play error:', err));
      }

      setIsLoading(false);
      setCallState("connected");

      videoRoom.participants.forEach(participantConnected);
      videoRoom.on('participantConnected', participantConnected);
      videoRoom.on('participantDisconnected', participantDisconnected);
      videoRoom.on('disconnected', () => setCallState("idle"));
      videoRoom.on('error', (error) => {
        console.error('Room error:', error);
        setError('Room error: ' + error.message);
      });
    } catch (err) {
      console.error('Video room connection error:', err);
      setError(`Connection error: ${err.message}`);
      setIsLoading(false);
      setCallState("idle");
    }
  };

  const participantConnected = (participant) => {
    console.log('Participant connected:', participant.name);
    setRemoteParticipant(participant);

    participant.tracks.forEach(publication => {
      if (publication.isSubscribed) {
        attachTrack(publication.track);
      }
    });

    participant.on('trackSubscribed', track => {
      console.log('Track subscribed:', track.kind);
      attachTrack(track);
    });

    participant.on('trackUnsubscribed', track => {
      console.log('Track unsubscribed:', track.kind);
      track.detach().forEach(element => element.remove());
    });

    function attachTrack(track) {
      if (track.kind === 'video' && remoteVideoRef.current) {
        const videoElement = track.attach();
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.objectFit = 'cover';
        videoElement.style.display = 'block';
        remoteVideoRef.current.innerHTML = '';
        remoteVideoRef.current.appendChild(videoElement);
        videoElement.play().catch(err => console.warn('Remote video play error:', err));
      } else if (track.kind === 'audio') {
        const audioElement = track.attach();
        audioElement.autoplay = true;
        document.body.appendChild(audioElement);
      }
    }
  };

  const participantDisconnected = () => {
    console.log('Participant disconnected');
    if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = '';
    setRemoteParticipant(null);
  };

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

  const toggleScreenShare = async () => {
    try {
      if (!twilioRoomRef.current?.localParticipant) {
        setError('Call must be connected before sharing screen');
        return;
      }

      if (isScreenSharing) {
        // Stop screen sharing
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
        }

        // Unpublish screen track and republish camera
        const videoTrackPublication = Array.from(twilioRoomRef.current.localParticipant.videoTracks)[0];
        if (videoTrackPublication) {
          await videoTrackPublication.unpublish();
          const cameraTrack = localStream?.getVideoTracks()[0];
          if (cameraTrack) {
            await twilioRoomRef.current.localParticipant.publishTrack(cameraTrack);
          }
        }
        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always', frameRate: { ideal: 15, max: 30 } },
          audio: false
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Unpublish camera and publish screen
        const videoTrackPublication = Array.from(twilioRoomRef.current.localParticipant.videoTracks)[0];
        if (videoTrackPublication) {
          await videoTrackPublication.unpublish();
          await twilioRoomRef.current.localParticipant.publishTrack(screenTrack);
        }

        screenTrack.onended = async () => {
          const videoTrackPub = Array.from(twilioRoomRef.current.localParticipant.videoTracks)[0];
          if (videoTrackPub && localStream) {
            const cameraTrack = localStream.getVideoTracks()[0];
            if (cameraTrack) {
              await videoTrackPub.unpublish();
              await twilioRoomRef.current.localParticipant.publishTrack(cameraTrack);
            }
          }
          setIsScreenSharing(false);
        };

        setIsScreenSharing(true);
      }
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('Screen share error:', err);
        setError('Failed to share screen: ' + err.message);
      }
      screenStreamRef.current = null;
      setIsScreenSharing(false);
    }
  };

  const handleEndCall = () => {
    try {
      setCallState("disconnecting");

      if (twilioRoomRef.current) {
        try {
          const videoTracks = twilioRoomRef.current.localParticipant.videoTracks;
          videoTracks.forEach(trackSub => {
            if (trackSub.track) trackSub.track.stop();
          });
          
          const audioTracks = twilioRoomRef.current.localParticipant.audioTracks;
          audioTracks.forEach(trackSub => {
            if (trackSub.track) trackSub.track.stop();
          });

          twilioRoomRef.current.disconnect();
        } catch (err) {
          console.warn('Error during disconnect:', err);
        }
        twilioRoomRef.current = null;
      }

      if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = '';

      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }

      setCallState("idle");
      setIsScreenSharing(false);
      setTimeout(() => handleClose(), 50);
    } catch (err) {
      console.error('Error ending call:', err);
      setCallState("idle");
      setTimeout(() => handleClose(), 50);
    }
  };

  const handleClose = () => {
    try {
      if (twilioRoomRef.current) {
        try {
          const videoTracks = twilioRoomRef.current.localParticipant.videoTracks;
          videoTracks.forEach(trackSub => {
            if (trackSub.track) trackSub.track.stop();
          });
          
          const audioTracks = twilioRoomRef.current.localParticipant.audioTracks;
          audioTracks.forEach(trackSub => {
            if (trackSub.track) trackSub.track.stop();
          });

          twilioRoomRef.current.disconnect();
        } catch (err) {
          console.warn('Error during cleanup:', err);
        }
        twilioRoomRef.current = null;
      }

      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }

      if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = '';
      if (localVideoRef.current) localVideoRef.current.srcObject = null;

      setCallState("idle");
      setIsScreenSharing(false);
      setError(null);
    } catch (err) {
      console.error('Unexpected error during close:', err);
    }

    if (onClose && typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-2xl overflow-hidden w-full max-w-5xl shadow-2xl border border-slate-700/50">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 flex items-center justify-between border-b border-slate-700/50">
          <div>
            <h3 className="text-white font-semibold text-lg">{recipientName || 'Video Call'}</h3>
            {recipientExtension && <p className="text-slate-400 text-xs">Ext. {recipientExtension}</p>}
            {callState === "connected" && <p className="text-emerald-400 text-xs font-medium">● Connected</p>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-slate-300 hover:bg-slate-700/50"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Main Content */}
        <div className="flex h-[600px]">
          {/* Video Area */}
          <div className="flex-1 bg-black relative">
            <VideoDisplay
              remoteVideoRef={remoteVideoRef}
              localVideoRef={localVideoRef}
              localStream={localStream}
              isVideoOn={isVideoOn}
              isScreenSharing={isScreenSharing}
              isBlurring={isBlurring}
              callState={callState}
              isLoading={isLoading}
              error={error}
              isMuted={isMuted}
            />

            {/* Controls Overlay */}
            <VideoControls
              callState={callState}
              isLoading={isLoading}
              isMuted={isMuted}
              isVideoOn={isVideoOn}
              isScreenSharing={isScreenSharing}
              isBlurring={isBlurring}
              onToggleMic={toggleMic}
              onToggleVideo={toggleVideo}
              onToggleScreenShare={toggleScreenShare}
              onToggleBlur={() => setIsBlurring(!isBlurring)}
              onStartCall={handleStartCall}
              onEndCall={handleEndCall}
              onClose={handleClose}
              onToggleChat={() => setShowChat(!showChat)}
              showChat={showChat}
            />
          </div>

          {/* Chat Panel */}
          {showChat && (
            <ChatPanel
              messages={messages}
              onSendMessage={(msg) => setMessages([...messages, { text: msg, sender: 'self', timestamp: new Date() }])}
              remoteParticipantName={recipientName}
            />
          )}
        </div>
      </div>
    </div>
  );
}