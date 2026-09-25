import React, { useState } from "react";
import { useStudioEntitlement } from "@/hooks/useStudioEntitlement";
import StudioShell from "@/components/studio/StudioShell";
import StudioDashboard from "@/components/studio/StudioDashboard";
import StudioNewProduction from "@/components/studio/StudioNewProduction";
import StudioProjectDetail from "@/components/studio/StudioProjectDetail";
import StudioPlans from "@/components/studio/StudioPlans";
import StudioEmbeddedEditor from "@/components/studio/StudioEmbeddedEditor";
import StudioProjects from "@/components/studio/StudioProjects";
import StudioBrandKits from "@/components/studio/StudioBrandKits";
import StudioLibraries from "@/components/studio/StudioLibraries";
import StudioUsage from "@/components/studio/StudioUsage";
import StudioSettings from "@/components/studio/StudioSettings";
import StudioFlyers from "@/components/flyer/StudioFlyers";
import StudioLogo from "@/components/studio/StudioLogo";
import { Loader2 } from "lucide-react";

// StudioWorkspace — native Arriv Studio for Real Estate experience inside Estate Media.
// CONDITIONAL: only accessible when the customer has an active Studio entitlement.
//
// Architecture:
// - Estate Media owns: customer, property, booking, order, deliverables
// - Studio backend owns: StudioProject, CreativeBrief, scripts, production data
// - Estate Media embeds Studio via SSO iframe for heavy editing (script, storyboard, production)
// - Dashboard, New Production wizard, and Project Detail are native UI matching canonical Studio
export default function StudioWorkspace() {
  const { entitlement, loading, refresh } = useStudioEntitlement();
  const [section, setSection] = useState("dashboard");
  const [projectData, setProjectData] = useState(null);
  const [editorSection, setEditorSection] = useState(null);

  const handleStartProject = (ctx) => {
    if (ctx?.mode === "new_production") {
      setProjectData(null);
      setSection("new_production");
    } else if (ctx?.mode === "from_booking") {
      // Pre-fill wizard with booking data
      setProjectData({
        projectName: ctx.propertyAddress ? `${ctx.propertyAddress} Video` : "",
        sourceProduct: "Estate Media Booking",
        industryContext: "Real estate",
      });
      setSection("new_production");
    }
  };

  const handleCreateProject = (formData) => {
    setProjectData(formData);
    setSection("project_detail");
    refresh();
  };

  const handleCancelWizard = () => {
    setSection("dashboard");
  };

  const handleBackToDashboard = () => {
    setSection("dashboard");
    setProjectData(null);
  };

  const handleLaunchStudio = (ctx) => {
    setEditorSection(ctx?.section || "projects");
    setSection("editor");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ background: "#0f0f0f", minHeight: "60vh" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#FF5A4F" }} />
      </div>
    );
  }

  // No active entitlement — show purchase options
  if (!entitlement?.active) {
    return (
      <div className="min-h-screen" style={{ background: "#0f0f0f", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
        <div className="border-b" style={{ borderColor: "#2d2d2d" }}>
          <div className="max-w-6xl mx-auto px-4 py-3">
            <StudioLogo size={32} />
          </div>
        </div>
        <StudioPlans onSubscribed={refresh} />
      </div>
    );
  }

  // Editor view — Studio iframe for heavy editing
  if (section === "editor") {
    return (
      <StudioShell entitlement={entitlement} activeSection="projects" onSectionChange={(s) => { setSection(s); setEditorSection(null); }}>
        <StudioEmbeddedEditor
          section={editorSection}
          projectContext={projectData ? { bookingId: projectData.bookingId, templateId: projectData.templateId } : null}
          onExit={() => { setSection(projectData ? "project_detail" : "dashboard"); setEditorSection(null); }}
        />
      </StudioShell>
    );
  }

  // New Production wizard — full screen (no sidebar)
  if (section === "new_production") {
    return (
      <div style={{ background: "#0f0f0f", minHeight: "calc(100vh - 64px)" }}>
        <StudioNewProduction
          project={projectData}
          onCreate={handleCreateProject}
          onCancel={handleCancelWizard}
        />
      </div>
    );
  }

  // Project Detail — full screen with tabs (no sidebar, has its own back nav)
  if (section === "project_detail") {
    return (
      <div style={{ background: "#0f0f0f", minHeight: "calc(100vh - 64px)" }}>
        <StudioProjectDetail
          project={projectData}
          onBack={handleBackToDashboard}
          onLaunchStudio={handleLaunchStudio}
        />
      </div>
    );
  }

  // Canonical Studio shell with sidebar navigation
  return (
    <StudioShell entitlement={entitlement} activeSection={section} onSectionChange={setSection}>
      {section === "dashboard" && (
        <StudioDashboard
          entitlement={entitlement}
          onStartProject={handleStartProject}
          onNavigate={setSection}
        />
      )}
      {section === "projects" && (
        <StudioProjects onStartProject={handleStartProject} />
      )}
      {section === "flyers" && (
        <StudioFlyers />
      )}
      {section === "brand_kits" && (
        <StudioBrandKits />
      )}
      {section === "libraries" && (
        <StudioLibraries />
      )}
      {section === "usage" && (
        <StudioUsage entitlement={entitlement} onRefresh={refresh} />
      )}
      {section === "settings" && (
        <StudioSettings
          entitlement={entitlement}
          onManageSubscription={() => setSection("usage")}
        />
      )}
    </StudioShell>
  );
}