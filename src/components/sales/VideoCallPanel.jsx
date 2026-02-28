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
  const publishedTracksRef = useRef({ audio: null, video: null });

  useEffect(() => {
    const initCamera = async () => {
      try {
        console.log('Initializing camera...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        console.log('Camera stream obtained:', stream.id, 'video tracks:', stream.getVideoTracks().length);
        
        // Verify stream is valid
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) {
          throw new Error('No video tracks in stream');
        }
        
        const videoTrack = videoTracks[0];
        console.log('Video track:', {
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState,
          kind: videoTrack.kind
        });

        setLocalStream(stream);
        
        if (localVideoRef.current) {
          console.log('Camera initialized, setting up video ref. localVideoRef:', !!localVideoRef.current, 'stream id:', stream.id, 'stream tracks:', stream.getTracks().length);

            if (!localVideoRef.current) {
              console.warn('localVideoRef.current is null, deferring setup');
              setTimeout(initCamera, 500);
              return;
            }

            console.log('Setting srcObject on localVideoRef.current with stream:', stream.id);
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.muted = true;
            localVideoRef.current.playsInline = true;
            localVideoRef.current.autoplay = true;

            console.log('Video element after srcObject assignment:', {
              hasSrcObject: !!localVideoRef.current.srcObject,
              trackCount: localVideoRef.current.srcObject?.getTracks().length || 0
            });

            const playLocalVideo = () => {
              if (!localVideoRef.current) {
                console.warn('localVideoRef.current is null during play attempt');
                return;
              }
              localVideoRef.current.play().then(() => {
                console.log('Local video playing successfully.');
              }).catch(err => {
                console.warn('Local video play failed, retrying in 200ms:', err);
                setTimeout(playLocalVideo, 200);
              });
            };

            localVideoRef.current.onloadedmetadata = () => {
              console.log('Local video metadata loaded.');
              playLocalVideo();
            };

            playLocalVideo();
          
          console.log('Local stream attached to video ref, element:', {
            src: localVideoRef.current.srcObject ? 'set' : 'not set',
            autoplay: localVideoRef.current.autoplay,
            muted: localVideoRef.current.muted,
            playsInline: localVideoRef.current.playsInline,
            paused: localVideoRef.current.paused
          });
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
        localStream.getTracks().forEach(track => {
          console.log('Stopping track:', track.kind);
          track.stop();
        });
      }
    };
  }, []);

  useEffect(() => {
    if (autoStart && roomName && !recipientExtension && callState === "idle" && localStream) {
      console.log('Auto-starting video call with room:', roomName);
      setTimeout(() => {
        if (callState === "idle") {
          handleStartCall();
        }
      }, 100);
    }
  }, [autoStart, roomName, callState, localStream]);

  const toggleMic = () => {
    if (!twilioRoomRef.current?.localParticipant) {
      console.warn('No local participant in Twilio room');
      return;
    }
    
    try {
      const audioTracks = twilioRoomRef.current.localParticipant.audioTracks;
      audioTracks.forEach(audioTrackPublication => {
        if (audioTrackPublication.track) {
          audioTrackPublication.track.disable();
          console.log('Toggling audio to:', !isMuted);
        }
      });
      setIsMuted(!isMuted);
    } catch (err) {
      console.error('Error toggling mic:', err);
      setError('Failed to toggle microphone');
    }
  };

  const toggleVideo = () => {
    if (!twilioRoomRef.current?.localParticipant) {
      console.warn('No local participant in Twilio room');
      return;
    }
    
    try {
      const videoTracks = twilioRoomRef.current.localParticipant.videoTracks;
      videoTracks.forEach(videoTrackPublication => {
        if (videoTrackPublication.track) {
          if (isVideoOn) {
            videoTrackPublication.track.disable();
          } else {
            videoTrackPublication.track.enable();
          }
          console.log('Video track toggled to:', !isVideoOn ? 'enabled' : 'disabled');
        }
      });
      setIsVideoOn(!isVideoOn);
    } catch (err) {
      console.error('Error toggling video:', err);
      setError('Failed to toggle video');
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

     // Ensure local video is playing
     if (localVideoRef.current && localStream) {
       console.log('Ensuring local video is playing after room connection');
         if (localVideoRef.current.srcObject !== localStream) {
           console.log('srcObject mismatch, re-attaching localStream to localVideoRef');
           localVideoRef.current.srcObject = localStream;
         }
         localVideoRef.current.muted = true;
         localVideoRef.current.playsInline = true;
         localVideoRef.current.autoplay = true;

         const playLocalVideoAfterConnect = () => {
           localVideoRef.current.play().then(() => {
             console.log('Local video playing successfully after room connection.');
           }).catch(err => {
             console.warn('Local video play failed after connect, retrying in 200ms:', err);
             setTimeout(playLocalVideoAfterConnect, 200);
           });
         };
         playLocalVideoAfterConnect();
     }

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

    // Handle existing tracks
    participant.tracks.forEach(publication => {
      if (publication.isSubscribed) {
        attachTrack(publication.track);
      }
    });

    // Handle new tracks that appear later
    participant.on('trackSubscribed', track => {
      console.log('Participant', participant.sid, 'subscribed to track:', track.kind);
      attachTrack(track);
    });

    // Handle tracks that get unsubscribed
    participant.on('trackUnsubscribed', track => {
      console.log('Participant', participant.sid, 'unsubscribed from track:', track.kind);
      track.detach().forEach(element => element.remove());
    });

    function attachTrack(track) {
      if (track.kind === 'video' && remoteVideoRef.current) {
        console.log('Attaching video track to remote video ref:', track.sid);
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
        console.log('Attaching audio track:', track.sid);
        const audioElement = track.attach();
        audioElement.autoplay = true;
        audioElement.playsInline = true;
        document.body.appendChild(audioElement);
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      // Check if we're ready to screen share
      if (!twilioRoomRef.current?.localParticipant?.videoTracks.size) {
        setError('Video call must be connected before sharing screen');
        return;
      }

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
        if (twilioRoomRef.current && localStream && twilioRoomRef.current.localParticipant.videoTracks.size > 0) {
          const cameraTrack = localStream.getVideoTracks()[0];
          if (cameraTrack && cameraTrack.readyState === 'live') {
            try {
              console.log('Replacing screen track with camera track');
              const videoTrackPublication = Array.from(twilioRoomRef.current.localParticipant.videoTracks)[0];
              if (videoTrackPublication && videoTrackPublication.track) {
                cameraTrack.enabled = true;
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
           video: { 
             cursor: 'always',
             frameRate: { ideal: 15, max: 30 }
           },
           audio: false
         });
         screenStreamRef.current = screenStream;

         const screenTrack = screenStream.getVideoTracks()[0];
         if (!screenTrack) {
           throw new Error('No screen track obtained');
         }

         console.log('Screen track obtained, enabled:', screenTrack.enabled, 'readyState:', screenTrack.readyState);

         // Replace camera video with screen share in Twilio
         if (twilioRoomRef.current && twilioRoomRef.current.localParticipant.videoTracks.size > 0) {
           try {
             console.log('Replacing camera with screen track in Twilio');
             const videoTrackPublication = Array.from(twilioRoomRef.current.localParticipant.videoTracks)[0];

             if (videoTrackPublication && videoTrackPublication.track) {
               const twilioTrack = videoTrackPublication.track;
               console.log('Twilio track:', { kind: twilioTrack.kind, enabled: twilioTrack.enabled });

               // Ensure screen track is enabled
               screenTrack.enabled = true;
               console.log('Screen track enabled:', screenTrack.enabled);

               // Replace the track
               console.log('Calling replaceTrack with screen track');
               await twilioTrack.replaceTrack(screenTrack);
               console.log('Screen share track replaced successfully');
               setIsScreenSharing(true);
             } else {
               throw new Error('Video track publication or track is null');
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
           console.log('Screen share stopped by user from OS');
           if (localStream && twilioRoomRef.current?.localParticipant.videoTracks.size > 0) {
             const cameraTrack = localStream.getVideoTracks()[0];
             if (cameraTrack && cameraTrack.readyState === 'live') {
               try {
                 const videoTrackPublication = Array.from(twilioRoomRef.current.localParticipant.videoTracks)[0];
                 if (videoTrackPublication && videoTrackPublication.track) {
                   console.log('Auto-replacing screen with camera track');
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
    console.log('handleEndCall called, current room:', !!twilioRoomRef.current);
    try {
      // Disable all controls first to prevent double-clicks
      setCallState("disconnecting");

      if (twilioRoomRef.current) {
        console.log('Stopping all tracks in Twilio room...');
        try {
          // Stop local participant's video tracks
          const videoTracks = twilioRoomRef.current.localParticipant.videoTracks;
          console.log('Video tracks to stop:', videoTracks.length);
          videoTracks.forEach((trackSubscription, i) => {
            try {
              console.log('Stopping video track', i);
              if (trackSubscription.track) {
                trackSubscription.track.stop();
              }
            } catch (err) {
              console.warn('Error stopping video track:', err);
            }
          });
        } catch (err) {
          console.warn('Error accessing video tracks:', err);
        }

        try {
          // Stop local participant's audio tracks
          const audioTracks = twilioRoomRef.current.localParticipant.audioTracks;
          console.log('Audio tracks to stop:', audioTracks.length);
          audioTracks.forEach((trackSubscription, i) => {
            try {
              console.log('Stopping audio track', i);
              if (trackSubscription.track) {
                trackSubscription.track.stop();
              }
            } catch (err) {
              console.warn('Error stopping audio track:', err);
            }
          });
        } catch (err) {
          console.warn('Error accessing audio tracks:', err);
        }

        try {
          // Disconnect from room
          console.log('Disconnecting from Twilio room...');
          twilioRoomRef.current.disconnect();
          console.log('Room disconnect completed');
        } catch (err) {
          console.error('Error disconnecting room:', err);
        }

        twilioRoomRef.current = null;
      }

      // Clear remote video
      if (remoteVideoRef.current) {
        console.log('Clearing remote video ref');
        remoteVideoRef.current.innerHTML = '';
      }

      // Cleanup local stream tracks (separate from Twilio)
      if (localStream) {
        console.log('Stopping local media stream tracks');
        localStream.getTracks().forEach((track, i) => {
          try {
            console.log('Stopping local stream track', i, track.kind);
            track.stop();
          } catch (err) {
            console.warn('Error stopping local stream track:', err);
          }
        });
        setLocalStream(null);
      }

      // Cleanup screen stream if active
      if (screenStreamRef.current) {
        console.log('Stopping screen stream tracks');
        screenStreamRef.current.getTracks().forEach((track, i) => {
          try {
            console.log('Stopping screen track', i);
            track.stop();
          } catch (err) {
            console.warn('Error stopping screen track:', err);
          }
        });
        screenStreamRef.current = null;
      }

      console.log('Setting call state to idle and closing');
      setCallState("idle");
      setIsScreenSharing(false);

      // Wait a tick before closing to ensure state updates
      setTimeout(() => {
        console.log('Calling handleClose from handleEndCall');
        handleClose();
      }, 50);
    } catch (err) {
      console.error('Unexpected error in handleEndCall:', err);
      setCallState("idle");
      setTimeout(() => {
        handleClose();
      }, 50);
    }
  };

  const handleClose = () => {
    console.log('handleClose called');
    try {
      // Stop Twilio room and tracks
      if (twilioRoomRef.current) {
        console.log('Closing Twilio room...');
        try {
          const localParticipant = twilioRoomRef.current.localParticipant;

          // Stop all video tracks
          try {
            const videoTracks = localParticipant.videoTracks;
            console.log('Stopping Twilio video tracks:', videoTracks.length);
            videoTracks.forEach((trackSubscription, i) => {
              try {
                console.log('Stopping Twilio video track', i);
                if (trackSubscription.track) {
                  trackSubscription.track.stop();
                }
              } catch (err) {
                console.warn('Error stopping Twilio video track:', err);
              }
            });
          } catch (err) {
            console.warn('Error accessing Twilio video tracks:', err);
          }

          // Stop all audio tracks
          try {
            const audioTracks = localParticipant.audioTracks;
            console.log('Stopping Twilio audio tracks:', audioTracks.length);
            audioTracks.forEach((trackSubscription, i) => {
              try {
                console.log('Stopping Twilio audio track', i);
                if (trackSubscription.track) {
                  trackSubscription.track.stop();
                }
              } catch (err) {
                console.warn('Error stopping Twilio audio track:', err);
              }
            });
          } catch (err) {
            console.warn('Error accessing Twilio audio tracks:', err);
          }
        } catch (err) {
          console.warn('Error stopping local participant tracks:', err);
        }

        try {
          console.log('Disconnecting Twilio room...');
          twilioRoomRef.current.disconnect();
          console.log('Twilio room disconnected successfully');
        } catch (err) {
          console.error('Error disconnecting Twilio room:', err);
        }

        twilioRoomRef.current = null;
      }

      // Clean up local media stream
      if (localStream) {
        console.log('Stopping all local media stream tracks');
        localStream.getTracks().forEach((track, i) => {
          try {
            console.log('Stopping local stream track', i, track.kind);
            track.stop();
          } catch (err) {
            console.warn('Error stopping local stream track:', err);
          }
        });
        setLocalStream(null);
      }

      // Clean up screen stream
      if (screenStreamRef.current) {
        console.log('Stopping screen stream tracks');
        screenStreamRef.current.getTracks().forEach((track, i) => {
          try {
            console.log('Stopping screen track', i);
            track.stop();
          } catch (err) {
            console.warn('Error stopping screen track:', err);
          }
        });
        screenStreamRef.current = null;
      }

      // Clear video elements
      if (remoteVideoRef.current) {
        console.log('Clearing remote video element');
        remoteVideoRef.current.innerHTML = '';
      }

      if (localVideoRef.current) {
        console.log('Clearing local video element');
        localVideoRef.current.srcObject = null;
      }

      // Update UI state
      setCallState("idle");
      setIsScreenSharing(false);
      setError(null);

      console.log('All cleanup complete, calling onClose callback');
    } catch (err) {
      console.error('Unexpected error during handleClose cleanup:', err);
    }

    // Call the onClose callback last to close the modal
    try {
      console.log('Invoking onClose callback');
      if (onClose && typeof onClose === 'function') {
        onClose();
      } else {
        console.warn('onClose callback not available or not a function');
      }
    } catch (err) {
      console.error('Error calling onClose:', err);
    }
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
              {localStream && callState !== "idle" && (
                <>
                  {console.log('Rendering local video PIP, localStream:', !!localStream, 'callState:', callState, 'isScreenSharing:', isScreenSharing)}
                  <div className="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-yellow-500 bg-black shadow-lg z-10">
                    {!isScreenSharing ? (
                      <>
                        {(() => {
                          const videoTracks = localStream.getVideoTracks();
                          if (videoTracks.length > 0) {
                            videoTracks.forEach(track => {
                              if (!track.enabled) {
                                console.log('Enabling disabled video track');
                                track.enabled = true;
                              }
                            });
                          }
                          return null;
                        })()}
                        <video
                          ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                          backgroundColor: '#000'
                        }}
                        onError={(e) => {
                          console.error('Local video error:', e.target.error?.code, e);
                        }}
                        onLoadedMetadata={() => {
                          console.log('Local video metadata loaded, element:', localVideoRef.current);
                          if (localVideoRef.current) {
                            localVideoRef.current.play().catch(err => {
                              console.error('Play error on metadata loaded:', err);
                            });
                          }
                        }}
                        onPlay={() => {
                          console.log('Local video playing');
                        }}
                        onPause={() => {
                          console.log('Local video paused');
                        }}
                      />
                      </>
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <span className="text-xs text-gray-400 text-center px-2">Sharing screen</span>
                      </div>
                    )}
                    {!isVideoOn && !isScreenSharing && (
                      <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                        <span className="text-xs text-gray-300">📷 Off</span>
                      </div>
                    )}
                  </div>
                </>
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
          ) : callState !== "idle" && callState !== "disconnecting" ? (
            <Button
              onClick={() => {
                console.log('End Call button clicked');
                handleEndCall();
              }}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
              disabled={callState === "disconnecting"}
            >
              <PhoneOff className="w-4 h-4" />
              End Call
            </Button>
          ) : null}

          <Button
            onClick={() => {
              console.log('Close button clicked');
              handleClose();
            }}
            variant="outline"
            className="text-gray-300 border-gray-600 hover:bg-gray-700"
            type="button"
            disabled={callState === "disconnecting"}
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