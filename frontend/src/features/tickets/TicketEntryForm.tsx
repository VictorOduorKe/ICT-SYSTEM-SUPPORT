import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  Save,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Monitor,
  User,
  Building,
  AlertTriangle,
  Send,
  Clock,
} from 'lucide-react';

interface Department {
  id: number;
  name: string;
  code: string;
}

interface Asset {
  id: number;
  hostname: string;
  asset_tag: string | null;
  device_type: string;
  department_id: number | null;
  assigned_person_id: number | null;
  assigned_person_name: string | null;
}

interface StaffMember {
  id: number;
  staff_id: string;
  full_name: string;
  department_id: number;
}

interface TicketEntryFormProps {
  onSubmitted: (ticketId: number) => void;
  onCancel?: () => void;
}

type AutosaveStatus = 'unsaved' | 'saving' | 'saved' | 'error' | 'conflict';

export const TicketEntryForm: React.FC<TicketEntryFormProps> = ({ onSubmitted, onCancel }) => {
  const queryClient = useQueryClient();

  // Draft state
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftVersion, setDraftVersion] = useState<number>(1);
  const [draftNumber, setDraftNumber] = useState<string>('');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('hardware');
  const [priority, setPriority] = useState<string>('normal');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [assetId, setAssetId] = useState<string>('');
  const [affectedPersonId, setAffectedPersonId] = useState<string>('');

  // Duplicate incidents warning state
  const [duplicateWarning, setDuplicateWarning] = useState<any[]>([]);

  // Timer ref for debounce
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirtyRef = useRef<boolean>(false);

  // Fetch reference data (departments, assets, directory)
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await fetch('/api/v1/departments');
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : (json.data?.items || []);
    },
  });

  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ['assets-quick-list'],
    queryFn: async () => {
      const res = await fetch('/api/v1/assets?limit=100&is_archived=false');
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : (json.data?.items || []);
    },
  });

  const { data: staffMembers = [] } = useQuery<StaffMember[]>({
    queryKey: ['directory-quick-list'],
    queryFn: async () => {
      const res = await fetch('/api/v1/directory/people?limit=100&is_archived=false');
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : (json.data?.items || []);
    },
  });

  // 1. Initialize or recover draft
  const initDraft = useCallback(async () => {
    setIsInitializing(true);
    setErrorMessage(null);
    try {
      // Check for active draft
      const activeRes = await fetch('/api/v1/tickets/drafts/active');
      const activeJson = await activeRes.json();

      if (activeJson.success && activeJson.data) {
        const draft = activeJson.data;
        setDraftId(draft.id);
        setDraftVersion(draft.draft_version);
        setDraftNumber(draft.ticket_number);
        setTitle(draft.title === '(Untitled Draft)' ? '' : draft.title || '');
        setDescription(draft.description || '');
        setCategory(draft.category || 'hardware');
        setPriority(draft.priority || 'normal');
        setDepartmentId(draft.department_id ? String(draft.department_id) : '');
        setAssetId(draft.asset_id ? String(draft.asset_id) : '');
        setAffectedPersonId(draft.affected_person_id ? String(draft.affected_person_id) : '');
        setAutosaveStatus('saved');
        setLastSavedTime(new Date(draft.updated_at || Date.now()).toLocaleTimeString());
      } else {
        // Create new draft
        const createRes = await fetch('/api/v1/tickets/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const createJson = await createRes.json();
        if (createJson.success) {
          const draft = createJson.data;
          setDraftId(draft.id);
          setDraftVersion(draft.draft_version);
          setDraftNumber(draft.ticket_number);
          setAutosaveStatus('saved');
          setLastSavedTime(new Date().toLocaleTimeString());
        }
      }
    } catch (err: any) {
      setErrorMessage('Failed to initialize issue draft session. Check network connection.');
      setAutosaveStatus('error');
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    initDraft();
  }, [initDraft]);

  // 2. Autosave logic with optimistic concurrency
  const performAutosave = useCallback(
    async (overrideFields?: any) => {
      if (!draftId) return;

      setAutosaveStatus('saving');
      setErrorMessage(null);

      const payload = {
        client_version: draftVersion,
        title: overrideFields?.title !== undefined ? overrideFields.title : (title || '(Untitled Draft)'),
        description: overrideFields?.description !== undefined ? overrideFields.description : description,
        category: overrideFields?.category !== undefined ? overrideFields.category : category,
        priority: overrideFields?.priority !== undefined ? overrideFields.priority : priority,
        department_id:
          overrideFields?.departmentId !== undefined
            ? (overrideFields.departmentId ? Number(overrideFields.departmentId) : null)
            : (departmentId ? Number(departmentId) : null),
        asset_id:
          overrideFields?.assetId !== undefined
            ? (overrideFields.assetId ? Number(overrideFields.assetId) : null)
            : (assetId ? Number(assetId) : null),
        affected_person_id:
          overrideFields?.affectedPersonId !== undefined
            ? (overrideFields.affectedPersonId ? Number(overrideFields.affectedPersonId) : null)
            : (affectedPersonId ? Number(affectedPersonId) : null),
      };

      try {
        const res = await fetch(`/api/v1/tickets/${draftId}/draft`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await res.json();

        if (res.status === 409) {
          // Concurrency conflict
          setAutosaveStatus('conflict');
          setErrorMessage('Autosave conflict: Draft was edited in another session. Please reload to see changes.');
          return;
        }

        if (json.success) {
          setDraftVersion(json.data.draft_version);
          setAutosaveStatus('saved');
          setLastSavedTime(new Date(json.data.saved_at).toLocaleTimeString());
          isDirtyRef.current = false;
        } else {
          setAutosaveStatus('error');
          setErrorMessage(json.error?.message || 'Autosave failed');
        }
      } catch (err: any) {
        setAutosaveStatus('error');
        setErrorMessage('Network error during autosave. Unsaved changes are preserved.');
      }
    },
    [draftId, draftVersion, title, description, category, priority, departmentId, assetId, affectedPersonId]
  );

  // Trigger debounced autosave when form fields change
  const triggerDebouncedAutosave = (overrideFields?: any) => {
    isDirtyRef.current = true;
    setAutosaveStatus('unsaved');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      performAutosave(overrideFields);
    }, 600);
  };

  // 3. Asset auto-suggestion behavior
  const handleAssetChange = (selectedAssetId: string) => {
    setAssetId(selectedAssetId);
    let newDept = departmentId;
    let newPerson = affectedPersonId;

    if (selectedAssetId) {
      const assetList = Array.isArray(assets) ? assets : [];
      const match = assetList.find((a) => a.id === Number(selectedAssetId));
      if (match) {
        if (match.department_id) {
          newDept = String(match.department_id);
          setDepartmentId(newDept);
        }
        if (match.assigned_person_id) {
          newPerson = String(match.assigned_person_id);
          setAffectedPersonId(newPerson);
        }
      }
    }

    triggerDebouncedAutosave({ assetId: selectedAssetId, departmentId: newDept, affectedPersonId: newPerson });
  };

  // 4. Duplicate Check
  useEffect(() => {
    if (!assetId && !affectedPersonId) {
      setDuplicateWarning([]);
      return;
    }

    const checkDuplicates = async () => {
      try {
        const query = new URLSearchParams();
        if (assetId) query.set('asset_id', assetId);
        if (affectedPersonId) query.set('affected_person_id', affectedPersonId);
        if (category) query.set('category', category);

        const res = await fetch(`/api/v1/tickets/check-duplicates?${query.toString()}`);
        const json = await res.json();
        if (json.success && json.data.duplicateFound) {
          setDuplicateWarning(json.data.duplicateTickets);
        } else {
          setDuplicateWarning([]);
        }
      } catch (err) {
        // non-blocking
      }
    };

    const timer = setTimeout(checkDuplicates, 400);
    return () => clearTimeout(timer);
  }, [assetId, affectedPersonId, category]);

  // 5. Submit Ticket
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!title.trim() || title.trim().length < 3) {
      errors.title = 'Title must be at least 3 characters.';
    }
    if (!description.trim() || description.trim().length < 5) {
      errors.description = 'Description must be at least 5 characters.';
    }
    if (!departmentId) {
      errors.departmentId = 'Department is required for support reporting.';
    }

    if (Object.keys(errors).length > 0) {
      setSubmitErrors(errors);
      return;
    }

    setSubmitErrors({});
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        department_id: Number(departmentId),
        asset_id: assetId ? Number(assetId) : null,
        affected_person_id: affectedPersonId ? Number(affectedPersonId) : null,
      };

      const res = await fetch(`/api/v1/tickets/${draftId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (json.success) {
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
        onSubmitted(json.data.id);
      } else {
        setErrorMessage(json.error?.message || 'Failed to submit support issue.');
      }
    } catch (err: any) {
      setErrorMessage('Network error during submission. Your draft is still saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInitializing) {
    return (
      <Card className="p-8 text-center bg-surface border-surface-border">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-primary mb-3" />
        <p className="text-content-secondary">Preparing issue form and autosave engine...</p>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header with Autosave Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <h2 className="text-2xl font-bold text-content-primary">New ICT Support Issue</h2>
          <p className="text-sm text-content-secondary">
            Daily incident registration with continuous autosave and duplicate checking
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Indicator Pill */}
          {autosaveStatus === 'saving' && (
            <Badge variant="info" className="flex items-center gap-1.5 py-1 px-3">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Saving draft…</span>
            </Badge>
          )}

          {autosaveStatus === 'saved' && (
            <Badge variant="success" className="flex items-center gap-1.5 py-1 px-3">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Saved {lastSavedTime ? `at ${lastSavedTime}` : ''}</span>
            </Badge>
          )}

          {autosaveStatus === 'unsaved' && (
            <Badge variant="neutral" className="flex items-center gap-1.5 py-1 px-3">
              <Clock className="w-3.5 h-3.5" />
              <span>Unsaved changes</span>
            </Badge>
          )}

          {autosaveStatus === 'error' && (
            <Badge variant="error" className="flex items-center gap-1.5 py-1 px-3">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Save failed</span>
            </Badge>
          )}

          {autosaveStatus === 'conflict' && (
            <Badge variant="warning" className="flex items-center gap-1.5 py-1 px-3">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Session conflict</span>
            </Badge>
          )}

          {draftNumber && (
            <span className="text-xs font-mono px-2.5 py-1 bg-surface-muted text-content-secondary rounded border border-surface-border">
              {draftNumber} (v{draftVersion})
            </span>
          )}
        </div>
      </div>

      {/* Error or Conflict Alerts */}
      {errorMessage && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 border ${
            autosaveStatus === 'conflict'
              ? 'bg-status-warning-bg border-status-warning text-status-warning-text'
              : 'bg-status-error-bg border-status-error text-status-error-text'
          }`}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">{errorMessage}</p>
            {autosaveStatus === 'conflict' && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => initDraft()}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reload Latest Draft
              </Button>
            )}
            {autosaveStatus === 'error' && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => performAutosave()}
              >
                <Save className="w-3.5 h-3.5 mr-1" /> Retry Autosave
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Duplicate Incidents Warning Banner */}
      {duplicateWarning.length > 0 && (
        <div className="p-4 rounded-lg bg-status-warning-bg border border-status-warning text-status-warning-text flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-bold">Duplicate Incident Notice</p>
            <p>
              There {duplicateWarning.length === 1 ? 'is' : 'are'} currently {duplicateWarning.length} open issue(s)
              for this computer or person in category &lsquo;{category}&rsquo;:
            </p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5 font-mono text-xs">
              {duplicateWarning.map((t) => (
                <li key={t.id}>
                  <span className="font-bold">{t.ticket_number}</span>: {t.title} ({t.status.toUpperCase()})
                </li>
              ))}
            </ul>
            <p className="text-xs pt-1 opacity-90">
              You may proceed if this report represents a distinct incident or recurring failure.
            </p>
          </div>
        </div>
      )}

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6 space-y-6 bg-surface border-surface-border">
          <h3 className="text-lg font-semibold text-content-primary pb-2 border-b border-surface-border">
            1. Incident Overview
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Title */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-content-primary mb-1">
                Issue Title <span className="text-status-error">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  triggerDebouncedAutosave({ title: e.target.value });
                }}
                placeholder="e.g. Finance LAN Switch Port Failure / Printer Jam"
                className={`w-full px-3 py-2 border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary ${
                  submitErrors.title ? 'border-status-error' : 'border-surface-border'
                }`}
              />
              {submitErrors.title && (
                <p className="text-xs text-status-error mt-1">{submitErrors.title}</p>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Category <span className="text-status-error">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  triggerDebouncedAutosave({ category: e.target.value });
                }}
                className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="hardware">Computer / Hardware</option>
                <option value="network">Network / Internet</option>
                <option value="printer">Printer / Scanner</option>
                <option value="software">Software / Application</option>
                <option value="access">Account / Access</option>
                <option value="security">Security / Antivirus</option>
                <option value="maintenance">Maintenance</option>
                <option value="other">Other Support</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Priority <span className="text-status-error">*</span>
              </label>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  triggerDebouncedAutosave({ priority: e.target.value });
                }}
                className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="low">Low (Routine non-urgent)</option>
                <option value="normal">Normal (Standard day-to-day)</option>
                <option value="high">High (Department workflow impacted)</option>
                <option value="critical">Critical (Organization-wide / Severe outage)</option>
              </select>
            </div>

            {/* Detailed Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-content-primary mb-1">
                Detailed Description <span className="text-status-error">*</span>
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  triggerDebouncedAutosave({ description: e.target.value });
                }}
                placeholder="Describe the symptoms, error codes, and circumstances observed by the user or officer..."
                className={`w-full px-3 py-2 border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary ${
                  submitErrors.description ? 'border-status-error' : 'border-surface-border'
                }`}
              />
              {submitErrors.description && (
                <p className="text-xs text-status-error mt-1">{submitErrors.description}</p>
              )}
            </div>
          </div>
        </Card>

        {/* Association & Location */}
        <Card className="p-6 space-y-6 bg-surface border-surface-border">
          <div className="flex items-center justify-between pb-2 border-b border-surface-border">
            <h3 className="text-lg font-semibold text-content-primary">
              2. Affected Equipment & Personnel
            </h3>
            <span className="text-xs text-content-secondary">
              Selecting a computer auto-populates its assigned user and department
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Computer / Asset Selection */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1 flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-brand-primary" />
                <span>Computer / Asset</span>
              </label>
              <select
                value={assetId}
                onChange={(e) => handleAssetChange(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="">-- Not Applicable / Non-Device --</option>
                {(Array.isArray(assets) ? assets : []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.hostname} {a.asset_tag ? `(${a.asset_tag})` : ''} - {a.device_type}
                  </option>
                ))}
              </select>
            </div>

            {/* Affected Person */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1 flex items-center gap-1.5">
                <User className="w-4 h-4 text-brand-primary" />
                <span>Person Affected</span>
              </label>
              <select
                value={affectedPersonId}
                onChange={(e) => {
                  setAffectedPersonId(e.target.value);
                  triggerDebouncedAutosave({ affectedPersonId: e.target.value });
                }}
                className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="">-- Select Person (or Unspecified) --</option>
                {(Array.isArray(staffMembers) ? staffMembers : []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.staff_id})
                  </option>
                ))}
              </select>
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-brand-primary" />
                <span>Department <span className="text-status-error">*</span></span>
              </label>
              <select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  triggerDebouncedAutosave({ departmentId: e.target.value });
                }}
                className={`w-full px-3 py-2 border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary ${
                  submitErrors.departmentId ? 'border-status-error' : 'border-surface-border'
                }`}
              >
                <option value="">-- Select Department --</option>
                {(Array.isArray(departments) ? departments : []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
              {submitErrors.departmentId && (
                <p className="text-xs text-status-error mt-1">{submitErrors.departmentId}</p>
              )}
            </div>
          </div>
        </Card>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => performAutosave()}
              disabled={autosaveStatus === 'saving'}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Draft Now
            </Button>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || autosaveStatus === 'conflict'}
            className="px-6"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Submitting Issue…
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" /> Submit Support Issue
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
