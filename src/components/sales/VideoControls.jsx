import React from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, Settings, MessageCircle, Circle, Film } from "lucide-react";

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
  isChatOpen,
  isRecording,
  onToggleRecord,
  onToggleRecordings,
  isRecordingsOpen,
  recordingCount
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

      {/* Chat */}
      {onToggleChat && (
        <Button
          size="icon"
          onClick={onToggleChat}
          title={isChatOpen ? "Close chat" : "Open chat"}
          className={`h-10 w-10 rounded-full ${isChatOpen ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"}`}
        >
          <MessageCircle className="w-5 h-5 text-white" />
        </Button>
      )}

      {/* Record */}
      {onToggleRecord && (
        <Button
          size="icon"
          onClick={onToggleRecord}
          title={isRecording ? "Stop recording" : "Start recording"}
          className={`h-10 w-10 rounded-full ${
            isRecording ? "bg-red-600 hover:bg-red-700" : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          <Circle className={`w-5 h-5 text-white ${isRecording ? "fill-white" : ""}`} />
        </Button>
      )}

      {/* Recordings */}
      {onToggleRecordings && (
        <Button
          size="icon"
          onClick={onToggleRecordings}
          title="Recordings"
          className={`h-10 w-10 rounded-full relative ${isRecordingsOpen ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"}`}
        >
          <Film className="w-5 h-5 text-white" />
          {recordingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
              {recordingCount > 9 ? "9+" : recordingCount}
            </span>
          )}
        </Button>
      )}

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