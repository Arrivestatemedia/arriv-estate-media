import React from "react";

export default function SmsConsent() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png"
            alt="Arriv"
            className="h-10 mx-auto mb-6"
          />
          <h1 className="text-2xl font-bold text-[#1A1A1A]">SMS Messaging Consent</h1>
          <p className="text-sm text-[#1A1A1A]/50 mt-1">Arriv Estate Media LLC</p>
        </div>

        <div className="bg-white border border-[#B8956A]/20 rounded-xl p-6 md:p-8 space-y-6 text-[#1A1A1A]">

          <section>
            <p className="text-sm leading-relaxed text-[#1A1A1A]/80">
              <strong>Arriv Estate Media LLC</strong> sends transactional SMS notifications to clients who create an account and request services through the Arriv Estate Media platform.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">Messages may include:</h2>
            <ul className="space-y-2 text-sm text-[#1A1A1A]/80">
              {[
                "Booking confirmations",
                "Scheduling updates",
                "Arrival notifications",
                "Job completion notifications",
                "Invoice notifications",
                "Payment reminders",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-[#B8956A] mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">How users opt in</h2>
            <p className="text-sm text-[#1A1A1A]/80 leading-relaxed mb-3">
              Clients opt in by selecting an optional SMS consent checkbox during account creation at:
            </p>
            <a
              href="https://app.arrivestatemedia.com/clientsignup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#B8956A] hover:underline break-all"
            >
              https://app.arrivestatemedia.com/clientsignup
            </a>
            <p className="text-sm text-[#1A1A1A]/80 leading-relaxed mt-3">
              The checkbox appears on the signup form and is <strong>not pre-checked</strong>. Users must manually select it to opt in.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">Checkbox language</h2>
            <blockquote className="border-l-4 border-[#B8956A]/40 pl-4 text-sm text-[#1A1A1A]/70 italic leading-relaxed bg-[#B8956A]/5 py-3 pr-3 rounded-r-lg">
              "I would like to receive optional SMS updates from Arriv Estate Media LLC about my bookings (confirmations, scheduling updates, arrival notifications, job completion notices, invoices, and payment reminders). Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help."
            </blockquote>
          </section>

          <section className="space-y-2 text-sm text-[#1A1A1A]/80 leading-relaxed">
            <p>
              SMS consent is <strong>not required</strong> to create an account or use Arriv Estate Media services.
            </p>
            <p>
              Users may opt out at any time by replying <strong>STOP</strong> to any SMS message.
            </p>
            <p>
              For assistance, users can reply <strong>HELP</strong>.
            </p>
          </section>

          <div className="border-t border-[#B8956A]/20 pt-4 text-xs text-[#1A1A1A]/40">
            © {new Date().getFullYear()} Arriv Estate Media LLC. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}