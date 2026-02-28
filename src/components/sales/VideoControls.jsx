import React from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Phone, PhoneOff, Settings } from "lucide-react";

export default function VideoControls({
  isMuted,
  isVideoOn,
  isScreenSharing,
  canScreenShare,
  onToggleMic,
  onToggleVideo,
  onToggleScreenShare,
  onEndCall,
  onSettings
}) {
  return (
    <div className="flex items-center justify-center gap-3 bg-gradient-to-b from-black/30 to-black/60 px-6 py-4 backdrop-blur-md">
      <Button
        size="icon"
        onClick={onToggleMic}
        className={`h-12 w-12 rounded-full transition-all ${
          isMuted
            ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/50"
            : "bg-gray-700 hover:bg-gray-600 shadow-lg shadow-gray-700/50"
        }`}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <MicOff className="w-6 h-6 text-white" />
        ) : (
          <Mic className="w-6 h-6 text-white" />
        )}
      </Button>

      <Button
        size="icon"
        onClick={onToggleVideo}
        className={`h-12 w-12 rounded-full transition-all ${
          !isVideoOn
            ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/50"
            : "bg-gray-700 hover:bg-gray-600 shadow-lg shadow-gray-700/50"
        }`}
        title={isVideoOn ? "Stop video" : "Start video"}
      >
        {isVideoOn ? (
          <Video className="w-6 h-6 text-white" />
        ) : (
          <VideoOff className="w-6 h-6 text-white" />
        )}
      </Button>

      <Button
        size="icon"
        onClick={onToggleScreenShare}
        disabled={!canScreenShare}
        className={`h-12 w-12 rounded-full transition-all ${
          isScreenSharing
            ? "bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/50"
            : "bg-gray-700 hover:bg-gray-600 shadow-lg shadow-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
        title={isScreenSharing ? "Stop sharing" : "Share screen"}
      >
        {isScreenSharing ? (
          <MonitorOff className="w-6 h-6 text-white" />
        ) : (
          <Monitor className="w-6 h-6 text-white" />
        )}
      </Button>

      <Button
        size="icon"
        onClick={onSettings}
        className="h-12 w-12 rounded-full bg-gray-700 hover:bg-gray-600 shadow-lg shadow-gray-700/50"
        title="Settings"
      >
        <Settings className="w-6 h-6 text-white" />
      </Button>

      <div className="w-px h-8 bg-gray-600 mx-2" />

      <Button
        size="icon"
        onClick={onEndCall}
        className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/50"
        title="End call"
      >
        <PhoneOff className="w-6 h-6 text-white" />
      </Button>
    </div>
  );
}