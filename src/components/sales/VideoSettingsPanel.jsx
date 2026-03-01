import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function VideoSettingsPanel({ isOpen, onClose, onBlurChange, isBlurred }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 rounded-xl p-6 w-80 border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-base">Video Settings</h3>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="text-gray-400 hover:text-white h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <label className="flex items-center justify-between bg-gray-800 p-4 rounded-lg cursor-pointer group">
            <span className="text-white text-sm">Blur Background</span>
            <input
              type="checkbox"
              checked={isBlurred}
              onChange={(e) => onBlurChange(e.target.checked)}
              className="w-4 h-4 accent-blue-500 cursor-pointer"
            />
          </label>

          <p className="text-xs text-gray-500 bg-gray-800 p-3 rounded-lg">
            More settings coming soon...
          </p>
        </div>

        <Button
          onClick={onClose}
          className="w-full mt-5 bg-blue-600 hover:bg-blue-700 text-white"
        >
          Done
        </Button>
      </div>
    </div>
  );
}