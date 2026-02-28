import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Loader2 } from "lucide-react";

export default function IncomingVideoCallModal({ callerName, callerExtension, onAccept, onDecline, isProcessing }) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-black via-purple-950 to-black flex items-center justify-center p-4 z-50">
      <style>{`
        @keyframes ring {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .ring-animation {
          animation: ring 1.5s ease-in-out infinite;
        }
      `}</style>
      
      <div className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-2xl p-8 w-full max-w-sm text-center border border-purple-500/30 shadow-2xl shadow-purple-500/20">
        <div className="mb-6">
          <div className="ring-animation inline-block">
            <Phone className="w-16 h-16 mx-auto mb-4 text-green-400 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Incoming Video Call</h2>
          <p className="text-lg font-semibold text-purple-200">{callerName}</p>
          {callerExtension && <p className="text-sm text-purple-400">Ext. {callerExtension}</p>}
        </div>
        
        <div className="flex gap-3">
          <Button
            onClick={onDecline}
            disabled={isProcessing}
            className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white border-red-500/50"
          >
            <PhoneOff className="w-5 h-5 mr-2" />
            Decline
          </Button>
          <Button
            onClick={onAccept}
            disabled={isProcessing}
            className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white border-green-500/50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <Phone className="w-5 h-5 mr-2" />
                Accept
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}