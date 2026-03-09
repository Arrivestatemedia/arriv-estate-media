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
        const isScrollable = element.scrollHeight > element.clientHeight;
        const isAtBottom = !isScrollable || (element.scrollHeight - element.scrollTop - element.clientHeight < 10);
        setIsScrolled(isAtBottom);
        if (isAtBottom) {
          localStorage.setItem('clientTermsScrolled', 'true');
        }
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener("scroll", handleScroll);
      handleScroll();
      return () => content.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="sticky top-0 z-10 bg-[#1A1A1A] border-b border-[#B8956A]/20 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
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
          <h1 className="text-xl font-bold text-[#FFFBF5]">Client Terms & Conditions</h1>
        </div>
      </div>

      <div className="flex flex-col h-screen">
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto"
        >
          <div className="max-w-4xl mx-auto p-6 space-y-6 text-[#1A1A1A]">
            <div>
              <h2 className="text-2xl font-bold mb-2">ARRIV Estate Media LLC</h2>
              <h3 className="text-lg font-semibold">Client Terms & Conditions</h3>
            </div>

            <section className="space-y-4">
              <div>
                <h4 className="text-lg font-bold mb-2">1. Services</h4>
                <p className="text-[#1A1A1A]/80">
                  ARRIV Estate Media LLC provides real estate media services including photography, video, aerial
                  imagery, and related deliverables as booked through ARRIV Estate Media LLC's platform or direct
                  scheduling.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">2. Booking & Scheduling</h4>
                <p className="text-[#1A1A1A]/80">
                  All bookings are subject to availability. Clients are responsible for ensuring timely property access
                  and readiness. ARRIV Estate Media LLC is not responsible for delays caused by access issues,
                  property conditions, or third-party systems.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">3. Property Access Authorization</h4>
                <p className="text-[#1A1A1A]/80">
                  Clients authorize ARRIV Estate Media LLC and its Media Partners to access the property for the
                  limited purpose of performing the booked services.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">4. Pricing & Payment</h4>
                <p className="text-[#1A1A1A]/80">
                  Pricing is determined at the time of booking. Complimentary or discounted services do not establish
                  an obligation for future free or reduced-rate services.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">5. Media Delivery</h4>
                <p className="text-[#1A1A1A]/80">
                  Media is delivered digitally. Delivery timelines are estimates and not guaranteed. Clients are
                  responsible for downloading and archiving delivered files.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">6. Usage Rights</h4>
                <p className="text-[#1A1A1A]/80">
                  ARRIV Estate Media LLC grants Clients a non-exclusive, non-transferable license to use delivered
                  media for marketing and listing purposes. ARRIV Estate Media LLC retains the right to use media
                  for portfolio, promotional, and educational purposes unless otherwise agreed in writing.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">7. Revisions</h4>
                <p className="text-[#1A1A1A]/80">
                  Reasonable revision requests are included when submitted promptly. Additional services or
                  reshoots may incur additional fees.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">8. Limitation of Liability</h4>
                <p className="text-[#1A1A1A]/80">
                  ARRIV Estate Media LLC is not responsible for third-party platform issues, listing performance, or
                  outcomes related to the use of delivered media.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">9. Cancellations</h4>
                <p className="text-[#1A1A1A]/80">
                  Cancellations or reschedules may be subject to fees if insufficient notice is provided or if resources
                  have already been allocated.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">10. Communications & Messaging</h4>
                <p className="text-[#1A1A1A]/80">
                  ARRIV Estate Media LLC may send clients email communications related to their account and bookings.
                </p>
                <p className="text-[#1A1A1A]/80 mt-3">
                  SMS/text message notifications are optional and are sent only if a client explicitly opts in. SMS messages may include booking confirmations, scheduling updates, media partner arrival notifications, job completion notices, invoice delivery, and payment reminders.
                </p>
                <p className="text-[#1A1A1A]/80 mt-3">
                  Message frequency varies. Message and data rates may apply.
                </p>
                <p className="text-[#1A1A1A]/80 mt-3">
                  Clients may opt out of SMS communications at any time by replying <strong>STOP</strong> to any message. For assistance, clients may reply <strong>HELP</strong>.
                </p>
                <p className="text-[#1A1A1A]/80 mt-3">
                  SMS consent is not required to create an account or request services.
                </p>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2">11. Acceptance</h4>
                <p className="text-[#1A1A1A]/80">
                  By booking services with ARRIV Estate Media LLC, Clients agree to these Terms & Conditions.
                  Continued use of the ARRIV platform constitutes acceptance of these terms.
                </p>
              </div>
            </section>

            <div className="h-8" />
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