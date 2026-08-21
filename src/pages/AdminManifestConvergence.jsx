import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CLASSIFICATION_ICONS = {
  FULL_RUNTIME_CONVERGENCE: CheckCircle2,
  CONFIG_CONVERGED_EXECUTION_LOCAL_UNTIL_LATER_PHASE: Circle,
  FALLBACK_ACTIVE: AlertTriangle,
  INCOMPATIBLE: XCircle,
  NOT_CONFIGURED: Circle,
};

const CLASSIFICATION_COLORS = {
  FULL_RUNTIME_CONVERGENCE: "text-emerald-600",
  CONFIG_CONVERGED_EXECUTION_LOCAL_UNTIL_LATER_PHASE: "text-blue-600",
  FALLBACK_ACTIVE: "text-amber-600",
  INCOMPATIBLE: "text-red-600",
  NOT_CONFIGURED: "text-slate-400",
};

export default function AdminManifestConvergence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getManifestConvergenceStatus", {});
      setData(res?.data || res);
      setError(null);
    } catch (e) {
      setError(e?.message || "Failed to load convergence status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-[#B8956A]" />
              ProductManifest Convergence Status
            </h1>
            <p className="text-sm text-[#1A1A1A]/60 mt-1">
              Runtime consumption diagnostics for canonical Arriv One ProductManifest configuration
            </p>
          </div>
          <Button onClick={fetchStatus} disabled={loading} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="mb-4 border-red-200">
            <CardContent className="pt-4">
              <p className="text-sm text-red-600">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-[#B8956A]" />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-[#1A1A1A]/60">EM Runtime Version</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-[#1A1A1A]">{data.em_runtime_version}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-[#1A1A1A]/60">Tenant ID</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-mono font-bold text-[#1A1A1A]">{data.tenant_id}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-[#1A1A1A]/60">AO Reachable</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold flex items-center gap-2">
                    {data.ao_reachable ? (
                      <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Yes</>
                    ) : (
                      <><XCircle className="w-5 h-5 text-amber-600" /> No</>
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Per-Entry-Type Convergence</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#B8956A]/20">
                        <th className="text-left py-2 px-3 font-medium text-[#1A1A1A]/60">Entry Type</th>
                        <th className="text-left py-2 px-3 font-medium text-[#1A1A1A]/60">Expected</th>
                        <th className="text-left py-2 px-3 font-medium text-[#1A1A1A]/60">Stored</th>
                        <th className="text-left py-2 px-3 font-medium text-[#1A1A1A]/60">Active</th>
                        <th className="text-left py-2 px-3 font-medium text-[#1A1A1A]/60">Runtime</th>
                        <th className="text-left py-2 px-3 font-medium text-[#1A1A1A]/60">Classification</th>
                        <th className="text-left py-2 px-3 font-medium text-[#1A1A1A]/60">Fallback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((entry) => {
                        const Icon = CLASSIFICATION_ICONS[entry.classification] || Circle;
                        const color = CLASSIFICATION_COLORS[entry.classification] || "text-slate-400";
                        return (
                          <tr key={entry.entry_type} className="border-b border-[#B8956A]/10 hover:bg-[#B8956A]/5">
                            <td className="py-2 px-3 font-mono text-xs text-[#1A1A1A]">{entry.entry_type}</td>
                            <td className="py-2 px-3 text-xs text-[#1A1A1A]/70">{entry.expected_canonical_version || "—"}</td>
                            <td className="py-2 px-3 text-xs text-[#1A1A1A]/70">{entry.stored_version || "—"}</td>
                            <td className="py-2 px-3 text-xs text-[#1A1A1A]/70">{entry.active_version || "—"}</td>
                            <td className="py-2 px-3 text-xs text-[#1A1A1A]/70">{entry.runtime_version || "—"}</td>
                            <td className="py-2 px-3">
                              <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
                                <Icon className="w-3 h-3" />
                                {entry.classification}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              {entry.fallback_used ? (
                                <Badge variant="outline" className="text-amber-600 border-amber-300">Yes</Badge>
                              ) : (
                                <Badge variant="outline" className="text-emerald-600 border-emerald-300">No</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Convergence Classification Legend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs text-[#1A1A1A]/70">
                  <p><strong className="text-emerald-600">FULL_RUNTIME_CONVERGENCE</strong> — STORED == ACTIVE == RUNTIME == EXPECTED. True convergence.</p>
                  <p><strong className="text-blue-600">CONFIG_CONVERGED_EXECUTION_LOCAL_UNTIL_LATER_PHASE</strong> — Config resolved but execution still uses local implementation (later phase owns cutover).</p>
                  <p><strong className="text-amber-600">FALLBACK_ACTIVE</strong> — No compatible manifest; runtime using safe local default.</p>
                  <p><strong className="text-red-600">INCOMPATIBLE</strong> — Manifest exists but outside EM runtime compatibility range.</p>
                  <p><strong className="text-slate-400">NOT_CONFIGURED</strong> — No manifest stored and no expected version from AO.</p>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}