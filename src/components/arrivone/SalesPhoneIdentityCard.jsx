import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Phone, Smartphone } from 'lucide-react';
import { arrivOne } from '@/lib/arrivOneClient';

const STATUS_STYLE = {
  active: 'bg-[#B8956A]/15 text-[#7a5f3f] border-[#B8956A]/40',
  pending: 'bg-amber-50 text-amber-800 border-amber-300',
  suspended: 'bg-amber-50 text-amber-800 border-amber-300',
  revoked: 'bg-[#1A1A1A]/5 text-[#1A1A1A]/50 border-[#1A1A1A]/10',
};

/** A representative's own telephony identity: cellphone, extension, caller ID. */
export default function SalesPhoneIdentityCard() {
  const [data, setData] = useState(null);
  const [cellphone, setCellphone] = useState('');
  const [voicemail, setVoicemail] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await arrivOne.getIdentity();
      setData(response);
      setCellphone(response?.identity?.cellphone || '');
      setVoicemail(response?.identity?.voicemail_enabled !== false);
    } catch (err) {
      setError(err.message || 'Your dial-out details could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await arrivOne.saveIdentity({ cellphone, voicemail_enabled: voicemail });
      toast.success(response.message || 'Saved');
      await load();
    } catch (err) {
      setError(err.message || 'That number could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-[#B8956A]/20">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-[#1A1A1A]/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your dial-out details…
        </CardContent>
      </Card>
    );
  }

  const identity = data?.identity;
  const status = identity?.telephony_status || 'pending';

  return (
    <Card className="border-[#B8956A]/20 bg-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-[#1A1A1A]">
          <Smartphone className="h-4 w-4 text-[#B8956A]" /> Cellphone dial-out
          <Badge variant="outline" className={`ml-auto text-[10px] capitalize ${STATUS_STYLE[status] || STATUS_STYLE.pending}`}>
            {status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-[#1A1A1A]/70">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-[#1A1A1A]/60">Registered cellphone</Label>
            <Input
              value={cellphone}
              onChange={(event) => setCellphone(event.target.value)}
              placeholder="(301) 555-0142"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-[#1A1A1A]/60">Your extension</Label>
            <div className="mt-1 flex h-9 items-center rounded-md border border-[#1A1A1A]/10 bg-[#FFFBF5] px-3 text-sm">
              {identity?.extension || <span className="text-[#1A1A1A]/40">Assigned by an administrator</span>}
            </div>
          </div>
          <div>
            <Label className="text-xs text-[#1A1A1A]/60">Caller ID prospects see</Label>
            <div className="mt-1 flex h-9 items-center gap-2 rounded-md border border-[#1A1A1A]/10 bg-[#FFFBF5] px-3 text-sm">
              <Phone className="h-3.5 w-3.5 text-[#B8956A]" />
              {identity?.caller_id_number || <span className="text-[#1A1A1A]/40">Assigned by an administrator</span>}
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 rounded-md border border-[#1A1A1A]/10 px-3 py-2">
            <span className="text-xs text-[#1A1A1A]/60">Voicemail access</span>
            <Switch checked={voicemail} onCheckedChange={setVoicemail} />
          </div>
        </div>

        <p className="rounded-lg bg-[#FFFBF5] p-3 text-xs leading-relaxed text-[#1A1A1A]/60">
          {status === 'active' && data?.access_number
            ? `Call ${data.access_number} from this cellphone. You will hear the sales menu, then key in your extension followed by the number to dial.`
            : 'An administrator must activate dial-out before this number can place calls. The in-app dialer works in the meantime.'}
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save number
          </Button>
          <span className="text-[11px] text-[#1A1A1A]/45">Only this registered number can use dial-out.</span>
        </div>
      </CardContent>
    </Card>
  );
}