import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Loader2 } from "lucide-react";

export default function IncomingVideoCallModal({ callerName, callerExtension, onAccept, onDecline, isProcessing }) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center p-4 z-50">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black border border-gray-700 rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl backdrop-blur-md">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center animate-pulse">
            <Phone className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">Incoming Video Call</h2>
          <p className="text-lg font-semibold text-white">{callerName}</p>
          {callerExtension && <p className="text-sm text-gray-400">Ext. {callerExtension}</p>}
        </div>
        
        <div className="flex gap-3">
          <Button
            onClick={onDecline}
            disabled={isProcessing}
            className="flex-1 h-12 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
          >
            <PhoneOff className="w-5 h-5 mr-2" />
            Decline
          </Button>
          <Button
            onClick={onAccept}
            disabled={isProcessing}
            className="flex-1 h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
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