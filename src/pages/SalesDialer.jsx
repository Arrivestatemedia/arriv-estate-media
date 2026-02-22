import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, MessageSquare, Grid3x3 } from "lucide-react";
import TwilioDialer from "@/components/sales/TwilioDialer.jsx";
import CallRecents from "@/components/sales/CallRecents.jsx";
import DialerKeypad from "@/components/sales/DialerKeypad.jsx";
import SmsInbox from "@/components/sales/SmsInbox.jsx";

export default function SalesDialer() {
  const salesMemberId = localStorage.getItem('sales_member_id');
  const [dialNumber, setDialNumber] = useState("");

  if (!salesMemberId) {
    return <div className="text-center mt-20">Not authenticated</div>;
  }

  const handleDial = (number) => {
    setDialNumber(number);
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      <Tabs defaultValue="recents" className="w-full flex flex-col flex-1">
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
          {dialNumber && <TwilioDialer key={dialNumber} salesMemberId={salesMemberId} initialNumber={dialNumber} />}
        </TabsContent>

        <TabsContent value="messages" className="flex-1 p-4 overflow-y-auto">
          <SmsInbox salesMemberId={salesMemberId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}