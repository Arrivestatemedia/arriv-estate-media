import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPageUrl } from "../utils";
import { Link } from "react-router-dom";
import { getStatusLabel, getStatusColor } from "@/lib/applicationStatus";
import { Search, Link2, Plus, X, Clock, FileText, ArrowLeft, CheckCircle2 } from "lucide-react";

function LinkList({ items, setItems, placeholder, editable }) {
  const [value, setValue] = useState("");
  const add = () => {
    if (!value.trim()) return;
    setItems([...items, value.trim()]);
    setValue("");
  };
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)] italic">None provided.</p>
      )}
      {items.map((url, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate text-sm text-[var(--accent-color)] underline">
            {url}
          </a>
          {editable && (
            <button
              type="button"
              onClick={() => setItems(items.filter((_, i) => i !== idx))}
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={add} className="border-[var(--accent-color)] text-[var(--accent-color)]">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ApplicationPortal() {
  const [fullName, setFullName] = useState("");
  const [addressPrefix, setAddressPrefix] = useState("");
  const [looking, setLooking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [application, setApplication] = useState(null);

  const [videoSamples, setVideoSamples] = useState([]);
  const [pictureSamples, setPictureSamples] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const handleLookup = async (e) => {
    e.preventDefault();
    setLooking(true);
    setNotFound(false);
    setLookupError("");
    setApplication(null);
    setSaveMsg("");
    try {
      const res = await base44.functions.invoke("lookupApplication", { fullName, addressPrefix });
      if (res.data?.notFound) {
        setNotFound(true);
      } else if (res.data?.application) {
        const app = res.data.application;
        setApplication(app);
        setVideoSamples(app.video_samples || []);
        setPictureSamples(app.picture_samples || []);
        setDocuments(app.documents || []);
      } else {
        setLookupError(res.data?.error || "Could not find your application.");
      }
    } catch (err) {
      setLookupError("Something went wrong. Please try again.");
    } finally {
      setLooking(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await base44.functions.invoke("updateApplicationDocuments", {
        applicationId: application.id,
        fullName,
        addressPrefix,
        video_samples: videoSamples,
        picture_samples: pictureSamples,
        documents,
      });
      if (res.data?.success) {
        setSaveMsg("Your documents have been updated.");
        setApplication({ ...application, video_samples: videoSamples, picture_samples: pictureSamples, documents });
      } else {
        setSaveMsg(res.data?.error || "Could not save. Please try again.");
      }
    } catch (e) {
      setSaveMsg("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updates = (application?.updates || []).slice().reverse();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Application Portal</h1>
          <p className="text-[var(--text-secondary)] mt-1">Check your status and update your documents</p>
        </div>

        {!application && (
          <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
            <CardContent className="pt-6">
              <form onSubmit={handleLookup} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)]">Full Name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name exactly as you applied"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)]">Street Address Number</Label>
                  <Input
                    value={addressPrefix}
                    onChange={(e) => setAddressPrefix(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                    placeholder="e.g. 1234"
                    required
                    inputMode="numeric"
                  />
                  <p className="text-xs text-[var(--text-secondary)]">
                    Enter the digits at the start of your street address (your house number). If your address has fewer than 4 digits, just enter what you have — e.g. "12" for 12 Main St.
                  </p>
                </div>
                {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
                {notFound && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    We couldn't find an application matching that name and address. Double-check your entries, or{" "}
                    <a href={createPageUrl("MediaSpecialist")} className="underline font-medium">apply here</a>.
                  </div>
                )}
                <Button type="submit" disabled={looking} className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white">
                  {looking ? "Searching..." : (<><Search className="w-4 h-4 mr-2" /> Find My Application</>)}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {application && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Button variant="ghost" className="text-[var(--text-secondary)]" onClick={() => { setApplication(null); setSaveMsg(""); }}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Look up another
              </Button>
            </div>

            {/* Status */}
            <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
              <CardHeader>
                <CardTitle className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[var(--accent-color)]" />
                  Application Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <span
                    className="px-4 py-2 rounded-full text-white font-semibold"
                    style={{ backgroundColor: getStatusColor(application.status) }}
                  >
                    {getStatusLabel(application.status)}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    Submitted {new Date(application.created_date).toLocaleDateString()}
                  </span>
                </div>
                {application.status === "reviewing" && (
                  <div className="mt-3 text-sm text-[var(--text-secondary)]">
                    Your application is under review — you should hear something from us within 24–48 hours.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Accepted — continue to account setup */}
            {application.status === "accepted" && (
              <Card className="border-2 border-green-300 bg-green-50/50">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-8 h-8 text-green-600 shrink-0" />
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">You've been accepted!</h3>
                      <p className="text-sm text-[var(--text-secondary)]">Complete your account setup to start taking jobs.</p>
                    </div>
                  </div>
                  <Link
                    to={`/MediaPartnerSignup?full_name=${encodeURIComponent(application.full_name || "")}&email=${encodeURIComponent(application.email || "")}&phone_number=${encodeURIComponent(application.phone || "")}`}
                    className="block w-full text-center px-4 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
                  >
                    Continue to Create Your Account
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Submitted information */}
            <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
              <CardHeader>
                <CardTitle className="text-lg text-[var(--text-primary)]">Submitted Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Name" value={application.full_name} />
                <InfoRow label="Email" value={application.email} />
                <InfoRow label="Phone" value={application.phone} />
                <InfoRow label="Address" value={application.address} />
                <InfoRow label="Date of Birth" value={application.dob} />
                <InfoRow label="LinkedIn" value={application.linkedin} link />
                <InfoRow label="Portfolio" value={application.portfolio_link} link />
                <div className="pt-2 border-t border-[var(--border-color)]">
                  <p className="font-medium text-[var(--text-primary)] mb-1">Last Related Job / Experience</p>
                  <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{application.last_related_job}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)] mb-1">Why You're a Good Fit</p>
                  <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{application.why_good_fit}</p>
                </div>
              </CardContent>
            </Card>

            {/* Updates */}
            <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
              <CardHeader>
                <CardTitle className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[var(--accent-color)]" />
                  Updates
                </CardTitle>
              </CardHeader>
              <CardContent>
                {updates.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)] italic">No updates yet. Check back as your application is reviewed.</p>
                ) : (
                  <ul className="space-y-3">
                    {updates.map((u, idx) => (
                      <li key={idx} className="border-l-2 pl-3" style={{ borderColor: "var(--accent-color)" }}>
                        <p className="text-sm text-[var(--text-primary)]">{u.message}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                          {u.created_at ? new Date(u.created_at).toLocaleString() : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Documents */}
            <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
              <CardHeader>
                <CardTitle className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-[var(--accent-color)]" />
                  Documents & Samples
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {application.documents_requested && application.documents_requested_note && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    <strong>Documents requested:</strong> {application.documents_requested_note}
                  </div>
                )}
                <div>
                  <Label className="text-[var(--text-primary)] mb-2 block">Video Samples (Google Drive links)</Label>
                  <LinkList items={videoSamples} setItems={setVideoSamples} placeholder="https://drive.google.com/..." editable />
                </div>
                <div>
                  <Label className="text-[var(--text-primary)] mb-2 block">Picture Samples (Google Drive links)</Label>
                  <LinkList items={pictureSamples} setItems={setPictureSamples} placeholder="https://drive.google.com/..." editable />
                </div>
                <div>
                  <Label className="text-[var(--text-primary)] mb-2 block">Additional Documents</Label>
                  <LinkList items={documents} setItems={setDocuments} placeholder="Add a document link" editable />
                </div>

                {saveMsg && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> {saveMsg}
                  </p>
                )}
                <Button onClick={handleSave} disabled={saving} className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white">
                  {saving ? "Saving..." : "Save Documents"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, link }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <span className="font-medium text-[var(--text-secondary)]">{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noreferrer" className="text-[var(--accent-color)] underline truncate">{value}</a>
      ) : (
        <span className="text-[var(--text-primary)] text-right">{value}</span>
      )}
    </div>
  );
}