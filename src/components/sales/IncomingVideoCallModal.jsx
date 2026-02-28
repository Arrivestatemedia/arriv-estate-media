import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Loader2 } from "lucide-react";

export default function IncomingVideoCallModal({ callerName, callerExtension, onAccept, onDecline, isProcessing }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center">
        <div className="mb-6">
          <Phone className="w-16 h-16 mx-auto mb-4 text-green-500 animate-bounce" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Incoming Video Call</h2>
          <p className="text-lg font-semibold text-gray-700">{callerName}</p>
          {callerExtension && <p className="text-sm text-gray-500">Ext. {callerExtension}</p>}
        </div>
        
        <div className="flex gap-3">
          <Button
            onClick={onDecline}
            disabled={isProcessing}
            variant="destructive"
            className="flex-1 h-12"
          >
            <PhoneOff className="w-5 h-5 mr-2" />
            Decline
          </Button>
          <Button
            onClick={onAccept}
            disabled={isProcessing}
            className="flex-1 h-12 bg-green-600 hover:bg-green-700"
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