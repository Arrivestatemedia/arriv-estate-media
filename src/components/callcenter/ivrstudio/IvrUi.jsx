import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function Card({ children, className = "" }) {
  return (
    <div className={cn("rounded-2xl border border-[#B8956A]/25 bg-white p-4 sm:p-5", className)}>{children}</div>
  );
}

export function SectionHead({ title, description, right }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-serif text-xl text-[#1A1A1A]">{title}</h3>
        {description ? <p className="mt-1 max-w-2xl text-sm text-[#1A1A1A]/55">{description}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[#1A1A1A]/45">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder, className = "", ...rest }) {
  return (
    <Input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("h-9 bg-white text-sm", className)}
      {...rest}
    />
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <Textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="bg-white text-sm"
    />
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#B8956A]/20 px-3 py-2">
      <span className="text-sm text-[#1A1A1A]/75">{label}</span>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}

export function Pill({ tone = "neutral", children }) {
  const tones = {
    neutral: "bg-[#1A1A1A]/5 text-[#1A1A1A]/60",
    gold: "bg-[#B8956A]/15 text-[#8a6a44]",
    live: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    info: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Empty({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-[#B8956A]/30 px-4 py-8 text-center text-sm text-[#1A1A1A]/45">
      {children}
    </div>
  );
}