import React, { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MyTimeOff from "@/components/timeoff/MyTimeOff";
import ManagerTimeOff from "@/components/timeoff/ManagerTimeOff";

export default function TimeOff() {
  const [salesMemberId, setSalesMemberId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
    const role = localStorage.getItem("user_role") || sessionStorage.getItem("user_role") || "user";
    setSalesMemberId(id);
    setIsAdmin(role === "admin");
  }, []);

  if (!salesMemberId) {
    return <div className="p-8 text-center text-slate-400">Unable to identify your employee record. Please log in.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {isAdmin ? (
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">My Time Off</TabsTrigger>
            <TabsTrigger value="team">Team Time Off</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-6"><MyTimeOff salesMemberId={salesMemberId} /></TabsContent>
          <TabsContent value="team" className="mt-6"><ManagerTimeOff salesMemberId={salesMemberId} /></TabsContent>
        </Tabs>
      ) : (
        <MyTimeOff salesMemberId={salesMemberId} />
      )}
    </div>
  );
}