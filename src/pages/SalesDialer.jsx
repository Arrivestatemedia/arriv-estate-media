import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, MessageSquare, Grid3x3 } from "lucide-react";
import TwilioDialer from "@/components/sales/TwilioDialer";
import CallRecents from "@/components/sales/CallRecents";
import DialerKeypad from "@/components/sales/DialerKeypad";
import SmsInbox from "@/components/sales/SmsInbox";

export default function SalesDialer() {
  const salesMemberId = localStorage.getItem('sales_member_id');
  const [dialerKey, setDialerKey] = useState(0);

  if (!salesMemberId) {
    return <div className="text-center mt-20">Not authenticated</div>;
  }

  const handleNumberPad = (number) => {
    setDialerKey(prev => prev + 1);
  };

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <Tabs defaultValue="recents" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sticky top-0 z-40 bg-white border-b">
          <TabsTrigger value="recents" className="flex items-center gap-1">
            <Phone className="w-4 h-4" />
            <span className="hidden sm:inline">Recents</span>
          </TabsTrigger>
          <TabsTrigger value="keypad" className="flex items-center gap-1">
            <Grid3x3 className="w-4 h-4" />
            <span className="hidden sm:inline">Keypad</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Messages</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recents" className="mt-4">
          <CallRecents salesMemberId={salesMemberId} onCallSelect={handleNumberPad} />
        </TabsContent>

        <TabsContent value="keypad" className="mt-4">
          <div className="space-y-4">
            <DialerKeypad onNumberPad={handleNumberPad} />
            <TwilioDialer key={dialerKey} salesMemberId={salesMemberId} />
          </div>
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <SmsInbox salesMemberId={salesMemberId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}