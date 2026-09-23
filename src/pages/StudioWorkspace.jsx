import React, { useState, useEffect } from "react";
import { useStudioEntitlement } from "@/hooks/useStudioEntitlement";
import StudioHome from "@/components/studio/StudioHome";
import StudioPlans from "@/components/studio/StudioPlans";
import StudioEmbeddedEditor from "@/components/studio/StudioEmbeddedEditor";
import { Loader2, Film } from "lucide-react";

// StudioWorkspace — the native Arriv Studio for Real Estate experience inside Estate Media.
// CONDITIONAL: only accessible when the customer has an active Studio entitlement.
// The Studio tab in bottom navigation is hidden until entitlement is active.
//
// Architecture:
// - Estate Media owns: customer, property, booking, order, deliverables
// - Studio backend owns: StudioProject, CreativeBrief, scripts, production data
// - Estate Media embeds Studio via SSO iframe — no redirect, no second login
export default function StudioWorkspace() {
  const { entitlement, loading, refresh } = useStudioEntitlement();
  const [projectContext, setProjectContext] = useState(null);

  const handleStartProject = (ctx) => {
    setProjectContext(ctx);
  };

  const handleExitEditor = () => {
    setProjectContext(null);
    refresh();
  };

  const handleSubscribed = () => {
    refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ background: "#111111", minHeight: "60vh" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#FF5A4F" }} />
      </div>
    );
  }

  // No active entitlement — show purchase options (discovery is allowed, access is not)
  if (!entitlement?.active) {
    return (
      <div className="min-h-screen" style={{ background: "#FAF8F5" }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ background: "#111111", borderColor: "rgba(255,90,79,0.2)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)" }}>
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold" style={{ color: "#FAF8F5" }}>Arriv Studio</span>
        </div>
        <StudioPlans onSubscribed={handleSubscribed} />
      </div>
    );
  }

  // Active entitlement — show full Studio experience
  if (projectContext) {
    return (
      <StudioEmbeddedEditor
        projectContext={projectContext}
        onExit={handleExitEditor}
      />
    );
  }

  return <StudioHome entitlement={entitlement} onStartProject={handleStartProject} />;
}