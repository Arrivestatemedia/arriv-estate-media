import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardList, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { SIMULATION_LEVELS } from "@/lib/simulationScenarios";

export default function ManagerReview({ learnerId, isAdmin }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const loadEvents = async () => {
    setLoading(true);
    try {
      const query = isAdmin ? {} : { learner_id: learnerId };
      const result = await base44.entities.TrainingSimulationEvent.filter(query, "-timestamp", 100);
      setEvents(result || []);
    } catch (e) {
      console.error("Failed to load simulation events:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEvents(); }, []);

  const filtered = filter === "all" ? events : events.filter(e => e.validation_result === filter);

  const stats = {
    total: events.length,
    correct: events.filter(e => e.validation_result === "correct").length,
    warnings: events.filter(e => e.validation_result === "warning").length,
    failures: events.filter(e => e.validation_result === "critical_failure").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif text-[#1A1A1A] flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[#B8956A]" /> Simulation Event Log
        </h3>
        <button onClick={loadEvents} className="p-2 rounded-lg hover:bg-[#B8956A]/10 text-[#B8956A]"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="p-2 rounded-lg bg-[#1A1A1A]/5 text-center"><p className="text-xs text-[#1A1A1A]/60">Total</p><p className="text-lg font-bold text-[#1A1A1A]">{stats.total}</p></div>
        <div className="p-2 rounded-lg bg-emerald-50 text-center"><p className="text-xs text-emerald-700">Correct</p><p className="text-lg font-bold text-emerald-600">{stats.correct}</p></div>
        <div className="p-2 rounded-lg bg-amber-50 text-center"><p className="text-xs text-amber-700">Warnings</p><p className="text-lg font-bold text-amber-600">{stats.warnings}</p></div>
        <div className="p-2 rounded-lg bg-red-50 text-center"><p className="text-xs text-red-700">Failures</p><p className="text-lg font-bold text-red-600">{stats.failures}</p></div>
      </div>

      <div className="flex gap-1.5">
        {["all", "correct", "warning", "critical_failure"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium ${filter === f ? "bg-[#B8956A] text-white" : "bg-[#1A1A1A]/5 text-[#1A1A1A]/60"}`}>
            {f === "all" ? "All" : f.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-[#1A1A1A]/40 text-sm">Loading events...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-[#1A1A1A]/40 text-sm">No simulation events recorded yet.</div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filtered.map(evt => (
            <div key={evt.event_id} className="p-3 rounded-lg border border-[#B8956A]/15 bg-white text-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {evt.validation_result === "correct" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> :
                   evt.validation_result === "critical_failure" ? <XCircle className="w-4 h-4 text-red-500" /> :
                   <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  <span className="font-medium text-[#1A1A1A]">{evt.action}</span>
                </div>
                <span className="text-xs text-[#1A1A1A]/40">{new Date(evt.timestamp).toLocaleString()}</span>
              </div>
              <p className="text-xs text-[#1A1A1A]/60">{evt.scenario_id} · {evt.screen} · {evt.level?.replace("_", " ")}</p>
              {evt.validation_notes && <p className="text-xs text-[#1A1A1A]/50 mt-1">{evt.validation_notes}</p>}
              {evt.learner_name && isAdmin && <p className="text-xs text-[#B8956A] mt-1">Learner: {evt.learner_name}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}