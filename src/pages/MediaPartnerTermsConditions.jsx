import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function MediaPartnerTermsConditions() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const contentRef = useRef(null);

  const handleScroll = () => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      setIsScrolled(isAtBottom);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="sticky top-0 z-10 bg-[#1A1A1A] border-b border-[#B8956A]/20 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-[#FFFBF5]">Media Partner Terms & Conditions</h1>
        </div>
      </div>

      <div className="flex flex-col h-screen">
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          <div className="max-w-4xl mx-auto p-6 space-y-6 text-[#1A1A1A]">
            <div>
              <h2 className="text-2xl font-bold mb-2">ARRIV Estate Media LLC</h2>
              <h3 className="text-lg font-semibold">Media Partner Terms & Conditions</h3>
            </div>

            <section className="space-y-4">
              <div>
                <h4 className="text-lg font-bold mb-2">1. Independent Contractor Relationship</h4>
                <p className="text-[#1A1A1A]/80">
                  Media Partners are independent contractors and not employees, agents, or representatives of ARRIV Estate Media LLC ("ARRIV"). Nothing in this Agreement shall be construed to create an employer–employee relationship, partnership, or joint venture.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">2. Scope of Engagement</h4>
                <p className="text-[#1A1A1A]/80">
                  Media Partners may be engaged to provide photography, videography, aerial, or related media services for real estate listings scheduled through ARRIV Estate Media LLC. All assignments, instructions, timelines, and deliverables are provided by ARRIV Estate Media LLC and may be modified at its discretion.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">3. Property Access & Conduct</h4>
                <p className="text-[#1A1A1A]/80 mb-3">
                  Media Partners are granted temporary, limited access to properties solely for the purpose of completing assigned services.
                </p>
                <p className="text-[#1A1A1A]/80 font-semibold mb-2">Media Partners shall not:</p>
                <ul className="list-disc list-inside space-y-2 text-[#1A1A1A]/80">
                  <li>Retain, reuse, or share access credentials</li>
                  <li>Access properties outside the approved time window</li>
                  <li>Contact listing agents, sellers, or occupants unless explicitly authorized by ARRIV Estate Media LLC</li>
                </ul>
                <p className="text-[#1A1A1A]/80 mt-3">
                  Any access issues must be reported immediately to ARRIV Estate Media LLC.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">4. Non-Circumvention & Non-Solicitation</h4>
                <p className="text-[#1A1A1A]/80 mb-2">
                  Media Partners agree not to directly or indirectly:
                </p>
                <ul className="list-disc list-inside space-y-2 text-[#1A1A1A]/80 mb-3">
                  <li>Solicit business from ARRIV Estate Media LLC clients</li>
                  <li>Accept direct payment from ARRIV Estate Media LLC clients</li>
                  <li>Use client information for personal or third-party benefit</li>
                </ul>
                <p className="text-[#1A1A1A]/80">
                  This restriction applies during the term of engagement and for twelve (12) months following the last assignment.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">5. Confidential Information</h4>
                <p className="text-[#1A1A1A]/80">
                  All client data, pricing, workflows, access details, and internal systems are confidential. Media Partners shall not disclose or use such information outside ARRIV Estate Media LLC assignments.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">6. Equipment, Licensing & Compliance</h4>
                <p className="text-[#1A1A1A]/80 mb-2">
                  Media Partners are solely responsible for:
                </p>
                <ul className="list-disc list-inside space-y-2 text-[#1A1A1A]/80 mb-3">
                  <li>Their equipment and backups</li>
                  <li>Required licenses, certifications, and permits</li>
                  <li>Compliance with all applicable laws and regulations (including FAA Part 107, where required)</li>
                </ul>
                <p className="text-[#1A1A1A]/80">
                  ARRIV Estate Media LLC assumes no responsibility for equipment loss, damage, or operational failure.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">7. Quality Standards & Deliverables</h4>
                <p className="text-[#1A1A1A]/80">
                  All deliverables must meet ARRIV Estate Media LLC's technical and brand standards. ARRIV Estate Media LLC reserves the right to request revisions, corrections, or withhold payment for incomplete or non-compliant work.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">8. Compensation</h4>
                <p className="text-[#1A1A1A]/80">
                  Compensation terms are communicated per assignment. Payment is issued only after satisfactory delivery and approval. Media Partners are responsible for all applicable taxes and fees.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">9. Termination</h4>
                <p className="text-[#1A1A1A]/80">
                  ARRIV Estate Media LLC may suspend or terminate access to assignments at any time for violation of these terms or failure to meet expectations.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">10. Acceptance</h4>
                <p className="text-[#1A1A1A]/80">
                  By accepting assignments through ARRIV Estate Media LLC's platform, Media Partners acknowledge and agree to these Terms & Conditions. Continued use of the ARRIV platform constitutes acceptance of these terms.
                </p>
              </div>
            </section>

            <div className="h-8" />
          </div>
        </div>

        {!isScrolled && (
          <div className="sticky bottom-0 bg-[#FFFBF5] border-t border-[#B8956A]/20 p-4">
            <div className="max-w-4xl mx-auto text-center text-[#1A1A1A]/60 text-sm">
              Please scroll to the bottom to continue
            </div>
          </div>
        )}
      </div>
    </div>
  );
}