import React from "react";

export default function Terms() {
  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-2" style={{ color: '#1A1A1A' }}>📄 Terms & SMS Terms of Service</h1>
          <p className="text-lg font-semibold" style={{ color: '#B8956A' }}>Arriv Estate Media LLC</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.5)' }}>Last Updated: Feb 21, 2026</p>
        </div>

        <p className="mb-8 leading-relaxed" style={{ color: 'rgba(26,26,26,0.8)' }}>
          These Terms govern your use of Arriv Estate Media's services and communications.
        </p>

        <Section title="Use of Services">
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>
            Arriv Estate Media provides real estate media and related services. SMS communications are used strictly for internal business operations with authorized personnel, including employees and independent contractors.
          </p>
        </Section>

        <Section title="SMS Messaging Terms">
          <p className="mb-3" style={{ color: 'rgba(26,26,26,0.8)' }}>
            By providing your phone number, you consent to receive SMS messages related to:
          </p>
          <ul className="space-y-2 pl-4 mb-4">
            {["Job assignments", "Scheduling updates", "Operational notices", "Administrative communications"].map((item) => (
              <li key={item} className="flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#B8956A' }} />
                {item}
              </li>
            ))}
          </ul>
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>Message frequency varies.</p>
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>Message and data rates may apply.</p>
        </Section>

        <Section title="Opt-Out Instructions">
          <p className="mb-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
            You may opt out of SMS messages at any time by replying <strong>STOP</strong>.
          </p>
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>
            For assistance, reply <strong>HELP</strong> or contact{" "}
            <a href="mailto:support@arrivestatemedia.com" className="underline font-medium" style={{ color: '#B8956A' }}>
              support@arrivestatemedia.com
            </a>.
          </p>
        </Section>

        <Section title="Consent">
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>
            Consent to receive SMS messages is obtained during onboarding, contractual agreement, or written authorization prior to message delivery.
          </p>
        </Section>

        <Section title="Prohibited Use">
          <p className="mb-3" style={{ color: 'rgba(26,26,26,0.8)' }}>SMS messaging is not used for:</p>
          <ul className="space-y-2 pl-4">
            {["Marketing or promotional campaigns", "Public advertising", "Lead generation"].map((item) => (
              <li key={item} className="flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#B8956A' }} />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Limitation of Liability">
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>
            Arriv Estate Media is not responsible for delays or failures in message delivery caused by mobile carriers or third-party service providers.
          </p>
        </Section>

        <Section title="Contact Information">
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>
            For questions regarding these Terms or SMS communications, contact:{" "}
            <a href="mailto:support@arrivestatemedia.com" className="underline font-medium" style={{ color: '#B8956A' }}>
              support@arrivestatemedia.com
            </a>
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-3 pb-2 border-b" style={{ color: '#1A1A1A', borderColor: 'rgba(184,149,106,0.3)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}