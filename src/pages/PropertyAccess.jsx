import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Key,
  ExternalLink,
  Smartphone,
  Mail,
  Clock,
  Bluetooth,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  SENTRILOCK_ACCESS_GUIDE_URL,
  SUPRA_ACCESS_GUIDE_URL,
  SENTRICONNECT_IOS_URL,
  SENTRICONNECT_ANDROID_URL,
} from "@/lib/propertyAccessProvider";

function SentriConnectSection() {
  return (
    <Card className="border-2 border-[#B8956A]/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Key className="w-6 h-6 text-[#B8956A]" />
          </div>
          <div>
            <CardTitle className="text-xl text-[#1A1A1A]">SentriConnect Access</CardTitle>
            <p className="text-sm text-[#1A1A1A]/60 mt-1">
              For DMV properties (DC, Maryland, Virginia)
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-[#1A1A1A]/70 leading-relaxed">
          Temporary SentriLock property access for your Arriv Estate Media appointments.
          SentriConnect allows listing agents to grant Arriv Media Specialists temporary
          access to compatible SentriLock lockboxes.
        </p>

        {/* Before Your First Job */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide">
            Before Your First SentriLock Job
          </h3>
          <div className="bg-[#FFFBF5] rounded-lg p-4 space-y-2">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#B8956A] text-white text-xs font-bold flex items-center justify-center">1</span>
              <p className="text-sm text-[#1A1A1A]/80">Install SentriConnect (links below).</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#B8956A] text-white text-xs font-bold flex items-center justify-center">2</span>
              <p className="text-sm text-[#1A1A1A]/80">
                Register using the <strong>same email address</strong> associated with your
                Arriv Estate Media account.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#B8956A] text-white text-xs font-bold flex items-center justify-center">3</span>
              <p className="text-sm text-[#1A1A1A]/80">Complete account activation if prompted.</p>
            </div>
          </div>
        </div>

        {/* When You Receive Access */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide">
            When You Receive Access
          </h3>
          <div className="bg-[#FFFBF5] rounded-lg p-4 space-y-2 text-sm text-[#1A1A1A]/80">
            <p>The listing agent grants temporary access to your Arriv email address.</p>
            <p>The authorization becomes available through SentriConnect for the approved access window.</p>
          </div>
        </div>

        {/* At the Property */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide">
            At the Property
          </h3>
          <div className="bg-[#FFFBF5] rounded-lg p-4 space-y-2 text-sm text-[#1A1A1A]/80">
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Open SentriConnect.</span></div>
            <div className="flex gap-2"><Bluetooth className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Confirm Bluetooth is enabled.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Select the available property/access.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Follow SentriConnect instructions.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Press ENT on the compatible SentriLock lockbox when prompted.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Complete the lockbox access.</span></div>
          </div>
        </div>

        {/* After the Shoot */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide">
            After the Shoot
          </h3>
          <div className="bg-[#FFFBF5] rounded-lg p-4 space-y-2 text-sm text-[#1A1A1A]/80">
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Return the key.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Close the key compartment.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Confirm the lockbox is secure.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Secure the property.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-0.5" /><span>Continue the normal Arriv Estate Media job-completion workflow.</span></div>
          </div>
        </div>

        {/* Availability note */}
        <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-900">
            SentriConnect availability depends on the listing agent's Association and
            compatible SentriLock equipment/configuration. The lockbox must be assigned
            appropriately to the listing. If the agent does not see "Grant SentriConnect
            Access," they should use another access method supported by their
            SentriLock system/Association or contact the appropriate association/SentriLock
            support. Arriv does not block a job if SentriConnect is unavailable — the agent
            may arrange another authorized method of entry.
          </p>
        </div>

        {/* Download buttons */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#B8956A]" />
            Get SentriConnect
          </h3>
          <a
            href={SENTRICONNECT_IOS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Download for iOS
          </a>
          <a
            href={SENTRICONNECT_ANDROID_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Download for Android
          </a>
        </div>

        {/* Guide link */}
        <div>
          <a
            href={SENTRILOCK_ACCESS_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            View SentriLock Access Guide
          </a>
        </div>

        {/* Onboarding callout */}
        <div className="border border-[#B8956A]/30 rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide">
            Property Access — DMV
          </h3>
          <p className="text-sm text-[#1A1A1A]/70">
            Arriv Estate Media uses SentriConnect for temporary access to many
            SentriLock-equipped properties in DC, Maryland and Virginia.
          </p>
          <p className="text-sm text-[#1A1A1A]/70">
            Before accepting or performing these appointments:
          </p>
          <ol className="text-sm text-[#1A1A1A]/80 space-y-1 ml-4 list-decimal">
            <li>Install SentriConnect.</li>
            <li>Register using the same email address associated with your Arriv Estate Media account.</li>
            <li>Keep the app available on your phone for property-access assignments.</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

function SupraSection() {
  return (
    <Card className="border-2 border-[#B8956A]/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Key className="w-6 h-6 text-[#B8956A]" />
          </div>
          <div>
            <CardTitle className="text-xl text-[#1A1A1A]">Supra eKey Access</CardTitle>
            <p className="text-sm text-[#1A1A1A]/60 mt-1">
              For existing Supra markets (outside DC/MD/VA)
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-[#1A1A1A]/70">
          Download the Supra eKey app to access your keys for properties in existing Supra markets.
        </p>

        <div className="flex flex-col gap-3">
          <a
            href="https://apps.apple.com/us/app/supra-ekey/id379909266"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Download for iOS
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.utc.fs.ekey&hl=en_IN"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Download for Android
          </a>
        </div>

        <div>
          <a
            href={SUPRA_ACCESS_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            View Supra Access Guide
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PropertyAccess() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 w-16 h-16 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Key className="w-8 h-8 text-[#B8956A]" />
          </div>
          <h1 className="text-2xl font-serif text-[#1A1A1A]">Property Access</h1>
          <p className="text-sm text-[#1A1A1A]/60 mt-2">
            Property-access provider is determined by the job's property location.
            DMV (DC, Maryland, Virginia) uses SentriLock/SentriConnect. All other
            markets use Supra/eKey.
          </p>
        </div>

        <SentriConnectSection />
        <SupraSection />
      </div>
    </div>
  );
}