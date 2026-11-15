import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Phone,
  PhoneCall,
  Search,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { arrivOne } from '@/lib/arrivOneClient';
import { createPageUrl } from '@/utils';

const VERIFICATION = {
  verified: { label: 'Verified', className: 'bg-[#B8956A]/15 text-[#7a5f3f] border-[#B8956A]/40', icon: CheckCircle2 },
  unverified: { label: 'Unverified', className: 'bg-amber-50 text-amber-800 border-amber-300', icon: HelpCircle },
  none: { label: 'Not found', className: 'bg-[#1A1A1A]/5 text-[#1A1A1A]/50 border-[#1A1A1A]/10', icon: XCircle },
};

function VerificationBadge({ status }) {
  const meta = VERIFICATION[status] || VERIFICATION.none;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] ${meta.className}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </Badge>
  );
}

/** Individual live prospect lookup, layered on top of the existing prospecting module. */
export default function ProspectLiveSearch({ onProspectAdded }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', company: '', city: '', state: '' });
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [saved, setSaved] = useState({});

  const setField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const runSearch = async (mode = 'search') => {
    if (form.full_name.trim().split(/\s+/).length < 2) {
      setError('Enter a first and last name.');
      return;
    }
    setSearching(true);
    setError('');
    setNotice('');
    try {
      const data = mode === 'email'
        ? await arrivOne.lookupEmail(form)
        : await arrivOne.searchPerson(form);
      setResults(data.results || []);
      setNotice(data.notice || '');
    } catch (err) {
      setError(err.message || 'The search could not be completed.');
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const addProspect = async (person, callAfter) => {
    const key = `${person.full_name}-${person.email || person.phone || 'x'}`;
    setBusyKey(key);
    setError('');
    try {
      const response = await arrivOne.addProspect({ person });
      if (response.duplicate) {
        toast.info(`${response.contact?.name || 'That person'} is already in Arriv One`);
        setSaved((prev) => ({ ...prev, [key]: response.contact }));
        if (callAfter && response.contact?.phone) startCall(response.contact.phone, response.contact.name);
        return;
      }
      setSaved((prev) => ({ ...prev, [key]: response.contact }));
      toast.success(`Added ${response.contact?.name || 'prospect'}`);
      onProspectAdded?.(response);
      if (callAfter) {
        if (response.callable) startCall(response.contact.phone, response.contact.name);
        else toast.error('No verified phone number on that prospect, so calling stays disabled.');
      }
    } catch (err) {
      setError(err.message || 'The prospect could not be added.');
    } finally {
      setBusyKey('');
    }
  };

  const startCall = (phone, name) => {
    localStorage.setItem('_dialerPhone', phone);
    localStorage.setItem('_dialerContact', JSON.stringify({ phone, name }));
    navigate(`${createPageUrl('HubSpotActivityLog')}?tab=call`);
  };

  const openProspect = () => navigate(`${createPageUrl('HubSpotActivityLog')}?tab=mycontacts`);

  return (
    <div className="rounded-2xl border border-[#B8956A]/30 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-[#B8956A]" />
        <h3 className="font-serif text-lg text-[#1A1A1A]">Live prospect search</h3>
      </div>
      <p className="mb-3 text-xs text-[#1A1A1A]/55">
        Find one specific person and their publicly published professional details. Verified means the value was
        found on a page that actually loaded — never guessed from an email pattern.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs text-[#1A1A1A]/60">Full name</Label>
          <Input value={form.full_name} onChange={setField('full_name')} placeholder="Jennifer Williams" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-[#1A1A1A]/60">Brokerage (optional)</Label>
          <Input value={form.company} onChange={setField('company')} placeholder="ABC Realty" className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-[#1A1A1A]/60">City</Label>
            <Input value={form.city} onChange={setField('city')} placeholder="Rockville" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-[#1A1A1A]/60">State</Label>
            <Input value={form.state} onChange={setField('state')} placeholder="MD" className="mt-1" />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => runSearch('search')} disabled={searching} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find this person
        </Button>
        <Button variant="outline" onClick={() => runSearch('email')} disabled={searching}>
          Find business email only
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && !error && <p className="mt-3 text-sm text-[#1A1A1A]/60">{notice}</p>}

      {results?.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((person, index) => {
            const key = `${person.full_name}-${person.email || person.phone || index}`;
            const existing = saved[key];
            return (
              <div key={key} className="rounded-xl border border-[#1A1A1A]/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1A1A1A]">{person.full_name || 'Unnamed'}</p>
                    <p className="text-xs text-[#1A1A1A]/55">
                      {[person.brokerage, person.city, person.state].filter(Boolean).join(' · ') || 'Location not published'}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Match {Math.round((person.confidence || 0) * 100)}%
                  </Badge>
                </div>

                <div className="mt-2 space-y-1.5 text-xs text-[#1A1A1A]/70">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-[#1A1A1A]/40" />
                    <span>{person.phone || 'No public phone found'}</span>
                    <VerificationBadge status={person.verification?.phone || 'none'} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#1A1A1A]/40">@</span>
                    <span className="truncate">{person.email || 'No public email found'}</span>
                    <VerificationBadge status={person.verification?.email || 'none'} />
                  </div>
                </div>

                {(person.sources || []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {person.sources.slice(0, 3).map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-[#B8956A] underline decoration-[#B8956A]/40"
                      >
                        <ExternalLink className="h-3 w-3" /> {source.title || new URL(source.url).hostname}
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {existing ? (
                    <>
                      <Button size="sm" variant="outline" onClick={openProspect}>
                        View prospect
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#1A1A1A]/90"
                        disabled={!existing.phone}
                        onClick={() => startCall(existing.phone, existing.name)}
                      >
                        <PhoneCall className="h-3.5 w-3.5" /> Call
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
                        disabled={busyKey === key}
                        onClick={() => addProspect(person, false)}
                      >
                        {busyKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add prospect
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyKey === key || !person.phone}
                        title={person.phone ? '' : 'No verified phone number, so calling is disabled'}
                        onClick={() => addProspect(person, true)}
                      >
                        <PhoneCall className="h-3.5 w-3.5" /> Add &amp; call
                      </Button>
                    </>
                  )}
                </div>
                {!person.phone && (
                  <p className="mt-2 text-[11px] text-[#1A1A1A]/45">
                    Calling stays disabled until a verified phone number exists for this person.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}