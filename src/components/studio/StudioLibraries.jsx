import React, { useState, useEffect } from "react";
import { Plus, Play, Pencil, Trash2, Music as MusicIcon, Mic, User, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  bg: "#0f0f0f", container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
  green: "#2d5a27", gold: "#5a4a27",
};

// Status badge colors
const STATUS_COLORS = {
  available: { bg: C.green, text: "#7ddc6e" },
  limited: { bg: C.gold, text: "#e8c46a" },
};

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.available;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  );
}

function Tag({ children }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
      style={{ background: "#2d2d2d", color: C.muted }}
    >
      {children}
    </span>
  );
}

// ── Presenter Card ──
function PresenterCard({ presenter, onEdit, onDelete }) {
  const [avatarColor] = useState(() => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"];
    return colors[presenter.name?.charCodeAt(0) % colors.length] || "#FF5A4F";
  });

  return (
    <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{ background: avatarColor }}
          >
            {presenter.name?.charAt(0)}
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: C.text }}>{presenter.name}</h3>
            <p className="text-xs" style={{ color: C.muted }}>{presenter.source}</p>
          </div>
        </div>
        <StatusBadge status={presenter.status || "available"} />
      </div>

      {/* Sub-header: category (HUMAN / ARRIV AI) */}
      {presenter.category && (
        <p className="text-xs mb-2" style={{ color: C.muted }}>{presenter.category}</p>
      )}

      {/* Description */}
      <p className="text-sm mb-3" style={{ color: C.text }}>{presenter.description}</p>

      {/* Tags */}
      {presenter.tags && presenter.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {presenter.tags.map((tag, i) => (
            <Tag key={i}>{tag}</Tag>
          ))}
        </div>
      )}

      {/* Preview area */}
      <div
        className="flex items-center justify-center gap-2 rounded-lg py-6 mb-3"
        style={{ background: "#2d2d2d" }}
      >
        <Play className="w-4 h-4" style={{ color: C.muted }} />
        <span className="text-sm" style={{ color: C.muted }}>Demo coming</span>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onEdit?.(presenter)}
          className="inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
          style={{ color: C.muted }}
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button
          onClick={() => onDelete?.(presenter)}
          className="inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
          style={{ color: C.muted }}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

// ── Voice Card ──
function VoiceCard({ voice, onEdit, onDelete }) {
  return (
    <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,90,79,0.1)" }}
        >
          <Mic className="w-5 h-5" style={{ color: C.accent }} />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: C.text }}>{voice.name}</h3>
          <p className="text-xs" style={{ color: C.muted }}>
            {voice.source} · {voice.category}
          </p>
        </div>
      </div>

      <p className="text-sm mb-4" style={{ color: C.muted }}>
        {voice.description}{voice.metadata?.language ? ` · ${voice.metadata.language}` : ""}
      </p>

      <button
        className="w-full py-2 rounded-lg text-sm font-medium mb-3 transition-colors hover:border-[#FF5A4F]/40"
        style={{ border: `1px solid ${C.border}`, color: C.text }}
      >
        Preview voice
      </button>

      <div className="flex items-center gap-4">
        <button
          onClick={() => onEdit?.(voice)}
          className="inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
          style={{ color: C.muted }}
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button
          onClick={() => onDelete?.(voice)}
          className="inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
          style={{ color: C.muted }}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

