// CustomerIntelligencePanel.jsx
// Displays canonical Arriv One Customer360 intelligence fields synced to the
// Estate Media Contact entity. Estate Media CONSUMES this intelligence — it
// does not compute it. All fields are Arriv One-authoritative (read-only here).
//
// Canonical intelligence categories (matching Arriv One):
//   Profile | Purchase | Relationship | Sales Intelligence | AI Memory | Learning
//
// Estate Media vertical enrichment (bookings, shoots, jobs, invoices) remains
// in the existing Customer360 tabs — this panel supplements, not replaces.

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain, TrendingUp, Heart, Target, Sparkles, GraduationCap,
  Clock, AlertTriangle, CheckCircle2, Phone, Mail, MessageSquare, Ban,
  Lightbulb, ArrowUpCircle, Package, RefreshCw
} from "lucide-react";
import { format } from "date-fns";

const HEALTH_CONFIG = {
  healthy: { label: "Healthy", color: "bg-[#B8956A] text-[#1A1A1A]", icon: CheckCircle2 },
  at_risk: { label: "At Risk", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  critical: { label: "Critical", color: "bg-orange-100 text-orange-700", icon: AlertTriangle },
  churned: { label: "Churned", color: "bg-red-100 text-red-700", icon: Ban },
};

const CONTACT_METHOD_CONFIG = {
  email: { label: "Email", icon: Mail },
  phone: { label: "Phone", icon: Phone },
  text: { label: "Text", icon: MessageSquare },
  none: { label: "No Preference", icon: Ban },
};

function ScoreBar({ score, label }) {
  const pct = Math.min(100, Math.max(0, score || 0));
  const tone = pct >= 70 ? "#B8956A" : pct >= 40 ? "#D4A574" : "#E07B39";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: "rgba(26,26,26,0.6)" }}>{label}</span>
        <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>{Math.round(pct)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(184,149,106,0.1)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: tone }} />
      </div>
    </div>
  );
}

