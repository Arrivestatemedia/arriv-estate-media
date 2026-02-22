import React, { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, MessageSquare, Grid3x3, PhoneOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import TwilioDialer from "@/components/sales/TwilioDialer.jsx";
import CallRecents from "@/components/sales/CallRecents.jsx";
import DialerKeypad from "@/components/sales/DialerKeypad.jsx";
import SmsInbox from "@/components/sales/SmsInbox.jsx";

export default function SalesDialer() {
  const salesMemberId = localStorage.getItem('sales_member_id');
  const [dialNumber, setDialNumber] = useState("");
  const [device, setDevice] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [incomingFrom, setIncomingFrom] = useState("");

  if (!salesMemberId) {
    return <div className="text-center mt-20">Not authenticated</div>;
  }

  // Initialize Twilio device for incoming calls only
  useEffect(() => {
    initIncomingDevice();
    return () => {
      if (device) device.destroy();
    };
  }, []);

  const initIncomingDevice = async () => {
    try {
      await loadTwilioSdk();
      const res = await base44.functions.invoke('generateTwilioToken', { salesMemberId });
      const { token } = res.data;

      if (!token) return;

      const { Device } = window.Twilio;
      const twilioDevice = new Device(token, {
        codecPreferences: ['opus', 'pcmu'],
        enableRingingState: true,
        logLevel: 1
      });

      twilioDevice.on('incoming', (call) => {
        setIncomingCall(call);
        setIncomingFrom(call.parameters?.From || 'Unknown');
        call.on('disconnect', () => {
          setIncomingCall(null);
          setIncomingFrom('');
        });
        call.on('cancel', () => {
          setIncomingCall(null);
          setIncomingFrom('');
        });
      });

      await twilioDevice.register();
      setDevice(twilioDevice);
    } catch (err) {
      console.error('Failed to init device:', err);
    }
  };

  const loadTwilioSdk = () => new Promise((resolve, reject) => {
    if (window.Twilio?.Device) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://sdk.twilio.com/js/voice/releases/2.10.0/twilio.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const handleDial = (number) => {
    setDialNumber(number);
  };

  const acceptIncoming = () => {
    if (incomingCall) {
      incomingCall.accept();
      setDialNumber(incomingFrom);
    }
  };

  const rejectIncoming = () => {
    if (incomingCall) {
      incomingCall.reject();
      setIncomingCall(null);
      setIncomingFrom('');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white relative">
      {/* Incoming Call Notification */}
      {incomingCall && (
        <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-green-500 to-green-600 text-white shadow-lg animate-pulse">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <Phone className="w-6 h-6 animate-spin" />
              <div>
                <p className="font-bold text-lg">Incoming Call</p>
                <p className="text-sm opacity-90">{incomingFrom}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={acceptIncoming}
                className="bg-white text-green-600 hover:bg-gray-100 font-bold gap-2"
              >
                <Phone className="w-4 h-4" /> Accept
              </Button>
              <Button 
                onClick={rejectIncoming}
                className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
              >
                <PhoneOff className="w-4 h-4" /> Decline
              </Button>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="recents" className="w-full flex flex-col flex-1" style={{ marginTop: incomingCall ? '100px' : '0' }}>
        <TabsList className="grid w-full grid-cols-3 sticky top-0 z-40 bg-white border-b rounded-none">
          <TabsTrigger value="recents" className="flex items-center gap-1 rounded-none">
            <Phone className="w-4 h-4" />
            <span>Recents</span>
          </TabsTrigger>
          <TabsTrigger value="keypad" className="flex items-center gap-1 rounded-none">
            <Grid3x3 className="w-4 h-4" />
            <span>Keypad</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-1 rounded-none">
            <MessageSquare className="w-4 h-4" />
            <span>Messages</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recents" className="flex-1 p-4 overflow-y-auto">
          <CallRecents salesMemberId={salesMemberId} onCallClick={handleDial} />
        </TabsContent>

        <TabsContent value="keypad" className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
          <DialerKeypad onDial={handleDial} />
        </TabsContent>

        <TabsContent value="messages" className="flex-1 p-4 overflow-y-auto">
          <SmsInbox salesMemberId={salesMemberId} />
        </TabsContent>
      </Tabs>

      {/* Dialer Modal */}
      <Dialog open={!!dialNumber} onOpenChange={(open) => !open && setDialNumber("")}>
        <DialogContent className="max-w-2xl h-5/6 flex flex-col p-0 border-0 rounded-lg">
          <div className="flex-1 overflow-y-auto">
            <TwilioDialer 
              salesMemberId={salesMemberId} 
              initialNumber={dialNumber}
              onClose={() => setDialNumber("")}
              device={device}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}