// ── Music Card ──
function MusicCard({ track, onEdit, onDelete }) {
  const energyColors = {
    high: { bg: "rgba(255,90,79,0.15)", text: "#FF5A4F" },
    medium: { bg: "rgba(255,180,79,0.15)", text: "#e8c46a" },
    low: { bg: "rgba(100,180,255,0.15)", text: "#6bb4ff" },
  };
  const energy = track.metadata?.energy || "medium";
  const energyColor = energyColors[energy] || energyColors.medium;

  return (
    <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,90,79,0.1)" }}
          >
            <MusicIcon className="w-5 h-5" style={{ color: C.accent }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: C.text }}>{track.name}</h3>
            <p className="text-xs" style={{ color: C.muted }}>{track.category}</p>
          </div>
        </div>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: energyColor.bg, color: energyColor.text }}
        >
          {energy} energy
        </span>
      </div>

      {track.description && (
        <p className="text-sm mb-3" style={{ color: C.muted }}>{track.description}</p>
      )}

      {(track.metadata?.bpm || track.metadata?.duration_sec) && (
        <div className="flex items-center gap-3 mb-3 text-xs" style={{ color: C.muted }}>
          {track.metadata?.mood && <span>{track.metadata.mood}</span>}
          {track.metadata?.bpm && <span>· {track.metadata.bpm} BPM</span>}
          {track.metadata?.duration_sec && <span>· {track.metadata.duration_sec}s</span>}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3" style={{ color: C.muted }}>
        <Play className="w-3.5 h-3.5" />
        <span className="text-xs">Audio not uploaded</span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => onEdit?.(track)}
          className="inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
          style={{ color: C.muted }}
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button
          onClick={() => onDelete?.(track)}
          className="inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
          style={{ color: C.accent }}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

// ── Edit Music Modal ──
function EditMusicModal({ track, onClose }) {
  const [form, setForm] = useState({
    title: track?.name || "",
    genre: track?.category || "",
    mood: track?.metadata?.mood || "",
    energy: track?.metadata?.energy || "medium",
    bpm: track?.metadata?.bpm || "",
    duration: track?.metadata?.duration_sec || "",
    recommended_use: track?.metadata?.recommended_use || track?.description || "",
  });

  const fieldStyle = { background: "#2d2d2d", border: `1px solid #333`, color: C.text };
  const labelStyle = { color: C.muted, fontSize: "13px", fontWeight: 500 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-lg rounded-xl p-6" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: C.text }}>Edit Music Track</h2>
          <button onClick={onClose} style={{ color: C.muted }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block mb-1" style={labelStyle}>Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={fieldStyle}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1" style={labelStyle}>Genre</label>
              <input
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={fieldStyle}
              />
            </div>
            <div>
              <label className="block mb-1" style={labelStyle}>Mood</label>
              <input
                value={form.mood}
                onChange={(e) => setForm({ ...form, mood: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={fieldStyle}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block mb-1" style={labelStyle}>Energy</label>
              <select
                value={form.energy}
                onChange={(e) => setForm({ ...form, energy: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={fieldStyle}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            <div>
              <label className="block mb-1" style={labelStyle}>Tempo (BPM)</label>
              <input
                type="number"
                value={form.bpm}
                onChange={(e) => setForm({ ...form, bpm: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={fieldStyle}
              />
            </div>
            <div>
              <label className="block mb-1" style={labelStyle}>Duration (sec)</label>
              <input
                type="number"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={fieldStyle}
              />
            </div>
          </div>
          <div>
            <label className="block mb-1" style={labelStyle}>Recommended Use</label>
            <textarea
              value={form.recommended_use}
              onChange={(e) => setForm({ ...form, recommended_use: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={fieldStyle}
            />
          </div>
          <div>
            <label className="block mb-1" style={labelStyle}>Audio File</label>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ border: `1px solid ${C.border}`, color: C.text }}
              >
                Choose File
              </button>
              <span className="text-sm" style={{ color: C.muted }}>No file chosen</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={onClose} className="text-sm font-medium" style={{ color: C.muted }}>
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: C.accent }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Libraries Component ──
export default function StudioLibraries() {
  const [activeTab, setActiveTab] = useState("presenters");
  const [data, setData] = useState({ presenters: [], voices: [], music: [] });
  const [loading, setLoading] = useState(true);
  const [editingTrack, setEditingTrack] = useState(null);

  useEffect(() => {
    const loadLibraries = async () => {
      try {
        const res = await base44.functions.invoke("getStudioLibraries", {});
        const d = res?.data || res;
        setData({
          presenters: d.presenters || [],
          voices: d.voices || [],
          music: d.music || [],
        });
      } catch (e) {
        // Fallback: empty state
      } finally {
        setLoading(false);
      }
    };
    loadLibraries();
  }, []);

  const tabs = [
    { id: "presenters", label: "Presenters" },
    { id: "voices", label: "Voices" },
    { id: "music", label: "Music" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-8 py-8" style={{ ...STUDIO_FONT }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold" style={{ color: C.text }}>Libraries</h1>
        <button
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: C.accent }}
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <p className="text-sm mb-6" style={{ color: C.muted }}>
        Presenters, voices, and music available across your productions. Preview before you cast.
      </p>

      {/* Tabs */}
      <div className="flex items-center gap-6 mb-6 border-b" style={{ borderColor: C.border }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="pb-3 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === tab.id ? C.text : C.muted,
            }}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: C.accent }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: C.border, borderTopColor: C.accent }} />
        </div>
      ) : activeTab === "presenters" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.presenters.map((p) => (
            <PresenterCard key={p.id} presenter={p} />
          ))}
        </div>
      ) : activeTab === "voices" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.voices.map((v) => (
            <VoiceCard key={v.id} voice={v} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.music.map((m) => (
            <MusicCard key={m.id} track={m} onEdit={(t) => setEditingTrack(t)} />
          ))}
        </div>
      )}

      {/* Edit Music Modal */}
      {editingTrack && (
        <EditMusicModal track={editingTrack} onClose={() => setEditingTrack(null)} />
      )}
    </div>
  );
}