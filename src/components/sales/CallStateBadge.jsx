import React from 'react';

export default function CallStateBadge({ 
  role = 'Sales Rep', 
  callStatus = 'idle', 
  isInLiveCall = false,
  isVideoWindowOpen = false,
  activeVideoCall = false,
  incomingVideoCall = false,
  lastCallEvent = ''
}) {
  const getStatusColor = () => {
    switch (callStatus) {
      case 'dialing': return 'bg-yellow-100 border-yellow-300';
      case 'ringing': return 'bg-blue-100 border-blue-300';
      case 'connected': return 'bg-green-100 border-green-300';
      case 'ending': return 'bg-orange-100 border-orange-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'dialing': return 'text-yellow-700';
      case 'ringing': return 'text-blue-700';
      case 'connected': return 'text-green-700';
      case 'ending': return 'text-orange-700';
      default: return 'text-gray-700';
    }
  };

  return (
    <div className={`fixed top-20 right-4 ${getStatusColor()} border rounded-lg p-3 text-xs font-mono shadow-lg z-50 max-w-xs`}>
      <div className={`font-semibold ${getStatusText()} mb-1`}>{role}</div>
      <div className="space-y-0.5 text-gray-700">
        <div><span className="font-semibold">callStatus:</span> {callStatus}</div>
        <div><span className="font-semibold">isInLiveCall:</span> {String(isInLiveCall)}</div>
        <div><span className="font-semibold">isVideoWindowOpen:</span> {String(isVideoWindowOpen)}</div>
        <div><span className="font-semibold">activeVideoCall:</span> {String(!!activeVideoCall)}</div>
        <div><span className="font-semibold">incomingVideoCall:</span> {String(!!incomingVideoCall)}</div>
        {lastCallEvent && <div><span className="font-semibold">lastEvent:</span> {lastCallEvent}</div>}
      </div>
    </div>
  );
}