import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Loader2, PenTool, CheckCircle2, Clock, XCircle, Eye, Download } from "lucide-react";

const STATUS_COLORS = {
  DRAFT: "bg-gray-100 text-gray-700",
  PREPARING: "bg-blue-100 text-blue-700",
  READY_TO_SEND: "bg-blue-100 text-blue-700",
  SENT: "bg-amber-100 text-amber-700",
  DELIVERED: "bg-amber-100 text-amber-700",
  OPENED: "bg-blue-100 text-blue-700",
  VIEWING: "bg-blue-100 text-blue-700",
  SIGNING: "bg-[#B8956A]/20 text-[#B8956A]",
  PARTIALLY_SIGNED: "bg-[#B8956A]/20 text-[#B8956A]",
  COMPLETED: "bg-[#B8956A] text-[#1A1A1A]",
  DECLINED: "bg-red-100 text-red-700",
  VOIDED: "bg-gray-200 text-gray-600",
  EXPIRED: "bg-gray-200 text-gray-600",
};

export default function AgreementsSection({ organizationId, contractId, onShowCreate }) {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgreement, setSelectedAgreement] = useState(null);

  useEffect(() => {
    if (organizationId) loadAgreements();
  }, [organizationId]);

  const loadAgreements = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getAgreementsForOrganization", {
        organization_id: organizationId,
      });
      const data = res?.data || res;
      setAgreements(data?.agreements || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  const activeAgreements = agreements.filter(a => !['COMPLETED', 'VOIDED', 'EXPIRED', 'DECLINED'].includes(a.status));
  const completedAgreements = agreements.filter(a => a.status === 'COMPLETED');
  const pendingSignature = agreements.filter(a => ['SENT', 'DELIVERED', 'OPENED', 'VIEWING', 'SIGNING', 'PARTIALLY_SIGNED'].includes(a.status));
  const drafts = agreements.filter(a => a.status === 'DRAFT' || a.status === 'PREPARING' || a.status === 'READY_TO_SEND');

  return (
    <div className="space-y-4">
      {/* Prominent status banner for awaiting signatures */}
      {pendingSignature.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-600" />
          <p className="text-sm text-amber-800">
            <span className="font-medium">{pendingSignature.length}</span> agreement{pendingSignature.length !== 1 ? 's' : ''} awaiting signature
          </p>
        </div>
      )}

      {/* Create button */}
      <div className="flex justify-end">
        <Button
          onClick={() => onShowCreate?.()}
          className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          Create Agreement
        </Button>
      </div>

      {/* Active Agreements */}
      {activeAgreements.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[#1A1A1A]/60 mb-2">Active</h4>
          <div className="space-y-2">
            {activeAgreements.map(a => (
              <AgreementCard key={a.id} agreement={a} onClick={() => setSelectedAgreement(a)} />
            ))}
          </div>
        </div>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[#1A1A1A]/60 mb-2">Drafts</h4>
          <div className="space-y-2">
            {drafts.map(a => (
              <AgreementCard key={a.id} agreement={a} onClick={() => setSelectedAgreement(a)} />
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedAgreements.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[#1A1A1A]/60 mb-2">Executed Agreements</h4>
          <div className="space-y-2">
            {completedAgreements.map(a => (
              <AgreementCard key={a.id} agreement={a} onClick={() => setSelectedAgreement(a)} />
            ))}
          </div>
        </div>
      )}

      {agreements.length === 0 && (
        <div className="text-center py-8 text-[#1A1A1A]/40">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No agreements yet</p>
        </div>
      )}
    </div>
  );
}

function AgreementCard({ agreement, onClick }) {
  return (
    <Card className="cursor-pointer hover:border-[#B8956A] transition-colors" onClick={onClick}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[#1A1A1A] truncate">{agreement.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={STATUS_COLORS[agreement.status] || 'bg-gray-100 text-gray-700'} variant="secondary">
                {agreement.status.replace(/_/g, ' ')}
              </Badge>
              {agreement.required_count > 0 && (
                <span className="text-xs text-[#1A1A1A]/50">
                  {agreement.completed_count}/{agreement.required_count} complete
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            {agreement.status === 'COMPLETED' && <CheckCircle2 className="w-4 h-4 text-[#B8956A]" />}
            {['SENT', 'DELIVERED', 'OPENED', 'VIEWING', 'SIGNING'].includes(agreement.status) && <Clock className="w-4 h-4 text-amber-500" />}
            {agreement.status === 'DECLINED' && <XCircle className="w-4 h-4 text-red-500" />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}