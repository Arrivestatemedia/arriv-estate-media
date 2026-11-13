import React from "react";
import { CircleSlash, PencilLine } from "lucide-react";
import { Card, Pill, SectionHead } from "./IvrUi";

export default function IvrInventory({ data, go }) {
  const rows = data.inventory || [];

  return (
    <div className="space-y-3">
      <SectionHead
        title="Configuration Inventory"
        description="Every call-handling behavior that exists today, what triggers it, where it currently goes, and where an administrator can change it. Anything marked not editable says why."
      />

      <div className="overflow-hidden rounded-2xl border border-[#B8956A]/25">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#FFFBF5] text-xs uppercase tracking-wide text-[#1A1A1A]/50">
            <tr>
              <th className="px-3 py-2">Function</th>
              <th className="px-3 py-2">Current behavior</th>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Destination</th>
              <th className="px-3 py-2">Editable in</th>
              <th className="px-3 py-2">Verified live</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-[#B8956A]/15 align-top">
                <td className="px-3 py-2 font-medium text-[#1A1A1A]">{row.area}</td>
                <td className="px-3 py-2 text-[#1A1A1A]/65">{row.behavior}</td>
                <td className="px-3 py-2 text-[#1A1A1A]/65">{row.trigger}</td>
                <td className="px-3 py-2 text-[#1A1A1A]/65">{row.destination}</td>
                <td className="px-3 py-2">
                  {row.editable ? (
                    <span className="inline-flex items-start gap-1 text-[#8a6a44]">
                      <PencilLine className="mt-0.5 h-3.5 w-3.5" /> {row.editable_in}
                    </span>
                  ) : (
                    <span className="inline-flex items-start gap-1 text-red-600">
                      <CircleSlash className="mt-0.5 h-3.5 w-3.5" /> {row.editable_in}
                    </span>
                  )}
                  {row.note ? <p className="mt-1 text-xs text-[#1A1A1A]/45">{row.note}</p> : null}
                </td>
                <td className="px-3 py-2">
                  {row.verified ? <Pill tone="live">verified</Pill> : <Pill tone="warn">awaiting test call</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card>
        <p className="text-sm font-medium text-[#1A1A1A]">What is deliberately not editable</p>
        <p className="mt-1 text-sm text-[#1A1A1A]/60">
          Inbound SMS forwarding on the 706 line runs in its own function with its own credentials and is outside the call
          flow engine. Assist ticketing, calendar booking and Ashley's conversation logic are also separate services: the
          studio controls when they are reached and what they may do, not their internal behavior.
        </p>
        <button className="mt-2 text-sm text-[#8a6a44] underline" onClick={() => go("overview")}>
          Back to the overview
        </button>
      </Card>
    </div>
  );
}