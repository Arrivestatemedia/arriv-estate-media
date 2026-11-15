import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Check, Link2, Loader2, UserCheck } from 'lucide-react';
import { arrivOne } from '@/lib/arrivOneClient';

const FIELD_LABELS = {
  full_name: 'Name',
  first_name: 'First name',
  last_name: 'Last name',
  phone: 'Phone',
  email: 'Email',
  company: 'Brokerage',
  city: 'City',
  state: 'State',
  package_interest: 'Package interest',
  call_outcome: 'Call outcome',
  lead_status: 'Lead status',
  note: 'Note',
};

const EDITABLE = ['first_name', 'last_name', 'phone', 'email', 'company', 'city', 'state', 'package_interest', 'call_outcome', 'note', 'lead_status'];

export default function CommandReviewSheet({ open, onClose, execution, onApplied }) {
  const [fields, setFields] = useState({});
  const [candidateId, setCandidateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!execution) return;
    setFields(execution.extracted || {});
    const candidates = execution.candidates || [];
    setCandidateId(candidates.length === 1 ? candidates[0].id : '');
    setResult(null);
    setError('');
    setSaving(false);
  }, [execution]);

  if (!execution) return null;

  const candidates = execution.candidates || [];
  const actions = execution.proposed_actions || [];
  const warnings = execution.warnings || [];
  const needsChoice = candidates.length > 1 && ['update_prospect', 'log_call', 'create_task', 'update_status'].includes(execution.intent);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await arrivOne.apply({
        execution_id: execution.id,
        edits: { contact_id: candidateId || undefined, extracted: fields },
      });
      setResult(response.result || {});
      onApplied?.(response);
    } catch (err) {
      setError(err.message || 'The change could not be saved.');
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose?.()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white">
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-xl text-[#1A1A1A]">
            {result ? 'Saved' : 'Review before saving'}
          </SheetTitle>
          <SheetDescription className="text-[#1A1A1A]/60">
            {result ? 'Arriv One applied the approved changes.' : 'Correct anything that was misheard, then confirm.'}
          </SheetDescription>
        </SheetHeader>

        {result ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-[#B8956A]/30 bg-[#FFFBF5] p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-[#1A1A1A]">
                <Check className="h-4 w-4 text-[#B8956A]" /> {result.contact?.name || 'Record updated'}
              </p>
              {result.contact?.phone && <p className="mt-1 text-sm text-[#1A1A1A]/60">{result.contact.phone}</p>}
              {result.contact?.email && <p className="text-sm text-[#1A1A1A]/60">{result.contact.email}</p>}
            </div>
            {(result.notes || []).length > 0 && (
              <ul className="space-y-1 text-sm text-[#1A1A1A]/70">
                {result.notes.map((note, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="text-[#B8956A]">•</span> {note}
                  </li>
                ))}
              </ul>
            )}
            {result.lookup_requested && (
              <p className="rounded-lg bg-[#B8956A]/10 p-3 text-sm text-[#1A1A1A]/70">
                Email lookup requested. Open AI Prospecting to review the verified result before saving anything to the record.
              </p>
            )}
            <Button className="w-full bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-[#FFFBF5] p-3 text-sm text-[#1A1A1A]/70">
              <span className="font-medium text-[#1A1A1A]">You said: </span>
              “{execution.command_text}”
            </div>

            {candidates.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-[#1A1A1A]/50">
                  {needsChoice ? 'Choose the correct person' : 'Existing match'}
                </Label>
                <div className="space-y-2">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setCandidateId(candidate.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                        candidateId === candidate.id
                          ? 'border-[#B8956A] bg-[#B8956A]/10'
                          : 'border-[#1A1A1A]/10 bg-white'
                      }`}
                    >
                      <UserCheck className="mt-0.5 h-4 w-4 text-[#B8956A]" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[#1A1A1A]">{candidate.name || 'Unnamed contact'}</span>
                        <span className="block truncate text-xs text-[#1A1A1A]/55">
                          {[candidate.company, candidate.city, candidate.phone, candidate.email].filter(Boolean).join(' · ')}
                        </span>
                        <span className="mt-1 block text-[11px] text-[#1A1A1A]/40">
                          {(candidate.reasons || []).join(', ')}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {actions.length > 0 && (
              <div className="rounded-xl border border-[#1A1A1A]/10 p-3">
                <p className="text-xs uppercase tracking-wide text-[#1A1A1A]/50">Arriv One will</p>
                <ul className="mt-2 space-y-1 text-sm text-[#1A1A1A]/75">
                  {actions.map((action, index) => (
                    <li key={index} className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B8956A]" /> {action.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {EDITABLE.filter((key) => fields[key] !== undefined && fields[key] !== '' || ['first_name', 'last_name', 'phone', 'email'].includes(key)).map((key) => (
                <div key={key} className={key === 'note' || key === 'call_outcome' ? 'col-span-2' : ''}>
                  <Label className="text-xs text-[#1A1A1A]/60">{FIELD_LABELS[key]}</Label>
                  {key === 'note' || key === 'call_outcome' ? (
                    <Textarea
                      value={fields[key] || ''}
                      rows={2}
                      onChange={(event) => setFields((prev) => ({ ...prev, [key]: event.target.value }))}
                      className="mt-1 bg-white text-sm"
                    />
                  ) : (
                    <Input
                      value={fields[key] || ''}
                      onChange={(event) => setFields((prev) => ({ ...prev, [key]: event.target.value }))}
                      className="mt-1 bg-white text-sm"
                    />
                  )}
                </div>
              ))}
            </div>

            {fields.follow_up_iso !== undefined && (
              <div>
                <Label className="text-xs text-[#1A1A1A]/60">Follow-up</Label>
                <Input
                  type="datetime-local"
                  value={(fields.follow_up_iso || '').slice(0, 16)}
                  onChange={(event) => setFields((prev) => ({ ...prev, follow_up_iso: event.target.value }))}
                  className="mt-1 bg-white text-sm"
                />
                {fields.follow_up_phrase && (
                  <p className="mt-1 text-[11px] text-[#1A1A1A]/45">
                    Heard as “{fields.follow_up_phrase}”. Confirm the date above.
                  </p>
                )}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="space-y-1 rounded-xl border border-amber-300/60 bg-amber-50 p-3">
                {warnings.map((warning, index) => (
                  <p key={index} className="flex gap-2 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {warning}
                  </p>
                ))}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 pb-4">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
                onClick={save}
                disabled={saving || (needsChoice && !candidateId)}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm & save'}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}