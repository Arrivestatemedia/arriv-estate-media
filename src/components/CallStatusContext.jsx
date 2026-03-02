import React, { createContext, useState } from 'react';

export const CallStatusContext = createContext();

export function CallStatusProvider({ children }) {
  const [callStatus, setCallStatus] = useState('idle');
  const [remoteCallLive, setRemoteCallLive] = useState(false);

  const isInLiveCall = callStatus !== 'idle';

  return (
    <CallStatusContext.Provider value={{ callStatus, setCallStatus, isInLiveCall, remoteCallLive, setRemoteCallLive }}>
      {children}
    </CallStatusContext.Provider>
  );
}

export function useCallStatus() {
  const context = React.useContext(CallStatusContext);
  if (!context) {
    throw new Error('useCallStatus must be used within CallStatusProvider');
  }
  return context;
}