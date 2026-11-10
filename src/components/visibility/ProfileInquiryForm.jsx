import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { submitProfileInquiry } from '@/lib/professionalVisibility';

// The public inquiry form. Consent is a required, separate checkbox, and the disclosure above it is
// the same wording recorded with the stored inquiry.
export default function ProfileInquiryForm({ profileType, slug, displayName, disclosures, listingId = '', marketSlug = '' }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', consent: false, company_website: '' });
  const [state, setState] = useState({ busy: false, sent: false, error: '' });

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event?.target ? event.target.value : event }));

  const submit = async () => {
    setState({ busy: true, sent: false, error: '' });
    try {
      const result = await submitProfileInquiry({
        profile_type: profileType,
        slug,
        name: form.name,
        email: form.email,
        phone: form.phone,
        message: form.message,
        consent_privacy: form.consent,
        company_website: form.company_website,
        listing_id: listingId,
        market_slug: marketSlug,
        landing_page: window.location.pathname,
        referrer_host: document.referrer ? new URL(document.referrer).hostname : '',
        ...Object.fromEntries(
          ['utm_source', 'utm_medium', 'utm_campaign'].map((key) => [
            key,
            new URLSearchParams(window.location.search).get(key) || '',
          ]),
        ),
      });
      if (result?.ok) {
        setState({ busy: false, sent: true, error: '' });
      } else {
        setState({ busy: false, sent: false, error: result?.error || 'Your inquiry could not be sent.' });
      }
    } catch (error) {
      setState({ busy: false, sent: false, error: 'Your inquiry could not be sent. Please try again.' });
    }
  };

  if (state.sent) {
    return (
      <div className="rounded-2xl border border-[#B8956A]/40 bg-[#FFFBF5] p-6">
        <h3 className="font-serif text-xl text-[#1A1A1A]">Your message was sent</h3>
        <p className="text-sm text-[#1A1A1A]/65 mt-2">
          {displayName} has received your inquiry and will reply to the email address you provided.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-6">
      <h3 className="font-serif text-xl text-[#1A1A1A]">Contact {displayName}</h3>
      <div className="space-y-3 mt-4">
        <div>
          <Label htmlFor="inq-name">Your name</Label>
          <Input id="inq-name" value={form.name} onChange={update('name')} className="mt-1" autoComplete="name" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="inq-email">Email</Label>
            <Input id="inq-email" type="email" value={form.email} onChange={update('email')} className="mt-1" autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="inq-phone">Phone (optional)</Label>
            <Input id="inq-phone" value={form.phone} onChange={update('phone')} className="mt-1" autoComplete="tel" />
          </div>
        </div>
        <div>
          <Label htmlFor="inq-message">What can they help with?</Label>
          <Textarea id="inq-message" rows={4} value={form.message} onChange={update('message')} className="mt-1" />
        </div>

        {/* Hidden from people, filled by bots. Never rendered visibly. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={form.company_website}
          onChange={update('company_website')}
          className="hidden"
        />

        <label className="flex items-start gap-2 text-xs text-[#1A1A1A]/60 leading-relaxed">
          <Checkbox checked={form.consent} onCheckedChange={(value) => setForm((prev) => ({ ...prev, consent: value === true }))} className="mt-0.5" />
          <span>
            I agree my name, email and message may be shared with {displayName} so they can respond to this inquiry.
          </span>
        </label>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <Button className="w-full bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#2A3536]" disabled={state.busy} onClick={submit}>
          {state.busy ? 'Sending…' : 'Send inquiry'}
        </Button>

        <div className="pt-2 space-y-1.5">
          {(disclosures || []).map((line) => (
            <p key={line} className="text-[11px] text-[#1A1A1A]/45 leading-relaxed">{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}