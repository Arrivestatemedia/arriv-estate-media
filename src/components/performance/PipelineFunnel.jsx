import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STAGES = [
  { key: 'leads', label: 'Leads', color: '#B8956A' },
  { key: 'conversations', label: 'Conversations', color: '#C9A87B' },
  { key: 'appointments', label: 'Appointments', color: '#D4B88E' },
  { key: 'quotes', label: 'Quotes', color: '#E0C7A3' },
  { key: 'clients', label: 'Clients', color: '#16a34a' },
  { key: 'revenue', label: 'Revenue', color: '#15803d', isMoney: true },
];

export default function PipelineFunnel({ data, title = 'Pipeline Health' }) {
  if (!data) return null;
  const maxValue = Math.max(...STAGES.filter(s => !s.isMoney).map(s => data[s.key] || 0), 1);

  return (
    <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
      <CardHeader>
        <CardTitle className="text-lg" style={{ color: '#1A1A1A' }}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {STAGES.map((stage, idx) => {
          const value = data[stage.key] || 0;
          const width = stage.isMoney ? 100 : Math.max(8, (value / maxValue) * 100);
          return (
            <div key={stage.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{stage.label}</span>
                <span className="text-sm font-bold" style={{ color: stage.color }}>
                  {stage.isMoney ? `$${value.toLocaleString()}` : value}
                </span>
              </div>
              <div className="h-7 rounded-lg transition-all" style={{
                width: `${width}%`,
                backgroundColor: stage.isMoney ? stage.color : `${stage.color}25`,
                border: `1px solid ${stage.color}40`,
                minWidth: '40px',
              }} />
              {idx < STAGES.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <span className="text-xs" style={{ color: 'rgba(26,26,26,0.3)' }}>↓</span>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}