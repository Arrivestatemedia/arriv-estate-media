import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ClientTermsConditions() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        const element = contentRef.current;
        const isAtBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 10;
        setIsScrolled(isAtBottom);
        if (isAtBottom) {
          localStorage.setItem('clientTermsScrolled', 'true');
        }
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener("scroll", handleScroll);
      return () => content.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col">
      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b border-[#B8956A]/20 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem('clientTermsScrolled');
                navigate(-1);
              }}
              className="text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold text-[#FFFBF5]">
              Terms & Conditions
            </h1>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-6 py-8"
        >
          <div className="max-w-4xl mx-auto prose prose-sm max-w-none text-[#1A1A1A]">
            <h1 className="text-2xl font-bold mb-6">
              ARRIV Estate Media LLC
              <br />
              Client Terms & Conditions
            </h1>

            <h2 className="text-lg font-bold mt-6 mb-3">1. Services</h2>
            <p>
              ARRIV Estate Media LLC provides real estate media services including photography, video, aerial
              imagery, and related deliverables as booked through ARRIV Estate Media LLC's platform or direct
              scheduling.
            </p>

            <h2 className="text-lg font-bold mt-6 mb-3">2. Booking & Scheduling</h2>
            <p>
              All bookings are subject to availability. Clients are responsible for ensuring timely property access
              and readiness. ARRIV Estate Media LLC is not responsible for delays caused by access issues,
              property conditions, or third-party systems.
            </p>

            <h2 className="text-lg font-bold mt-6 mb-3">3. Property Access Authorization</h2>
            <p>
              Clients authorize ARRIV Estate Media LLC and its Media Partners to access the property for the
              limited purpose of performing the booked services.
            </p>

            <h2 className="text-lg font-bold mt-6 mb-3">4. Pricing & Payment</h2>
            <p>
              Pricing is determined at the time of booking. Complimentary or discounted services do not establish
              an obligation for future free or reduced-rate services.
            </p>

            <h2 className="text-lg font-bold mt-6 mb-3">5. Media Delivery</h2>
            <p>
              Media is delivered digitally. Delivery timelines are estimates and not guaranteed. Clients are
              responsible for downloading and archiving delivered files.
            </p>

            <h2 className="text-lg font-bold mt-6 mb-3">6. Usage Rights</h2>
            <p>
              ARRIV Estate Media LLC grants Clients a non-exclusive, non-transferable license to use delivered
              media for marketing and listing purposes. ARRIV Estate Media LLC retains the right to use media
              for portfolio, promotional, and educational purposes unless otherwise agreed in writing.
            </p>

            <h2 className="text-lg font-bold mt-6 mb-3">7. Revisions</h2>
            <p>
              Reasonable revision requests are included when submitted promptly. Additional services or
              reshoots may incur additional fees.
            </p>

            <h2 className="text-lg font-bold mt-6 mb-3">8. Limitation of Liability</h2>
            <p>
              ARRIV Estate Media LLC is not responsible for third-party platform issues, listing performance, or
              outcomes related to the use of delivered media.
            </p>

            <h2 className="text-lg font-bold mt-6 mb-3">9. Cancellations</h2>
            <p>
              Cancellations or reschedules may be subject to fees if insufficient notice is provided or if resources
              have already been allocated.
            </p>

            <h2 className="text-lg font-bold mt-6 mb-3">10. Acceptance</h2>
            <p>
              By booking services with ARRIV Estate Media LLC, Clients agree to these Terms & Conditions.
              Continued use of the ARRIV platform constitutes acceptance of these terms.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-[#FFFBF5] border-t border-[#B8956A]/20 p-4">
          {!isScrolled ? (
            <div className="max-w-4xl mx-auto text-center text-[#1A1A1A]/60 text-sm">
              Please scroll to the bottom to continue
            </div>
          ) : (
            <div className="max-w-4xl mx-auto flex justify-center">
              <Button
                onClick={() => navigate(-1)}
                className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white gap-2"
              >
                <X className="w-5 h-5" />
                Back to Sign Up
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}