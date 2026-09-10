import React, { useState } from "react";
import { Share2, Copy, ExternalLink, X, QrCode, Linkedin, Facebook, Twitter, Mail, Sparkles, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const LIGHT_BG = "#F9FAFB";
const BORDER = "rgba(184,149,106,0.25)";

export default function DistributeJobModal({ job, onClose }) {
  const [embedMode, setEmbedMode] = useState("single");
  const [qrGenerated, setQrGenerated] = useState(false);
  const [aiContent, setAiContent] = useState(null);
  const [aiLoading, setAiLoading] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const baseUrl = "https://app.arrivestatemedia.com";
  const jobPath = `/careers/${job.public_slug || job.job_id}`;
  const publicUrl = `${baseUrl}${jobPath}`;
  const allJobsUrl = `${baseUrl}/careers`;

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => toast.error("Failed to copy"));
  };

  const socialOptions = [
    { key: "linkedin", label: "LinkedIn", icon: Linkedin, url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}` },
    { key: "facebook", label: "Facebook", icon: Facebook, url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}` },
    { key: "x", label: "X", icon: Twitter, url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(publicUrl)}&text=${encodeURIComponent(`We're hiring: ${job.title}`)}` },
    { key: "email", label: "Email", icon: Mail, url: `mailto:?subject=${encodeURIComponent(`Job Opening: ${job.title}`)}&body=${encodeURIComponent(`Check out this opportunity: ${publicUrl}`)}` },
  ];

  const embedUrl = embedMode === "single" ? publicUrl : allJobsUrl;
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" style="border:0" allowfullscreen></iframe>`;

  const aiOptions = [
    { key: "linkedin_post", label: "LinkedIn Post" },
    { key: "short_social", label: "Short Social" },
    { key: "email_announcement", label: "Email Announcement" },
    { key: "referral_message", label: "Referral Message" },
    { key: "career_fair_blurb", label: "Career Fair Blurb" },
  ];

  const generateAIContent = async (type) => {
    setAiLoading(type);
    setAiContent(null);
    try {
      const prompts = {
        linkedin_post: `Write a professional LinkedIn post announcing a job opening for "${job.title}"${job.department ? ` in the ${job.department} department` : ""}. Include a call to action to apply. Keep it engaging and professional. The application link is: ${publicUrl}`,
        short_social: `Write a short social media post (under 280 characters) announcing a job opening for "${job.title}". Include the application link: ${publicUrl}`,
        email_announcement: `Write an email announcement for a job opening: "${job.title}"${job.department ? ` at ${job.department}` : ""}. Include a brief description and a call to action with the link: ${publicUrl}`,
        referral_message: `Write a referral message that employees can send to their network about a job opening for "${job.title}". Keep it casual and encouraging. Application link: ${publicUrl}`,
        career_fair_blurb: `Write a short career fair blurb (2-3 sentences) for a "${job.title}" position. Make it attention-grabbing for job fair attendees. Link: ${publicUrl}`,
      };
      const res = await base44.integrations.Core.InvokeLLM({ prompt: prompts[type] });
      setAiContent(typeof res === "string" ? res : res?.content || "");
    } catch (err) {
      toast.error("Failed to generate content");
    } finally {
      setAiLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{ backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5" style={{ color: GOLD }} />
            <h2 className="text-lg font-bold" style={{ color: TEXT_DARK }}>Distribute Job</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" style={{ color: MUTED }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Public Job Page */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: MUTED }}>Public Job Page</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-lg text-sm font-mono truncate" style={{ backgroundColor: LIGHT_BG, border: `1px solid ${BORDER}`, color: TEXT_DARK }}>
                {publicUrl}
              </div>
              <button onClick={() => copyToClipboard(publicUrl, "url")} className="px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 shrink-0" style={{ border: `1px solid ${BORDER}`, backgroundColor: "white", color: TEXT_DARK }}>
                {copiedField === "url" ? <Check className="w-3.5 h-3.5" style={{ color: GOLD }} /> : <Copy className="w-3.5 h-3.5" />}
                {copiedField === "url" ? "Copied" : "Copy"}
              </button>
              <button onClick={() => window.open(publicUrl, "_blank")} className="px-3 py-2 rounded-lg transition-colors shrink-0" style={{ border: `1px solid ${BORDER}`, backgroundColor: "white", color: TEXT_DARK }}>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Share to Social */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: MUTED }}>Share to Social</label>
            <div className="grid grid-cols-4 gap-3">
              {socialOptions.map(opt => {
                const Icon = opt.icon;
                return (
                  <button key={opt.key} onClick={() => window.open(opt.url, "_blank")} className="flex flex-col items-center gap-2 p-3 rounded-lg transition-all hover:shadow-md" style={{ border: `1px solid ${BORDER}`, backgroundColor: "white" }}>
                    <Icon className="w-5 h-5" style={{ color: GOLD }} />
                    <span className="text-xs font-medium" style={{ color: TEXT_DARK }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: MUTED }}>Each share link includes source tracking so Arriv attributes applicants to the right channel.</p>
          </div>

          {/* QR Code */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: MUTED }}>QR Code</label>
            {qrGenerated ? (
              <div className="flex flex-col items-center gap-3">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicUrl)}`} alt="QR Code" className="rounded-lg" style={{ border: `1px solid ${BORDER}` }} />
                <button onClick={() => copyToClipboard(publicUrl, "qr")} className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5" style={{ border: `1px solid ${BORDER}`, color: TEXT_DARK, backgroundColor: "white" }}>
                  {copiedField === "qr" ? <Check className="w-3.5 h-3.5" style={{ color: GOLD }} /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Link
                </button>
              </div>
            ) : (
              <button onClick={() => setQrGenerated(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ border: `1px solid ${BORDER}`, color: TEXT_DARK, backgroundColor: "white" }}>
                <QrCode className="w-4 h-4" style={{ color: GOLD }} />
                Generate QR Code
              </button>
            )}
          </div>

          {/* Embed on Website */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: MUTED }}>Embed on Website</label>
            <div className="flex gap-1 p-1 rounded-lg mb-3" style={{ backgroundColor: LIGHT_BG }}>
              <button onClick={() => setEmbedMode("single")} className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all" style={{ backgroundColor: embedMode === "single" ? "white" : "transparent", color: embedMode === "single" ? TEXT_DARK : MUTED, boxShadow: embedMode === "single" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                Single Job
              </button>
              <button onClick={() => setEmbedMode("all")} className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all" style={{ backgroundColor: embedMode === "all" ? "white" : "transparent", color: embedMode === "all" ? TEXT_DARK : MUTED, boxShadow: embedMode === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                All Jobs
              </button>
            </div>
            <pre className="px-3 py-2.5 rounded-lg text-xs font-mono overflow-x-auto mb-2" style={{ backgroundColor: LIGHT_BG, border: `1px solid ${BORDER}`, color: TEXT_DARK, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{embedCode}</pre>
            <button onClick={() => copyToClipboard(embedCode, "embed")} className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5" style={{ border: `1px solid ${BORDER}`, color: TEXT_DARK, backgroundColor: "white" }}>
              {copiedField === "embed" ? <Check className="w-4 h-4" style={{ color: GOLD }} /> : <Copy className="w-4 h-4" />}
              {copiedField === "embed" ? "Copied!" : "Copy Embed Code"}
            </button>
            <p className="text-xs mt-2" style={{ color: MUTED }}>Applications submitted through the embed go through Arriv's standard application flow.</p>
          </div>

          {/* AI Share Content */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>AI Share Content</label>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {aiOptions.map(opt => (
                <button key={opt.key} onClick={() => generateAIContent(opt.key)} disabled={aiLoading !== null} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50" style={{ border: `1px solid ${BORDER}`, color: TEXT_DARK, backgroundColor: "white" }}>
                  {aiLoading === opt.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: GOLD }} /> : <Sparkles className="w-3.5 h-3.5" style={{ color: GOLD }} />}
                  {opt.label}
                </button>
              ))}
            </div>
            {aiContent && (
              <div>
                <textarea readOnly value={aiContent} className="w-full px-3 py-2.5 rounded-lg text-sm resize-none" style={{ backgroundColor: LIGHT_BG, border: `1px solid ${BORDER}`, color: TEXT_DARK, minHeight: "120px" }} />
                <button onClick={() => copyToClipboard(aiContent, "ai")} className="mt-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5" style={{ border: `1px solid ${BORDER}`, color: TEXT_DARK, backgroundColor: "white" }}>
                  {copiedField === "ai" ? <Check className="w-4 h-4" style={{ color: GOLD }} /> : <Copy className="w-4 h-4" />}
                  {copiedField === "ai" ? "Copied!" : "Copy Content"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}