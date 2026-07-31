import React from "react";
import ApplicantPortalPanel from "@/components/hireiq/ApplicantPortalPanel";

export default function ApplicationPortal() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Application Portal</h1>
          <p className="text-[var(--text-secondary)] mt-1">Check your status and update your documents</p>
        </div>
        <ApplicantPortalPanel />
      </div>
    </div>
  );
}