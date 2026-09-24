import React, { useState, useEffect } from "react";
import FlyerBuilder from "@/components/flyer/FlyerBuilder";
import { Loader2 } from "lucide-react";

export default function FlyerBuilderPage() {
  const [email, setEmail] = useState(null);
  useEffect(() => {
    const e = localStorage.getItem("user_email") || sessionStorage.getItem("user_email")
      || localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email");
    setEmail(e);
  }, []);

  if (!email) return <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-[#B8956A]" /></div>;
  return <FlyerBuilder userEmail={email} />;
}