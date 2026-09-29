import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle2, AlertCircle, Shield, PenTool, XCircle, Download } from "lucide-react";

export default function AgreementSigning() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [fieldValues, setFieldValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const heartbeatRef = useRef(null);

  useEffect(() => {
    if (token) initiateSession();
    else {
      setError("No signing token provided");
      setLoading(false);
    }
  }, [token]);

  const initiateSession = async () => {
    try {
      const res = await base44.functions.invoke("getAgreementSigningSession", {
        action: "initiate_session",
        token,
        ip_address: "",
        user_agent: navigator.userAgent,
      });
      const data = res?.data || res;
      if (data?.status === "ERROR") throw new Error(data.error);
      setSessionData(data);
      setSessionToken(data.session_token);
      setConsentAccepted(data.recipient.consent_status === "accepted");

      // Initialize field values from existing
      const existing = {};
      (data.existing_values || []).forEach(v => { existing[v.field_id] = v.value; });
      setFieldValues(existing);

      // Start heartbeat
      startHeartbeat(data.session_token);
    } catch (e) {
      setError(e.message || "Failed to start signing session");
    } finally {
      setLoading(false);
    }
  };

  const startHeartbeat = (sToken) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(async () => {
      try {
        await base44.functions.invoke("getAgreementSigningSession", {
          action: "heartbeat",
          session_token: sToken,
        });
      } catch {}
    }, 30000); // 30 second heartbeat
  };

  useEffect(() => () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
  }, []);

  const acceptConsent = async () => {
    try {
      await base44.functions.invoke("getAgreementSigningSession", {
        action: "accept_consent",
        session_token: sessionToken,
        ip_address: "",
        user_agent: navigator.userAgent,
      });
      setConsentAccepted(true);
    } catch (e) {
      setError(e.message);
    }
  };

  const submitField = async (fieldId, value) => {
    setSubmitting(true);
    try {
      await base44.functions.invoke("getAgreementSigningSession", {
        action: "submit_field",
        session_token: sessionToken,
        field_id: fieldId,
        value,
        idempotency_key: `${sessionData.agreement.id}_${sessionData.recipient.recipient_id}_${fieldId}`,
        ip_address: "",
        user_agent: navigator.userAgent,
      });
      setFieldValues(prev => ({ ...prev, [fieldId]: value }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const completeSigning = async () => {
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("getAgreementSigningSession", {
        action: "complete_recipient",
        session_token: sessionToken,
        ip_address: "",
        user_agent: navigator.userAgent,
      });
      const data = res?.data || res;
      if (data?.agreement_completed) {
        setCompleted(true);
      } else {
        // This recipient is done but others still need to sign
        setCompleted(true);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const declineAgreement = async () => {
    setSubmitting(true);
    try {
      await base44.functions.invoke("getAgreementSigningSession", {
        action: "decline",
        session_token: sessionToken,
        reason: declineReason,
      });
      setCompleted(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-[#1A1A1A] mb-2">Unable to Access Agreement</h2>
            <p className="text-[#1A1A1A]/60">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-16 h-16 text-[#B8956A] mx-auto mb-4" />
            <h2 className="text-2xl font-medium text-[#1A1A1A] mb-2">
              {sessionData.recipient.role === 'SIGNER' || sessionData.recipient.role === 'INTERNAL_SIGNER' ? 'Signature Complete' : 'Review Complete'}
            </h2>
            <p className="text-[#1A1A1A]/60 mb-4">
              Thank you, {sessionData.recipient.name}. Your portion of "{sessionData.agreement.name}" has been completed.
            </p>
            <p className="text-sm text-[#1A1A1A]/40">
              You will receive a notification when all parties have completed signing.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const agreement = sessionData.agreement;
  const recipient = sessionData.recipient;
  const fields = sessionData.fields || [];
  const myFields = fields; // Already filtered to this recipient

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="bg-[#1A1A1A] border-b border-[#B8956A]/20 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv" className="h-7" />
            <span className="text-[#FFFBF5]/50 text-sm">Arriv Agreements</span>
          </div>
          <div className="text-right">
            <p className="text-sm text-[#FFFBF5]">{recipient.name}</p>
            <p className="text-xs text-[#B8956A]">{recipient.role}</p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Agreement Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-serif text-[#1A1A1A] mb-1">{agreement.name}</h1>
          <p className="text-sm text-[#1A1A1A]/50">{agreement.agreement_type.replace(/_/g, ' ')}</p>
        </div>

        {/* Consent Gate */}
        {!consentAccepted && (
          <Card className="mb-6 border-[#B8956A]/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 mb-4">
                <Shield className="w-6 h-6 text-[#B8956A] flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-medium text-[#1A1A1A] mb-2">Electronic Records and Signature Consent</h3>
                  <p className="text-sm text-[#1A1A1A]/60 leading-relaxed">
                    By proceeding, you consent to use electronic records and signatures for this agreement.
                    Your electronic signature has the same legal effect as a handwritten signature.
                    You may decline and request a paper copy.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={acceptConsent} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
                  I Agree — Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Document */}
        {consentAccepted && (
          <>
            {agreement.document_type === 'native' ? (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div
                    className="prose prose-sm max-w-none text-[#1A1A1A]"
                    dangerouslySetInnerHTML={{ __html: agreement.document_body || '<p class="text-gray-400">No document content</p>' }}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 p-4 bg-[#FFFBF5] rounded-lg">
                    <FileText className="w-8 h-8 text-[#B8956A]" />
                    <div className="flex-1">
                      <p className="font-medium text-[#1A1A1A]">{agreement.document_file_name || 'Document'}</p>
                      <p className="text-sm text-[#1A1A1A]/50">Uploaded document</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Signature Fields */}
            {myFields.length > 0 && (
              <Card className="mb-6 border-[#B8956A]/30">
                <CardContent className="pt-6">
                  <h3 className="font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
                    <PenTool className="w-5 h-5 text-[#B8956A]" />
                    {recipient.role === 'SIGNER' || recipient.role === 'INTERNAL_SIGNER' ? 'Sign Here' : 'Complete Fields'}
                  </h3>
                  <div className="space-y-4">
                    {myFields.map(field => (
                      <FieldInput
                        key={field.field_id}
                        field={field}
                        value={fieldValues[field.field_id] || ''}
                        onChange={(val) => submitField(field.field_id, val)}
                        disabled={submitting}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={completeSigning}
                disabled={submitting}
                className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] flex-1"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {recipient.role === 'SIGNER' || recipient.role === 'INTERNAL_SIGNER' ? 'Finish Signing' : 'Complete Review'}
              </Button>
              <Button
                onClick={() => setDeclineMode(true)}
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                Decline
              </Button>
            </div>

            {/* Decline Modal */}
            {declineMode && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <Card className="max-w-md w-full">
                  <CardContent className="pt-6">
                    <h3 className="font-medium text-[#1A1A1A] mb-3">Decline to Sign</h3>
                    <textarea
                      className="w-full border border-[#B8956A]/30 rounded-lg p-3 text-sm mb-4"
                      rows={3}
                      placeholder="Reason for declining (optional)"
                      value={declineReason}
                      onChange={e => setDeclineReason(e.target.value)}
                    />
                    <div className="flex gap-3">
                      <Button onClick={declineAgreement} disabled={submitting} className="bg-red-600 text-white hover:bg-red-700 flex-1">
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                        Confirm Decline
                      </Button>
                      <Button onClick={() => setDeclineMode(false)} variant="outline">
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange, disabled }) {
  const [localValue, setLocalValue] = useState(value);

  const handleSign = () => {
    // For signature fields, use typed name as signature
    const sigValue = localValue || '';
    if (sigValue.trim()) {
      onChange(sigValue);
    }
  };

  if (field.field_type === 'SIGNATURE' || field.field_type === 'INITIALS') {
    return (
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A] mb-1">
          {field.label || (field.field_type === 'SIGNATURE' ? 'Signature' : 'Initials')}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 border border-[#B8956A]/30 rounded-lg px-3 py-2 text-sm"
            style={{ fontFamily: '"Brush Script MT", cursive', fontSize: '18px' }}
            placeholder="Type your name to sign"
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            disabled={disabled}
          />
          <Button onClick={handleSign} disabled={disabled || !localValue.trim()} size="sm" className="bg-[#B8956A] text-[#1A1A1A]">
            Sign
          </Button>
        </div>
        {value && <p className="text-xs text-green-600 mt-1">✓ Signed</p>}
      </div>
    );
  }

  if (field.field_type === 'APPROVAL' || field.field_type === 'ACKNOWLEDGEMENT') {
    return (
      <div>
        <label className="flex items-center gap-2 text-sm text-[#1A1A1A]">
          <input
            type="checkbox"
            className="w-4 h-4 accent-[#B8956A]"
            checked={localValue === 'true'}
            onChange={e => { setLocalValue('true'); onChange('true'); }}
            disabled={disabled}
          />
          {field.label || 'I approve'}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {value === 'true' && <p className="text-xs text-green-600 mt-1">✓ Approved</p>}
      </div>
    );
  }

  if (field.field_type === 'CHECKBOX') {
    return (
      <div>
        <label className="flex items-center gap-2 text-sm text-[#1A1A1A]">
          <input
            type="checkbox"
            className="w-4 h-4 accent-[#B8956A]"
            checked={localValue === 'true'}
            onChange={e => { const v = e.target.checked ? 'true' : ''; setLocalValue(v); onChange(v); }}
            disabled={disabled}
          />
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      </div>
    );
  }

  if (field.field_type === 'DATE_SIGNED' || field.field_type === 'DATE') {
    const today = new Date().toISOString().split('T')[0];
    return (
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A] mb-1">
          {field.label || 'Date'}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <input
          type="date"
          className="w-full border border-[#B8956A]/30 rounded-lg px-3 py-2 text-sm"
          value={value || today}
          readOnly={field.read_only}
          onChange={e => { setLocalValue(e.target.value); onChange(e.target.value); }}
          disabled={disabled}
        />
      </div>
    );
  }

  // Default text/number/email/title/company/full_name
  return (
    <div>
      <label className="block text-sm font-medium text-[#1A1A1A] mb-1">
        {field.label || field.field_type.replace(/_/g, ' ').toLowerCase()}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={field.field_type === 'NUMBER' ? 'number' : field.field_type === 'EMAIL' ? 'email' : 'text'}
        className="w-full border border-[#B8956A]/30 rounded-lg px-3 py-2 text-sm"
        value={value || field.prefilled_value || ''}
        readOnly={field.read_only}
        placeholder={field.prefilled_value || ''}
        onChange={e => { setLocalValue(e.target.value); onChange(e.target.value); }}
        disabled={disabled}
      />
    </div>
  );
}