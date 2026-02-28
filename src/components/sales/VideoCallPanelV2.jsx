import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone, PhoneOff, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import VideoControls from "./VideoControls";
import VideoChat from "./VideoChat";
import VideoSettingsPanel from "./VideoSettingsPanel";

export default function VideoCallPanelV2({
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
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const twilioRoomRef = useRef(null);
  const remoteParticipantRef = useRef(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [callState, setCallState] = useState("idle");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initialize camera on mount
  useEffect(() => {
    const initCamera = async () => {
      try {
        console.log("Initializing camera...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });

        console.log("Camera stream obtained:", {
          id: stream.id,
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length
        });

        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch((err) => {
            console.warn("Play failed on init, will retry on metadata load:", err);
          });
        }
      } catch (err) {
        console.error("Camera initialization error:", err);
        setError("Cannot access camera: " + err.message);
      }
    };

    initCamera();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          console.log("Cleanup: stopping", track.kind, "track");
          track.stop();
        });
      }
    };
  }, []);

  // Auto-start call if needed
  useEffect(() => {
    if (autoStart && roomName && !recipientExtension && callState === "idle" && localStreamRef.current) {
      console.log("Auto-starting video call");
      setTimeout(handleStartCall, 200);
    }
  }, [autoStart, roomName, callState]);

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log("Mute toggled:", !audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
        console.log("Video toggled:", videoTrack.enabled);
      }
    }
  };

  const handleStartCall = async () => {
    try {
      setCallState("calling");
      setIsLoading(true);
      setError(null);

      // Generate token for direct connection
      if (roomName && !recipientExtension) {
        console.log("Generating token for room:", roomName);
        const response = await base44.functions.invoke("generateDirectVideoToken", {
          roomName: roomName,
          participantName: currentUserName || "Guest"
        });

        if (!response?.data?.token) {
          throw new Error("Failed to generate token");
        }

        await connectToRoom(response.data.token, roomName);
      } else if (callerToken && roomName) {
        await connectToRoom(callerToken, roomName);
      }
    } catch (err) {
      console.error("Call start error:", err);
      setError("Connection failed: " + err.message);
      setCallState("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const connectToRoom = async (token, room) => {
    try {
      console.log("Connecting to room:", room);

      // Ensure Twilio SDK is loaded
      if (!window.Twilio?.Video) {
        try {
          await loadTwilioSDK();
        } catch (sdkErr) {
          console.error("SDK load failed:", sdkErr);
          throw new Error("Failed to load Twilio Video SDK: " + sdkErr.message);
        }
      }

      if (!window.Twilio?.Video) {
        throw new Error("Twilio Video SDK is not available");
      }

      const Video = window.Twilio.Video;
      const videoRoom = await Video.connect(token, {
        name: room,
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: 640, height: 480 },
        networkQuality: { local: 1, remote: 1 }
      });

      console.log("Connected to room:", videoRoom.name);
      twilioRoomRef.current = videoRoom;

      // Handle existing participants
      videoRoom.participants.forEach((participant) => {
        console.log("Existing participant:", participant.name);
        attachParticipant(participant);
      });

      // Handle new participants
      videoRoom.on("participantConnected", (participant) => {
        console.log("Participant connected:", participant.name);
        attachParticipant(participant);
      });

      videoRoom.on("participantDisconnected", (participant) => {
        console.log("Participant disconnected:", participant.name);
        detachParticipant(participant);
      });

      videoRoom.on("error", (error) => {
        console.error("Room error:", error);
        setError("Room error: " + error.message);
      });

      videoRoom.on("disconnected", () => {
        console.log("Disconnected from room");
        setCallState("idle");
      });

      setCallState("connected");
    } catch (err) {
      console.error("Room connection error:", err);
      setError("Connection error: " + err.message);
      setCallState("idle");
    }
  };

  const attachParticipant = (participant) => {
   remoteParticipantRef.current = participant;

   const subscriptionHandler = (subscription) => {
     if (!subscription) {
       console.warn("Subscription is null or undefined");
       return;
     }

     const { track } = subscription;
     if (!track) {
       console.warn("Track is null or undefined");
       return;
     }

     console.log("Track subscribed:", track.kind);

     if (track.kind === "video") {
       if (remoteVideoRef.current) {
         try {
           const element = track.attach();
           if (element) {
             element.style.width = "100%";
             element.style.height = "100%";
             element.style.objectFit = "cover";
             element.style.display = "block";
             remoteVideoRef.current.innerHTML = "";
             remoteVideoRef.current.appendChild(element);
             console.log("Remote video attached successfully");
           }
         } catch (err) {
           console.error("Failed to attach video track:", err);
         }
       }
     } else if (track.kind === "audio") {
       try {
         const audioElement = track.attach();
         if (audioElement) {
           audioElement.autoplay = true;
           audioElement.style.display = "none";
           document.body.appendChild(audioElement);
           console.log("Remote audio attached successfully");
         }
       } catch (err) {
         console.error("Failed to attach audio track:", err);
       }
     }
   };

    const unsubscriptionHandler = (subscription) => {
      if (!subscription || !subscription.track) {
        console.warn("Unsubscription: subscription or track is null");
        return;
      }

      try {
        console.log("Track unsubscribed:", subscription.track.kind);
        const detachedElements = subscription.track.detach();
        if (Array.isArray(detachedElements)) {
          detachedElements.forEach((element) => {
            try {
              element.remove();
            } catch (err) {
              console.warn("Failed to remove element:", err);
            }
          });
        }
      } catch (err) {
        console.error("Error unsubscribing from track:", err);
      }
    };

    // Subscribe to existing tracks
    try {
      participant.tracks.forEach((subscription) => {
        if (subscription && subscription.isSubscribed) {
          subscriptionHandler(subscription);
        }
      });
    } catch (err) {
      console.error("Error subscribing to existing tracks:", err);
    }

    // Subscribe to future tracks
    try {
      participant.on("trackSubscribed", subscriptionHandler);
      participant.on("trackUnsubscribed", unsubscriptionHandler);
    } catch (err) {
      console.error("Error setting up track event handlers:", err);
    }
  };

  const detachParticipant = (participant) => {
    try {
      if (remoteParticipantRef.current) {
        remoteParticipantRef.current = null;
      }
      
      if (remoteVideoRef.current) {
        const children = Array.from(remoteVideoRef.current.children || []);
        children.forEach((child) => {
          try {
            child.remove();
          } catch (err) {
            console.warn("Failed to remove video element:", err);
          }
        });
        remoteVideoRef.current.innerHTML = "";
      }
      
      console.log("Participant detached");
    } catch (err) {
      console.error("Error detaching participant:", err);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!twilioRoomRef.current?.localParticipant?.videoTracks.size) {
        setError("Video must be connected first");
        return;
      }

      if (isScreenSharing) {
        // Stop screen sharing
        console.log("Stopping screen share");
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((track) => track.stop());
          screenStreamRef.current = null;
        }

        // Switch back to camera
        if (localStreamRef.current) {
          const cameraTrack = localStreamRef.current.getVideoTracks()[0];
          if (cameraTrack?.readyState === "live") {
            const videoPublication = Array.from(twilioRoomRef.current.localParticipant.videoTracks)[0];
            if (videoPublication?.track) {
              await videoPublication.track.replaceTrack(cameraTrack);
              console.log("Switched back to camera");
            }
          }
        }
        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        console.log("Starting screen share");
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false
        });

        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        if (!screenTrack) {
          throw new Error("No screen track obtained");
        }

        // Replace camera with screen in Twilio
        const videoPublication = Array.from(twilioRoomRef.current.localParticipant.videoTracks)[0];
        if (!videoPublication?.track) {
          throw new Error("No video track publication");
        }

        screenTrack.enabled = true;
        await videoPublication.track.replaceTrack(screenTrack);
        console.log("Screen share started and published");
        setIsScreenSharing(true);

        // Handle when user stops screen share from OS
        screenTrack.onended = async () => {
          console.log("Screen share stopped by user");
          if (localStreamRef.current) {
            const cameraTrack = localStreamRef.current.getVideoTracks()[0];
            if (cameraTrack?.readyState === "live") {
              const vidPublication = Array.from(twilioRoomRef.current.localParticipant.videoTracks)[0];
              if (vidPublication?.track) {
                await vidPublication.track.replaceTrack(cameraTrack);
                console.log("Auto-switched back to camera");
              }
            }
          }
          setIsScreenSharing(false);
        };
      }
    } catch (err) {
      if (err.name !== "NotAllowedError") {
        console.error("Screen share error:", err);
        setError("Screen share failed: " + err.message);
      }
      screenStreamRef.current = null;
      setIsScreenSharing(false);
    }
  };

  const handleEndCall = async () => {
    console.log("Ending call");
    setCallState("disconnecting");

    try {
      // Disconnect Twilio room
      if (twilioRoomRef.current) {
        twilioRoomRef.current.disconnect();
        twilioRoomRef.current = null;
      }

      // Stop all tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }

      // Clear video elements
      if (remoteVideoRef.current) {
        remoteVideoRef.current.innerHTML = "";
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }

      setCallState("idle");
      setTimeout(onClose, 100);
    } catch (err) {
      console.error("Error ending call:", err);
      setCallState("idle");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-black via-gray-900 to-black flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-900/80 to-gray-800/80 backdrop-blur-md border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {(recipientName || "User").charAt(0)}
            </span>
          </div>
          <div>
            <h3 className="text-white font-semibold">{recipientName || "Video Call"}</h3>
            {callState === "connected" && (
              <p className="text-green-400 text-xs font-medium">● Connected</p>
            )}
            {callState === "calling" && (
              <p className="text-blue-400 text-xs font-medium">Connecting...</p>
            )}
            {recipientExtension && <p className="text-gray-400 text-xs">Ext. {recipientExtension}</p>}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-gray-400 hover:text-white hover:bg-gray-700/50"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Video Area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-red-900/20 to-black">
            <div className="text-center">
              <p className="text-red-400 text-lg font-semibold mb-4">❌ {error}</p>
              <Button onClick={handleEndCall} variant="destructive">
                Close
              </Button>
            </div>
          </div>
        ) : isLoading && callState === "calling" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-white text-sm">Connecting...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Remote Video */}
            <div
              ref={remoteVideoRef}
              className="absolute inset-0 w-full h-full bg-black"
            />

            {/* Local Video PIP */}
            {callState !== "idle" && localStreamRef.current && (
              <div className="absolute bottom-20 right-4 w-40 h-32 rounded-lg overflow-hidden border-2 border-blue-500 bg-black shadow-2xl z-10 backdrop-blur-sm">
                {!isScreenSharing ? (
                  <>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        backgroundColor: "#000",
                        filter: isBlurred ? "blur(20px)" : "none"
                      }}
                    />
                    {!isVideoOn && (
                      <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                        <span className="text-white text-xl">📷</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <span className="text-xs text-gray-400">Sharing Screen</span>
                  </div>
                )}
              </div>
            )}

            {/* Status Badge */}
            {callState === "connected" && (
              <div className="absolute top-4 left-4 px-3 py-1 bg-gradient-to-r from-green-500/80 to-emerald-600/80 backdrop-blur-md rounded-full text-white text-xs font-semibold">
                ✓ Connected
              </div>
            )}
          </>
        )}

        {/* Chat Sidebar */}
        <VideoChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 bg-gradient-to-t from-black/80 via-gray-900/60 to-transparent backdrop-blur-md">
        <div className="flex-1">
          {callState === "idle" && !isIncoming ? (
            <Button
              onClick={handleStartCall}
              disabled={isLoading}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white gap-2 shadow-lg"
            >
              <Phone className="w-5 h-5" />
              {isLoading ? "Connecting..." : "Start Call"}
            </Button>
          ) : callState === "idle" && isIncoming ? (
            <Button
              onClick={handleStartCall}
              disabled={isLoading}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white gap-2 shadow-lg"
            >
              <Phone className="w-5 h-5" />
              {isLoading ? "Connecting..." : "Join Call"}
            </Button>
          ) : null}
        </div>

        <VideoControls
          isMuted={isMuted}
          isVideoOn={isVideoOn}
          isScreenSharing={isScreenSharing}
          canScreenShare={callState === "connected"}
          onToggleMic={toggleMic}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onEndCall={handleEndCall}
          onSettings={() => setIsSettingsOpen(true)}
        />

        <Button
          size="icon"
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`h-12 w-12 rounded-full shadow-lg ${
            isChatOpen
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-gray-700 hover:bg-gray-600"
          }`}
          title="Toggle chat"
        >
          <MessageCircle className="w-5 h-5 text-white" />
        </Button>
      </div>

      {/* Settings Panel */}
      <VideoSettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onBlurChange={setIsBlurred}
        isBlurred={isBlurred}
      />
    </div>
  );
}

async function loadTwilioSDK() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js";
    script.onload = () => {
      setTimeout(() => {
        if (window.Twilio?.Video) {
          resolve(window.Twilio.Video);
        } else {
          reject(new Error("Twilio.Video not available"));
        }
      }, 200);
    };
    script.onerror = () => reject(new Error("Failed to load Twilio SDK"));
    document.head.appendChild(script);
  });
}