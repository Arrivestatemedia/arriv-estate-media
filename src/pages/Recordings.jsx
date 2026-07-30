import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Film, Download, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Recordings() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);

  const userId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    base44.entities.VideoRecording.filter({ recorded_by_id: userId }, '-created_date', 100)
      .then(setRecordings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const handleDelete = async (id) => {
    try {
      await base44.entities.VideoRecording.delete(id);
      setRecordings(prev => prev.filter(r => r.id !== id));
    } catch (_) {}
  };

  const fmtDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Film className="w-7 h-7" style={{ color: '#B8956A' }} />
        <h1 className="text-2xl font-bold">My Recordings</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Film className="w-16 h-16 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No recordings yet</p>
          <p className="text-sm text-gray-400 mt-1">Recordings from your video calls will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recordings.map((rec) => (
            <div key={rec.id} className="bg-white rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
              <video
                src={rec.file_url}
                controls
                className="w-full h-40 bg-black object-contain"
              />
              <div className="p-3">
                <p className="text-sm font-medium text-gray-800">
                  {rec.participant_name ? `Call with ${rec.participant_name}` : "Video call recording"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(rec.created_date).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtDuration(rec.duration_seconds || 0)} · {((rec.file_size || 0) / 1024 / 1024).toFixed(1)} MB
                </p>
                <div className="flex gap-2 mt-3">
                  <a href={rec.file_url} download={`recording-${rec.id}.webm`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full h-8 text-xs">
                      <Download className="w-3.5 h-3.5 mr-1" /> Download
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(rec.id)}
                    className="h-8 px-2 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}