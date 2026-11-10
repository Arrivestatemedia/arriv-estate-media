import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, KeyRound, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchLaunchReadiness } from '@/lib/professionalVisibility';

const STATE_META = {
  ready: { label: 'Ready', icon: CheckCircle2, className: 'border-[#B8956A]/50 bg-[#FFFBF5]', tone: 'text-[#8C6F45]' },
  requires_configuration: { label: 'Requires configuration', icon: KeyRound, className: 'border-amber-300 bg-amber-50', tone: 'text-amber-800' },
  requires_authorization: { label: 'Requires your authorization', icon: ShieldAlert, className: 'border-[#1A1A1A]/15 bg-white', tone: 'text-[#1A1A1A]' },
  requires_production_verification: { label: 'Requires production verification', icon: Clock, className: 'border-slate-300 bg-slate-50', tone: 'text-slate-700' },
  blocked: { label: 'Blocked', icon: AlertTriangle, className: 'border-red-300 bg-red-50', tone: 'text-red-700' },
};

export default function LaunchReadiness() {
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  const load = () => {
    setState((prev) => ({ ...prev, loading: true }));
    fetchLaunchReadiness()
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch(() => setState({ loading: false, data: null, error: 'Launch readiness could not be loaded.' }));
  };

  useEffect(() => {
    load();
  }, []);

  if (state.loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#B8956A] rounded-full animate-spin" />
      </div>
    );
  }

  if (state.error) {
    return <div className="max-w-3xl mx-auto px-4 py-12 text-sm text-red-600">{state.error}</div>;
  }

  const data = state.data || {};
  const summary = data.summary || {};
  const components = data.components || [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#B8956A]">Administration</p>
          <h1 className="font-serif text-3xl md:text-4xl text-[#1A1A1A] mt-1">Launch readiness</h1>
          <p className="text-sm text-[#1A1A1A]/55 mt-1">
            What is actually configured right now. A passing test suite is never treated as proof that a live service works.
          </p>
        </div>
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
        {[
          ['Ready', summary.ready],
          ['Configuration', summary.requires_configuration],
          ['Authorization', summary.requires_authorization],
          ['Verification', summary.requires_production_verification],
          ['Blocked', summary.blocked],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#1A1A1A]/10 bg-white p-4">
            <p className="text-xs text-[#1A1A1A]/45">{label}</p>
            <p className="font-serif text-2xl text-[#1A1A1A] mt-1">{Number(value || 0)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {components.map((component) => {
          const meta = STATE_META[component.state] || STATE_META.requires_authorization;
          const Icon = meta.icon;
          return (
            <div key={component.id} className={`rounded-2xl border p-5 ${meta.className}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 mt-0.5 ${meta.tone}`} />
                  <h2 className="font-medium text-[#1A1A1A]">{component.label}</h2>
                </div>
                <span className={`text-xs font-medium ${meta.tone}`}>{meta.label}</span>
              </div>
              <p className="text-sm text-[#1A1A1A]/65 mt-2">{component.detail}</p>
              <p className="text-xs text-[#1A1A1A]/50 mt-2"><span className="font-medium">Next step:</span> {component.action}</p>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-[#1A1A1A]/40 mt-6">{data.note}</p>
      <p className="text-[11px] text-[#1A1A1A]/40 mt-1">Generated {data.generated_at ? new Date(data.generated_at).toLocaleString() : ''}</p>
    </div>
  );
}