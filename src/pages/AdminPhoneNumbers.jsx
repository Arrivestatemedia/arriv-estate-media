import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, ArrowRight, Save, Loader2, Settings } from "lucide-react";

export default function AdminPhoneNumbers() {
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("managePhoneNumbers", { action: "get" });
      const data = res?.data || res;
      setNumbers(data?.numbers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke("managePhoneNumbers", {
        action: "set_forward",
        target_number: editValue,
      });
      setEditing(null);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Settings className="w-6 h-6 text-[#B8956A]" />
          </div>
          <div>
            <h1 className="text-2xl font-serif text-[#1A1A1A]">Phone Numbers</h1>
            <p className="text-sm text-[#1A1A1A]/60">
              All numbers in the system, their function, and forwarding targets
            </p>
          </div>
        </div>

        {numbers.map((item, idx) => (
          <Card key={idx} className="border-2 border-[#B8956A]/20">
            <CardHeader>
              <CardTitle className="text-lg text-[#1A1A1A] flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#B8956A]" />
                {item.label}
              </CardTitle>
              <p className="text-sm text-[#1A1A1A]/60 mt-1">{item.function}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 bg-[#FFFBF5] rounded-lg p-4">
                <div className="flex-1">
                  <p className="text-xs text-[#1A1A1A]/50 uppercase tracking-wide mb-1">
                    Number
                  </p>
                  <p className="text-lg font-medium text-[#1A1A1A]">
                    {item.number || "Not configured"}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-[#B8956A] flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-[#1A1A1A]/50 uppercase tracking-wide mb-1">
                    {item.pointing_type === "phone" ? "Forwarding To" : "Points To"}
                  </p>
                  {editing === idx && item.editable ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="e.g. +16786409268"
                      className="font-medium"
                    />
                  ) : (
                    <p className="text-lg font-medium text-[#1A1A1A]">
                      {item.pointing_to || "—"}
                    </p>
                  )}
                </div>
              </div>

              {item.editable && (
                <div className="flex justify-end gap-2">
                  {editing === idx ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setEditing(null)}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleSave} disabled={saving || !editValue.trim()}>
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-1" />
                        )}
                        Save
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(idx);
                        setEditValue(item.pointing_to);
                      }}
                    >
                      Change Target
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}