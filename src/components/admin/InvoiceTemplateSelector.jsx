import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { Upload, Check, AlertCircle } from "lucide-react";

export default function InvoiceTemplateSelector({ onTemplateSelected }) {
  const [templateId, setTemplateId] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    // Load existing template ID from database
    base44.entities.AdminSettings.list().then(settings => {
      if (settings.length > 0 && settings[0].invoice_template_id) {
        setTemplateId(settings[0].invoice_template_id);
      }
      setStatus('idle');
    }).catch(err => {
      console.error('Error loading settings:', err);
      setStatus('idle');
    });
  }, []);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // This will trigger Google Drive's file picker through the browser's file input
    // However, we need to use Google Drive's official picker for better UX
    
    // For now, ask user to paste the file ID directly
    const fileId = prompt('Please paste the Google Doc template file ID from the URL:\n\nExample: 1Rdy5wlkeugEjNf2akpgZxwbmcDY8HzsAU95U_VIHFzk');
    
    if (fileId) {
      try {
        setStatus('saving');
        setError('');
        
        // Save to database
        const existingSettings = await base44.asServiceRole.entities.AdminSettings.list();
        if (existingSettings.length > 0) {
          await base44.asServiceRole.entities.AdminSettings.update(existingSettings[0].id, {
            invoice_template_id: fileId
          });
        } else {
          await base44.asServiceRole.entities.AdminSettings.create({
            invoice_template_id: fileId
          });
        }
        
        setTemplateId(fileId);
        
        setStatus('success');
        onTemplateSelected?.(fileId);
        
        setTimeout(() => setStatus('idle'), 3000);
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
          Invoice Template File ID
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Paste your Google Doc template ID here"
            className="flex-1 px-3 py-2 border border-[#B8956A]/30 rounded-lg text-sm"
            readOnly
          />
          <Button
            onClick={handleFileSelect}
            className="bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            <Upload className="w-4 h-4 mr-2" />
            Select
          </Button>
        </div>
      </div>

      {status === 'success' && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-700">Template saved successfully</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {templateId && (
        <p className="text-xs text-[#1A1A1A]/60">
          Current template: <code className="bg-[#1A1A1A]/5 px-2 py-1 rounded">{templateId.substring(0, 20)}...</code>
        </p>
      )}
    </div>
  );
}