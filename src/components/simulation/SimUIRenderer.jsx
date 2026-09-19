import React, { useState } from "react";
import { Search, Video, Package, Calendar, Users, FileText, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Building2, Home, User, Mail, Phone } from "lucide-react";
import { useSimulation } from "./SimulationContext";
import { PACKAGES, ADD_ONS, PRICING_TIERS, PREFERRED_CONFIG } from "@/lib/simulationScenarios";
import { calculateSimPricing, determineTier } from "@/lib/simulationEngine";

// --- Search List UI ---
function SearchListUI({ step, dispatch, simState }) {
  const [query, setQuery] = useState("");
  const dataKey = step.ui_config?.data_key;
  const items = simState[dataKey] || [];
  const displayFields = step.ui_config?.display_fields || [];

  const filtered = items.filter(item =>
    displayFields.some(f => String(item[f] || "").toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1A1A1A]/40" />
        <input
          type="text"
          placeholder={step.ui_config?.search_placeholder || "Search..."}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#B8956A]/30 bg-white text-[#1A1A1A] placeholder-[#1A1A1A]/40 focus:outline-none focus:border-[#B8956A]"
        />
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {filtered.map(item => (
          <button
            key={item.id}
            onClick={() => dispatch(step.expected_action, { prospect_id: item.id, property_id: item.id, contact_id: item.id })}
            className="w-full text-left p-3 rounded-lg border border-[#B8956A]/20 bg-white hover:border-[#B8956A] hover:bg-[#B8956A]/5 transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                {displayFields.includes("name") && <p className="font-medium text-[#1A1A1A]">{item.name}</p>}
                {displayFields.includes("address") && <p className="font-medium text-[#1A1A1A]">{item.address}</p>}
                <p className="text-sm text-[#1A1A1A]/60">
                  {displayFields.filter(f => !["name", "address"].includes(f)).map(f => item[f]).join(" · ")}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#B8956A] flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-center text-[#1A1A1A]/40 py-8 text-sm">No results found.</p>}
      </div>
    </div>
  );
}

// --- Video Check UI ---
function VideoCheckUI({ step, dispatch, simState }) {
  const prospectKey = step.ui_config?.prospect_key;
  const prospect = prospectKey === "prospect" ? simState.prospect : (simState.prospects || []).find(p => p.id === simState[prospectKey]);
  const [checked, setChecked] = useState(simState.video_check_done);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-[#B8956A]/15 flex items-center justify-center">
            <User className="w-5 h-5 text-[#B8956A]" />
          </div>
          <div>
            <p className="font-medium text-[#1A1A1A]">{prospect?.name || "Prospect"}</p>
            <p className="text-sm text-[#1A1A1A]/60">{prospect?.role} · {prospect?.brokerage}</p>
          </div>
        </div>
        <div className="text-sm space-y-1 text-[#1A1A1A]/70">
          <p><Home className="w-3.5 h-3.5 inline mr-1" /> {prospect?.listing_address}</p>
          <p><Building2 className="w-3.5 h-3.5 inline mr-1" /> {prospect?.market}</p>
        </div>
      </div>
      {checked ? (
        <div className={`p-4 rounded-lg border ${simState.video_check_result === "PROFESSIONAL_VIDEO_PRESENT" ? "border-amber-400 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}>
          <div className="flex items-center gap-2">
            {simState.video_check_result === "PROFESSIONAL_VIDEO_PRESENT" ? <AlertTriangle className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            <p className="font-medium text-[#1A1A1A]">
              {simState.video_check_result === "PROFESSIONAL_VIDEO_PRESENT" ? "Professional video already exists — opportunity may be limited" : "No professional video found — media opportunity exists"}
            </p>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setChecked(true); dispatch(step.expected_action, { result: prospect?.has_professional_video ? "PROFESSIONAL_VIDEO_PRESENT" : "NO_PROFESSIONAL_VIDEO" }); }}
          className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors flex items-center justify-center gap-2"
        >
          <Video className="w-4 h-4" /> Run Professional Video Check
        </button>
      )}
    </div>
  );
}

// --- Pricing Calculator UI ---
function PricingUI({ step, dispatch, simState }) {
  const [selectedPackage, setSelectedPackage] = useState(simState.selected_package || "");
  const [addOns, setAddOns] = useState(simState.selected_add_ons || []);
  const [preferred, setPreferred] = useState(simState.preferred_active || false);

  const property = step.ui_config?.property_key ? simState[step.ui_config.property_key] : simState.selected_property;
  const sqft = property?.sqft;
  const tier = determineTier(sqft);
  const tierConfig = PRICING_TIERS.find(t => t.tier === tier);
  const pricing = selectedPackage ? calculateSimPricing(sqft, selectedPackage, addOns, preferred) : null;

  const toggleAddOn = (id) => setAddOns(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);

  return (
    <div className="space-y-4">
      {property && (
        <div className="p-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/20">
          <p className="text-sm text-[#1A1A1A]/70">{property.address}</p>
          <p className="text-sm text-[#1A1A1A]/60">{sqft} sqft · <span className="font-medium text-[#B8956A]">{tier}</span></p>
        </div>
      )}
      {tier === "CUSTOM" && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 inline mr-1" /> Properties over 10,000 sqft require a custom quote. Escalate to manager.
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-[#1A1A1A] mb-2">Select Package</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PACKAGES.map(pkg => {
            const price = tierConfig?.prices?.[pkg.id];
            return (
              <button
                key={pkg.id}
                onClick={() => setSelectedPackage(pkg.id)}
                disabled={tier === "CUSTOM"}
                className={`p-3 rounded-lg border text-left transition-all disabled:opacity-50 ${selectedPackage === pkg.id ? "border-[#B8956A] bg-[#B8956A]/10" : "border-[#B8956A]/20 bg-white hover:border-[#B8956A]/50"}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#1A1A1A]">{pkg.name}</p>
                    <p className="text-xs text-[#1A1A1A]/50">{pkg.description}</p>
                  </div>
                  {price != null && <p className="font-bold text-[#B8956A]">${price}</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-[#1A1A1A] mb-2">Add-Ons (Optional)</p>
        <div className="space-y-1.5">
          {ADD_ONS.map(ao => (
            <label key={ao.id} className="flex items-center justify-between p-2 rounded-lg border border-[#B8956A]/15 bg-white cursor-pointer hover:bg-[#B8956A]/5">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={addOns.includes(ao.id)} onChange={() => toggleAddOn(ao.id)} className="accent-[#B8956A]" />
                <span className="text-sm text-[#1A1A1A]">{ao.name}</span>
              </div>
              <span className="text-sm font-medium text-[#1A1A1A]/70">${ao.price}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 p-2 rounded-lg border border-[#B8956A]/15 bg-white cursor-pointer">
        <input type="checkbox" checked={preferred} onChange={e => setPreferred(e.target.checked)} className="accent-[#B8956A]" />
        <span className="text-sm text-[#1A1A1A]">Preferred Member (10% off non-MLS, $5 off MLS — ${PREFERRED_CONFIG.monthly_price}/mo)</span>
      </label>
      {pricing?.status === "OK" && (
        <div className="p-3 rounded-lg bg-[#1A1A1A] text-[#FFFBF5] space-y-1 text-sm">
          <div className="flex justify-between"><span>Package:</span><span>${pricing.packagePrice}</span></div>
          {pricing.preferredDiscount > 0 && <div className="flex justify-between text-[#B8956A]"><span>Preferred discount:</span><span>-${pricing.preferredDiscount.toFixed(2)}</span></div>}
          {pricing.addOnsSubtotal > 0 && <div className="flex justify-between"><span>Add-ons:</span><span>${pricing.addOnsSubtotal}</span></div>}
          <div className="flex justify-between font-bold pt-1 border-t border-[#FFFBF5]/20"><span>Total:</span><span>${pricing.total.toFixed(2)}</span></div>
        </div>
      )}
      <button
        onClick={() => dispatch(step.expected_action, { package_id: selectedPackage, add_ons: addOns, preferred_active: preferred })}
        disabled={!selectedPackage}
        className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Package className="w-4 h-4" /> Confirm Pricing
      </button>
    </div>
  );
}

// --- Booking Form UI ---
function BookingFormUI({ step, dispatch, simState }) {
  const [formData, setFormData] = useState({ package_id: "", preferred_date: "", preferred_time: "", notes: "" });
  const property = simState.property || simState.selected_property;

  return (
    <div className="space-y-3">
      {property && <div className="p-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/20"><p className="text-sm text-[#1A1A1A]/70">{property.address || property.listing_address}</p></div>}
      <div>
        <label className="text-sm font-medium text-[#1A1A1A] block mb-1">Package</label>
        <select value={formData.package_id} onChange={e => setFormData(d => ({ ...d, package_id: e.target.value }))} className="w-full p-2.5 rounded-lg border border-[#B8956A]/30 bg-white text-[#1A1A1A]">
          <option value="">Select a package...</option>
          {PACKAGES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-[#1A1A1A] block mb-1">Preferred Date</label>
          <input type="date" value={formData.preferred_date} onChange={e => setFormData(d => ({ ...d, preferred_date: e.target.value }))} className="w-full p-2.5 rounded-lg border border-[#B8956A]/30 bg-white text-[#1A1A1A]" />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1A1A1A] block mb-1">Preferred Time</label>
          <input type="time" value={formData.preferred_time} onChange={e => setFormData(d => ({ ...d, preferred_time: e.target.value }))} className="w-full p-2.5 rounded-lg border border-[#B8956A]/30 bg-white text-[#1A1A1A]" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-[#1A1A1A] block mb-1">Notes</label>
        <textarea value={formData.notes} onChange={e => setFormData(d => ({ ...d, notes: e.target.value }))} rows={3} className="w-full p-2.5 rounded-lg border border-[#B8956A]/30 bg-white text-[#1A1A1A]" placeholder="Special requests..." />
      </div>
      <button onClick={() => dispatch(step.expected_action, formData)} disabled={!formData.package_id} className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
        <Calendar className="w-4 h-4" /> Confirm Booking
      </button>
    </div>
  );
}

// --- Pipeline UI ---
function PipelineUI({ step, dispatch, simState }) {
  const stages = simState[step.ui_config?.stages_key] || [];
  const contacts = simState[step.ui_config?.contacts_key] || [];
  const [selectedId, setSelectedId] = useState(simState.selected_contact_id);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {stages.map(stage => (
          <div key={stage} className="flex-1 min-w-[180px]">
            <p className="text-xs font-medium text-[#1A1A1A]/60 uppercase mb-2 px-1">{stage}</p>
            <div className="space-y-2">
              {contacts.filter(c => c.stage === stage).map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); dispatch("select_contact", { contact_id: c.id }); }}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${selectedId === c.id ? "border-[#B8956A] bg-[#B8956A]/10" : "border-[#B8956A]/20 bg-white hover:border-[#B8956A]/50"}`}
                >
                  <p className="font-medium text-sm text-[#1A1A1A]">{c.name}</p>
                  <p className="text-xs text-[#1A1A1A]/50">{c.company}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {selectedId && (
        <div className="p-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/20">
          <p className="text-sm text-[#1A1A1A]/70">Selected: {contacts.find(c => c.id === selectedId)?.name}</p>
          <p className="text-xs text-[#1A1A1A]/50">Click "Continue" to advance this contact.</p>
          <button onClick={() => dispatch("advance_contact", { contact_id: selectedId, to_stage: "opportunity" })} className="mt-2 px-4 py-1.5 rounded-lg bg-[#B8956A] text-white text-sm font-medium hover:bg-[#A68559]">
            Advance to Next Stage
          </button>
        </div>
      )}
    </div>
  );
}

// --- Form UI ---
function FormUI({ step, dispatch }) {
  const [formData, setFormData] = useState({});
  const fields = step.ui_config?.fields || [];

  return (
    <div className="space-y-3">
      {fields.map(field => (
        <div key={field.key}>
          <label className="text-sm font-medium text-[#1A1A1A] block mb-1">{field.label}</label>
          {field.type === "textarea" ? (
            <textarea value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} rows={4} placeholder={field.placeholder || ""} className="w-full p-2.5 rounded-lg border border-[#B8956A]/30 bg-white text-[#1A1A1A]" />
          ) : field.type === "select" ? (
            <select value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} className="w-full p-2.5 rounded-lg border border-[#B8956A]/30 bg-white text-[#1A1A1A]">
              <option value="">Select...</option>
              {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : field.type === "multiselect" ? (
            <div className="space-y-1.5">
              {field.options?.map(o => (
                <label key={o} className="flex items-center gap-2 p-2 rounded-lg border border-[#B8956A]/15 bg-white cursor-pointer">
                  <input type="checkbox" checked={(formData[field.key] || []).includes(o)} onChange={e => { const cur = formData[field.key] || []; setFormData(d => ({ ...d, [field.key]: e.target.checked ? [...cur, o] : cur.filter(x => x !== o) })); }} className="accent-[#B8956A]" />
                  <span className="text-sm text-[#1A1A1A]">{o}</span>
                </label>
              ))}
            </div>
          ) : field.type === "checkbox" ? (
            <label className="flex items-center gap-2 p-2 rounded-lg border border-[#B8956A]/15 bg-white cursor-pointer">
              <input type="checkbox" checked={!!formData[field.key]} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.checked }))} className="accent-[#B8956A]" />
              <span className="text-sm text-[#1A1A1A]">{field.label}</span>
            </label>
          ) : (
            <input type={field.type || "text"} value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} placeholder={field.placeholder || ""} className="w-full p-2.5 rounded-lg border border-[#B8956A]/30 bg-white text-[#1A1A1A]" />
          )}
        </div>
      ))}
      <button onClick={() => dispatch(step.expected_action, formData)} className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors flex items-center justify-center gap-2">
        <FileText className="w-4 h-4" /> Submit
      </button>
    </div>
  );
}

// --- Info UI ---
function InfoUI({ step, dispatch, simState }) {
  const prospect = simState.selected_prospect || simState.prospect;
  const customer = simState.customer;
  const project = simState.project;
  const objection = simState.objection;
  const question = simState.question || customer?.question;

  return (
    <div className="space-y-3">
      {step.ui_config?.show_prospect && prospect && (
        <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
          <p className="font-medium text-[#1A1A1A]">{prospect.name}</p>
          <p className="text-sm text-[#1A1A1A]/60">{prospect.role} · {prospect.brokerage}</p>
          <p className="text-sm text-[#1A1A1A]/60 mt-1">{prospect.listing_address}</p>
        </div>
      )}
      {step.ui_config?.show_customer && customer && (
        <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
          <p className="font-medium text-[#1A1A1A]">{customer.name}</p>
          <p className="text-sm text-[#1A1A1A]/60">{customer.email}</p>
        </div>
      )}
      {step.ui_config?.show_objection && objection && (
        <div className="p-4 rounded-lg border border-amber-300 bg-amber-50">
          <p className="text-sm font-medium text-amber-800 mb-1">Customer Objection:</p>
          <p className="text-sm text-amber-700">"{objection}"</p>
        </div>
      )}
      {step.ui_config?.show_question && question && (
        <div className="p-4 rounded-lg border border-blue-300 bg-blue-50">
          <p className="text-sm font-medium text-blue-800 mb-1">Customer Question:</p>
          <p className="text-sm text-blue-700">"{question}"</p>
        </div>
      )}
      {step.ui_config?.show_project && project && (
        <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
          <p className="font-medium text-[#1A1A1A]">{project.customer} — {project.property}</p>
          <p className="text-sm text-[#1A1A1A]/60">Package: {project.package} · Status: {project.status}</p>
        </div>
      )}
      {step.ui_config?.show_summary && (
        <div className="p-4 rounded-lg border border-emerald-300 bg-emerald-50">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-1" />
          <p className="text-sm text-emerald-800">Research complete. Ready to proceed.</p>
        </div>
      )}
      {step.ui_config?.show_account_status && (
        <div className="p-4 rounded-lg border border-emerald-300 bg-emerald-50">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-1" />
          <p className="text-sm text-emerald-800">Customer account created successfully (simulated).</p>
        </div>
      )}
      <button onClick={() => dispatch(step.expected_action, {})} className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors flex items-center justify-center gap-2">
        Continue <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Teachback UI ---
function TeachbackUI({ step, dispatch }) {
  const [response, setResponse] = useState("");
  const fieldKey = step.ui_config?.field_key || "response";

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/20">
        <p className="text-sm font-medium text-[#1A1A1A]">{step.ui_config?.prompt}</p>
      </div>
      <textarea value={response} onChange={e => setResponse(e.target.value)} rows={5} className="w-full p-3 rounded-lg border border-[#B8956A]/30 bg-white text-[#1A1A1A]" placeholder="Type your explanation as if teaching a new customer..." />
      <button onClick={() => dispatch(step.expected_action, { [fieldKey]: response })} disabled={!response.trim()} className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors disabled:opacity-50">
        Submit Teach-Back
      </button>
    </div>
  );
}

// --- Boundary UI ---
function BoundaryUI({ step, dispatch }) {
  const choices = step.ui_config?.choices || [];

  return (
    <div className="space-y-2">
      {choices.map(choice => (
        <button
          key={choice.action}
          onClick={() => dispatch(choice.action, { choice: choice.label })}
          className={`w-full text-left p-3 rounded-lg border transition-all ${choice.correct ? "border-emerald-300 bg-emerald-50 hover:border-emerald-400" : "border-red-300 bg-red-50 hover:border-red-400"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#1A1A1A]">{choice.label}</span>
            {choice.correct ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
          </div>
        </button>
      ))}
    </div>
  );
}

// --- Lifecycle UI ---
function LifecycleUI({ step, dispatch, simState }) {
  const steps = simState[step.ui_config?.steps_key] || simState.lifecycle || simState.lifecycle_steps || [];
  const currentStep = simState[step.ui_config?.current_step_key] ?? simState.current_step ?? simState.current_lifecycle_step ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center">
            <div className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${i < currentStep ? "bg-emerald-100 text-emerald-700" : i === currentStep ? "bg-[#B8956A] text-white" : "bg-[#1A1A1A]/5 text-[#1A1A1A]/40"}`}>
              {s}
            </div>
            {i < steps.length - 1 && <div className={`w-4 h-0.5 ${i < currentStep ? "bg-emerald-300" : "bg-[#1A1A1A]/10"}`} />}
          </div>
        ))}
      </div>
      {currentStep < steps.length - 1 ? (
        <button onClick={() => dispatch(step.expected_action, {})} className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors flex items-center justify-center gap-2">
          Advance to {steps[currentStep + 1]} <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-1" />
          <p className="text-sm text-emerald-800">Lifecycle complete!</p>
        </div>
      )}
    </div>
  );
}

// --- Customer View UI ---
function CustomerViewUI({ step, dispatch, simState }) {
  const account = simState.customer_account;
  if (!account) return null;

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-[#B8956A]/15 flex items-center justify-center"><User className="w-5 h-5 text-[#B8956A]" /></div>
          <div><p className="font-medium text-[#1A1A1A]">{account.name}</p><p className="text-sm text-[#1A1A1A]/60">{account.email}</p></div>
          {account.membership && <span className="ml-auto text-xs bg-[#B8956A]/15 text-[#B8956A] px-2 py-1 rounded-full">{account.membership}</span>}
        </div>
        {step.ui_config?.show_customer_dashboard && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#1A1A1A]">Your Bookings</p>
            {account.bookings?.map(b => (
              <div key={b.id} className="p-2.5 rounded-lg bg-[#1A1A1A]/5">
                <p className="text-sm font-medium text-[#1A1A1A]">{b.property}</p>
                <p className="text-xs text-[#1A1A1A]/60">{b.package} · {b.status}</p>
              </div>
            ))}
          </div>
        )}
        {step.ui_config?.show_deliverables && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#1A1A1A]">Your Deliverables</p>
            {account.bookings?.filter(b => b.status === "delivered").map(b => (
              <div key={b.id} className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-sm text-emerald-800">{b.property} — Ready to view</p>
              </div>
            ))}
          </div>
        )}
        {step.ui_config?.show_membership && (
          <div className="p-3 rounded-lg bg-[#B8956A]/10">
            <p className="text-sm font-medium text-[#B8956A]">Preferred Membership Active</p>
            <p className="text-xs text-[#1A1A1A]/60">10% off non-MLS packages · $5 off MLS</p>
          </div>
        )}
      </div>
      <button onClick={() => dispatch(step.expected_action, {})} className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors flex items-center justify-center gap-2">
        Continue <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Media Specialist View UI ---
function MediaSpecialistViewUI({ step, dispatch, simState }) {
  const ms = simState.media_specialist;
  if (!ms) return null;

  return (
    <div className="space-y-3">
      {step.ui_config?.show_role_overview && (
        <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[#B8956A]/15 flex items-center justify-center"><Users className="w-5 h-5 text-[#B8956A]" /></div>
            <div><p className="font-medium text-[#1A1A1A]">{ms.name}</p><p className="text-sm text-[#1A1A1A]/60">{ms.role}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="p-2 rounded-lg bg-[#1A1A1A]/5"><p className="text-[#1A1A1A]/60">Assigned Jobs</p><p className="font-medium text-[#1A1A1A]">{ms.assigned_jobs}</p></div>
            <div className="p-2 rounded-lg bg-[#1A1A1A]/5"><p className="text-[#1A1A1A]/60">Completed Jobs</p><p className="font-medium text-[#1A1A1A]">{ms.completed_jobs}</p></div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {ms.capabilities?.map(c => <span key={c} className="text-xs bg-[#B8956A]/15 text-[#B8956A] px-2 py-0.5 rounded-full">{c}</span>)}
          </div>
          <p className="text-xs text-[#1A1A1A]/40 mt-2">Note: Provider payout details are not exposed to customers or in customer-facing scenarios.</p>
        </div>
      )}
      <button onClick={() => dispatch(step.expected_action, {})} className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors flex items-center justify-center gap-2">
        Continue <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Customer Simulation UI (full lifecycle) ---
function CustomerSimulationUI({ step, dispatch, simState }) {
  const phases = simState.phases || [];
  const currentPhase = simState.current_phase || 0;
  const customer = simState.customer;
  const property = simState.property;
  const pricing = simState.pricing_result;

  const phaseLabels = ["Discovery", "Pricing", "Booking", "Project", "Deliverables", "Billing", "Support", "Satisfaction", "Follow-Up"];

  return (
    <div className="space-y-4">
      {customer && (
        <div className="p-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/20">
          <p className="font-medium text-[#1A1A1A]">{customer.name} — {customer.company}</p>
          <p className="text-sm text-[#1A1A1A]/60">{property?.address} · {property?.sqft} sqft</p>
        </div>
      )}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {phaseLabels.map((label, i) => (
          <div key={i} className="flex items-center">
            <div className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${i < currentPhase ? "bg-emerald-100 text-emerald-700" : i === currentPhase ? "bg-[#B8956A] text-white" : "bg-[#1A1A1A]/5 text-[#1A1A1A]/40"}`}>
              {i + 1}. {label}
            </div>
            {i < phaseLabels.length - 1 && <div className={`w-3 h-0.5 ${i < currentPhase ? "bg-emerald-300" : "bg-[#1A1A1A]/10"}`} />}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="p-3 rounded-lg border border-[#B8956A]/20 bg-white">
          <p className="text-sm font-medium text-[#1A1A1A] mb-1">Project Status → Deliverables → Billing → Support → Satisfaction → Follow-Up</p>
          <p className="text-sm text-[#1A1A1A]/60">After booking, the project moves through capture, editing, and delivery. The customer receives notifications at each stage.</p>
        </div>
        {pricing?.status === "OK" && (
          <div className="p-3 rounded-lg bg-[#1A1A1A] text-[#FFFBF5] text-sm">
            <p className="font-medium">Pricing Confirmed: ${pricing.total.toFixed(2)}</p>
            <p className="text-xs text-[#FFFBF5]/60 mt-1">Tier: {pricing.tier} · Package: ${pricing.packagePrice}</p>
          </div>
        )}
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-800"><AlertTriangle className="w-4 h-4 inline mr-1" />Do NOT expose internal provider payout details to the customer.</p>
        </div>
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <p className="text-sm text-emerald-800"><CheckCircle2 className="w-4 h-4 inline mr-1" />Satisfaction check within 1 business day. Follow-up 7–14 days later.</p>
        </div>
      </div>
      <button onClick={() => dispatch(step.expected_action, {})} className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors flex items-center justify-center gap-2">
        Complete Lifecycle <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Provider Boundary UI (customer-visible provider lifecycle) ---
function ProviderBoundaryUI({ step, dispatch, simState }) {
  const ms = simState.media_specialist;
  const lifecycleSteps = simState.lifecycle_steps || [];

  return (
    <div className="space-y-4">
      {step.ui_config?.show_qualification && (
        <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
          <p className="font-medium text-[#1A1A1A] mb-2">Provider Qualification</p>
          <p className="text-sm text-[#1A1A1A]/70 mb-2">A Media Specialist is matched based on <strong>verified capabilities</strong> and <strong>coverage area</strong>. Only verified capabilities determine job eligibility.</p>
          {ms && (
            <div className="flex flex-wrap gap-1 mt-2">
              {ms.capabilities?.map(c => <span key={c} className="text-xs bg-[#B8956A]/15 text-[#B8956A] px-2 py-0.5 rounded-full">{c}</span>)}
            </div>
          )}
          <p className="text-xs text-[#1A1A1A]/40 mt-2">Sales does NOT recruit providers through AO prospecting.</p>
        </div>
      )}
      {step.ui_config?.show_job_board && (
        <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
          <p className="font-medium text-[#1A1A1A] mb-2">Job Board</p>
          <p className="text-sm text-[#1A1A1A]/70">The job appears on the Job Board for qualified Media Specialists. Jobs are filtered by verified capabilities and coverage area.</p>
        </div>
      )}
      {step.ui_config?.show_assignment && (
        <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
          <p className="font-medium text-[#1A1A1A] mb-2">Accepted Assignment</p>
          <p className="text-sm text-[#1A1A1A]/70">A Media Specialist accepts the assignment. The customer is notified: assigned → on the way → on site → completed.</p>
        </div>
      )}
      {step.ui_config?.show_capture && (
        <div className="p-4 rounded-lg border border-[#B8956A]/20 bg-white">
          <p className="font-medium text-[#1A1A1A] mb-2">On-Site Capture</p>
          <p className="text-sm text-[#1A1A1A]/70">The Media Specialist captures photos/videos on site. Customer gets status updates at each stage.</p>
        </div>
      )}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {lifecycleSteps.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${s.customer_visible ? "bg-[#B8956A]/15 text-[#B8956A]" : "bg-red-50 text-red-600"}`}>
              {s.label}
            </div>
            {i < lifecycleSteps.length - 1 && <div className="w-3 h-0.5 bg-[#1A1A1A]/10" />}
          </div>
        ))}
      </div>
      <div className="p-3 rounded-lg bg-red-50 border border-red-200">
        <p className="text-sm text-red-700"><XCircle className="w-4 h-4 inline mr-1" />Payout Status is INTERNAL — not shared with the customer. Provider payout details are internal. Do not expose them.</p>
      </div>
      <button onClick={() => dispatch(step.expected_action, {})} className="w-full py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors flex items-center justify-center gap-2">
        Continue <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Main Renderer Switch ---
export default function SimUIRenderer({ step }) {
  const { dispatch, simState } = useSimulation();
  if (!step) return null;

  switch (step.ui_type) {
    case "search_list": return <SearchListUI step={step} dispatch={dispatch} simState={simState} />;
    case "video_check": return <VideoCheckUI step={step} dispatch={dispatch} simState={simState} />;
    case "pricing": return <PricingUI step={step} dispatch={dispatch} simState={simState} />;
    case "booking_form": return <BookingFormUI step={step} dispatch={dispatch} simState={simState} />;
    case "pipeline": return <PipelineUI step={step} dispatch={dispatch} simState={simState} />;
    case "form": return <FormUI step={step} dispatch={dispatch} />;
    case "info": return <InfoUI step={step} dispatch={dispatch} simState={simState} />;
    case "teachback": return <TeachbackUI step={step} dispatch={dispatch} />;
    case "boundary": return <BoundaryUI step={step} dispatch={dispatch} />;
    case "lifecycle": return <LifecycleUI step={step} dispatch={dispatch} simState={simState} />;
    case "customer_view": return <CustomerViewUI step={step} dispatch={dispatch} simState={simState} />;
    case "media_specialist_view": return <MediaSpecialistViewUI step={step} dispatch={dispatch} simState={simState} />;
    case "customer_simulation": return <CustomerSimulationUI step={step} dispatch={dispatch} simState={simState} />;
    case "provider_boundary": return <ProviderBoundaryUI step={step} dispatch={dispatch} simState={simState} />;
    default: return <div className="text-sm text-[#1A1A1A]/40">Unknown UI type: {step.ui_type}</div>;
  }
}