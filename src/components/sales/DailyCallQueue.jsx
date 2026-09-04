import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Clock, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, RefreshCw, Calendar, Brain, Pencil, Trash2 } from "lucide-react";
import { format, formatDistanceToNow, addDays, isAfter, startOfDay } from "date-fns";
import ReactMarkdown from "react-markdown";
import ViewCallMapModal from "./ViewCallMapModal";
import { getBestTime, buildLearnedContext, analyzeContact, saveScheduledFollowUp } from "./schedulingUtils";

function getPriorityLabel(urgency) {
  if (urgency === "high") return { label: "High", color: "#ef4444", bg: "rgba(239,68,68,0.1)" };
  if (urgency === "medium") return { label: "Medium", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" };
  if (urgency === "low") return { label: "Low", color: "#6b7280", bg: "rgba(107,114,128,0.1)" };
  return { label: "Paused", color: "#9ca3af", bg: "rgba(156,163,175,0.08)" };
}



const channelConfig = {
  call: { label: "Call", icon: "📞", color: "#B8956A" },
  text: { label: "Text", icon: "💬", color: "#3B82F6" },
  email: { label: "Email", icon: "✉️", color: "#8B5CF6" },
};

function LeadCard({ contact, rank, repName, salesMemberId, scheduledFollowUp, urgency, channel, channelReason, reason, suggestedOpener, contactIntel, patternTags, onOutcomeLogged }) {
  const [expanded, setExpanded] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [script, setScript] = useState(suggestedOpener || null);
  const [loggingOutcome, setLoggingOutcome] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [saved, setSaved] = useState(false);
  // Edit follow-up date
  const [editingDate, setEditingDate] = useState(false);
  const [editDateValue, setEditDateValue] = useState(
    scheduledFollowUp ? format(new Date(scheduledFollowUp.activity_date), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [savingDate, setSavingDate] = useState(false);
  const [deletingFollowUp, setDeletingFollowUp] = useState(false);

  const priority = getPriorityLabel(urgency || "medium");
  const bestTime = getBestTime(contact);
  const lastActivity = contact.past[0];
  const followUpDate = scheduledFollowUp ? new Date(scheduledFollowUp.activity_date) : null;

  const generateScript = async () => {
    setGeneratingScript(true);
    setScript(null);
    try {
      const historySnippet = contact.past.slice(0, 4).map(a => {
        const pics = a.picture_urls?.length ? ` [+${a.picture_urls.length} image(s)]` : "";
        return `${format(new Date(a.activity_date), "MMM d")}: ${a.activity_type} — ${a.notes.slice(0, 120)}${pics}`;
      }).join("\n");

      const scriptPictureUrls = contact.past
        .slice(0, 6)
        .flatMap(a => a.picture_urls || [])
        .slice(0, 6);
      
      // Include pattern tags and metadata for long-term learning
      const patternTagsText = patternTags && patternTags.length > 0 
        ? `\n\nRecurring patterns: ${patternTags.join(", ")}`
        : "";

      const allNotes = contact.activities.map(a => a.notes || "").join(" ");
      const boxSent = /box sent|intro package sent|package sent|sent a box|sent an intro|introduction package|sent box|mailed a box|mailed package/i.test(allNotes);
      const isFirstContact = (contact.activities || []).every(a => /^(FIRST CONTACT:|Contact created:)/i.test((a.notes || "").trim()));
      const firstName = contact.name?.split(' ')[0] || 'there';

      const boxContext = boxSent ? `
⚠️ BOX / INTRO PACKAGE WAS SENT TO THIS CONTACT. Opening MUST be:
"Hi ${contact.name?.split(' ')[0] || '[Name]'}, my name is Brad Burke, a local real estate media provider — do you have a moment? I recently sent over a small introduction package and just wanted to introduce myself personally."
[Pause. Let them respond.]
Then: "Glad it made it. I provide full-service real estate media — photography, video, and drone — and I just wanted to put a voice behind the name. [Reference their active listing if found.] I would love to help you get it to the closing table by adding a 2–3 minute MLS-ready video you can just drop into the listing."
If won't need it: "Totally understand. If you ever need backup coverage or something with a quick turnaround, I'd be happy to be a resource."
` : "";

      const firstContactScript = isFirstContact && !boxSent ? `
⚠️ THIS IS A BRAND NEW CONTACT — FIRST CALL EVER. Use this exact opening structure:
Opening: "Hi ${firstName}, this is Brad — I'm a local real estate media creator. Do you have a moment?"
[Pause briefly]
Then: "I came across your listing on [find their active listing from market research — street name or area] — it's a beautiful home."
[Pause]
Then: "I noticed the listing currently has photos but no video, so I wanted to reach out. I create clean, unbranded video tours that are MLS-ready, so agents can drop them straight into the listing without changing anything else."
[Pause]
Then: "If video isn't something you're planning to add, totally fine — I just wanted to see if it's something you'd be open to considering."

If they have NO active listing found: Skip the listing reference. Instead: "I work with realtors in the area providing full-service real estate media — photography, video, and drone. I just wanted to introduce myself and see if you'd be open to connecting."
` : "";

      const res = await base44.integrations.Core.InvokeLLM({
       prompt: `CALL MAP for ${contact.name} at ${contact.company || "Unknown brokerage"}

CRITICAL — ARRIV IS A REAL ESTATE PHOTOGRAPHY & VIDEO COMPANY. NOTHING ELSE.
- We shoot photos and video for real estate listings. That's it.
- We do NOT offer: websites, marketing platforms, advertising campaigns, CRM tools, lead gen, or anything other than photo/video.
- NEVER use placeholders like "[Your Name]" or "[Your Company]". Use "ARRIV" as company.
- Scripts must be casual and human, not corporate. Reference specific details from history.
- Key stat: "homes with pro media sell 32% faster and for 5-11% more"
- Brad handles pricing questions and closings.
${boxContext}${firstContactScript}
Rep: ${repName || "the rep"} | Contact Intel: ${contactIntel || "N/A"} | Why: ${reason || "routine follow-up"}${patternTagsText}
History: ${historySnippet || "no prior contact"}

Output JSON with ALL 10 sections. Every field required and must be filled with full content.

${scriptPictureUrls.length > 0 ? `Read attached images for full context.\n` : ""}`,
        add_context_from_internet: true,
        file_urls: scriptPictureUrls.length > 0 ? scriptPictureUrls : undefined,
        response_json_schema: {
          type: "object",
          properties: {
            opening: { type: "string", description: "2 sentences, casual, specific. NOT 'Hi this is X from ARRIV'" },
            if_interested: { type: "string", description: "Full 60-second pitch, key points, guide to booking" },
            if_has_photographer: { type: "string", description: "They already use a photographer. Acknowledge it warmly, then mention ARRIV provides BOTH photography AND video as full-service media. Don't dismiss their photographer — position ARRIV as upgrade/add-on. Example: 'That's great! We actually do photography too, but we also specialize in video tours. A lot of agents use us alongside their existing photographer to add video to their listings. Worth keeping in mind as an add-on.' OR 'Awesome — we do full-service real estate media including photos and video, so we could potentially upgrade what you're already doing or add video tours.'" },
            if_not_interested: { type: "string", description: "Graceful response that leaves door open. Example: 'Totally understand. If you ever need backup coverage or something with a quick turnaround, I'd be happy to be a resource.'" },
            if_send_email: { type: "string", description: "Agree to email but GET COMMITMENT for a call too" },
            if_too_expensive: { type: "string", description: "Value frame, never discount, redirect to Brad for pricing" },
            if_cold_unengaged: { type: "string", description: "Short graceful exit that doesn't burn the bridge" },
            if_busy_bad_time: { type: "string", description: "Acknowledge, lock in specific callback time, end on good note" },
            if_no_answer_voicemail: { type: "string", description: "15 seconds max, word-for-word, conversational" },
            follow_up_text: { type: "string", description: "Send right after voicemail if no answer — short, casual, natural" }
          },
          required: ["opening", "if_interested", "if_has_photographer", "if_not_interested", "if_send_email", "if_too_expensive", "if_cold_unengaged", "if_busy_bad_time", "if_no_answer_voicemail", "follow_up_text"]
        }
      });
      const callMapData = typeof res === "string" ? JSON.parse(res) : res;
      const formatted = `📞 **Opening**\n${callMapData.opening}\n\n🔀 **If they're interested**\n${callMapData.if_interested}\n\n🔀 **If they say "I already have a photographer"**\n${callMapData.if_has_photographer}\n\n🔀 **If they say "Not interested right now"**\n${callMapData.if_not_interested}\n\n🔀 **If they say "Send me an email"**\n${callMapData.if_send_email}\n\n🔀 **If they say "Too expensive"**\n${callMapData.if_too_expensive}\n\n🔀 **If they're cold / one-word answers**\n${callMapData.if_cold_unengaged}\n\n🔀 **If they're busy / bad time**\n${callMapData.if_busy_bad_time}\n\n📵 **If no answer — voicemail**\n${callMapData.if_no_answer_voicemail}\n\n📱 **Follow-up text**\n${callMapData.follow_up_text}`;
      setScript(formatted);
    } catch {
      setScript("Failed to generate script. Try again.");
    } finally {
      setGeneratingScript(false);
    }
  };

  const deleteFollowUp = async () => {
    if (!scheduledFollowUp) return;
    setDeletingFollowUp(true);
    await base44.entities.ActivityLog.delete(scheduledFollowUp.id).catch(() => {});
    setDeletingFollowUp(false);
    if (onOutcomeLogged) onOutcomeLogged();
  };

  const saveEditedDate = async () => {
    if (!scheduledFollowUp || !editDateValue) return;
    setSavingDate(true);
    try {
      await base44.entities.ActivityLog.update(scheduledFollowUp.id, {
        activity_date: new Date(editDateValue).toISOString()
      });
      setEditingDate(false);
      if (onOutcomeLogged) onOutcomeLogged();
    } catch {
      // ignore
    } finally {
      setSavingDate(false);
    }
  };

  const logOutcome = async () => {
    if (!outcome || !outcomeNotes) return;
    setLoggingOutcome(true);

    const salesMemberEmail = localStorage.getItem('sales_member_email');
    const sid = salesMemberId || localStorage.getItem('sales_member_id');
    const sem = salesMemberEmail;

    try {
      // 1. Log the completed call outcome as a real activity
      await base44.entities.ActivityLog.create({
        activity_type: "call",
        contact_name: contact.name,
        contact_email: contact.email,
        contact_phone: contact.phone || "",
        company_name: contact.company,
        activity_date: new Date().toISOString(),
        notes: `[Queue Call] Outcome: ${outcome.replace(/_/g, " ")} — ${outcomeNotes}`,
        sales_member_id: sid,
        sales_member_email: sem,
      });

      // 2. Update the old scheduled follow-up with the outcome so it moves to Activity History
      if (scheduledFollowUp) {
        await base44.entities.ActivityLog.update(scheduledFollowUp.id, {
          activity_date: new Date().toISOString(),
          notes: `[Queue Call] Outcome: ${outcome.replace(/_/g, " ")} — ${outcomeNotes}`,
        }).catch(() => {});
      }

      // 3. Build updated history including this new outcome for the AI to read
      const updatedHistoryActivities = [
        ...contact.activities,
        {
          activity_type: "call",
          activity_date: new Date().toISOString(),
          notes: `[Queue Call] Outcome: ${outcome.replace(/_/g, " ")} — ${outcomeNotes}`,
          picture_urls: [],
        }
      ].sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date)).slice(0, 15);

      const updatedContact = { ...contact, activities: updatedHistoryActivities };

      // 4. Use the Scheduling AI to determine the correct next follow-up date & details
      //    based on the outcome notes and full history
      const [pastInsights] = await Promise.all([
        sid ? base44.entities.QueueInsight.filter({ sales_member_id: sid }, '-logged_at', 200).catch(() => []) : Promise.resolve([])
      ]);
      const learnedCtx = buildLearnedContext(pastInsights);
      const analysis = await analyzeContact(updatedContact, learnedCtx);

      // 5. Save insight so AI learns
      await base44.entities.QueueInsight.create({
        sales_member_id: sid,
        contact_key: contact.key,
        contact_name: contact.name,
        outcome,
        outcome_notes: outcomeNotes,
        ai_recommendation: analysis?.reason || reason || "",
        next_contact_date: analysis?.follow_up_date_time ? format(new Date(analysis.follow_up_date_time), "yyyy-MM-dd") : null,
        pattern_tags: patternTags || [],
        logged_at: new Date().toISOString(),
      });

      // 6. Save the AI-scheduled follow-up with a fresh call map (unless urgency is "skip")
      if (analysis && analysis.urgency !== "skip") {
        await saveScheduledFollowUp(updatedContact, analysis, sid, sem, {});
      }

      setSaved(true);
      setLoggingOutcome(false);
      setOutcome("");
      setOutcomeNotes("");
      if (onOutcomeLogged) onOutcomeLogged();
    } catch (err) {
      console.error('[logOutcome] Error:', err);
      setLoggingOutcome(false);
    }
  };

  return (
    <Card style={{ borderColor: rank === 1 ? '#B8956A' : 'rgba(184,149,106,0.2)', borderWidth: rank === 1 ? '2px' : '1px' }}>
      <CardContent className="pt-4 pb-4">
        <button className="w-full text-left" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: priority.bg, color: priority.color }}>
                {rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold" style={{ color: '#1A1A1A' }}>{contact.name}</p>
                  {contact.company && <span className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>{contact.company}</span>}
                  <Badge style={{ backgroundColor: priority.bg, color: priority.color, border: 'none', fontSize: '11px' }}>
                    {priority.label} Priority
                  </Badge>
                  {saved && <Badge style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'none', fontSize: '11px' }}>✓ Logged</Badge>}
                </div>
                {contact.phone && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone: contact.phone } }));
                    }}
                    className="flex items-center gap-1 text-xs font-medium mt-0.5 hover:opacity-70 transition-opacity"
                    style={{ color: '#B8956A' }}
                  >
                    <Phone className="w-3 h-3" />
                    {contact.phone}
                  </button>
                )}
                <div className="flex flex-wrap gap-3 mt-1 text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Best time: {bestTime}</span>
                  {lastActivity && <span>Last touch: {formatDistanceToNow(new Date(lastActivity.activity_date), { addSuffix: true })}</span>}
                  {followUpDate && (
                    <span className="flex items-center gap-1 font-medium" style={{ color: '#B8956A' }}>
                      <Calendar className="w-3 h-3" />
                      Scheduled: {format(followUpDate, "MMM d 'at' h:mm a")}
                    </span>
                  )}
                  {channel && channel !== "call" && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${channelConfig[channel]?.color}18`, color: channelConfig[channel]?.color }}>
                      {channelConfig[channel]?.icon} via {channelConfig[channel]?.label}
                    </span>
                  )}
                </div>
                {reason && (
                  <p className="text-xs mt-1 italic flex items-start gap-1" style={{ color: 'rgba(26,26,26,0.55)' }}>
                    <Brain className="w-3 h-3 shrink-0 mt-0.5" style={{ color: '#B8956A' }} />
                    {reason}
                  </p>
                )}
                {channelReason && (
                  <p className="text-xs mt-0.5 flex items-start gap-1" style={{ color: channelConfig[channel]?.color || 'rgba(26,26,26,0.45)' }}>
                    {channelConfig[channel]?.icon} {channelReason}
                  </p>
                )}
                {contactIntel && (
                  <p className="text-xs mt-0.5 flex items-start gap-1" style={{ color: 'rgba(26,26,26,0.45)' }}>
                    🔍 {contactIntel}
                  </p>
                )}
              </div>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 mt-1 shrink-0 opacity-40" /> : <ChevronDown className="w-4 h-4 mt-1 shrink-0 opacity-40" />}
          </div>
        </button>

        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: 'rgba(184,149,106,0.15)' }}>

            {/* Editable follow-up date */}
            {scheduledFollowUp && (
              <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(184,149,106,0.06)', border: '1px solid rgba(184,149,106,0.2)' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>Scheduled Follow-up</p>
                  {!editingDate && (
                    <div className="flex items-center gap-3">
                      <button onClick={() => setEditingDate(true)} className="flex items-center gap-1 text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button onClick={deleteFollowUp} disabled={deletingFollowUp} className="flex items-center gap-1 text-xs" style={{ color: '#ef4444' }}>
                        <Trash2 className="w-3 h-3" /> {deletingFollowUp ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
                {editingDate ? (
                   <div className="flex items-center gap-2 mt-1 flex-wrap">
                     <Input
                       type="datetime-local"
                       value={editDateValue}
                       onChange={e => setEditDateValue(e.target.value)}
                       className="text-xs h-10 flex-1 min-w-[200px]"
                     />
                     <Button size="sm" onClick={saveEditedDate} disabled={savingDate} style={{ backgroundColor: '#B8956A', color: '#fff' }}>
                       {savingDate ? "Saving..." : "Save"}
                     </Button>
                     <Button size="sm" variant="outline" onClick={() => setEditingDate(false)}>Cancel</Button>
                   </div>
                ) : (
                  <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>
                    {format(new Date(scheduledFollowUp.activity_date), "EEEE, MMMM d 'at' h:mm a")}
                  </p>
                )}
              </div>
            )}

            {contact.past.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(26,26,26,0.4)' }}>Recent History</p>
                <div className="space-y-1">
                  {contact.past.slice(0, 4).map(a => (
                    <div key={a.id} className="text-xs p-2 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}>
                      <span className="font-medium capitalize">{a.activity_type}</span>
                      <span className="mx-1" style={{ color: 'rgba(26,26,26,0.4)' }}>·</span>
                      <span style={{ color: 'rgba(26,26,26,0.5)' }}>{format(new Date(a.activity_date), "MMM d")}</span>
                      <span className="mx-1" style={{ color: 'rgba(26,26,26,0.4)' }}>·</span>
                      <span style={{ color: '#1A1A1A' }}>{a.notes.slice(0, 100)}{a.notes.length > 100 ? "..." : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              {!script ? (
                <Button size="sm" onClick={generateScript} disabled={generatingScript} className="w-full gap-2" style={{ backgroundColor: '#1A1A1A', color: '#fff' }}>
                  {generatingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generatingScript ? "Generating call map..." : "Generate call map"}
                </Button>
              ) : (
                <>
                   <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.25)' }}>
                     <div className="flex items-center justify-between">
                       <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>ARRIV Coach</p>
                       <button onClick={generateScript} className="text-xs flex items-center gap-1" style={{ color: 'rgba(26,26,26,0.4)' }}>
                         <RefreshCw className="w-3 h-3" /> Regenerate
                       </button>
                     </div>
                     <ReactMarkdown 
                       className="text-sm prose prose-sm prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                       components={{
                         h1: ({ children }) => <h1 className="text-base font-semibold my-2" style={{ color: '#1A1A1A' }}>{children}</h1>,
                         h2: ({ children }) => <h2 className="text-sm font-semibold my-1.5" style={{ color: '#1A1A1A' }}>{children}</h2>,
                         h3: ({ children }) => <h3 className="text-xs font-semibold my-1" style={{ color: '#1A1A1A' }}>{children}</h3>,
                         p: ({ children }) => <p className="text-sm my-1 leading-relaxed" style={{ color: '#1A1A1A' }}>{children}</p>,
                         strong: ({ children }) => <strong className="font-semibold" style={{ color: '#1A1A1A' }}>{children}</strong>,
                         em: ({ children }) => <em className="italic" style={{ color: '#1A1A1A' }}>{children}</em>,
                         ul: ({ children }) => <ul className="list-disc list-inside my-1 ml-2 text-sm" style={{ color: '#1A1A1A' }}>{children}</ul>,
                         ol: ({ children }) => <ol className="list-decimal list-inside my-1 ml-2 text-sm" style={{ color: '#1A1A1A' }}>{children}</ol>,
                         li: ({ children }) => <li className="my-0.5" style={{ color: '#1A1A1A' }}>{children}</li>,
                         blockquote: ({ children }) => <blockquote className="border-l-2 border-[#B8956A] pl-3 my-1 italic" style={{ color: '#1A1A1A' }}>{children}</blockquote>,
                       }}
                     >
                       {script}
                     </ReactMarkdown>
                   </div>
                  {scheduledFollowUp && /--- CALL MAP ---/i.test(scheduledFollowUp.notes || '') && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full gap-2"
                      onClick={() => {
                        // Pass the scheduled follow-up to a modal for viewing
                        window.dispatchEvent(new CustomEvent('openCallMapModal', { detail: { activity: scheduledFollowUp } }));
                      }}
                      style={{ borderColor: '#B8956A', color: '#B8956A' }}
                    >
                      📋 View Full Call Map
                    </Button>
                  )}
                </>
              )}
            </div>

            {!saved ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.4)' }}>Log Outcome</p>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="What happened on this call?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_answer">No answer (text in 3 hours)</SelectItem>
                    <SelectItem value="call_later">Busy — call back tomorrow 8:30am</SelectItem>
                    <SelectItem value="interested">Interested — notify Brad</SelectItem>
                    <SelectItem value="warm_waiting">Warm — they'll reach out when ready (3 weeks)</SelectItem>
                    <SelectItem value="not_interested">Not interested — pause 30 days</SelectItem>
                    <SelectItem value="left_voicemail">Left voicemail (follow up in 3 days at 5pm)</SelectItem>
                  </SelectContent>
                </Select>
                {outcome && (
                  <>
                    <Textarea
                      placeholder="Quick notes on what was said..."
                      value={outcomeNotes}
                      onChange={e => setOutcomeNotes(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <Button size="sm" onClick={logOutcome} disabled={loggingOutcome || !outcomeNotes} className="w-full" style={{ backgroundColor: '#B8956A', color: '#fff' }}>
                      {loggingOutcome ? "Saving..." : "Log & Schedule Next Follow-up"}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#10b981' }}>
                <CheckCircle2 className="w-4 h-4" />
                Outcome logged — next follow-up scheduled and saved
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingCard({ contact, scheduled, meta, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const priority = getPriorityLabel(meta.urgency || "low");
  const hasCallMap = scheduled && /--- CALL MAP ---/i.test(scheduled.notes || '');
  const notes = scheduled?.notes || '';
  // Show the portion before the call map as the "notes preview"
  const notesPreview = notes.split(/--- CALL MAP ---/i)[0].replace(/^\[AI Scheduled\]\s*/i, '').trim();

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!scheduled) return;
    setDeleting(true);
    await base44.entities.ActivityLog.delete(scheduled.id).catch(() => {});
    setDeleting(false);
    if (onDeleted) onDeleted();
  };

  return (
    <div>
      <div
        className="rounded-lg cursor-pointer"
        style={{ backgroundColor: 'rgba(184,149,106,0.06)', border: '1px solid rgba(184,149,106,0.2)' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priority.color }} />
            <span className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>{contact.name}</span>
            {contact.company && <span className="text-xs truncate" style={{ color: 'rgba(26,26,26,0.4)' }}>{contact.company}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge style={{ backgroundColor: priority.bg, color: priority.color, border: 'none', fontSize: '10px' }}>{priority.label}</Badge>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 opacity-40" /> : <ChevronDown className="w-3.5 h-3.5 opacity-40" />}
          </div>
        </div>
        {scheduled && (
          <div className="px-3 pb-3 -mt-1">
            <span className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
              {format(new Date(scheduled.activity_date), "MMM d 'at' h:mm a")}
            </span>
          </div>
        )}

        {expanded && (
          <div className="px-3 pb-3 pt-2 border-t space-y-3" style={{ borderColor: 'rgba(184,149,106,0.15)' }} onClick={e => e.stopPropagation()}>
            {notesPreview && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'rgba(26,26,26,0.4)' }}>Notes</p>
                <p className="text-xs" style={{ color: '#1A1A1A' }}>{notesPreview}</p>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {hasCallMap && (
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" style={{ borderColor: '#B8956A', color: '#B8956A' }}
                  onClick={() => setMapOpen(true)}>
                  📋 View Call Map
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" style={{ borderColor: '#ef4444', color: '#ef4444' }}
                onClick={handleDelete} disabled={deleting}>
                <Trash2 className="w-3 h-3" /> {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </div>
      {scheduled && hasCallMap && (
        <ViewCallMapModal activity={scheduled} open={mapOpen} onOpenChange={setMapOpen} />
      )}
    </div>
  );
}

export default function DailyCallQueue({ salesMemberId, salesMemberEmail, repName, isAdmin }) {
  const [contacts, setContacts] = useState([]);
  // scheduledMap: contactKey -> ActivityLog record (the saved follow-up)
  const [scheduledMap, setScheduledMap] = useState({});
  // metaMap: contactKey -> { urgency, reason, suggestedOpener, patternTags } — only for display
  const [metaMap, setMetaMap] = useState({});
  const [insightCount, setInsightCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapActivity, setMapActivity] = useState(null);

  const sid = salesMemberId || localStorage.getItem('sales_member_id');
  const sem = salesMemberEmail || localStorage.getItem('sales_member_email');

  useEffect(() => {
    loadQueue();
  }, [salesMemberId, salesMemberEmail, refreshKey]);

  useEffect(() => {
    const handleOpenCallMapModal = (e) => {
      setMapActivity(e.detail?.activity || null);
      setMapOpen(true);
    };
    window.addEventListener('openCallMapModal', handleOpenCallMapModal);
    return () => window.removeEventListener('openCallMapModal', handleOpenCallMapModal);
  }, []);

  const loadQueue = async () => {
    setLoading(true);

    try {
      const [all, pastInsights] = await Promise.all([
        base44.entities.ActivityLog.list('-activity_date', 500),
        sid ? base44.entities.QueueInsight.filter({ sales_member_id: sid }, '-logged_at', 200) : Promise.resolve([])
      ]);

      setInsightCount(pastInsights.length);
      const learnedContext = buildLearnedContext(pastInsights);

      // Admins see all activities; reps see only their own
      const mine = isAdmin ? all : all.filter(a =>
        a.sales_member_id === sid ||
        a.sales_member_email === sem ||
        a.created_by === sem
      );

      const now = new Date();
      const startOfToday = startOfDay(now);

      // Separate future scheduled items from past activities
      const futureActivities = mine.filter(a => new Date(a.activity_date) >= startOfToday);
      const pastActivities = mine.filter(a => new Date(a.activity_date) < startOfToday);

      // Build contact map from ALL activities
      const contactMap = {};
      mine.forEach(a => {
        const key = a.contact_email || a.contact_name;
        if (!key) return;
        if (!contactMap[key]) {
          contactMap[key] = { key, name: a.contact_name || '', email: a.contact_email || '', company: a.company_name || '', phone: '', activities: [], past: [], upcoming: [] };
        }
        contactMap[key].activities.push(a);

        const notes = a.notes || '';
        const isLogged = notes.includes('[Queue Call]');
        // ONLY treat as AI-scheduled if it has the [AI Scheduled] prefix — NOT just any record with a call map
        const isAIScheduled = !isLogged && notes.includes('[AI Scheduled]');
        // HubSpot sync logs are NOT real interactions — always treat as past
        const isHubSpotSync = /^Contact (created|updated):/i.test(notes.trim());
        const isRealActivity = !isAIScheduled && !isLogged && !isHubSpotSync;

        // Tag each record for later resolution check
        a._isAIScheduled = isAIScheduled;
        a._isRealActivity = isRealActivity;

        if (!isLogged && !isHubSpotSync && (new Date(a.activity_date) >= startOfToday || isAIScheduled)) {
          contactMap[key].upcoming.push(a);
        } else {
          contactMap[key].past.push(a);
        }
        if (!contactMap[key].name && a.contact_name) contactMap[key].name = a.contact_name;
        if (!contactMap[key].company && a.company_name) contactMap[key].company = a.company_name;
        if (!contactMap[key].phone && a.contact_phone) contactMap[key].phone = a.contact_phone;
      });

      // Resolve AI-scheduled items that have been superseded by a real activity on/after their date
      Object.values(contactMap).forEach(c => {
        const realDates = c.activities
          .filter(a => a._isRealActivity)
          .map(a => new Date(a.activity_date));
        c.upcoming = c.upcoming.filter(a => {
          if (!a._isAIScheduled) return true;
          const aiDay = new Date(a.activity_date); aiDay.setHours(0,0,0,0);
          const resolvedByReal = realDates.some(d => d >= aiDay);
          if (resolvedByReal) { c.past.push(a); return false; }
          return true;
        });
      });

      const filtered = Object.values(contactMap).filter(c => {
        const name = c.name?.trim();
        if (!name) return false;
        if (/^\+?\d[\d\s\-().]+$/.test(name)) return false;
        if (/^\d+$/.test(name)) return false;
        // Include contacts with past real activities, HubSpot sync logs (new contacts), OR AI-scheduled upcoming items
        const hasAnyActivity = c.activities.length > 0;
        return hasAnyActivity;
      });

      setContacts(filtered);

      // Build scheduledMap: for each contact, keep ONLY the earliest upcoming scheduled call.
      // Delete any duplicates (extra AI-scheduled records) automatically.
      const newScheduledMap = {};
      const deletePromises = [];
      filtered.forEach(contact => {
        const upcoming = contact.upcoming
          .filter(a => a.activity_type === "call" || a.activity_type === "task")
          .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date));
        if (upcoming.length > 0) {
          newScheduledMap[contact.key] = upcoming[0];
          // ONLY delete duplicates that are AI-scheduled — never delete manually created tasks
          upcoming.slice(1).forEach(dupe => {
            if (dupe._isAIScheduled) {
              deletePromises.push(base44.entities.ActivityLog.delete(dupe.id).catch(() => {}));
            }
          });
        }
      });
      if (deletePromises.length > 0) Promise.all(deletePromises);
      // For "new" contacts (no past real interactions) whose scheduled task is > 1 day away,
      // delete the wrong far-future task so they get re-scheduled to same/next business day.
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      const deleteWrongSchedules = [];
      filtered.forEach(contact => {
        const scheduled = newScheduledMap[contact.key];
        if (!scheduled) return;
        // Check if this contact is "new" (no past real interactions)
        const pastReal = contact.activities.filter(a => {
          const notes = (a.notes || '').trim();
          const actDate = new Date(a.activity_date);
          const isPast = actDate <= new Date();
          const isSystemLog = /^Contact (created|updated):/i.test(notes);
          const isAIScheduled = /^\[AI Scheduled\]/i.test(notes);
          return isPast && !isSystemLog && !isAIScheduled;
        });
        const neverSpokenPhrases = /never spoken|never called|never talked|never contacted|haven't spoken|haven't called|has not been called|not yet called|first contact|no prior contact/i;
        const allNeverSpoken = pastReal.length > 0 && pastReal.every(a => neverSpokenPhrases.test(a.notes || ''));
        const isNew = pastReal.length === 0 || allNeverSpoken;

        if (isNew && new Date(scheduled.activity_date) > tomorrow) {
          deleteWrongSchedules.push(base44.entities.ActivityLog.delete(scheduled.id).catch(() => {}));
          delete newScheduledMap[contact.key];
        }
      });
      if (deleteWrongSchedules.length > 0) await Promise.all(deleteWrongSchedules);

      setScheduledMap(newScheduledMap);

      // Restore metaMap from existing scheduled activity notes so display works on reload
      const restoredMeta = {};
      filtered.forEach(contact => {
        const scheduled = newScheduledMap[contact.key];
        if (scheduled) {
          const notes = scheduled.notes || '';
          const reasonMatch = notes.match(/^\[AI Scheduled\]\s*([^|]+)/);
          const openerMatch = notes.match(/Opener:\s*(.+?)(?:\n|--- CALL MAP ---|$)/s);
          restoredMeta[contact.key] = {
            urgency: restoredMeta[contact.key]?.urgency || "medium",
            channel: "call",
            channelReason: "",
            reason: reasonMatch ? reasonMatch[1].trim() : "",
            suggestedOpener: openerMatch ? openerMatch[1].trim() : "",
            contactIntel: "",
            patternTags: []
          };
        }
      });
      setMetaMap(restoredMeta);

      setLoading(false);

      // For contacts that have NO scheduled follow-up yet, run AI to create one
      const needsScheduling = filtered.filter(c => !newScheduledMap[c.key]);

      if (needsScheduling.length > 0) {
        setScheduling(true);
        const newMeta = { ...metaMap };

        // Step 1: Run all AI analyses in parallel (fast)
        const analysisResults = await Promise.all(
          needsScheduling.map(async (contact) => {
            try {
              const analysis = await analyzeContact(contact, learnedContext);
              return { contact, analysis };
            } catch (e) {
              console.error(`Failed to analyze ${contact.name}`, e);
              return null;
            }
          })
        );

        // Step 2: Spread out contacts that land on the same time slot.
        // Group by day, then assign staggered times (30-min increments) per day.
        const validResults = analysisResults.filter(Boolean);
        
        // Track occupied slots: Map of "YYYY-MM-DD HH:mm" -> true
        // Seed with already-scheduled contacts
        const occupiedSlots = {};
        Object.values(newScheduledMap).forEach(record => {
          const d = new Date(record.activity_date);
          const key = `${format(d, 'yyyy-MM-dd')} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
          occupiedSlots[key] = true;
        });

        // Sort by suggested date so earlier ones get priority
        validResults.sort((a, b) => {
          const da = a.analysis?.follow_up_date_time ? new Date(a.analysis.follow_up_date_time) : new Date();
          const db = b.analysis?.follow_up_date_time ? new Date(b.analysis.follow_up_date_time) : new Date();
          return da - db;
        });

        // Assign non-conflicting slots
        validResults.forEach(({ contact, analysis }) => {
          if (!analysis?.follow_up_date_time) return;
          let date = new Date(analysis.follow_up_date_time);
          // Round to nearest 30-min slot
          const mins = date.getMinutes();
          date.setMinutes(mins < 30 ? 0 : 30, 0, 0);
          
          // Find next free 30-min slot within business hours (8am–7pm)
          let attempts = 0;
          while (attempts < 20) {
            const slotKey = `${format(date, 'yyyy-MM-dd')} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
            const hour = date.getHours();
            if (!occupiedSlots[slotKey] && hour >= 8 && hour < 19) {
              occupiedSlots[slotKey] = true;
              analysis.follow_up_date_time = date.toISOString();
              break;
            }
            // Move 30 mins forward
            date = new Date(date.getTime() + 30 * 60 * 1000);
            // Skip outside business hours — jump to 8am next business day
            if (date.getHours() >= 19 || date.getHours() < 8) {
              date.setDate(date.getDate() + 1);
              while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
              date.setHours(8, 0, 0, 0);
            }
            attempts++;
          }
        });

        // Step 3: Save all with the adjusted times
        await Promise.all(
          validResults.map(async ({ contact, analysis }) => {
            try {
              const savedRecord = await saveScheduledFollowUp(contact, analysis, sid, sem, newScheduledMap);
              newScheduledMap[contact.key] = savedRecord;
              newMeta[contact.key] = {
                urgency: analysis.urgency,
                channel: analysis.channel || "call",
                channelReason: analysis.channel_reason || "",
                reason: analysis.reason,
                suggestedOpener: analysis.suggested_opener,
                contactIntel: analysis.contact_intel || "",
                patternTags: analysis.pattern_tags || []
              };
            } catch (e) {
              console.error(`Failed to save schedule for ${contact.name}`, e);
            }
          })
        );

        setScheduledMap({ ...newScheduledMap });
        setMetaMap(newMeta);
        setScheduling(false);
      }

      // Generate call maps for all scheduled activities that don't have one yet
      const needsCallMap = filtered.filter(c => {
        const scheduled = newScheduledMap[c.key];
        if (!scheduled) return false;
        const notes = scheduled.notes || '';
        const hasCallMap = /--- CALL MAP ---/i.test(notes);
        return !hasCallMap;
      });

      if (needsCallMap.length > 0) {
        console.log(`[DailyCallQueue loadQueue] Generating call maps for ${needsCallMap.length} contacts...`);
        await Promise.all(
          needsCallMap.map(async (contact) => {
            try {
              const scheduled = newScheduledMap[contact.key];
              console.log(`[DailyCallQueue loadQueue] Generating call map for ${contact.name}`);
              const historySnippet = contact.past
                .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
                .slice(0, 15)
                .map(a => `${format(new Date(a.activity_date), "MMM d, yyyy")}: [${a.activity_type}] ${a.notes?.slice(0, 150)}`)
                .join("\n");
              
              const callMapRes = await base44.functions.invoke('regenerateCallMap', {
                contactName: contact.name,
                contactEmail: contact.email,
                companyName: contact.company,
                contactPhone: contact.phone,
                activityHistory: historySnippet || null,
              });

              const callMap = callMapRes?.data?.call_map;
              if (callMap && typeof callMap === 'string' && callMap.trim().length > 0) {
                console.log(`[DailyCallQueue loadQueue] Updating ActivityLog ${scheduled.id} with call_map, length: ${callMap.length}`);
                const updatedNotes = `${scheduled.notes || ''}\n\n--- CALL MAP ---\n${callMap}`;
                await base44.entities.ActivityLog.update(scheduled.id, {
                  notes: updatedNotes
                });
                // Directly update local state with the updated notes
                newScheduledMap[contact.key] = { ...scheduled, notes: updatedNotes };
                console.log(`[DailyCallQueue loadQueue] Updated local state with call_map for ${contact.name}`);
              } else {
                console.warn(`[DailyCallQueue loadQueue] Invalid/missing call_map for ${contact.name}:`, callMapRes?.data);
              }
            } catch (e) {
              console.error(`[DailyCallQueue loadQueue] Failed to generate call map for ${contact.name}:`, e);
            }
          })
        );
        // Force a complete state update to trigger re-renders
         console.log('[DailyCallQueue loadQueue] Call map generation complete. Final scheduled:', Object.keys(newScheduledMap).map(k => ({ contact: k, hasCallMap: !!newScheduledMap[k].call_map })));
         setScheduledMap({ ...newScheduledMap });
      }

    } catch (e) {
      console.error(e);
      setLoading(false);
      setScheduling(false);
    }
  };

  const today = startOfDay(new Date());

  // Contacts due today or overdue: their scheduled follow-up is today or in the past
  const dueContacts = contacts
    .filter(c => {
      const scheduled = scheduledMap[c.key];
      if (!scheduled) return false;
      const meta = metaMap[c.key];
      if (meta?.urgency === "skip") return false;
      return !isAfter(startOfDay(new Date(scheduled.activity_date)), today);
    })
    .sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      const ua = urgencyOrder[metaMap[a.key]?.urgency] ?? 1;
      const ub = urgencyOrder[metaMap[b.key]?.urgency] ?? 1;
      if (ua !== ub) return ua - ub;
      // Secondary sort: most overdue first
      return new Date(scheduledMap[a.key]?.activity_date) - new Date(scheduledMap[b.key]?.activity_date);
    });

  // Upcoming contacts: scheduled in the future
  const upcomingContacts = contacts
    .filter(c => {
      const scheduled = scheduledMap[c.key];
      if (!scheduled) return false;
      const meta = metaMap[c.key];
      if (meta?.urgency === "skip") return false;
      return isAfter(startOfDay(new Date(scheduled.activity_date)), today);
    })
    .sort((a, b) => new Date(scheduledMap[a.key]?.activity_date) - new Date(scheduledMap[b.key]?.activity_date))
    .slice(0, 5);

  const todayLabel = format(new Date(), "EEEE, MMMM d");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>Smart Call Queue</h2>
          <p className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>
            {todayLabel} · {dueContacts.length} due today
            {scheduling && <span className="ml-2 text-xs" style={{ color: '#B8956A' }}>· AI scheduling new contacts...</span>}
          </p>
          {insightCount > 0 && (
            <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'rgba(26,26,26,0.4)' }}>
              <Brain className="w-3 h-3" style={{ color: '#B8956A' }} />
              Learning from {insightCount} past outcomes
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)} className="gap-2" style={{ borderColor: 'rgba(184,149,106,0.4)', color: 'rgba(26,26,26,0.6)' }}>
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>

      {dueContacts.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Phone className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium" style={{ color: 'rgba(26,26,26,0.5)' }}>No contacts due today</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.4)' }}>
              All follow-ups are scheduled for future dates. Check "Coming Up" below.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.2)' }}>
            <p style={{ color: 'rgba(26,26,26,0.6)' }}>
              <span className="font-semibold" style={{ color: '#1A1A1A' }}>Start with:</span>{" "}
              <span className="font-semibold" style={{ color: '#B8956A' }}>{dueContacts[0]?.name}</span>
              {dueContacts[0] && `. Best time: ${getBestTime(dueContacts[0])}.`}
            </p>
          </div>
          {dueContacts.map((contact, idx) => {
            const meta = metaMap[contact.key] || {};
            return (
              <LeadCard
                key={contact.key}
                contact={contact}
                rank={idx + 1}
                repName={repName}
                salesMemberId={sid}
                scheduledFollowUp={scheduledMap[contact.key]}
                urgency={meta.urgency}
                channel={meta.channel || "call"}
                channelReason={meta.channelReason || ""}
                reason={meta.reason}
                suggestedOpener={meta.suggestedOpener}
                contactIntel={meta.contactIntel}
                patternTags={meta.patternTags}
                onOutcomeLogged={() => setRefreshKey(k => k + 1)}
              />
            );
          })}
        </div>
      )}

      {upcomingContacts.length > 0 && (
       <div className="mt-6">
         <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'rgba(26,26,26,0.4)' }}>Coming Up</p>
         <div className="space-y-2">
           {upcomingContacts.map(contact => (
             <UpcomingCard
               key={contact.key}
               contact={contact}
               scheduled={scheduledMap[contact.key]}
               meta={metaMap[contact.key] || {}}
               onDeleted={() => setRefreshKey(k => k + 1)}
             />
           ))}
         </div>
       </div>
      )}

      {mapActivity && (
       <ViewCallMapModal activity={mapActivity} open={mapOpen} onOpenChange={setMapOpen} />
      )}
      </div>
      );
      }