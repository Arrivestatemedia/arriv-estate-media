import React, { useState, useEffect } from "react";
import BenefitsOverview from "@/components/benefits/BenefitsOverview";
import OpenEnrollmentPanel from "@/components/benefits/OpenEnrollmentPanel";
import TotalCompensationPanel from "@/components/benefits/TotalCompensationPanel";
import LifeEventPanel from "@/components/benefits/LifeEventPanel";
import ReimbursementPanel from "@/components/benefits/ReimbursementPanel";
import BenefitsAiAssistant from "@/components/benefits/BenefitsAiAssistant";
import BenefitsNotificationBanner from "@/components/benefits/BenefitsNotificationBanner";

export default function Benefits() {
  const [salesMemberId, setSalesMemberId] = useState(null);

  useEffect(() => {
    const id = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
    setSalesMemberId(id);
  }, []);

  if (!salesMemberId) {
    return <div className="p-8 text-center text-slate-400">Unable to identify your employee record. Please log in.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <BenefitsNotificationBanner salesMemberId={salesMemberId} />
      <BenefitsOverview salesMemberId={salesMemberId} />
      <OpenEnrollmentPanel salesMemberId={salesMemberId} />
      <TotalCompensationPanel salesMemberId={salesMemberId} />
      <ReimbursementPanel salesMemberId={salesMemberId} />
      <LifeEventPanel salesMemberId={salesMemberId} />
      <BenefitsAiAssistant salesMemberId={salesMemberId} />
    </div>
  );
}