import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import FlyerCard from "@/components/flyer/FlyerCard";
import FlyerBuilder from "@/components/flyer/FlyerBuilder";
import { listFlyers } from "@/lib/studioFlyerApi";

// Flyers section inside the Arriv Studio shell. Toggles between list and
// builder views (no router). Themed to match Studio's dark/coral system.
export default function StudioFlyers() {
  const [view, setView] = useState("list");
  const [flyerId, setFlyerId] = useState(null);
  const [flyers, setFlyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(null);

  useEffect(() => {
    const e = localStorage.getItem("user_email") || sessionStorage.getItem("user_email")
      || localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email");
    setEmail(e);
  }, []);

  const load = async () => {
    if (!email) return;
    setLoading(true);
    try { const res = await listFlyers(email); setFlyers(res.flyers || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (view === "list") load(); }, [view, email]);

  const onDeleted = (id) => setFlyers((f) => f.filter((x) => x.id !== id));
  const openBuilder = (id) => { setFlyerId(id); setView("builder"); };
  const backToList = () => { setFlyerId(null); setView("list"); };

  if (!email) return <div className="text-center py-20" style={{ color: "#a0a0a0" }}>Please log in to view your flyers.</div>;

  if (view === "builder") {
    return (
      <FlyerBuilder
        userEmail={email}
        flyerId={flyerId}
        onBack={backToList}
        onFlyerCreated={(id) => setFlyerId(id)}
      />
    );
  }

  return (
    <div className="dark px-6 py-6" style={{ background: "#0f0f0f", minHeight: "100%", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "#fff" }}>Promotional Flyers</h1>
        <Button onClick={() => openBuilder(null)} style={{ background: "#FF5A4F", color: "#fff" }}><Plus className="w-4 h-4 mr-1" />New Flyer</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8" style={{ color: "#FF5A4F" }} /></div>
      ) : flyers.length === 0 ? (
        <div className="text-center py-20" style={{ color: "#a0a0a0" }}>No flyers yet. Click "New Flyer" to create one.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {flyers.map((f) => (
            <FlyerCard key={f.id} flyer={f} userEmail={email} onDeleted={onDeleted} onEdit={openBuilder} />
          ))}
        </div>
      )}
    </div>
  );
}