function IntelligenceCard({ icon: Icon, title, category, children }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded shrink-0" style={{ backgroundColor: "rgba(184,149,106,0.15)" }}>
            <Icon className="w-4 h-4" style={{ color: "#B8956A" }} />
          </div>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: "#1A1A1A" }}>{title}</h3>
            <p className="text-xs uppercase tracking-wide" style={{ color: "#B8956A" }}>{category}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function EmptyIntelligence({ lastSynced }) {
  return (
    <Card>
      <CardContent className="pt-8 pb-8 text-center">
        <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: "#B8956A" }} />
        <p className="text-sm font-medium mb-1" style={{ color: "#1A1A1A" }}>
          No canonical customer intelligence synced yet
        </p>
        <p className="text-xs" style={{ color: "rgba(26,26,26,0.5)" }}>
          Arriv One Customer360 intelligence will appear here when the sync contract refreshes this contact.
        </p>
        {lastSynced && (
          <p className="text-xs mt-2" style={{ color: "rgba(26,26,26,0.4)" }}>
            Last intelligence sync: {format(new Date(lastSynced), "MMM d, yyyy h:mm a")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function CustomerIntelligencePanel({ contact }) {
  // All intelligence fields are Arriv One-authoritative, synced to the Contact entity.
  // Estate Media reads but never writes these.
  const hasIntelligence = !!(
    contact?.engagement_score != null ||
    contact?.relationship_health ||
    contact?.next_best_action ||
    contact?.sales_memory ||
    contact?.recommendation_outcomes?.length > 0 ||
    contact?.churn_risk != null ||
    contact?.communication_preferences ||
    contact?.preferred_contact_method
  );

  if (!hasIntelligence) {
    return <EmptyIntelligence lastSynced={contact?.intelligence_synced_at} />;
  }

  const health = HEALTH_CONFIG[contact?.relationship_health] || null;
  const contactMethod = CONTACT_METHOD_CONFIG[contact?.preferred_contact_method] || null;
  const salesMemory = contact?.sales_memory || {};
  const recommendationOutcomes = contact?.recommendation_outcomes || [];

  return (
    <div className="space-y-4">
      {/* Sync status banner */}
      {contact?.intelligence_synced_at && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ backgroundColor: "rgba(184,149,106,0.08)", color: "#B8956A" }}>
          <RefreshCw className="w-3 h-3" />
          <span>Arriv One Customer360 intelligence — synced {format(new Date(contact.intelligence_synced_at), "MMM d, yyyy h:mm a")}</span>
        </div>
      )}

      {/* ── Profile Intelligence ── */}
      <IntelligenceCard icon={TrendingUp} title="Profile Intelligence" category="Profile">
        <div className="space-y-3">
          {contact?.engagement_score != null && (
            <ScoreBar score={contact.engagement_score} label="Engagement Score" />
          )}
          {contact?.relationship_age_days != null && (
            <div className="flex justify-between text-sm">
              <span style={{ color: "rgba(26,26,26,0.6)" }}>Relationship Age</span>
              <span className="font-medium" style={{ color: "#1A1A1A" }}>
                {contact.relationship_age_days} days
              </span>
            </div>
          )}
          {contact?.lifecycle_stage && (
            <div className="flex justify-between text-sm">
              <span style={{ color: "rgba(26,26,26,0.6)" }}>Lifecycle Stage</span>
              <Badge variant="outline" className="text-xs">{contact.lifecycle_stage}</Badge>
            </div>
          )}
        </div>
      </IntelligenceCard>

      {/* ── Relationship Intelligence ── */}
      <IntelligenceCard icon={Heart} title="Relationship Intelligence" category="Relationship">
        <div className="space-y-3">
          {health && (
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>Relationship Health</span>
              <Badge className={health.color}>
                <health.icon className="w-3 h-3 mr-1" />
                {health.label}
              </Badge>
            </div>
          )}
          {contact?.churn_risk != null && (
            <ScoreBar score={contact.churn_risk} label="Churn Risk" />
          )}
          {contactMethod && (
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>Preferred Contact Method</span>
              <span className="flex items-center gap-1 text-sm font-medium" style={{ color: "#1A1A1A" }}>
                <contactMethod.icon className="w-3.5 h-3.5" style={{ color: "#B8956A" }} />
                {contactMethod.label}
              </span>
            </div>
          )}
          {contact?.communication_preferences && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#B8956A" }}>Communication Preferences</p>
              <p className="text-sm" style={{ color: "#1A1A1A" }}>{contact.communication_preferences}</p>
            </div>
          )}
        </div>
      </IntelligenceCard>

      {/* ── Sales Intelligence ── */}
      <IntelligenceCard icon={Target} title="Sales Intelligence" category="Sales">
        <div className="space-y-3">
          {contact?.next_best_action && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#B8956A" }}>
                <Lightbulb className="w-3 h-3 inline mr-1" />Recommended Next Action
              </p>
              <p className="text-sm" style={{ color: "#1A1A1A" }}>{contact.next_best_action}</p>
              {contact?.next_best_action_timing && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "rgba(26,26,26,0.5)" }}>
                  <Clock className="w-3 h-3" /> Timing: {contact.next_best_action_timing}
                </p>
              )}
            </div>
          )}
          {contact?.upsell_opportunities?.length > 0 && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#B8956A" }}>
                <ArrowUpCircle className="w-3 h-3 inline mr-1" />Upsell Opportunities
              </p>
              <div className="flex flex-wrap gap-1.5">
                {contact.upsell_opportunities.map((opp, i) => (
                  <Badge key={i} className="bg-[#B8956A]/15 text-[#B8956A] text-xs">{opp}</Badge>
                ))}
              </div>
            </div>
          )}
          {contact?.recommended_products?.length > 0 && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#B8956A" }}>
                <Package className="w-3 h-3 inline mr-1" />Recommended Products
              </p>
              <div className="flex flex-wrap gap-1.5">
                {contact.recommended_products.map((prod, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{prod}</Badge>
                ))}
              </div>
            </div>
          )}
          {!contact?.next_best_action && !contact?.upsell_opportunities?.length && !contact?.recommended_products?.length && (
            <p className="text-sm" style={{ color: "rgba(26,26,26,0.5)" }}>No sales recommendations available</p>
          )}
        </div>
      </IntelligenceCard>

      {/* ── AI Sales Memory ── */}
      <IntelligenceCard icon={Brain} title="AI Sales Memory" category="AI Memory">
        <div className="space-y-3 text-sm">
          {salesMemory.successful_approaches?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#B8956A" }}>Successful Approaches</p>
              <ul className="space-y-1">
                {salesMemory.successful_approaches.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5" style={{ color: "#1A1A1A" }}>
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#B8956A" }} />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {salesMemory.objections?.length > 0 && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#B8956A" }}>Known Objections</p>
              <ul className="space-y-1">
                {salesMemory.objections.map((o, i) => (
                  <li key={i} className="flex items-start gap-1.5" style={{ color: "#1A1A1A" }}>
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#D4A574" }} />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {salesMemory.decision_maker_preferences?.length > 0 && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#B8956A" }}>Decision-Maker Preferences</p>
              <ul className="space-y-1">
                {salesMemory.decision_maker_preferences.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5" style={{ color: "#1A1A1A" }}>
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#B8956A" }} />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {salesMemory.relationship_notes && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#B8956A" }}>Relationship Notes</p>
              <p style={{ color: "#1A1A1A" }}>{salesMemory.relationship_notes}</p>
            </div>
          )}
          {salesMemory.historical_context && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#B8956A" }}>Historical Selling Context</p>
              <p style={{ color: "rgba(26,26,26,0.7)" }}>{salesMemory.historical_context}</p>
            </div>
          )}
          {!salesMemory.successful_approaches?.length && !salesMemory.objections?.length && !salesMemory.decision_maker_preferences?.length && !salesMemory.relationship_notes && !salesMemory.historical_context && (
            <p style={{ color: "rgba(26,26,26,0.5)" }}>No AI sales memory recorded</p>
          )}
        </div>
      </IntelligenceCard>

      {/* ── Learning / Recommendation Outcomes ── */}
      <IntelligenceCard icon={GraduationCap} title="Recommendation Learning" category="Learning">
        <div className="space-y-3">
          {contact?.recommendation_conversion_rate != null && (
            <ScoreBar score={contact.recommendation_conversion_rate} label="Recommendation Conversion Rate" />
          )}
          {contact?.what_worked_previously?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#B8956A" }}>What Worked Previously</p>
              <ul className="space-y-1">
                {contact.what_worked_previously.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm" style={{ color: "#1A1A1A" }}>
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#B8956A" }} />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recommendationOutcomes.length > 0 && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#B8956A" }}>Recommendation Outcomes</p>
              <div className="space-y-2">
                {recommendationOutcomes.slice(0, 10).map((ro, i) => {
                  const outcomeConfig = {
                    converted: { label: "Converted", color: "bg-[#B8956A] text-[#1A1A1A]", icon: CheckCircle2 },
                    not_converted: { label: "Not Converted", color: "bg-red-100 text-red-700", icon: AlertTriangle },
                    pending: { label: "Pending", color: "bg-amber-100 text-amber-700", icon: Clock },
                  };
                  const oc = outcomeConfig[ro.outcome] || outcomeConfig.pending;
                  const OcIcon = oc.icon;
                  return (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <OcIcon className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#B8956A" }} />
                      <div className="flex-1 min-w-0">
                        <p style={{ color: "#1A1A1A" }}>{ro.recommendation}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className={`${oc.color} text-xs`}>{oc.label}</Badge>
                          {ro.date && (
                            <span className="text-xs" style={{ color: "rgba(26,26,26,0.4)" }}>
                              {format(new Date(ro.date), "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {contact?.recommendation_conversion_rate == null && !contact?.what_worked_previously?.length && !recommendationOutcomes.length && (
            <p className="text-sm" style={{ color: "rgba(26,26,26,0.5)" }}>No recommendation learning data available</p>
          )}
        </div>
      </IntelligenceCard>
    </div>
  );
}