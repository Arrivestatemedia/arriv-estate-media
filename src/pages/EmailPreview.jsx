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
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState("admin");

  // Determine admin status from either platform auth or sales session
  useEffect(() => {
    const salesRole = localStorage.getItem("sales_member_role") || sessionStorage.getItem("sales_member_role");
    const userRole = localStorage.getItem("user_role") || sessionStorage.getItem("user_role");
    const salesName = localStorage.getItem("sales_member_name") || sessionStorage.getItem("sales_member_name");
    const userName = localStorage.getItem("user_name") || sessionStorage.getItem("user_name");

    if (salesRole === "admin") {
      setIsAdmin(true);
      setAdminName(salesName || "admin");
      return;
    }

    if (userRole === "admin") {
      setIsAdmin(true);
      setAdminName(userName || "admin");
      return;
    }

    // Also check base44 auth for platform admin role
    base44.auth.isAuthenticated().then((isAuth) => {
      if (isAuth) {
        base44.auth.me().then((user) => {
          if (user?.role === "admin") {
            setIsAdmin(true);
            setAdminName(user.full_name || user.email || "admin");
          } else {
            setLoading(false);
          }
        }).catch(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("manageEmailTemplates", { action: "list" });
      setTemplates(res?.templates || []);
    } catch (err) {
      console.error("Failed to load templates:", err);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchTemplates();
    else setLoading(false);
  }, [isAdmin, fetchTemplates]);

  const savedMap = new Map(templates.map((t) => [t.template_key, t]));
  const savedKeys = new Set(savedMap.keys());
  const entry = selectedKey ? getCatalogEntry(selectedKey) : null;
  const savedTemplate = selectedKey ? savedMap.get(selectedKey) : null;

  const handleSave = async ({ subject, htmlBody }) => {
    if (!entry) return;
    setSaving(true);
    try {
      await base44.functions.invoke("manageEmailTemplates", {
        action: "save",
        templateKey: entry.key,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        subject,
        htmlBody,
        variables: entry.variables || [],
        updatedBy: adminName,
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
    if (!entry) return;
    setSaving(true);
    try {
      await base44.functions.invoke("manageEmailTemplates", {
        action: "reset",
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

  if (!isAdmin && !loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-[#FFFBF5]">
        <div className="text-center">
          <Mail className="w-12 h-12 text-[#B8956A]/40 mx-auto mb-3" />
          <p className="text-lg font-medium text-[#1A1A1A]">Admin access required</p>
          <p className="text-sm text-[#1A1A1A]/50 mt-1">Log in as an admin to manage email templates</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[#FFFBF5]" style={{ height: "calc(100vh - 4rem)" }}>
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-[#B8956A]/20 bg-white flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Email Template Manager</h1>
          <p className="text-sm text-[#1A1A1A]/50">
            {templates.length} customized · {savedKeys.size > 0 ? `${savedKeys.size} saved` : "No custom templates yet"}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar */}
        <div className="w-72 border-r border-[#B8956A]/15 bg-white shrink-0 flex flex-col">
          <EmailTemplateList
            savedKeys={savedKeys}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
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