import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Save, RotateCcw, Eye, Code,
  Bold, Italic, Underline, List, Link as LinkIcon, Undo2, Redo2,
} from "lucide-react";
import { getEmailDefault } from "@/lib/emailDefaults";

export default function EmailTemplateEditor({ entry, savedTemplate, onSave, onReset, saving }) {
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [iframeSrc, setIframeSrc] = useState("");
  const [view, setView] = useState("visual"); // "visual" | "code"
  const [dirty, setDirty] = useState(false);
  const previewRef = useRef(null);

  // Load content when template changes
  useEffect(() => {
    let content = "";
    let subj = "";
    if (savedTemplate) {
      content = savedTemplate.html_body || "";
      subj = savedTemplate.subject || "";
    }
    if (!content && entry) {
      const def = getEmailDefault(entry.key);
      content = def.htmlBody || "";
      subj = def.subject || entry.defaultSubject || "";
    }
    setHtmlBody(content);
    setSubject(subj);
    setIframeSrc(content);
    setDirty(false);
  }, [entry?.key, savedTemplate?.id]);

  // Turn the iframe into an editable surface and capture edits
  const handleIframeLoad = useCallback(() => {
    const doc = previewRef.current?.contentDocument;
    if (!doc) return;
    doc.designMode = "on";
    const sync = () => {
      const html = doc.documentElement.outerHTML;
      setHtmlBody(html);
      setDirty(true);
    };
    doc.addEventListener("input", sync);
    doc.addEventListener("keyup", sync);
    doc.addEventListener("blur", sync);
  }, []);

  // Run a formatting command inside the iframe
  const exec = useCallback((cmd, val) => {
    const doc = previewRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand(cmd, false, val);
    const html = doc.documentElement.outerHTML;
    setHtmlBody(html);
    setDirty(true);
    // refocus so the user can keep typing
    previewRef.current?.contentWindow?.focus();
  }, []);

  const handleLink = () => {
    const url = window.prompt("Enter URL (https://...)");
    if (url) exec("createLink", url);
  };

  const handleSubjectChange = (val) => { setSubject(val); setDirty(true); };

  // Source-mode textarea: update both state and reload the iframe
  const handleSourceChange = (val) => {
    setHtmlBody(val);
    setIframeSrc(val);
    setDirty(true);
  };

  const handleSave = () => {
    onSave({ subject, htmlBody });
    setDirty(false);
  };

  const handleReset = () => {
    onReset();
    const def = getEmailDefault(entry.key);
    const content = def.htmlBody || "";
    setSubject(def.subject || entry?.defaultSubject || "");
    setHtmlBody(content);
    setIframeSrc(content);
    setDirty(false);
  };

  if (!entry) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#1A1A1A]/40">
        <div className="text-center">
          <p className="text-lg font-medium">Select an email template</p>
          <p className="text-sm mt-1">Choose a template from the list to view and edit it</p>
        </div>
      </div>
    );
  }

  const ToolBtn = ({ icon: Icon, cmd, label }) => (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => exec(cmd)}
      className="w-8 h-8 flex items-center justify-center rounded text-[#1A1A1A]/70 hover:bg-[#B8956A]/15 hover:text-[#1A1A1A] transition-colors"
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#B8956A]/15">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">{entry.name}</h2>
          <div className="flex items-center gap-2">
            {savedTemplate && (
              <span className="text-xs px-2 py-1 rounded-full bg-[#B8956A]/10 text-[#B8956A] font-medium">
                Customized
              </span>
            )}
            <div className="flex bg-[#1A1A1A]/5 rounded-lg p-0.5">
              <button
                onClick={() => setView("visual")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === "visual" ? "bg-white text-[#1A1A1A] shadow-sm" : "text-[#1A1A1A]/50"
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Visual
              </button>
              <button
                onClick={() => setView("code")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === "code" ? "bg-white text-[#1A1A1A] shadow-sm" : "text-[#1A1A1A]/50"
                }`}
              >
                <Code className="w-3.5 h-3.5" /> Code
              </button>
            </div>
          </div>
        </div>
        <p className="text-sm text-[#1A1A1A]/60">{entry.description}</p>
        {entry.variables?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {entry.variables.map((v) => (
              <span key={v} className="text-xs px-2 py-0.5 rounded bg-[#1A1A1A]/5 text-[#1A1A1A]/50 font-mono">
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Subject */}
      <div className="px-6 py-3 border-b border-[#B8956A]/15">
        <label className="text-xs font-semibold uppercase tracking-wider text-[#B8956A] mb-1.5 block">Subject Line</label>
        <Input
          value={subject}
          onChange={(e) => handleSubjectChange(e.target.value)}
          placeholder="Email subject line..."
          className="font-medium"
        />
      </div>

      {/* Formatting toolbar (visual mode only) */}
      {view === "visual" && (
        <div className="px-4 py-1.5 flex items-center gap-0.5 border-b border-[#B8956A]/15 bg-[#FFFBF5]">
          <ToolBtn icon={Bold} cmd="bold" label="Bold" />
          <ToolBtn icon={Italic} cmd="italic" label="Italic" />
          <ToolBtn icon={Underline} cmd="underline" label="Underline" />
          <div className="w-px h-5 bg-[#B8956A]/20 mx-1" />
          <ToolBtn icon={List} cmd="insertUnorderedList" label="Bullet List" />
          <button
            type="button"
            title="Insert Link"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleLink}
            className="w-8 h-8 flex items-center justify-center rounded text-[#1A1A1A]/70 hover:bg-[#B8956A]/15 hover:text-[#1A1A1A] transition-colors"
          >
            <LinkIcon className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-[#B8956A]/20 mx-1" />
          <ToolBtn icon={Undo2} cmd="undo" label="Undo" />
          <ToolBtn icon={Redo2} cmd="redo" label="Redo" />
          <div className="ml-auto text-xs text-[#1A1A1A]/40 pr-2">Click the preview and type to edit</div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {view === "visual" ? (
          <iframe
            ref={previewRef}
            title="Email Editor"
            srcDoc={iframeSrc || "<p style='color:#999;padding:20px;'>Preview will appear here...</p>"}
            onLoad={handleIframeLoad}
            className="flex-1 w-full border-0 bg-white"
          />
        ) : (
          <textarea
            value={htmlBody}
            onChange={(e) => handleSourceChange(e.target.value)}
            placeholder="Enter HTML email body..."
            className="flex-1 w-full p-4 font-mono text-xs leading-relaxed bg-[#1A1A1A] text-[#FFFBF5] resize-none outline-none border-0"
            spellCheck={false}
          />
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-3 border-t border-[#B8956A]/15 flex items-center justify-between bg-[#FFFBF5]">
        <div className="text-sm text-[#1A1A1A]/50">
          {dirty ? <span className="text-[#B8956A]">● Unsaved changes</span> : savedTemplate ? `Last edited by ${savedTemplate.updated_by || "admin"}` : "Not yet customized"}
        </div>
        <div className="flex gap-2">
          {savedTemplate && (
            <Button variant="outline" onClick={handleReset} disabled={saving} className="border-[#B8956A]/30 text-[#1A1A1A]/70">
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Reset to Default
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !dirty} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
            <Save className="w-4 h-4 mr-1.5" />
            {saving ? "Saving..." : "Save Template"}
          </Button>
        </div>
      </div>
    </div>
  );
}