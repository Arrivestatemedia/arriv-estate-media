import React from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Mic, MicOff, Monitor, MessageSquare, Wind } from "lucide-react";

export default function VideoCallControls({
  callState,
  isMuted,
  isVideoOn,
  isScreenSharing,
  isLoading,
  blurEnabled,
  showChat,
  onToggleMic,
  onToggleVideo,
  onToggleScreenShare,
  onToggleBlur,
  onToggleChat,
  onStartCall,
  onEndCall,
  onClose,
}) {
  return (
    <div className="bg-black/60 backdrop-blur-lg border-t border-purple-500/20 px-6 py-4">
      <div className="flex items-center justify-center gap-3">
        {/* Mic Control */}
        <Button
          size="lg"
          onClick={onToggleMic}
          disabled={callState === "idle"}
          className={`control-button h-12 w-12 p-0 rounded-full ${
            isMuted
              ? "bg-red-500/80 hover:bg-red-600 text-white"
              : "bg-purple-600/60 hover:bg-purple-700 text-white"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </Button>

        {/* Camera Control */}
        <Button
          size="lg"
          onClick={onToggleVideo}
          disabled={callState === "idle"}
          className={`control-button h-12 w-12 p-0 rounded-full ${
            !isVideoOn
              ? "bg-red-500/80 hover:bg-red-600 text-white"
              : "bg-purple-600/60 hover:bg-purple-700 text-white"
          }`}
          title={isVideoOn ? "Turn off camera" : "Turn on camera"}
        >
          {isVideoOn ? "📹" : "🚫"}
        </Button>

        {/* Screen Share */}
        <Button
          size="lg"
          onClick={onToggleScreenShare}
          disabled={callState !== "connected"}
          className={`control-button h-12 w-12 p-0 rounded-full ${
            isScreenSharing
              ? "bg-blue-500/80 hover:bg-blue-600 text-white"
              : "bg-purple-600/60 hover:bg-purple-700 text-white"
          }`}
          title={isScreenSharing ? "Stop sharing" : "Share screen"}
        >
          <Monitor className="w-5 h-5" />
        </Button>

        {/* Blur Background */}
        <Button
          size="lg"
          onClick={onToggleBlur}
          disabled={callState === "idle"}
          className={`control-button h-12 w-12 p-0 rounded-full ${
            blurEnabled
              ? "bg-cyan-500/80 hover:bg-cyan-600 text-white"
              : "bg-purple-600/60 hover:bg-purple-700 text-white"
          }`}
          title={blurEnabled ? "Disable blur" : "Enable blur"}
        >
          <Wind className="w-5 h-5" />
        </Button>

        {/* Chat */}
        <Button
          size="lg"
          onClick={onToggleChat}
          disabled={callState === "idle"}
          className={`control-button h-12 w-12 p-0 rounded-full ${
            showChat
              ? "bg-yellow-500/80 hover:bg-yellow-600 text-white"
              : "bg-purple-600/60 hover:bg-purple-700 text-white"
          }`}
          title="Chat"
        >
          <MessageSquare className="w-5 h-5" />
        </Button>

        {/* Spacer */}
        <div className="w-8" />

        {/* Start/End Call */}
        {callState === "idle" ? (
          <Button
            onClick={onStartCall}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 text-white h-12 px-8 rounded-full font-semibold"
          >
            <Phone className="w-5 h-5 mr-2" />
            Start Call
          </Button>
        ) : callState !== "disconnecting" ? (
          <Button
            onClick={onEndCall}
            className="bg-red-600 hover:bg-red-700 text-white h-12 px-8 rounded-full font-semibold"
          >
            <PhoneOff className="w-5 h-5 mr-2" />
            End Call
          </Button>
        ) : null}

        {/* Close Button */}
        <Button
          onClick={onClose}
          variant="outline"
          className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20 h-12 px-6"
          disabled={callState !== "idle" && callState !== "disconnecting"}
        >
          Close
        </Button>
      </div>
    </div>
  );
}