import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Gift, Plus, X, DollarSign, Users } from "lucide-react";
import { REFERRAL_CREDIT_AMOUNT } from "@/lib/salesTrainingData";

const getMember = () => ({
  id: localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id'),
  name: localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name'),
  email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email'),
});

const QUAL_COLORS = {
  PENDING: "bg-orange-100 text-orange-700",
  QUALIFIED: "bg-[#B8956A] text-[#1A1A1A]",
  DISQUALIFIED: "bg-red-100 text-red-700",
};

export default function ReferralProgramPage() {
  const [referrals, setReferrals] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const member = getMember();

  const load = useCallback(async () => {
    if (!member.id) return;
    try {
      const [refs, ledger] = await Promise.all([
        base44.entities.Referral.filter({ referring_rep_id: member.id }, '-created_at', 200),
        base44.entities.ReferralCreditLedger.list('-timestamp', 200),
      ]);
      setReferrals(refs || []);
      // Aggregate balances by customer
      const balMap = {};
      (ledger || []).forEach(entry => {
        if (!balMap[entry.customer_id]) balMap[entry.customer_id] = { customer_id: entry.customer_id, customer_name: entry.customer_name, balance: 0, credits_earned: 0 };
        balMap[entry.customer_id].balance += entry.amount;
        if (entry.transaction_type === "EARN") balMap[entry.customer_id].credits_earned += 1;
      });
      setBalances(Object.values(balMap));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [member.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    try {
      const now = new Date().toISOString();
      await base44.entities.Referral.create({
        ...data,
        referring_rep_id: member.id,
        referring_rep_name: member.name,
        credit_amount: REFERRAL_CREDIT_AMOUNT,
        created_at: now,
      });
      setShowForm(false); await load();
    } catch (err) { console.error(err); }
  };

  const handleQualify = async (ref) => {
    try {
      const now = new Date().toISOString();
      await base44.entities.Referral.update(ref.id, {
        qualification_status: "QUALIFIED",
        qualifying_event: "Manually qualified",
        qualifying_event_date: now,
        credit_earned: true,
      });
      // Create ledger entry
      const currentBalance = balances.find(b => b.customer_id === ref.referrer_customer_id)?.balance || 0;
      await base44.entities.ReferralCreditLedger.create({
        customer_id: ref.referrer_customer_id,
        customer_name: ref.referrer_customer_name,
        referral_id: ref.id,
        transaction_type: "EARN",
        amount: REFERRAL_CREDIT_AMOUNT,
        balance_after: currentBalance + REFERRAL_CREDIT_AMOUNT,
        reason: `Qualifying referral: ${ref.referred_party_name}`,
        actor: member.name,
        timestamp: now,
      });
      await base44.entities.AuditEvent.create({
        event_type: "REFERRAL_CREDIT_EARNED",
        sales_member_id: member.id, sales_member_name: member.name,
        actor_id: member.id, actor_name: member.name, actor_role: "REP",
        entity_type: "Referral", entity_id: ref.id,
        details: { amount: REFERRAL_CREDIT_AMOUNT, customer: ref.referrer_customer_name },
        timestamp: now,
      });
      await load();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin" /></div>;
  if (!member.id) return <div className="p-8 text-center text-slate-500">Please log in.</div>;

  const totalCredits = balances.reduce((sum, b) => sum + b.balance, 0);

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#1A1A1A] mb-1">Referral Program</h1>
            <p className="text-slate-600">Log referrals and track customer credit balances (${REFERRAL_CREDIT_AMOUNT} per qualifying referral)</p>
          </div>
          <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-2" /> Log Referral</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4 bg-[#1A1A1A] border-[#B8956A]/20">
            <DollarSign className="w-6 h-6 text-[#B8956A] mb-2" />
            <p className="text-2xl font-bold text-[#FFFBF5]">${totalCredits}</p>
            <p className="text-xs text-[#FFFBF5]/60">Total Customer Credits</p>
          </Card>
          <Card className="p-4 bg-white border-[#B8956A]/15">
            <Gift className="w-6 h-6 text-[#B8956A] mb-2" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{referrals.filter(r => r.qualification_status === "QUALIFIED").length}</p>
            <p className="text-xs text-slate-500">Qualified Referrals</p>
          </Card>
          <Card className="p-4 bg-white border-[#B8956A]/15">
            <Users className="w-6 h-6 text-[#B8956A] mb-2" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{balances.length}</p>
            <p className="text-xs text-slate-500">Customers with Credits</p>
          </Card>
        </div>

        {showForm && <ReferralForm onSave={handleSave} onCancel={() => setShowForm(false)} />}

        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3">Customer Credit Balances</h2>
        <div className="space-y-2 mb-6">
          {balances.length === 0 ? <Card className="p-6 text-center bg-white text-slate-400">No customer credits yet.</Card> : balances.map(b => (
            <Card key={b.customer_id} className="p-3 bg-white border-[#B8956A]/15 flex items-center justify-between">
              <div>
                <p className="font-medium text-[#1A1A1A]">{b.customer_name || "Unknown Customer"}</p>
                <p className="text-xs text-slate-400">{b.credits_earned} qualifying referral{b.credits_earned !== 1 ? "s" : ""}</p>
              </div>
              <Badge className="bg-[#B8956A] text-[#1A1A1A] text-sm">${b.balance}</Badge>
            </Card>
          ))}
        </div>

        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3">Referral Log</h2>
        <div className="space-y-3">
          {referrals.length === 0 ? <Card className="p-8 text-center bg-white"><Gift className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No referrals logged yet.</p></Card> : referrals.map(ref => (
            <Card key={ref.id} className="p-4 bg-white border-[#B8956A]/15">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-[#1A1A1A]">{ref.referred_party_name}</h3>
                    <Badge className={QUAL_COLORS[ref.qualification_status]}>{ref.qualification_status}</Badge>
                    {ref.credit_earned && <Badge className="bg-[#B8956A] text-[#1A1A1A]">+${REFERRAL_CREDIT_AMOUNT}</Badge>}
                  </div>
                  <p className="text-sm text-slate-500">Referred by: {ref.referrer_customer_name || "Unknown"}</p>
                  {ref.referred_contact_info && <p className="text-sm text-slate-500">{ref.referred_contact_info}</p>}
                  {ref.notes && <p className="text-sm text-slate-600 mt-1">{ref.notes}</p>}
                  <p className="text-xs text-slate-400 mt-1">{new Date(ref.created_at).toLocaleDateString()}</p>
                </div>
                {ref.qualification_status === "PENDING" && (
                  <Button size="sm" variant="outline" className="border-[#B8956A]/30 text-[#B8956A]" onClick={() => handleQualify(ref)}>Mark Qualified</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReferralForm({ onSave, onCancel }) {
  const [data, setData] = useState({ referrer_customer_id: "", referrer_customer_name: "", referred_party_name: "", referred_contact_info: "", notes: "" });
  const set = (k, v) => setData({ ...data, [k]: v });
  return (
    <Card className="p-6 mb-4 bg-white border-[#B8956A]/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[#1A1A1A]">Log New Referral</h3>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Referring Customer Name</label>
          <Input value={data.referrer_customer_name} onChange={e => set("referrer_customer_name", e.target.value)} placeholder="Customer who referred" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Referring Customer ID (optional)</label>
          <Input value={data.referrer_customer_id} onChange={e => set("referrer_customer_id", e.target.value)} placeholder="Contact ID if known" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Referred Party Name</label>
          <Input value={data.referred_party_name} onChange={e => set("referred_party_name", e.target.value)} placeholder="Who was referred" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Referred Contact Info</label>
          <Input value={data.referred_contact_info} onChange={e => set("referred_contact_info", e.target.value)} placeholder="Email or phone" />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-600 mb-1 block">Notes</label>
          <Textarea value={data.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Context about this referral..." />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" disabled={!data.referred_party_name} onClick={() => onSave(data)}>Save Referral</Button>
      </div>
    </Card>
  );
}