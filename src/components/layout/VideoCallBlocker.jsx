import React from 'react';
import { useCallStatus } from '@/components/CallStatusContext';

export default function VideoCallBlocker() {
  const { isInLiveCall } = useCallStatus();

  if (!isInLiveCall) return null;

  return (
    <div
      className="fixed right-0 bottom-0 w-1/2 h-1/2 z-[9999999] pointer-events-auto"
      style={{ cursor: 'not-allowed' }}
    />
  );
}