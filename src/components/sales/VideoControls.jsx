import React from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Mic, MicOff, Monitor, MessageCircle, Zap } from "lucide-react";

export default function VideoControls({
  callState,
  isLoading,
  isMuted,
  isVideoOn,
  isScreenSharing,
  isBlurring,
  onToggleMic,
  onToggleVideo,
  onToggleScreenShare,
  onToggleBlur,
  onStartCall,
  onEndCall,
  onClose,
  onToggleChat,
  showChat
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-center gap-4 p-6 bg-gradient-to-t from-slate-950 to-transparent">
      {/* Main Controls */}
      <div className="flex items-center justify-center gap-3 bg-slate-800/50 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 shadow-xl">
        {/* Mute Button */}
        <Button
          size="icon"
          onClick={onToggleMic}
          className={`h-12 w-12 rounded-full transition-all ${
            isMuted
              ? "bg-red-500/80 hover:bg-red-600 shadow-lg shadow-red-500/50"
              : "bg-slate-700 hover:bg-slate-600"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <MicOff className="w-6 h-6 text-white" />
          ) : (
            <Mic className="w-6 h-6 text-white" />
          )}
        </Button>

        {/* Camera Button */}
        <Button
          size="icon"
          onClick={onToggleVideo}
          className={`h-12 w-12 rounded-full transition-all ${
            !isVideoOn
              ? "bg-red-500/80 hover:bg-red-600 shadow-lg shadow-red-500/50"
              : "bg-slate-700 hover:bg-slate-600"
          }`}
          title={isVideoOn ? "Turn off camera" : "Turn on camera"}
        >
          {isVideoOn ? "📹" : "📷"}
        </Button>

        {/* Screen Share Button */}
        <Button
          size="icon"
          onClick={onToggleScreenShare}
          disabled={callState !== "connected"}
          className={`h-12 w-12 rounded-full transition-all ${
            isScreenSharing
              ? "bg-blue-500/80 hover:bg-blue-600 shadow-lg shadow-blue-500/50"
              : "bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
          }`}
          title={isScreenSharing ? "Stop sharing" : "Share screen"}
        >
          <Monitor className="w-6 h-6 text-white" />
        </Button>

        {/* Blur Background Button */}
        <Button
          size="icon"
          onClick={onToggleBlur}
          className={`h-12 w-12 rounded-full transition-all ${
            isBlurring
              ? "bg-purple-500/80 hover:bg-purple-600 shadow-lg shadow-purple-500/50"
              : "bg-slate-700 hover:bg-slate-600"
          }`}
          title={isBlurring ? "Disable blur" : "Enable blur background"}
        >
          ✨
        </Button>

        {/* Chat Button */}
        <Button
          size="icon"
          onClick={onToggleChat}
          className={`h-12 w-12 rounded-full transition-all ${
            showChat
              ? "bg-indigo-500/80 hover:bg-indigo-600 shadow-lg shadow-indigo-500/50"
              : "bg-slate-700 hover:bg-slate-600"
          }`}
          title="Toggle chat"
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </Button>
      </div>

      {/* Call Action Buttons */}
      <div className="flex items-center justify-center gap-3">
        {callState === "idle" && !isLoading ? (
          <Button
            onClick={onStartCall}
            disabled={isLoading}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-full px-6 py-3 shadow-lg shadow-emerald-500/50 transition-all hover:shadow-emerald-500/75"
          >
            <Phone className="w-5 h-5 mr-2" />
            Start Call
          </Button>
        ) : callState === "idle" && isLoading ? (
          <Button
            disabled
            className="bg-emerald-500/50 text-white font-semibold rounded-full px-6 py-3"
          >
            <span className="animate-pulse">Connecting...</span>
          </Button>
        ) : callState !== "idle" && callState !== "disconnecting" ? (
          <Button
            onClick={onEndCall}
            disabled={callState === "disconnecting"}
            className="bg-red-500 hover:bg-red-600 text-white font-semibold rounded-full px-6 py-3 shadow-lg shadow-red-500/50 transition-all hover:shadow-red-500/75 disabled:opacity-50"
          >
            <PhoneOff className="w-5 h-5 mr-2" />
            End Call
          </Button>
        ) : null}

        <Button
          onClick={onClose}
          variant="outline"
          className="border-slate-600 text-slate-300 hover:bg-slate-700/50 rounded-full px-6 py-3"
          disabled={callState === "disconnecting"}
        >
          Close
        </Button>
      </div>
    </div>
  );
}