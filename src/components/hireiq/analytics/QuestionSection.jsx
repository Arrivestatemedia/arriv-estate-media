import React from "react";
import { HelpCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { SectionWrapper, EmptyState, ChartTooltip, CREAM, GOLD, MUTED_LIGHT, card, SERIF, MONO, CHART_COLORS } from "./shared";
import { computeQuestionEffectiveness } from "@/lib/analyticsEngine";

export default function QuestionSection({ data }) {
  const q = computeQuestionEffectiveness(data);

  if (!q) {
    return (
      <SectionWrapper title="Question Effectiveness" icon={HelpCircle}>
        <EmptyState message="Not enough data — need at least 3 hired candidates with completed interviews and performance records to analyze question effectiveness." />
      </SectionWrapper>
    );
  }

  const bestQData = q.bestQuestions.map(qq => ({ name: qq.question.length > 30 ? qq.question.substring(0, 30) + "…" : qq.question, score: Number(qq.effectivenessScore.toFixed(2)), full: qq.question }));
  const bestCData = q.bestCompetencies.map(cc => ({ name: cc.competency, score: Number(cc.effectivenessScore.toFixed(2)) }));

  return (
    <SectionWrapper title="Question Effectiveness" icon={HelpCircle}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5" style={card}>
          <h3 className="text-sm font-bold mb-3" style={{ ...SERIF, color: GOLD }}>Most Predictive Questions</h3>
          {bestQData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bestQData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(184,149,106,0.1)" />
                <XAxis type="number" tick={{ fill: MUTED_LIGHT, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: CREAM, fontSize: 10 }} width={120} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(184,149,106,0.05)" }} />
                <Bar dataKey="score" name="Effectiveness" radius={[0, 4, 4, 0]}>
                  {bestQData.map((_, i) => <Cell key={i} fill={CHART_COLORS[0]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-center py-6" style={{ color: MUTED_LIGHT }}>No data</p>}
        </div>
        <div className="p-5" style={card}>
          <h3 className="text-sm font-bold mb-3" style={{ ...SERIF, color: GOLD }}>Most Predictive Competencies</h3>
          {bestCData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bestCData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(184,149,106,0.1)" />
                <XAxis type="number" tick={{ fill: MUTED_LIGHT, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: CREAM, fontSize: 10 }} width={100} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(184,149,106,0.05)" }} />
                <Bar dataKey="score" name="Effectiveness" radius={[0, 4, 4, 0]}>
                  {bestCData.map((_, i) => <Cell key={i} fill={CHART_COLORS[1]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-center py-6" style={{ color: MUTED_LIGHT }}>No data</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="p-5" style={card}>
          <h3 className="text-sm font-bold mb-2" style={{ ...SERIF, color: "#FCA5A5" }}>Least Predictive Questions</h3>
          {q.worstQuestions.length > 0 ? (
            <ul className="space-y-1.5">
              {q.worstQuestions.map((qq, i) => (
                <li key={i} className="text-xs flex justify-between items-start gap-2">
                  <span style={{ color: CREAM }}>{qq.question}</span>
                  <span className="font-bold flex-shrink-0" style={{ ...MONO, color: "#FCA5A5" }}>{qq.effectivenessScore.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm" style={{ color: MUTED_LIGHT }}>No data</p>}
        </div>
        <div className="p-5" style={card}>
          <h3 className="text-sm font-bold mb-2" style={{ ...SERIF, color: "#FCA5A5" }}>Least Predictive Competencies</h3>
          {q.worstCompetencies.length > 0 ? (
            <ul className="space-y-1.5">
              {q.worstCompetencies.map((cc, i) => (
                <li key={i} className="text-xs flex justify-between items-center">
                  <span style={{ color: CREAM }}>{cc.competency}</span>
                  <span className="font-bold" style={{ ...MONO, color: "#FCA5A5" }}>{cc.effectivenessScore.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm" style={{ color: MUTED_LIGHT }}>No data</p>}
        </div>
      </div>
      <p className="text-xs mt-2" style={{ color: MUTED_LIGHT }}>
        Effectiveness score = avg rating among high performers minus avg rating among low performers. Higher = more predictive of success.
      </p>
    </SectionWrapper>
  );
}