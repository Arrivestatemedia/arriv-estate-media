import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import FlyerCard from "@/components/flyer/FlyerCard";
import { listFlyers } from "@/lib/studioFlyerApi";

export default function Flyers() {
  const navigate = useNavigate();
  const [flyers, setFlyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(null);

  useEffect(() => {
    const e = localStorage.getItem("user_email") || sessionStorage.getItem("user_email")
      || localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email");
    setEmail(e);
    if (!e) { setLoading(false); return; }
    (async () => {
      try {
        const res = await listFlyers(e);
        setFlyers(res.flyers || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const onDeleted = (id) => setFlyers((f) => f.filter((x) => x.id !== id));

  if (!email) return <div className="text-center py-20 text-muted-foreground">Please log in to view your flyers.</div>;

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif">Promotional Flyers</h1>
        <Button onClick={() => navigate("/FlyerBuilderPage")} className="bg-[#B8956A] text-white hover:bg-[#A68559]"><Plus className="w-4 h-4 mr-1" />New Flyer</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-[#B8956A]" /></div>
      ) : flyers.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">No flyers yet. Click "New Flyer" to create one.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {flyers.map((f) => <FlyerCard key={f.id} flyer={f} userEmail={email} onDeleted={onDeleted} />)}
        </div>
      )}
    </div>
  );
}