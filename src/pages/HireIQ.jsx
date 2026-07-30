import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus, Loader2, Users } from "lucide-react";
import JobCreateForm from "@/components/hireiq/JobCreateForm";

export default function HireIQ() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const loadJobs = async () => {
    try {
      const list = await base44.entities.HireJob.list("-created_date", 50);
      setJobs(list || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { loadJobs(); }, []);

  const handleCreate = async (jobData) => {
    setCreating(true);
    try {
      const job = await base44.entities.HireJob.create({
        ...jobData,
        status: "draft",
        role_profile_approved: false,
        created_by_name: localStorage.getItem("sales_member_name") || localStorage.getItem("user_name") || "Admin",
      });
      setShowCreate(false);
      navigate(createPageUrl("HireIQJobDetail") + `?id=${job.id}`);
    } catch (err) {
      alert("Failed to create job: " + (err.message || "unknown error"));
    } finally {
      setCreating(false);
    }
  };

  const statusColor = (s) => ({
    draft: "bg-gray-100 text-gray-600",
    open: "bg-green-100 text-green-700",
    closed: "bg-red-100 text-red-600",
    filled: "bg-blue-100 text-blue-700",
  }[s] || "bg-gray-100 text-gray-600");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#B8956A] flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Arriv HireIQ</h1>
            <p className="text-sm text-gray-500">AI-powered hiring & interview management</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} style={{ backgroundColor: "#B8956A" }}>
          <Plus className="w-4 h-4 mr-2" /> Create Job Opening
        </Button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Create Job Opening</h2>
            {creating ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
                <span className="ml-2 text-gray-500">Creating job...</span>
              </div>
            ) : (
              <JobCreateForm onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20">
          <Briefcase className="w-16 h-16 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No job openings yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first job opening to start hiring.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map(job => (
            <div key={job.id} onClick={() => navigate(createPageUrl("HireIQJobDetail") + `?id=${job.id}`)}
              className="bg-white rounded-xl border shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
              style={{ borderColor: "rgba(184,149,106,0.2)" }}>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-gray-800">{job.title || "Untitled"}</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${statusColor(job.status)}`}>{job.status}</span>
              </div>
              <p className="text-sm text-gray-500">{job.department || "No department"}</p>
              <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Candidates: —</span>
                {job.role_profile_approved && <span className="text-green-500">Profile approved</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}