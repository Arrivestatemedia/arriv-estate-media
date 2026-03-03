import React from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, Settings, MessageCircle } from "lucide-react";

export default function VideoControls({
  isMuted,
  isVideoOn,
  isScreenSharing,
  canScreenShare,
  onToggleMic,
  onToggleVideo,
  onToggleScreenShare,
  onEndCall,
  onSettings,
  onToggleChat,
  isChatOpen
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {/* Mic */}
      <Button
        size="icon"
        onClick={onToggleMic}
        title={isMuted ? "Unmute" : "Mute"}
        className={`h-10 w-10 rounded-full ${
          isMuted ? "bg-red-600 hover:bg-red-700" : "bg-gray-700 hover:bg-gray-600"
        }`}
      >
        {isMuted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
      </Button>

      {/* Camera */}
      <Button
        size="icon"
        onClick={onToggleVideo}
        title={isVideoOn ? "Stop video" : "Start video"}
        className={`h-10 w-10 rounded-full ${
          !isVideoOn ? "bg-red-600 hover:bg-red-700" : "bg-gray-700 hover:bg-gray-600"
        }`}
      >
        {isVideoOn ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-white" />}
      </Button>

      {/* Screen share */}
      <Button
        size="icon"
        onClick={onToggleScreenShare}
        disabled={!canScreenShare}
        title={isScreenSharing ? "Stop sharing" : "Share screen"}
        className={`h-10 w-10 rounded-full ${
          isScreenSharing ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {isScreenSharing ? <MonitorOff className="w-5 h-5 text-white" /> : <Monitor className="w-5 h-5 text-white" />}
      </Button>

      {/* Settings */}
      <Button
        size="icon"
        onClick={onSettings}
        title="Settings"
        className="h-10 w-10 rounded-full bg-gray-700 hover:bg-gray-600"
      >
        <Settings className="w-5 h-5 text-white" />
      </Button>

      <div className="w-px h-7 bg-gray-600 mx-1" />

      {/* End call */}
      <Button
        size="icon"
        onClick={onEndCall}
        title="End call"
        className="h-10 w-10 rounded-full bg-red-600 hover:bg-red-700"
      >
        <PhoneOff className="w-5 h-5 text-white" />
      </Button>
    </div>
  );
}