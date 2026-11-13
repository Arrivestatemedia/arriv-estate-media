import { Card, CardContent } from "@/components/ui/card";

export default function StatCard({ label, value, hint }) {
  return (
    <Card className="border-[#B8956A]/25 bg-white">
      <CardContent className="p-4">
        <p className="text-2xl font-semibold text-[#1A1A1A] leading-none">{value ?? 0}</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-[#1A1A1A]/50">{label}</p>
        {hint ? <p className="mt-1 text-xs text-[#1A1A1A]/40">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}