import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";

const SECTIONS = [
  {
    title: "1. Independent Contractor Relationship",
    paras: [
      "The Media Partner is an independent contractor and not an employee of Arriv Estate Media.",
      "Nothing in this Agreement creates an employer-employee relationship, partnership, joint venture, or agency relationship.",
      "The Media Partner is solely responsible for:",
    ],
    list: [
      "Federal, state, and local taxes",
      "Self-employment taxes",
      "Insurance",
      "Licenses and permits",
      "Business expenses",
      "Equipment",
    ],
  },
  {
    title: "2. Scope of Services",
    paras: [
      "The Media Partner may accept assignments offered through the Arriv Estate Media platform, including but not limited to:",
    ],
    list: [
      "Real estate photography",
      "Videography",
      "Drone photography/video",
      "Floor plans",
      "3D tours",
      "Twilight photography",
      "Virtual staging capture",
      "Commercial media",
      "Other media services offered by Arriv",
    ],
    after: "The Media Partner is never required to accept any assignment.",
  },
  {
    title: "3. Assignment Acceptance",
    paras: ["Media Partners may:"],
    list: [
      "Accept or decline any assignment",
      "Set their travel radius",
      "Update availability",
    ],
    after:
      "Once an assignment is accepted, the Media Partner agrees to complete the project professionally and on time. Repeated cancellations or no-shows may result in suspension or termination.",
  },
  {
    title: "4. Professional Standards",
    paras: ["Media Partners agree to:"],
    list: [
      "Arrive on time",
      "Dress professionally",
      "Treat clients respectfully",
      "Protect client property",
      "Follow all property access instructions",
      "Communicate promptly",
      "Deliver work meeting Arriv's quality standards",
    ],
    after:
      "Smoking, illegal drug use, harassment, discrimination, or inappropriate conduct while representing Arriv is prohibited.",
  },
  {
    title: "5. Equipment Requirements",
    paras: [
      "The Media Partner is responsible for maintaining professional-grade equipment suitable for the services they provide. This may include:",
    ],
    list: [
      "Camera bodies",
      "Lenses",
      "Drone (if applicable)",
      "Gimbal",
      "Tripod",
      "Lighting",
      "Memory cards",
      "Batteries",
      "Computer",
    ],
    after: "Arriv does not provide equipment unless otherwise agreed in writing.",
  },
  {
    title: "6. Compensation",
    paras: [
      "Media Partners will receive the payout amount shown when accepting an assignment. Compensation may vary depending on:",
    ],
    list: [
      "Property size",
      "Services ordered",
      "Travel",
      "Complexity",
      "Promotions",
      "Marketplace pricing",
    ],
    after:
      "Payments are processed through Stripe Connect after successful completion of the assignment and client approval, subject to Arriv's payout schedule. The Media Partner acknowledges that Arriv retains a service fee for operating the marketplace.",
  },
  {
    title: "7. Media Ownership & License",
    paras: [
      "All photographs, videos, drone footage, floor plans, and other media created for Arriv assignments become the property of Arriv Estate Media upon payment.",
      "The Media Partner grants Arriv a perpetual, worldwide, royalty-free license to use, edit, reproduce, distribute, market, and sublicense the media.",
    ],
  },
  {
    title: "8. Confidentiality",
    paras: ["Media Partners may have access to confidential information including:"],
    list: [
      "Client information",
      "Property access codes",
      "Pricing",
      "Business practices",
      "Platform features",
      "Internal communications",
    ],
    after:
      "Confidential information may not be shared with anyone outside Arriv without written permission.",
  },
  {
    title: "9. Non-Circumvention & Non-Solicitation",
    paras: ["Media Partners agree not to:"],
    list: [
      "Solicit Arriv clients outside the platform",
      "Accept direct payment from Arriv clients for assignments originating through Arriv",
      "Encourage clients to bypass Arriv",
    ],
    after:
      "This restriction applies during participation on the platform and for 12 months after the last Arriv assignment with that client. Nothing in this section restricts lawful competition unrelated to Arriv-introduced clients.",
  },
  {
    title: "10. Insurance & Compliance",
    paras: [
      "Media Partners are responsible for complying with all applicable federal, state, and local laws.",
      "Drone operators must maintain any required certifications, including FAA Part 107 certification where applicable.",
      "Media Partners are encouraged to maintain general liability insurance and are responsible for any insurance required by law or their business.",
    ],
  },
  {
    title: "11. Platform Access",
    paras: ["Arriv may suspend or terminate platform access at any time for reasons including:"],
    list: [
      "Poor quality work",
      "Safety concerns",
      "Fraud",
      "Repeated cancellations",
      "Violation of this Agreement",
      "Client complaints",
      "Illegal activity",
    ],
    after:
      "Termination does not affect payment for completed and approved assignments.",
  },
  {
    title: "12. Limitation of Liability",
    paras: [
      "To the fullest extent permitted by law, Arriv Estate Media shall not be liable for indirect, incidental, special, consequential, or punitive damages arising from participation on the platform.",
      "Arriv's total liability shall not exceed the amount owed to the Media Partner for the specific assignment giving rise to the claim.",
    ],
  },
  {
    title: "13. Indemnification",
    paras: [
      "The Media Partner agrees to defend, indemnify, and hold harmless Arriv Estate Media, its owners, employees, and affiliates from claims, damages, liabilities, or expenses arising from:",
    ],
    list: [
      "Negligence",
      "Property damage",
      "Personal injury",
      "Violation of laws",
      "Breach of this Agreement",
      "Unauthorized use of equipment",
    ],
  },
  {
    title: "14. Governing Law",
    paras: [
      "This Agreement shall be governed by the laws of the State of Georgia without regard to conflict of law principles.",
      "Any legal disputes shall be resolved in the appropriate courts located in Georgia.",
    ],
  },
  {
    title: "15. Changes to This Agreement",
    paras: [
      "Arriv may update this Agreement from time to time.",
      "Material changes will be communicated through the platform or by email. Continued use of the platform after such changes constitutes acceptance of the revised Agreement.",
    ],
  },
  {
    title: "16. Electronic Acceptance",
    paras: [
      'By checking the box below and clicking "I Agree," the Media Partner acknowledges that they:',
    ],
    list: [
      "Have read this Agreement in its entirety.",
      "Understand its terms.",
      "Agree to be legally bound by this Agreement.",
      "Consent to the use of electronic records and electronic signatures.",
    ],
  },
];

