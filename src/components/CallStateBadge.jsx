import React from 'react';
import { useCallStatus } from '@/components/CallStatusContext';

export default function CallStateBadge() {
  const { callStatus, isInLiveCall } = useCallStatus();
  
  const userType = localStorage.getItem('sales_member_id') ? 'Sales Rep' : 
                   localStorage.getItem('user_type') === 'media_partner' ? 'Media Partner' : 'User';

  return (
    <div className="fixed top-4 left-4 bg-gray-900 border border-gray-700 rounded-lg p-3 z-[50000] text-white text-xs font-mono space-y-1">
      <div>Role: {userType}</div>
      <div>CallStatus: <span className={callStatus === 'connected' ? 'text-green-400' : callStatus === 'calling' ? 'text-yellow-400' : 'text-gray-400'}>{callStatus}</span></div>
      <div>isInLiveCall: <span className={isInLiveCall ? 'text-green-400' : 'text-gray-400'}>{isInLiveCall ? 'true' : 'false'}</span></div>
    </div>
  );
}