import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PayoutOverview from "@/components/payoutrecords/PayoutOverview";
import PayoutHistoryTab from "@/components/payoutrecords/PayoutHistoryTab";
import WeeklyStatementsTab from "@/components/payoutrecords/WeeklyStatementsTab";
import MonthlyStatementsTab from "@/components/payoutrecords/MonthlyStatementsTab";
import TaxDocumentsTab from "@/components/payoutrecords/TaxDocumentsTab";
import { Wallet } from "lucide-react";

export default function PayoutRecords() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-6 px-4 md:py-10 md:px-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Wallet className="w-6 h-6 text-[#B8956A]" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#1A1A1A]">Payout Records</h1>
            <p className="text-sm text-[#1A1A1A]/60 mt-0.5">
              Your earnings, statements, and tax documents — all in one place.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto bg-white border border-[#B8956A]/20 rounded-lg p-1">
            <TabsTrigger value="overview" className="text-xs md:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="history" className="text-xs md:text-sm">Payout History</TabsTrigger>
            <TabsTrigger value="weekly" className="text-xs md:text-sm">Weekly Statements</TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs md:text-sm">Monthly Statements</TabsTrigger>
            <TabsTrigger value="tax" className="text-xs md:text-sm">Tax Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <PayoutOverview />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <PayoutHistoryTab />
          </TabsContent>
          <TabsContent value="weekly" className="mt-4">
            <WeeklyStatementsTab />
          </TabsContent>
          <TabsContent value="monthly" className="mt-4">
            <MonthlyStatementsTab />
          </TabsContent>
          <TabsContent value="tax" className="mt-4">
            <TaxDocumentsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}