export default function MediaPartnerTermsConditions() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);

  const expectedName =
    (urlParams.get("full_name") || localStorage.getItem("user_name") || "").trim();
  const expectedEmail =
    (urlParams.get("email") || localStorage.getItem("user_email") || "").trim();

  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState(expectedName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [partnerName, setPartnerName] = useState(expectedName);

  useEffect(() => {
    let active = true;
    base44.auth.isAuthenticated().then((isAuth) => {
      if (!isAuth) return;
      base44.auth.me().then((u) => {
        if (active && u?.full_name) setPartnerName(u.full_name);
      }).catch(() => {});
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const effectiveDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const signatureValid =
    signature.trim().length > 0 &&
    (expectedName
      ? signature.trim().toLowerCase() === expectedName.toLowerCase()
      : true);

  const canProceed = agreed && signatureValid && expectedEmail && !submitting;

  const handleAgree = async () => {
    setError("");
    if (!expectedEmail || !signature.trim()) {
      setError("Please enter your full name to sign.");
      return;
    }
    if (expectedName && signature.trim().toLowerCase() !== expectedName.toLowerCase()) {
      setError("The name you type must match the name on your account.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("generateSignedTerms", {
        full_name: signature.trim(),
        email: expectedEmail,
      });
      if (res.data?.success) {
        localStorage.removeItem("mediaPartnerSignupFormData");
        window.location.href = "/SignIn";
      } else {
        setError(res.data?.error || "Failed to record your agreement. Please try again.");
        setSubmitting(false);
      }
    } catch (err) {
      console.error("Terms signing error:", err);
      setError(err.response?.data?.error || err.message || "Failed to record your agreement.");
      setSubmitting(false);
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
          <h1 className="text-xl font-bold text-[#FFFBF5]">Media Partner Agreement</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6 text-[#1A1A1A] pb-40">
        <div>
          <h2 className="text-2xl font-bold">ARRIV ESTATE MEDIA</h2>
          <h3 className="text-lg font-semibold mt-1">Media Partner Agreement</h3>
          <p className="text-sm text-[#1A1A1A]/60 mt-1">Effective Date: {effectiveDate}</p>
        </div>

        <p className="text-[#1A1A1A]/80">
          This Media Partner Agreement ("Agreement") is entered into between Arriv Estate
          Media, LLC ("Arriv") and {partnerName || "the undersigned independent contractor"} ("Media Partner").
          By accepting this Agreement, the Media Partner agrees to the following terms.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.title} className="space-y-2">
            <h4 className="text-lg font-bold">{s.title}</h4>
            {s.paras?.map((p, i) => (
              <p key={i} className="text-[#1A1A1A]/80">{p}</p>
            ))}
            {s.list && (
              <ul className="list-disc list-inside space-y-1 text-[#1A1A1A]/80">
                {s.list.map((li, i) => (
                  <li key={i}>{li}</li>
                ))}
              </ul>
            )}
            {s.after && <p className="text-[#1A1A1A]/80">{s.after}</p>}
          </section>
        ))}

        <div className="h-8" />
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-[#FFFBF5] border-t border-[#B8956A]/20 p-4 z-10">
        <div className="max-w-4xl mx-auto space-y-3">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>
          )}
          <div className="flex items-start gap-3">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-1"
            />
            <label htmlFor="agree" className="text-sm text-[#1A1A1A]/80 cursor-pointer leading-relaxed">
              I have read and agree to the Arriv Estate Media Partner Agreement.
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1">
              Type your full name to sign
            </label>
            <Input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Your full legal name"
              className="border-[#B8956A]/30 focus:border-[#B8956A]"
            />
          </div>
          <Button
            onClick={handleAgree}
            disabled={!canProceed}
            className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white disabled:bg-[#1A1A1A]/40 disabled:cursor-not-allowed"
          >
            {submitting ? "Recording..." : "I Agree"}
          </Button>
        </div>
      </div>
    </div>
  );
}