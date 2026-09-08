import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Briefcase, MapPin, ArrowRight, Loader2, Heart } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.6)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

export default function CareersHub() {
  const { companySlug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getCareersHub", {
          company_slug: companySlug || "",
          host: window.location.hostname,
        });
        const d = res?.data ?? res;
        if (d?.error) {
          setError(d.error);
        } else {
          setData(d);
          base44.functions.invoke("trackJobPageEvent", {
            event_type: "careers_hub_view",
            tenant_id: d?.tenant?.tenant_id || "tnt_estate_media",
          }).catch(() => {});
        }
      } catch (err) {
        setError(err.message || "Failed to load careers hub");
      }
      setLoading(false);
    })();
  }, [companySlug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FFFBF5" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FFFBF5" }}>
        <div className="text-center">
          <Briefcase className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="text-lg font-medium" style={{ color: TEXT_DARK }}>{error}</p>
          <p className="text-sm mt-1" style={{ color: MUTED }}>The careers page may not be enabled yet.</p>
        </div>
      </div>
    );
  }

  const tenant = data?.tenant || {};
  const jobs = data?.jobs || [];
  const primary = tenant.primary_color || GOLD;
  const social = tenant.career_social_links || {};

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFFBF5" }}>
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}>
        {tenant.career_hero_image && (
          <div className="absolute inset-0" style={{ backgroundImage: `url(${tenant.career_hero_image})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.25 }} />
        )}
        <div className="relative max-w-5xl mx-auto px-6 py-16">
          {tenant.logo_url && <img src={tenant.logo_url} alt={tenant.company_name} className="h-12 mb-6" />}
          <h1 className="text-4xl font-bold mb-3" style={{ ...SERIF }}>
            Careers at {tenant.company_name || "Arriv Estate Media"}
          </h1>
          {tenant.career_company_description && (
            <p className="text-lg max-w-2xl mb-4" style={{ color: "rgba(255,251,245,0.7)" }}>{tenant.career_company_description}</p>
          )}
          {tenant.career_locations?.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              {tenant.career_locations.map((loc, i) => (
                <span key={i} className="text-sm" style={{ color: "rgba(255,251,245,0.6)" }}>
                  {i > 0 && <span className="mx-1.5">•</span>}
                  {loc}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            {social.website && <a href={social.website} target="_blank" rel="noreferrer" className="text-sm hover:underline" style={{ color: primary }}>Website</a>}
            {tenant.career_contact_email && <a href={`mailto:${tenant.career_contact_email}`} className="text-sm hover:underline" style={{ color: primary }}>{tenant.career_contact_email}</a>}
            {social.linkedin && <a href={social.linkedin} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-full text-xs font-medium" style={{ border: `1px solid ${primary}40`, color: primary }}>LinkedIn</a>}
            {social.facebook && <a href={social.facebook} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-full text-xs font-medium" style={{ border: `1px solid ${primary}40`, color: primary }}>Facebook</a>}
            {social.x && <a href={social.x} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-full text-xs font-medium" style={{ border: `1px solid ${primary}40`, color: primary }}>X</a>}
            {social.instagram && <a href={social.instagram} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-full text-xs font-medium" style={{ border: `1px solid ${primary}40`, color: primary }}>Instagram</a>}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        {tenant.career_culture_text && (
          <section>
            <h2 className="text-2xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>Life at {tenant.company_name}</h2>
            <p className="whitespace-pre-wrap text-base leading-relaxed" style={{ color: MUTED }}>{tenant.career_culture_text}</p>
          </section>
        )}

        {tenant.career_benefits?.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>Benefits & Perks</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tenant.career_benefits.map((b, i) => (
                <div key={i} className="p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}>
                  <Heart className="w-5 h-5 shrink-0 mt-0.5" style={{ color: primary }} />
                  <span className="text-sm" style={{ color: TEXT_DARK }}>{b}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Open Positions</h2>
            <span className="text-sm" style={{ color: MUTED }}>{jobs.length} open</span>
          </div>
          {jobs.length === 0 ? (
            <div className="text-center py-16 rounded-xl" style={{ border: "1px solid rgba(184,149,106,0.15)", backgroundColor: "#FFFFFF" }}>
              <Briefcase className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
              <p className="font-medium" style={{ color: TEXT_DARK }}>No open jobs yet</p>
              <p className="text-sm mt-1" style={{ color: MUTED }}>Check back soon for new opportunities.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <Link
                  key={job.job_id}
                  to={`/careers/${job.public_slug || job.job_id}`}
                  className="block p-5 rounded-xl transition-all hover:shadow-md group"
                  style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg mb-1" style={{ ...SERIF, color: TEXT_DARK }}>{job.title}</h3>
                      <div className="flex items-center gap-3 text-sm flex-wrap" style={{ color: MUTED }}>
                        {job.department && <span>{job.department}</span>}
                        {job.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {job.location}</span>}
                        {job.employment_type && <span className="capitalize">{job.employment_type.replace(/_/g, " ")}</span>}
                        {job.work_arrangement && <span className="capitalize">{job.work_arrangement}</span>}
                      </div>
                      {job.description_text && <p className="text-sm mt-2 line-clamp-2" style={{ color: MUTED }}>{job.description_text}</p>}
                    </div>
                    <ArrowRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-1" style={{ color: primary }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="py-8 text-center" style={{ borderTop: "1px solid rgba(184,149,106,0.15)" }}>
        <p className="text-sm" style={{ color: MUTED }}>Hiring powered by Khetha IQ</p>
      </footer>
    </div>
  );
}