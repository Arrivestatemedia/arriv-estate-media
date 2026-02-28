import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone, PhoneOff, Mic, MicOff, Monitor } from "lucide-react";
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
  const screenStreamRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState(null);
  const [callState, setCallState] = useState("idle"); // idle, calling, connected
  const twilioRoomRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const initCamera = async () => {
      try {
        console.log('Initializing camera...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        console.log('Camera stream obtained, attaching to video ref');
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          // Force play
          localVideoRef.current.play().catch(err => {
            console.warn('Auto-play failed (expected in some browsers):', err);
          });
          console.log('Local stream attached to video ref');
        } else {
          console.warn('localVideoRef is not ready yet');
        }
      } catch (err) {
        console.error('Camera access error:', err);
        setError("Unable to access camera: " + err.message);
      }
    };

    initCamera();

    return () => {
      if (localStream) {
        console.log('Cleaning up camera stream');
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [localVideoRef]);

  useEffect(() => {
    if (autoStart && roomName && !recipientExtension && callState === "idle" && localStream) {
      console.log('Auto-starting video call with room:', roomName);
      setTimeout(() => handleStartCall(), 100);
    }
  }, [autoStart, roomName, callState, localStream]);

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
    // If we already have a room name, generate a token and connect directly
    if (roomName && !recipientExtension) {
      console.log('Generating token for room:', roomName, 'participant:', currentUserName);
      setCallState("calling");
      setIsLoading(true);
      setError(null);
      try {
        const response = await base44.functions.invoke('generateDirectVideoToken', {
          roomName: roomName,
          participantName: currentUserName || 'Guest'
        });
        
        console.log('Token response:', response);
        
        if (!response) {
          throw new Error('No response from token generation');
        }

        if (response.status && response.status >= 400) {
          throw new Error(response.data?.error || `Server error: ${response.status}`);
        }
        
        const token = response.data?.token;
        if (!token) {
          throw new Error(`No token in response. Got: ${JSON.stringify(response.data)}`);
        }
        
        console.log('Token generated successfully, connecting to room...');
        await initializeVideoRoom(token, roomName);
      } catch (err) {
        console.error('Failed to generate token:', err);
        setError(`Connection failed: ${err.message}`);
        setCallState("idle");
        setIsLoading(false);
      }
      return;
    }

    // If we already have a token and room name (incoming call or token was provided), connect directly
    if (callerToken && roomName) {
      console.log('Using provided token and room name, connecting to room:', roomName);
      setCallState("connecting");
      initializeVideoRoom(callerToken, roomName);
      return;
    }

    setCallState("calling");
    setIsLoading(true);
    setError(null);
    try {
      const salesMemberId = localStorage.getItem('sales_member_id');
      const salesMemberName = localStorage.getItem('sales_member_name');
      if (!salesMemberId) {
        throw new Error('Sales member ID not found');
      }

      console.log('Initiating video call to extension:', recipientExtension);
      const response = await base44.functions.invoke('initiateVideoCall', {
        salesMemberId: salesMemberId.trim(),
        recipientExtension: parseInt(recipientExtension),
        callerName: salesMemberName
      });

      if (response?.status >= 400 || response?.data?.error) {
        throw new Error(`Video call initiation failed: ${response?.data?.error || 'Unknown error'}`);
      }

      if (!response.data?.roomName || !response.data?.caller?.token || !response.data?.recipient?.token) {
        throw new Error('Failed to initiate video call: missing roomName or tokens');
      }

      console.log('Video call initiated successfully:', {
        roomName: response.data.roomName,
        recipientId: response.data.recipient.id,
        recipientName: response.data.recipient.name,
        extension: response.data.recipient.extension
      });

      // Send invite to recipient
      try {
        await base44.functions.invoke('sendVideoCallInvite', {
          salesMemberId: salesMemberId.trim(),
          recipientExtension: parseInt(recipientExtension),
          recipientToken: response.data.recipient.token,
          roomName: response.data.roomName,
          callerName: salesMemberName
        });
        console.log('Video call invite sent to recipient');
      } catch (err) {
        console.warn('Failed to send video call invite:', err);
        // Continue anyway - connection can still work
      }

      // Connect caller to the room
      console.log('Connecting to video room...');
      initializeVideoRoom(response.data.caller.token, response.data.roomName);
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
     if (!token) {
       throw new Error('No token provided to initializeVideoRoom');
     }

     if (!room) {
       throw new Error('No room name provided to initializeVideoRoom');
     }

     // Ensure SDK is loaded
     if (!window.Twilio?.Video) {
       console.log('Loading Twilio Video SDK...');
       const Video = await new Promise((resolve, reject) => {
         const script = document.createElement('script');
         script.src = 'https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js';
         script.onload = () => {
           setTimeout(() => {
             if (window.Twilio?.Video) {
               console.log('Twilio SDK loaded successfully');
               resolve(window.Twilio.Video);
             } else {
               reject(new Error('Twilio.Video not available after SDK load'));
             }
           }, 100);
         };
         script.onerror = () => reject(new Error('Failed to load Twilio Video SDK script'));
         document.head.appendChild(script);
       });
     }

     const Video = window.Twilio.Video;
     if (!Video) {
       throw new Error('Twilio Video not available');
     }

     console.log('Connecting to video room:', room, 'with token:', token.substring(0, 20) + '...');

     const connectOptions = {
       name: room,
       audio: { echoCancellation: true, noiseSuppression: true },
       video: { width: 640, height: 480 },
       networkQuality: { local: 1, remote: 1 },
       maxAudioBitrate: 50000,
       dominantSpeaker: true
     };

     console.log('Connect options:', connectOptions);
     const videoRoom = await Video.connect(token, connectOptions);
     console.log('Successfully connected to room:', videoRoom.name);
     twilioRoomRef.current = videoRoom;
     setIsLoading(false);
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
    console.log('Participant connected:', participant.name, participant.sid);
    
    // Handle existing video tracks
    participant.videoTracks.forEach(videoTrackSubscription => {
      if (videoTrackSubscription.track && remoteVideoRef.current) {
        const videoElement = videoTrackSubscription.track.attach();
        remoteVideoRef.current.innerHTML = '';
        remoteVideoRef.current.appendChild(videoElement);
      }
    });

    // Handle new tracks that appear later
    participant.on('trackSubscribed', track => {
      console.log('Track subscribed:', track.kind);
      if (track.kind === 'video' && remoteVideoRef.current) {
        const videoElement = track.attach();
        remoteVideoRef.current.innerHTML = '';
        remoteVideoRef.current.appendChild(videoElement);
      }
    });

    // Handle track that gets unsubscribed
    participant.on('trackUnsubscribed', track => {
      console.log('Track unsubscribed:', track.kind);
      if (track.kind === 'video' && remoteVideoRef.current) {
        track.detach().forEach(element => element.remove());
      }
    });
  };

  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing - switch back to camera
        console.log('Stopping screen share...');

        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => {
            console.log('Stopping screen track:', track.kind);
            track.stop();
          });
          screenStreamRef.current = null;
        }

        // Switch back to camera video in Twilio
        if (twilioRoomRef.current && localStream) {
          const cameraTrack = localStream.getVideoTracks()[0];
          if (cameraTrack && twilioRoomRef.current.localParticipant.videoTracks.length > 0) {
            try {
              console.log('Replacing screen track with camera track');
              const videoTrackPublication = twilioRoomRef.current.localParticipant.videoTracks[0];
              if (videoTrackPublication && videoTrackPublication.track) {
                await videoTrackPublication.track.replaceTrack(cameraTrack);
                console.log('Successfully replaced screen with camera');
              }
            } catch (err) {
              console.error('Error replacing screen with camera:', err);
            }
          }
        }
        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        try {
          console.log('Starting screen share...');
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
          });
          screenStreamRef.current = screenStream;

          const screenTrack = screenStream.getVideoTracks()[0];
          if (!screenTrack) {
            throw new Error('No screen track obtained');
          }

          // Replace camera video with screen share in Twilio
          if (twilioRoomRef.current && twilioRoomRef.current.localParticipant.videoTracks.length > 0) {
            try {
              console.log('Replacing camera with screen track in Twilio');
              const videoTrackPublication = twilioRoomRef.current.localParticipant.videoTracks[0];
              if (videoTrackPublication && videoTrackPublication.track) {
                // Stop the camera track first
                try {
                  const oldTrack = videoTrackPublication.track;
                  if (oldTrack && oldTrack.mediaStreamTrack) {
                    oldTrack.mediaStreamTrack.stop();
                  }
                } catch (err) {
                  console.warn('Error stopping old track:', err);
                }
                
                // Now replace with screen track
                await videoTrackPublication.track.replaceTrack(screenTrack);
                console.log('Screen share sent to remote participant');
                setIsScreenSharing(true);
              }
            } catch (err) {
              console.error('Error replacing camera with screen:', err);
              throw err;
            }
          } else {
            throw new Error('No video tracks in Twilio room');
          }

          // Listen for when user stops screen share from OS
          screenTrack.onended = async () => {
            console.log('Screen share stopped by user');
            if (localStream && twilioRoomRef.current?.localParticipant.videoTracks.length > 0) {
              const cameraTrack = localStream.getVideoTracks()[0];
              if (cameraTrack) {
                try {
                  const videoTrackPublication = twilioRoomRef.current.localParticipant.videoTracks[0];
                  if (videoTrackPublication && videoTrackPublication.track) {
                    // Stop the screen track first
                    try {
                      const oldTrack = videoTrackPublication.track;
                      if (oldTrack && oldTrack.mediaStreamTrack) {
                        oldTrack.mediaStreamTrack.stop();
                      }
                    } catch (err) {
                      console.warn('Error stopping old track:', err);
                    }
                    
                    // Now replace with camera track
                    await videoTrackPublication.track.replaceTrack(cameraTrack);
                    console.log('Auto-switched back to camera');
                  }
                } catch (err) {
                  console.error('Error auto-switching to camera:', err);
                }
              }
            }
            setIsScreenSharing(false);
          };
        } catch (err) {
          if (err.name !== 'NotAllowedError') {
            console.error('Screen share error:', err);
            setError('Failed to share screen: ' + err.message);
          }
          screenStreamRef.current = null;
          setIsScreenSharing(false);
        }
      }
    } catch (err) {
      console.error('Toggle screen share error:', err);
      setError('Screen share error: ' + err.message);
      setIsScreenSharing(false);
    }
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
      handleClose();
    } catch (err) {
      console.error('Error ending call:', err);
      setCallState("idle");
      handleClose();
    }
  };

  const handleClose = () => {
    try {
      if (twilioRoomRef.current) {
        try {
          twilioRoomRef.current.localParticipant.videoTracks.forEach(trackSubscription => {
            trackSubscription.track.stop();
          });
          twilioRoomRef.current.localParticipant.audioTracks.forEach(trackSubscription => {
            trackSubscription.track.stop();
          });
        } catch (err) {
          console.warn('Error stopping tracks:', err);
        }
        try {
          twilioRoomRef.current.disconnect();
        } catch (err) {
          console.warn('Error disconnecting room:', err);
        }
        twilioRoomRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.innerHTML = '';
      }
      setCallState("idle");
      setIsScreenSharing(false);
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-lg overflow-hidden w-full max-w-2xl">
        {/* Header */}
        <div className="bg-gray-800 p-4 flex items-center justify-between border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold">{recipientName || 'Video Call'}</h3>
            {recipientExtension && <p className="text-gray-400 text-xs">Ext. {recipientExtension}</p>}
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
              {!isScreenSharing && callState === "connected" && (
                <div className="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-gray-600 bg-black shadow-lg z-10">
                  <video
                    ref={localVideoRef}
                    autoPlay={true}
                    playsInline={true}
                    muted={true}
                    className="w-full h-full object-cover bg-black"
                    style={{ display: 'block' }}
                  />
                  {!isVideoOn && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                      <span className="text-xs text-gray-300">📷 Off</span>
                    </div>
                  )}
                </div>
              )}
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

          <Button
            size="sm"
            variant="outline"
            onClick={toggleScreenShare}
            disabled={callState !== "connected"}
            className={`h-10 w-10 p-0 ${isScreenSharing ? "bg-blue-500 hover:bg-blue-600 border-blue-600" : ""}`}
            title={isScreenSharing ? "Stop sharing" : "Share screen"}
          >
            <Monitor className="w-5 h-5 text-white" />
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