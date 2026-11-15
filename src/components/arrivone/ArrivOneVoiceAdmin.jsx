import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, PhoneOutgoing, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { arrivOne } from '@/lib/arrivOneClient';

const STATUS_OPTIONS = ['pending', 'active', 'suspended', 'revoked'];

/** Administrator console for rep extensions, caller IDs and voice/recording flags. */
export default function ArrivOneVoiceAdmin() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [estimates, setEstimates] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [identities, voice] = await Promise.all([arrivOne.adminIdentities(), arrivOne.voiceSettings()]);
      setData(identities);
      setSettings(voice.settings);
      setEstimates(voice.estimates);
    } catch (err) {
      setError(err.message || 'The dial-out console could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const draftFor = (member) => {
    const identity = member.identity || {};
    return (
      drafts[member.id] || {
        sales_member_id: member.id,
        sales_member_name: member.full_name,
        sales_member_email: member.email,
        cellphone: identity.cellphone || '',
        extension: identity.extension || member.extension_hint || '',
        caller_id_number: identity.caller_id_number || member.twilio_phone_number || '',
        telephony_status: identity.telephony_status || 'pending',
        monthly_minutes_cap: identity.monthly_minutes_cap || 600,
      }
    );
  };

  const setDraft = (memberId, key, value) => {
    const member = (data?.members || []).find((item) => item.id === memberId);
    if (!member) return;
    setDrafts((prev) => ({ ...prev, [memberId]: { ...draftFor(member), ...prev[memberId], [key]: value } }));
  };

  const saveMember = async (member) => {
    const draft = draftFor(member);
    setBusy(member.id);
    try {
      await arrivOne.adminSaveIdentity({ identity: draft });
      toast.success(`${member.full_name || member.email} saved`);
      setDrafts((prev) => ({ ...prev, [member.id]: null }));
      await load();
    } catch (err) {
      toast.error(err.message || 'That identity could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const revoke = async (member) => {
    setBusy(member.id);
    try {
      await arrivOne.revokeIdentity(member.id);
      toast.success('Dial-out revoked');
      await load();
    } catch (err) {
      toast.error(err.message || 'Revocation failed.');
    } finally {
      setBusy('');
    }
  };

  const seed = async () => {
    setBusy('seed');
    try {
      const response = await arrivOne.seedIdentities();
      toast.success(`Created ${response.count || 0} telephony identities`);
      await load();
    } catch (err) {
      toast.error(err.message || 'Seeding failed.');
    } finally {
      setBusy('');
    }
  };

  const updateSetting = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  const saveSettings = async () => {
    setBusy('settings');
    try {
      const response = await arrivOne.saveVoiceSettings(settings);
      setSettings(response.settings);
      setEstimates(response.estimates);
      toast.success('Voice settings saved');
    } catch (err) {
      toast.error(err.message || 'Settings could not be saved.');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-[#1A1A1A]/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading dial-out console…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card className="border-[#B8956A]/20">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base text-[#1A1A1A]">
            <PhoneOutgoing className="h-4 w-4 text-[#B8956A]" /> Media Partner lines &amp; extensions
          </CardTitle>
          <Button size="sm" variant="outline" onClick={seed} disabled={busy === 'seed'}>
            {busy === 'seed' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Create missing
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.members || []).map((member) => {
            const draft = draftFor(member);
            return (
              <div key={member.id} className="rounded-xl border border-[#1A1A1A]/10 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{member.full_name || member.email}</p>
                    <p className="text-xs text-[#1A1A1A]/50">{member.email}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {draft.telephony_status}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <Label className="text-[11px] text-[#1A1A1A]/55">Cellphone</Label>
                    <Input
                      value={draft.cellphone || ''}
                      onChange={(event) => setDraft(member.id, 'cellphone', event.target.value)}
                      className="mt-1 h-9 text-sm"
                      placeholder="+13015550142"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-[#1A1A1A]/55">Extension</Label>
                    <Input
                      value={draft.extension || ''}
                      readOnly
                      className="mt-1 h-9 text-sm"
                      placeholder="204"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-[#1A1A1A]/55">Arriv caller ID</Label>
                    <Select
                      value={draft.caller_id_number || ''}
                      onValueChange={(value) => setDraft(member.id, 'caller_id_number', value)}
                    >
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder="Select a company number" />
                      </SelectTrigger>
                      <SelectContent>
                        {[member.twilio_phone_number].filter(Boolean).map((number) => (
                          <SelectItem key={number} value={number}>
                            {number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-[#1A1A1A]/55">Status</Label>
                    <Select
                      value={draft.telephony_status || 'pending'}
                      onValueChange={(value) => setDraft(member.id, 'telephony_status', value)}
                    >
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status} className="capitalize">
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-[#1A1A1A]/55">Monthly minutes</Label>
                    <Input
                      type="number"
                      value={draft.monthly_minutes_cap || 0}
                      onChange={(event) => setDraft(member.id, 'monthly_minutes_cap', Number(event.target.value))}
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => saveMember(member)} disabled={busy === member.id} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
                    {busy === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => revoke(member)} disabled={busy === member.id}>
                    <ShieldAlert className="h-3.5 w-3.5" /> Revoke
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-[#B8956A]/20">
        <CardHeader>
          <CardTitle className="text-base text-[#1A1A1A]">Voice, recording &amp; AI settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] text-[#1A1A1A]/55">Individual Media Partner access</Label>
              <p className="mt-2 text-xs leading-relaxed text-[#1A1A1A]/60">
                Each Media Partner calls their own assigned Twilio business number from their registered cellphone.
                The same individual number receives prospect and client callbacks. The 855 number remains the main company IVR, never a shared sales access line.
                Live routing and activation require administrator approval; preserve the in-app TwiML application when configuring an individual number.
              </p>
            </div>
            <div>
              <Label className="text-[11px] text-[#1A1A1A]/55">Monthly live-lookup limit</Label>
              <Input
                type="number"
                value={settings?.lookup_daily_cap || 0}
                onChange={(event) => updateSetting('lookup_daily_cap', Number(event.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] text-[#1A1A1A]/55">Lookup cache days</Label>
              <Input
                type="number"
                value={settings?.lookup_cache_days || 7}
                onChange={(event) => updateSetting('lookup_cache_days', Number(event.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] text-[#1A1A1A]/55">Recording retention (days)</Label>
              <Input
                type="number"
                value={settings?.retention_days || 365}
                onChange={(event) => updateSetting('retention_days', Number(event.target.value))}
                className="mt-1"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-[#1A1A1A]/10 p-3">
            {[
              ['voice_command_enabled', 'AI command and voice notes'],
              ['live_search_enabled', 'Live individual prospect search'],
              ['ai_summaries_enabled', 'AI call summaries'],
              ['coaching_enabled', 'AI coaching notes'],
              ['recording_enabled', 'Call recording (requires legal sign-off)'],
              ['transcription_enabled', 'Transcription of consented recordings'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-[#1A1A1A]/70">{label}</span>
                <Switch checked={settings?.[key] === true} onCheckedChange={(value) => updateSetting(key, value)} />
              </div>
            ))}
          </div>

          <div>
            <Label className="text-[11px] text-[#1A1A1A]/55">Post-call menu</Label>
            <Textarea
              value={settings?.dial_out_after_text || ''}
              onChange={(event) => updateSetting('dial_out_after_text', event.target.value)}
              rows={2}
              className="mt-1 text-sm"
            />
          </div>

          {estimates && (
            <div className="rounded-xl bg-[#FFFBF5] p-3 text-[11px] leading-relaxed text-[#1A1A1A]/55">
              <p className="font-medium text-[#1A1A1A]/70">Cost reference (estimates, not billed figures)</p>
              <p>
                Inbound access ${estimates.inbound_access_per_minute_usd}/min · outbound US $
                {estimates.outbound_us_per_minute_usd}/min · recording ${estimates.recording_per_minute_usd}/min ·
                transcription ${estimates.transcription_per_minute_usd}/min · summary ≈ $
                {estimates.ai_summary_per_call_usd}/call · lookup ≈ ${estimates.lookup_per_search_usd}/search
              </p>
              <p className="mt-1">{estimates.note}</p>
            </div>
          )}

          <Button onClick={saveSettings} disabled={busy === 'settings'} className="bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#1A1A1A]/90">
            {busy === 'settings' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}