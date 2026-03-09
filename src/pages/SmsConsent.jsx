import React from "react";

export default function SmsConsent() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png"
            alt="Arriv Estate Media LLC"
            className="h-10 mb-6"
          />
          <h1 className="text-3xl font-bold text-[#1A1A1A]">SMS Consent – Arriv Estate Media LLC</h1>
        </div>

        <div className="space-y-6 text-[#1A1A1A]/80 text-base leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-[#1A1A1A] mb-2">SMS Messaging Consent</h2>
            <p>
              <strong>Arriv Estate Media LLC</strong> sends transactional SMS notifications to clients who create an account and request services through the Arriv Estate Media platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A1A1A] mb-2">Messages may include:</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Booking confirmations</li>
              <li>Scheduling updates</li>
              <li>Arrival notifications</li>
              <li>Job completion notifications</li>
              <li>Invoice notifications</li>
              <li>Payment reminders</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A1A1A] mb-2">How users opt in</h2>
            <p>
              Clients opt in by selecting an optional SMS consent checkbox during account creation at:
            </p>
            <a
              href="https://app.arrivestatemedia.com/clientsignup"
              className="text-[#B8956A] hover:underline break-all"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://app.arrivestatemedia.com/clientsignup
            </a>
            <p className="mt-3">
              The checkbox appears on the signup form and is <strong>not pre-checked</strong>. Users must manually select it to opt in.
            </p>
            <p className="mt-3">The checkbox language reads:</p>
            <blockquote className="mt-2 border-l-4 border-[#B8956A] pl-4 py-2 bg-[#B8956A]/5 rounded-r-lg text-sm italic text-[#1A1A1A]/70">
              "I would like to receive optional SMS updates from Arriv Estate Media LLC about my bookings (confirmations, scheduling updates, arrival notifications, job completion notices, invoices, and payment reminders). Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help."
            </blockquote>
          </section>

          <section>
            <p>
              SMS consent is <strong>not required</strong> to create an account or use Arriv Estate Media services.
            </p>
            <p className="mt-3">
              Users may opt out at any time by replying <strong>STOP</strong> to any SMS message.
            </p>
            <p className="mt-3">
              For assistance, users can reply <strong>HELP</strong>.
            </p>
          </section>

          <section className="border-t border-[#B8956A]/20 pt-6">
            <p className="text-sm text-[#1A1A1A]/50">
              For support, contact{" "}
              <a href="mailto:support@arrivestatemedia.com" className="text-[#B8956A] hover:underline">
                support@arrivestatemedia.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}