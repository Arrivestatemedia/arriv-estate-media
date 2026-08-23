import React from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { useSupport } from "./SupportProvider";
import AgentAvatar from "./AgentAvatar";

export default function SupportBubble() {
  const { open, setOpen, startSupport, available, conversation, messages } = useSupport();

  // Don't render on marketing/auth pages — adjust these routes for your app
  const path = window.location.pathname;
  if (path === "/" || path === "/SignIn" || path === "/SalesLogin" || path === "/ClientSignup" || path === "/MediaPartnerSignup" || path === "/ContractorSignup") return null;

  if (open) return null; // panel shows instead

  const agentInitial = conversation?.agent_avatar_initial || "A";

  return (
    <button
      onClick={() => startSupport()}
      aria-label="Open Arriv Assist support"
      className="fixed z-[60] bottom-4 left-4 md:bottom-6 md:left-6 flex items-center justify-center w-14 h-14 rounded-full bg-[#B8956A] text-white shadow-lg hover:bg-[#A68559] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8956A] focus-visible:ring-offset-2"
      style={{ marginBottom: "env(safe-area-inset-bottom)", marginLeft: "env(safe-area-inset-left)" }}
    >
      {!available ? (
        <LifeBuoy className="w-6 h-6 opacity-60" />
      ) : conversation ? (
        <>
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white z-10" aria-hidden="true" />
          <AgentAvatar
            avatarUrl={conversation?.agent_avatar_url}
            avatarInitial={agentInitial}
            className="w-full h-full flex items-center justify-center text-xl font-semibold"
          />
        </>
      ) : (
        <>
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white" aria-hidden="true" />
          <MessageCircle className="w-6 h-6" />
        </>
      )}
    </button>
  );
}