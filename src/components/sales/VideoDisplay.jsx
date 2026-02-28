import React from "react";
import { Loader2 } from "lucide-react";

export default function VideoDisplay({
  remoteVideoRef,
  localVideoRef,
  localStream,
  isVideoOn,
  isScreenSharing,
  isBlurring,
  callState,
  isLoading,
  error,
  isMuted
}) {
  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      {error ? (
        <div className="text-center p-6">
          <p className="text-red-400 mb-4 text-sm">{error}</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-300 text-sm font-medium">Connecting...</p>
        </div>
      ) : (
        <>
          {/* Remote video (full screen) */}
          <div
            ref={remoteVideoRef}
            className="absolute inset-0 w-full h-full bg-black"
          />

          {/* Local video (picture-in-picture) */}
          {localStream && callState !== "idle" && (
            <div className="absolute bottom-6 right-6 w-40 h-32 rounded-xl overflow-hidden border-2 border-blue-500/80 bg-black shadow-2xl z-10 backdrop-blur-sm">
              {!isScreenSharing ? (
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
                    transform: "scaleX(-1)"
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-900/50 to-slate-900/50 flex flex-col items-center justify-center">
                  <div className="text-3xl mb-2">🖥️</div>
                  <span className="text-xs text-blue-300 font-semibold">Sharing</span>
                </div>
              )}

              {!isVideoOn && !isScreenSharing && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                  <span className="text-xl">📷</span>
                </div>
              )}

              {isMuted && (
                <div className="absolute top-2 right-2 bg-red-500/80 rounded-full p-1.5">
                  <div className="text-white text-xs">🔇</div>
                </div>
              )}
            </div>
          )}

          {/* Connection status */}
          {callState === "calling" && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-700">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              <p className="text-slate-300 text-sm font-medium">Calling...</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}