import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Trash2, PhoneOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CallRecents({ salesMemberId, onCallClick }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
    const unsubscribe = base44.entities.ActivityLog.subscribe((event) => {
      if (event.type === "create" || event.type === "update") {
        fetchActivities();
      }
    });
    return unsubscribe;
  }, []);

  const fetchActivities = async () => {
    try {
      const calls = await base44.entities.ActivityLog.filter(
        { activity_type: "call" },
        "-activity_date",
        50
      );
      setActivities(calls);
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.ActivityLog.delete(id);
      setActivities(activities.filter((a) => a.id !== id));
    } catch (error) {
      console.error("Error deleting call:", error);
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const missedCalls = activities.filter(a => a.notes?.includes('Inbound') && a.duration_minutes === 0);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  return (
    <Tabs defaultValue="all" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="all">All ({activities.length})</TabsTrigger>
        <TabsTrigger value="missed">Missed ({missedCalls.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="all" className="mt-4 space-y-2">
        {activities.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No call history</div>
        ) : (
          activities.map((call) => (
            <Card key={call.id} className="border-0 shadow-sm">
              <CardContent className="p-3 flex items-center justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => onCallClick(call.contact_name || call.contact_email)}
                >
                  <p className="font-semibold text-sm">{call.contact_name || call.contact_email}</p>
                  <p className="text-xs text-gray-500">
                    {formatTime(call.activity_date)} • {call.duration_minutes || 0}m
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onCallClick(call.contact_name || call.contact_email)}
                    className="h-8 w-8"
                  >
                    <Phone className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(call.id)}
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>

      <TabsContent value="missed" className="mt-4 space-y-2">
        {missedCalls.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No missed calls</div>
        ) : (
          missedCalls.map((call) => (
            <Card key={call.id} className="border-0 shadow-sm border-l-2 border-red-500">
              <CardContent className="p-3 flex items-center justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => onCallClick(call.contact_name || call.contact_email)}
                >
                  <p className="font-semibold text-sm text-red-600">{call.contact_name || call.contact_email}</p>
                  <p className="text-xs text-gray-500">Missed • {formatTime(call.activity_date)}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onCallClick(call.contact_name || call.contact_email)}
                    className="h-8 w-8"
                  >
                    <Phone className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(call.id)}
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}