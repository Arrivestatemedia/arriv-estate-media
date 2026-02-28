import React from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Loader2 } from "lucide-react";

export default function IncomingVideoCallModal({ 
  callerName, 
  callerExtension, 
  onAccept, 
  onDecline, 
  isProcessing 
}) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-black flex items-center justify-center p-4 z-50">
      <style>{`
        @keyframes ring {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        .ring-animation {
          animation: ring 1.5s ease-in-out infinite;
        }
      `}</style>

      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-8 w-full max-w-sm text-center border border-yellow-500/30 shadow-2xl shadow-yellow-500/10">
        <div className="mb-8">
          <div className="ring-animation inline-block mb-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/50">
              <Phone className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>

          <h2 className="text-3xl font-bold text-white mb-2">Incoming Video Call</h2>
          <p className="text-xl font-semibold text-yellow-300">{callerName}</p>
          {callerExtension && <p className="text-sm text-yellow-400/70">Ext. {callerExtension}</p>}
        </div>

        <div className="flex gap-4">
          <Button
            onClick={onDecline}
            disabled={isProcessing}
            size="lg"
            className="flex-1 h-14 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-full gap-2"
          >
            <PhoneOff className="w-5 h-5" />
            Decline
          </Button>
          <Button
            onClick={onAccept}
            disabled={isProcessing}
            size="lg"
            className="flex-1 h-14 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-full gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <Phone className="w-5 h-5" />
                Accept
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}