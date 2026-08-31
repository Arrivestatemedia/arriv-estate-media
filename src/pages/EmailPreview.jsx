import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { getCatalogEntry } from "@/lib/emailCatalog";
import EmailTemplateList from "@/components/email/EmailTemplateList";
import EmailTemplateEditor from "@/components/email/EmailTemplateEditor";
import { toast } from "sonner";
import { Mail } from "lucide-react";

export default function EmailPreview() {
  const [templates, setTemplates] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const salesMemberId = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");

  const fetchTemplates = useCallback(async () => {
    if (!salesMemberId) { setLoading(false); return; }
    try {
      const res = await base44.functions.invoke("manageEmailTemplates", {
        action: "list",
        salesMemberId,
      });
      setTemplates(res?.templates || []);
    } catch (err) {
      console.error("Failed to load templates:", err);
    } finally {
      setLoading(false);
    }
  }, [salesMemberId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const savedMap = new Map(templates.map((t) => [t.template_key, t]));
  const savedKeys = new Set(savedMap.keys());
  const entry = selectedKey ? getCatalogEntry(selectedKey) : null;
  const savedTemplate = selectedKey ? savedMap.get(selectedKey) : null;

  const handleSave = async ({ subject, htmlBody }) => {
    if (!salesMemberId || !entry) return;
    setSaving(true);
    try {
      await base44.functions.invoke("manageEmailTemplates", {
        action: "save",
        salesMemberId,
        templateKey: entry.key,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        subject,
        htmlBody,
        variables: entry.variables || [],
      });
      toast.success("Template saved");
      await fetchTemplates();
    } catch (err) {
      toast.error("Failed to save: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!salesMemberId || !entry) return;
    setSaving(true);
    try {
      await base44.functions.invoke("manageEmailTemplates", {
        action: "reset",
        salesMemberId,
        templateKey: entry.key,
      });
      toast.success("Template reset to default");
      await fetchTemplates();
    } catch (err) {
      toast.error("Failed to reset: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  if (!salesMemberId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5]">
        <div className="text-center">
          <Mail className="w-12 h-12 text-[#B8956A]/40 mx-auto mb-3" />
          <p className="text-lg font-medium text-[#1A1A1A]">Admin access required</p>
          <p className="text-sm text-[#1A1A1A]/50 mt-1">Log in as an admin to manage email templates</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#FFFBF5]">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-[#B8956A]/20 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Email Template Manager</h1>
          <p className="text-sm text-[#1A1A1A]/50">
            {templates.length} customized · {savedKeys.size > 0 ? `${savedKeys.size} saved` : "No custom templates yet"}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 border-r border-[#B8956A]/15 bg-white shrink-0 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin" />
            </div>
          ) : (
            <EmailTemplateList
              savedKeys={savedKeys}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          )}
        </div>

        {/* Editor */}
        <EmailTemplateEditor
          entry={entry}
          savedTemplate={savedTemplate}
          onSave={handleSave}
          onReset={handleReset}
          saving={saving}
        />
      </div>
    </div>
  );
}