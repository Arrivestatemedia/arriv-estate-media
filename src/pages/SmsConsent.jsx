import React from "react";

export default function SmsConsent() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png"
            alt="Arriv Estate Media"
            className="h-10 mx-auto mb-6"
          />
          <h1 className="text-3xl font-bold text-[#1A1A1A]">SMS Messaging Consent</h1>
          <p className="text-[#1A1A1A]/60 mt-2 text-sm">Arriv Estate Media LLC</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#B8956A]/20 shadow-sm p-6 md:p-8 space-y-6">

          <section>
            <p className="text-[#1A1A1A]/80 leading-relaxed">
              <strong>Arriv Estate Media LLC</strong> sends transactional SMS notifications to clients who create an account and request services through the Arriv Estate Media platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3">Messages may include:</h2>
            <ul className="space-y-2">
              {[
                "Booking confirmations",
                "Scheduling updates",
                "Arrival notifications",
                "Job completion notifications",
                "Invoice notifications",
                "Payment reminders",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-[#1A1A1A]/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B8956A] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <hr className="border-[#B8956A]/15" />

          <section>
            <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3">How users opt in</h2>
            <p className="text-[#1A1A1A]/80 leading-relaxed mb-3">
              Clients opt in by selecting an optional SMS consent checkbox during account creation at:
            </p>
            <a
              href="https://app.arrivestatemedia.com/clientsignup"
              className="text-[#B8956A] hover:underline break-all text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://app.arrivestatemedia.com/clientsignup
            </a>
            <p className="text-[#1A1A1A]/80 leading-relaxed mt-3">
              The checkbox appears on the signup form and is <strong>not pre-checked</strong>. Users must manually select it to opt in.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#1A1A1A] mb-2">The checkbox language reads:</h2>
            <blockquote className="bg-[#B8956A]/5 border-l-4 border-[#B8956A] rounded-r-lg p-4 text-sm text-[#1A1A1A]/70 italic leading-relaxed">
              "I would like to receive optional SMS updates from Arriv Estate Media LLC about my bookings (confirmations, scheduling updates, arrival notifications, job completion notices, invoices, and payment reminders). Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help."
            </blockquote>
          </section>

          <hr className="border-[#B8956A]/15" />

          <section className="space-y-3 text-[#1A1A1A]/80 leading-relaxed">
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

          <hr className="border-[#B8956A]/15" />

          <section>
            <p className="text-sm text-[#1A1A1A]/60">
              For support, contact{" "}
              <a href="mailto:support@arrivestatemedia.com" className="text-[#B8956A] hover:underline">
                support@arrivestatemedia.com
              </a>
            </p>
          </section>

        </div>

        <p className="text-center text-xs text-[#1A1A1A]/40 mt-8">
          © {new Date().getFullYear()} Arriv Estate Media LLC. All rights reserved.
        </p>
      </div>
    </div>
  );
}