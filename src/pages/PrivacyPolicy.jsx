import React from "react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-2" style={{ color: '#1A1A1A' }}>🔐 Privacy Policy</h1>
          <p className="text-lg font-semibold" style={{ color: '#B8956A' }}>Arriv Estate Media LLC</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.5)' }}>Last Updated: Feb 21, 2026</p>
        </div>

        <p className="mb-8 leading-relaxed" style={{ color: 'rgba(26,26,26,0.8)' }}>
          Arriv Estate Media LLC ("Arriv Estate Media," "we," "us," or "our") values your privacy and is committed to protecting personal information collected in connection with our business operations.
        </p>

        <Section title="Information We Collect">
          <p className="mb-3" style={{ color: 'rgba(26,26,26,0.8)' }}>
            We may collect the following information from employees, contractors, and authorized business partners:
          </p>
          <ul className="space-y-2 pl-4">
            {["Name", "Phone number", "Email address", "Business-related communications", "Job-related details necessary to perform contracted services"].map((item) => (
              <li key={item} className="flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#B8956A' }} />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="How We Use Information">
          <p className="mb-3" style={{ color: 'rgba(26,26,26,0.8)' }}>
            Information collected is used solely for internal business purposes, including:
          </p>
          <ul className="space-y-2 pl-4 mb-4">
            {[
              "Job assignments and scheduling",
              "Operational updates and notifications",
              "Service coordination and workflow communication",
              "Administrative and compliance purposes"
            ].map((item) => (
              <li key={item} className="flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#B8956A' }} />
                {item}
              </li>
            ))}
          </ul>
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>
            We do not use personal information for marketing purposes and do not sell or rent personal data to third parties.
          </p>
        </Section>

        <Section title="SMS Communications">
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>
            Phone numbers provided during onboarding or contractual agreement may be used to send work-related SMS messages. Message frequency varies based on job activity. Message and data rates may apply. Recipients may opt out at any time by replying <strong>STOP</strong>.
          </p>
        </Section>

        <Section title="Data Sharing">
          <p className="mb-3" style={{ color: 'rgba(26,26,26,0.8)' }}>
            We do not share personal information with third parties except:
          </p>
          <ul className="space-y-2 pl-4">
            {[
              "Service providers necessary to operate communications platforms (e.g., SMS delivery providers)",
              "When required by law or legal process"
            ].map((item) => (
              <li key={item} className="flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#B8956A' }} />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Data Security">
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>
            We implement reasonable administrative and technical safeguards to protect personal information from unauthorized access or disclosure.
          </p>
        </Section>

        <Section title="Your Rights">
          <p style={{ color: 'rgba(26,26,26,0.8)' }}>
            You may request access, correction, or deletion of your personal information by contacting us at:{" "}
            <a
              href="mailto:support@arrivestatemedia.com"
              className="font-medium underline"
              style={{ color: '#B8956A' }}
            >
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