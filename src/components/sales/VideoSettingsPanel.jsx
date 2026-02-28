import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function VideoSettingsPanel({ isOpen, onClose, onBlurChange, isBlurred }) {
  return (
    isOpen && (
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-lg p-6 w-80 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Settings</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="text-gray-400 hover:text-white h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-800 p-4 rounded-lg">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBlurred}
                  onChange={(e) => onBlurChange(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-white text-sm">Blur Background</span>
              </label>
            </div>

            <div className="text-xs text-gray-400 bg-gray-800 p-3 rounded">
              More settings coming soon...
            </div>
          </div>

          <Button
            onClick={onClose}
            className="w-full mt-6 bg-gray-700 hover:bg-gray-600"
          >
            Done
          </Button>
        </div>
      </div>
    )
  );
}