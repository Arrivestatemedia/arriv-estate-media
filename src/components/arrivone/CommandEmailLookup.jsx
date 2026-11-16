import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { arrivOne } from '@/lib/arrivOneClient';

const place = (person) => [person?.brokerage, person?.city, person?.state].filter(Boolean).join(' · ');

/**
 * Turns a requested email lookup into the address actually being on the record.
 * The search only proposes; the rep presses save, so nothing is written unseen.
 */
export default function CommandEmailLookup({ lookup, contactId, contactName, onSaved }) {
  const [state, setState] = useState({ status: 'loading', results: [], notice: '' });
  const [manual, setManual] = useState('');
  const [saving, setSaving] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  const name = lookup?.full_name || contactName || '';
  const company = lookup?.company || '';
  const city = lookup?.city || '';
  const stateCode = lookup?.state || '';

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', results: [], notice: '' });
    setSaved('');
    setError('');
    if (!name) {
      setState({ status: 'done', results: [], notice: 'A first and last name are needed to look this person up.' });
      return () => { cancelled = true; };
    }
    arrivOne
      .lookupEmail({ full_name: name, company, city, state: stateCode })
      .then((data) => {
        if (cancelled) return;
        setState({
          status: 'done',
          results: (data.results || []).filter((person) => person?.email),
          notice: data.notice || '',
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', results: [], notice: err?.message || 'The lookup could not be completed.' });
      });
    return () => { cancelled = true; };
  }, [name, company, city, stateCode]);

  const save = async (email, person) => {
    const address = String(email || '').trim();
    if (!address || !contactId) return;
    setSaving(address);
    setError('');
    try {
      await arrivOne.addProspect({
        contact_id: contactId,
        person: {
          full_name: name,
          email: address,
          phone: person?.phone || '',
          brokerage: person?.brokerage || company,
          city: person?.city || city,
          state: person?.state || stateCode,
          sources: person?.sources || [],
          confidence: person?.confidence || 0,
          verification: person?.verification || {},
        },
        overrides: { email: address },
      });
      setSaved(address);
      setManual('');
      onSaved?.();
    } catch (err) {
      setError(err?.message || 'That address could not be saved.');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-[#B8956A]/40 bg-[#B8956A]/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-[#1A1A1A]">
        <Mail className="h-4 w-4 text-[#B8956A]" /> Email for {name || 'this prospect'}
      </p>

      {saved && (
        <p className="flex items-center gap-2 rounded-lg bg-white p-2 text-sm text-[#1A1A1A]">
          <Check className="h-4 w-4 text-[#B8956A]" /> {saved} saved to {contactName || 'the contact'}.
        </p>
      )}

      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-[#1A1A1A]/60">
          <Loader2 className="h-4 w-4 animate-spin text-[#B8956A]" /> Searching published sources…
        </p>
      )}

      {state.status === 'done' && state.results.length === 0 && (
        <p className="text-sm text-[#1A1A1A]/60">{state.notice || 'No published email address was found.'}</p>
      )}

      {state.results.map((person) => (
        <div
          key={`${person.email}-${person.full_name}`}
          className="rounded-lg border border-[#1A1A1A]/10 bg-white p-2"
        >
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#1A1A1A]">
            {person.email}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                person.email_verified ? 'bg-[#B8956A]/20 text-[#8a6d45]' : 'bg-[#1A1A1A]/10 text-[#1A1A1A]/50'
              }`}
            >
              {person.email_verified ? 'verified' : 'unverified'}
            </span>
          </p>
          {place(person) && <p className="text-xs text-[#1A1A1A]/55">{place(person)}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            {(person.sources || [])[0]?.url ? (
              <a
                href={(person.sources || [])[0].url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-[#B8956A] underline"
              >
                <ExternalLink className="h-3 w-3" /> Source
              </a>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
              disabled={!contactId || saving === person.email || saved === person.email}
              onClick={() => save(person.email, person)}
            >
              {saving === person.email ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saved === person.email ? (
                'Saved'
              ) : (
                'Save to contact'
              )}
            </Button>
          </div>
        </div>
      ))}

      {!contactId ? (
        <p className="flex gap-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This person is not linked to a CRM record yet, so nothing can be saved.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="Or type the address"
            className="bg-white text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!manual.trim() || saving === manual.trim()}
            onClick={() => save(manual)}
          >
            Save
          </Button>
        </div>
      )}

      {state.status === 'error' && <p className="text-xs text-red-600">{state.notice}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}