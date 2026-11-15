import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { empComm } from '@/lib/empCommClient';

const emptyTemplate = { name: '', category: '', subject: '', body_html: '', scope: 'personal' };

/**
 * Company and personal templates. Company templates are administrator-managed;
 * a personal template is visible and editable only by its owner.
 */
export default function EmailTemplateManager({ memberId, templates, canManageCompany, onChanged }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    setError('');
    try {
      await empComm.saveTemplate({ memberId, template: draft });
      setDraft(null);
      onChanged?.();
    } catch (err) {
      setError(err.message || 'The template could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const remove = async (template) => {
    if (!window.confirm(`Delete the template “${template.name}”?`)) return;
    setBusy(template.id);
    setError('');
    try {
      await empComm.deleteTemplate({ memberId, id: template.id });
      onChanged?.();
    } catch (err) {
      setError(err.message || 'The template could not be deleted.');
    } finally {
      setBusy('');
    }
  };

  const duplicate = async (template) => {
    setDraft({
      name: `${template.name} (copy)`,
      category: template.category,
      subject: template.subject,
      body_html: template.body_html,
      scope: 'personal',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
          {templates.length} template{templates.length === 1 ? '' : 's'} available to you
        </p>
        <Button
          size="sm"
          onClick={() => setDraft({ ...emptyTemplate, scope: canManageCompany ? 'company' : 'personal' })}
          className="gap-1.5"
          style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
        >
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>

      {draft && (
        <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'rgba(184,149,106,0.3)' }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Follow-up" className="mt-1 h-9 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Subject</Label>
            <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Body</Label>
            <Textarea value={draft.body_html} onChange={(e) => setDraft({ ...draft, body_html: e.target.value })} rows={6} className="mt-1 text-sm" />
          </div>
          {canManageCompany && (
            <label className="flex items-center gap-2 text-xs" style={{ color: '#1A1A1A' }}>
              <input
                type="checkbox"
                checked={draft.scope === 'company'}
                onChange={(e) => setDraft({ ...draft, scope: e.target.checked ? 'company' : 'personal' })}
              />
              Company-wide template (visible to every Media Partner)
            </label>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy === 'save'} style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save template'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {templates.map((template) => (
          <div key={template.id} className="rounded-lg border p-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: '#1A1A1A' }}>{template.name}</p>
                <p className="truncate text-xs" style={{ color: 'rgba(26,26,26,0.55)' }}>{template.subject}</p>
                <div className="mt-1 flex gap-1.5">
                  <Badge variant="outline" className="text-[10px] capitalize">{template.scope}</Badge>
                  {template.category && <Badge variant="outline" className="text-[10px]">{template.category}</Badge>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" onClick={() => duplicate(template)} title="Duplicate">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDraft({ ...template })}
                  title="Edit"
                  disabled={template.scope === 'company' && !canManageCompany}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(template)}
                  title="Delete"
                  disabled={busy === template.id || (template.scope === 'company' && !canManageCompany)}
                  className="text-red-600"
                >
                  {busy === template.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        ))}
        {!templates.length && (
          <p className="py-6 text-center text-sm" style={{ color: 'rgba(26,26,26,0.45)' }}>
            No templates yet. Create one, or ask an administrator for company templates.
          </p>
        )}
      </div>
    </div>
  );
}