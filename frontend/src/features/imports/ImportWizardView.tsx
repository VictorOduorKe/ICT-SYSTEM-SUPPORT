import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  FileText,
  History,
  Monitor,
  UserCheck,
  LifeBuoy,
} from 'lucide-react';

type ImportEntityType = 'inventory' | 'directory' | 'issues';
type DuplicatePolicy = 'skip' | 'update';

interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string>;
  data: Record<string, any>;
  status: 'valid' | 'duplicate' | 'invalid';
  errors: string[];
  duplicateMatch?: {
    id: number;
    key: string;
    value: string;
  };
}

interface ImportPreviewData {
  jobId: number;
  fileName: string;
  entityType: ImportEntityType;
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  headers: string[];
  previewRows: ParsedRow[];
  duplicatePolicy: DuplicatePolicy;
}

interface ImportCommitData {
  jobId: number;
  status: 'committed';
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  completedAt: string;
}

interface ImportHistoryJob {
  id: number;
  file_name: string;
  entity_type: ImportEntityType;
  status: 'previewing' | 'committed' | 'failed';
  total_rows: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  duplicate_policy: DuplicatePolicy;
  created_at: string;
  completed_at: string | null;
  imported_by_name: string | null;
  imported_by_username: string | null;
}

interface ImportWizardViewProps {
  onNavigateToEntity?: (tab: 'inventory' | 'directory' | 'tickets') => void;
}

export const ImportWizardView: React.FC<ImportWizardViewProps> = ({ onNavigateToEntity }) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Top Tabs: Wizard vs Audit History
  const [activeView, setActiveView] = useState<'wizard' | 'history'>('wizard');

  // Wizard state: 1: Select & Download, 2: Upload, 3: Preview & Policy, 4: Complete
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedEntity, setSelectedEntity] = useState<ImportEntityType>('inventory');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Preview & Policy state
  const [previewData, setPreviewData] = useState<ImportPreviewData | null>(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>('skip');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'duplicate' | 'invalid'>('all');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Commit Outcome
  const [commitResult, setCommitResult] = useState<ImportCommitData | null>(null);

  // 1. History Query
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery<{
    data: ImportHistoryJob[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }>({
    queryKey: ['import-jobs'],
    queryFn: async () => {
      const res = await fetch('/api/v1/imports/jobs?page=1&limit=25');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch import history');
      return json;
    },
    enabled: activeView === 'history',
  });

  // 2. Upload & Preview Mutation
  const previewMutation = useMutation({
    mutationFn: async ({ file, entityType }: { file: File; entityType: ImportEntityType }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', entityType);

      const res = await fetch('/api/v1/imports/preview', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to parse and validate file');
      return json.data as ImportPreviewData;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setDuplicatePolicy(data.duplicatePolicy || 'skip');
      setWizardStep(3);
      setUploadError(null);
    },
    onError: (err: any) => {
      setUploadError(err.message || 'File processing failed');
    },
  });

  // 3. Commit Mutation
  const commitMutation = useMutation({
    mutationFn: async ({ jobId, policy }: { jobId: number; policy: DuplicatePolicy }) => {
      const res = await fetch('/api/v1/imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          duplicate_policy: policy,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to commit import job');
      return json.data as ImportCommitData;
    },
    onSuccess: (data) => {
      setCommitResult(data);
      setConfirmModalOpen(false);
      setWizardStep(4);
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['directory-people'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  const handleDownloadTemplate = (format: 'csv' | 'xlsx') => {
    window.location.href = `/api/v1/imports/templates/${selectedEntity}?format=${format}`;
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls', 'tsv'].includes(ext || '')) {
      setUploadError('Unsupported file type. Please upload a .csv or .xlsx spreadsheet.');
      setSelectedFile(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size exceeds the 10MB limit.');
      setSelectedFile(null);
      return;
    }
    setUploadError(null);
    setSelectedFile(file);
  };

  const handleExecuteUpload = () => {
    if (!selectedFile) {
      setUploadError('Please select a file to upload.');
      return;
    }
    previewMutation.mutate({ file: selectedFile, entityType: selectedEntity });
  };

  const handleResetWizard = () => {
    setWizardStep(1);
    setSelectedFile(null);
    setPreviewData(null);
    setCommitResult(null);
    setUploadError(null);
    setConfirmModalOpen(false);
  };

  // Filter preview rows
  const filteredPreviewRows = (previewData?.previewRows || []).filter((row) => {
    if (previewFilter === 'all') return true;
    return row.status === previewFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-content-primary">Data Import Wizard</h2>
          <p className="text-sm text-content-secondary">
            Secure, transactional spreadsheet ingestion for inventory, directory, and historical issue logs
          </p>
        </div>

        {/* View Switcher: Wizard vs Past Jobs */}
        <div className="flex items-center gap-2">
          <Button
            variant={activeView === 'wizard' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveView('wizard')}
          >
            <Upload className="w-4 h-4 mr-1.5" /> Import Wizard
          </Button>

          <Button
            variant={activeView === 'history' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveView('history');
              refetchHistory();
            }}
          >
            <History className="w-4 h-4 mr-1.5" /> Audit History
          </Button>
        </div>
      </div>

      {activeView === 'history' ? (
        /* ================= Past Import Jobs History ================= */
        <Card className="p-6 bg-surface border-surface-border space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-surface-border">
            <div>
              <h3 className="text-lg font-bold text-content-primary">Historical Import Jobs</h3>
              <p className="text-xs text-content-secondary">
                Audit trail of all batch imports committed by authorized officers and administrators
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchHistory()} disabled={historyLoading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${historyLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          {historyLoading ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-primary mb-3" />
              <p className="text-sm text-content-secondary">Loading import audit logs...</p>
            </div>
          ) : !historyData || historyData.data.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-content-secondary opacity-60" />
              <p className="text-base font-semibold text-content-primary">No import jobs recorded yet</p>
              <p className="text-xs text-content-secondary max-w-sm mx-auto">
                Completed batch imports with file details, row counts, and duplicate policies will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-surface-border rounded-md">
              <table className="w-full text-left text-xs text-content-primary">
                <thead className="bg-surface-muted border-b border-surface-border text-content-secondary uppercase">
                  <tr>
                    <th className="p-3">Job #</th>
                    <th className="p-3">File Name</th>
                    <th className="p-3">Target Entity</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Updated</th>
                    <th className="p-3">Skipped</th>
                    <th className="p-3">Failed</th>
                    <th className="p-3">Policy</th>
                    <th className="p-3">Imported By</th>
                    <th className="p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {historyData.data.map((job) => (
                    <tr key={job.id} className="hover:bg-surface-muted/50">
                      <td className="p-3 font-mono font-bold text-brand-primary">#{job.id}</td>
                      <td className="p-3 font-medium">{job.file_name}</td>
                      <td className="p-3 capitalize font-semibold">
                        <span className="px-2 py-0.5 rounded bg-surface border border-surface-border">
                          {job.entity_type}
                        </span>
                      </td>
                      <td className="p-3">
                        {job.status === 'committed' ? (
                          <Badge variant="success">Committed</Badge>
                        ) : job.status === 'failed' ? (
                          <Badge variant="error">Failed</Badge>
                        ) : (
                          <Badge variant="warning">Previewing</Badge>
                        )}
                      </td>
                      <td className="p-3 font-mono font-bold text-status-success">{job.created_count}</td>
                      <td className="p-3 font-mono font-bold text-brand-primary">{job.updated_count}</td>
                      <td className="p-3 font-mono font-bold text-status-warning">{job.skipped_count}</td>
                      <td className="p-3 font-mono font-bold text-status-error">{job.failed_count}</td>
                      <td className="p-3 uppercase text-[10px] font-semibold">{job.duplicate_policy}</td>
                      <td className="p-3 text-content-secondary">
                        {job.imported_by_name || job.imported_by_username || 'System User'}
                      </td>
                      <td className="p-3 text-content-secondary whitespace-nowrap">
                        {new Date(job.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        /* ================= Step-by-Step Import Wizard ================= */
        <div className="space-y-6">
          {/* Progress Step Indicator */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
            <div
              className={`p-2.5 rounded border transition-colors ${
                wizardStep === 1
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : wizardStep > 1
                  ? 'bg-surface-muted text-content-primary border-surface-border'
                  : 'bg-surface text-content-secondary border-surface-border'
              }`}
            >
              1. Entity & Template
            </div>
            <div
              className={`p-2.5 rounded border transition-colors ${
                wizardStep === 2
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : wizardStep > 2
                  ? 'bg-surface-muted text-content-primary border-surface-border'
                  : 'bg-surface text-content-secondary border-surface-border'
              }`}
            >
              2. Upload & Parse
            </div>
            <div
              className={`p-2.5 rounded border transition-colors ${
                wizardStep === 3
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : wizardStep > 3
                  ? 'bg-surface-muted text-content-primary border-surface-border'
                  : 'bg-surface text-content-secondary border-surface-border'
              }`}
            >
              3. Preview & Validation
            </div>
            <div
              className={`p-2.5 rounded border transition-colors ${
                wizardStep === 4
                  ? 'bg-status-success text-white border-status-success'
                  : 'bg-surface text-content-secondary border-surface-border'
              }`}
            >
              4. Commit Outcome
            </div>
          </div>

          {/* Step 1: Entity Selection & Template Download */}
          {wizardStep === 1 && (
            <Card className="p-6 bg-surface border-surface-border space-y-6">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Select Target Dataset & Template</h3>
                <p className="text-xs text-content-secondary">
                  Choose the destination database catalog and download pre-formatted CSV or Excel templates
                </p>
              </div>

              {/* Entity Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedEntity('inventory')}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    selectedEntity === 'inventory'
                      ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary'
                      : 'border-surface-border bg-surface-muted hover:border-brand-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Monitor className="w-5 h-5 text-brand-primary" />
                    {selectedEntity === 'inventory' && <Badge variant="brand">Selected</Badge>}
                  </div>
                  <h4 className="font-bold text-sm text-content-primary">Computer Inventory</h4>
                  <p className="text-xs text-content-secondary mt-1">
                    Hostnames, asset tags, hardware types, IP configurations, and physical department allocations.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedEntity('directory')}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    selectedEntity === 'directory'
                      ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary'
                      : 'border-surface-border bg-surface-muted hover:border-brand-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <UserCheck className="w-5 h-5 text-brand-primary" />
                    {selectedEntity === 'directory' && <Badge variant="brand">Selected</Badge>}
                  </div>
                  <h4 className="font-bold text-sm text-content-primary">Staff Directory</h4>
                  <p className="text-xs text-content-secondary mt-1">
                    Employee staff IDs, full names, departmental assignments, and official contact phone/email.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedEntity('issues')}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    selectedEntity === 'issues'
                      ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary'
                      : 'border-surface-border bg-surface-muted hover:border-brand-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <LifeBuoy className="w-5 h-5 text-brand-primary" />
                    {selectedEntity === 'issues' && <Badge variant="brand">Selected</Badge>}
                  </div>
                  <h4 className="font-bold text-sm text-content-primary">Historical Issues</h4>
                  <p className="text-xs text-content-secondary mt-1">
                    Incident titles, work descriptions, categories, priority, department, and resolution summaries.
                  </p>
                </button>
              </div>

              {/* Template Download Strip */}
              <div className="p-4 rounded-lg bg-surface-muted border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-content-primary flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-brand-primary" />
                    Download Formatted Template
                  </h4>
                  <p className="text-xs text-content-secondary mt-0.5">
                    Includes required column names, validation constraints, and sample data entries.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate('csv')}>
                    <Download className="w-4 h-4 mr-1.5" /> CSV Template
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate('xlsx')}>
                    <Download className="w-4 h-4 mr-1.5" /> Excel (.xlsx) Template
                  </Button>
                </div>
              </div>

              {/* Next Step Button */}
              <div className="flex justify-end pt-2">
                <Button variant="primary" onClick={() => setWizardStep(2)}>
                  Proceed to Upload <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </Card>
          )}

          {/* Step 2: File Upload & Parse */}
          {wizardStep === 2 && (
            <Card className="p-6 bg-surface border-surface-border space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                <div>
                  <h3 className="text-lg font-bold text-content-primary">
                    Upload Spreadsheet for {selectedEntity.toUpperCase()}
                  </h3>
                  <p className="text-xs text-content-secondary">
                    Supports .csv, .xlsx, .xls, and .tsv formats (maximum size: 10MB)
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setWizardStep(1)}>
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Change Dataset
                </Button>
              </div>

              {uploadError && (
                <div className="p-3 rounded bg-status-error-bg border border-status-error text-status-error-text text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-brand-primary bg-brand-primary/5'
                    : selectedFile
                    ? 'border-status-success bg-status-success-bg'
                    : 'border-surface-border bg-surface-muted hover:border-brand-primary/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.tsv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelected(e.target.files[0]);
                    }
                  }}
                />

                {selectedFile ? (
                  <div className="space-y-2">
                    <CheckCircle className="w-10 h-10 mx-auto text-status-success" />
                    <p className="font-bold text-content-primary text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-content-secondary">
                      {(selectedFile.size / 1024).toFixed(1)} KB &bull; Click or drag to replace file
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-10 h-10 mx-auto text-brand-primary opacity-80" />
                    <p className="font-semibold text-content-primary text-sm">
                      Drag and drop your spreadsheet here, or click to browse
                    </p>
                    <p className="text-xs text-content-secondary">
                      Formula injection defense and strict schema validation applied on upload
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setWizardStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
                </Button>

                <Button
                  variant="primary"
                  onClick={handleExecuteUpload}
                  disabled={!selectedFile || previewMutation.isPending}
                >
                  {previewMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Validating Spreadsheet…
                    </>
                  ) : (
                    <>
                      Parse & Validate Rows <ArrowRight className="w-4 h-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* Step 3: Interactive Preview & Policy Selection */}
          {wizardStep === 3 && previewData && (
            <div className="space-y-6">
              {/* Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card className="p-4 bg-surface border-surface-border">
                  <div className="flex items-center justify-between text-content-secondary mb-1">
                    <span className="text-xs uppercase font-bold tracking-wider">Total Rows</span>
                    <FileText className="w-4 h-4 text-brand-primary" />
                  </div>
                  <div className="text-2xl font-extrabold text-content-primary">{previewData.totalRows}</div>
                  <p className="text-[11px] text-content-secondary mt-0.5">{previewData.fileName}</p>
                </Card>

                <Card className="p-4 bg-surface border-surface-border">
                  <div className="flex items-center justify-between text-content-secondary mb-1">
                    <span className="text-xs uppercase font-bold tracking-wider">Valid New</span>
                    <CheckCircle className="w-4 h-4 text-status-success" />
                  </div>
                  <div className="text-2xl font-extrabold text-status-success">{previewData.validCount}</div>
                  <p className="text-[11px] text-content-secondary mt-0.5">Ready for direct insert</p>
                </Card>

                <Card className="p-4 bg-surface border-surface-border">
                  <div className="flex items-center justify-between text-content-secondary mb-1">
                    <span className="text-xs uppercase font-bold tracking-wider">Duplicates</span>
                    <AlertTriangle className="w-4 h-4 text-status-warning" />
                  </div>
                  <div className="text-2xl font-extrabold text-status-warning">{previewData.duplicateCount}</div>
                  <p className="text-[11px] text-content-secondary mt-0.5">Matches existing records</p>
                </Card>

                <Card className="p-4 bg-surface border-surface-border">
                  <div className="flex items-center justify-between text-content-secondary mb-1">
                    <span className="text-xs uppercase font-bold tracking-wider">Errors</span>
                    <AlertCircle className="w-4 h-4 text-status-error" />
                  </div>
                  <div className="text-2xl font-extrabold text-status-error">{previewData.errorCount}</div>
                  <p className="text-[11px] text-content-secondary mt-0.5">Will be excluded from commit</p>
                </Card>
              </div>

              {/* Duplicate Resolution Policy Selector */}
              <Card className="p-6 bg-surface border-surface-border space-y-4">
                <div>
                  <h3 className="text-base font-bold text-content-primary">Duplicate Record Policy</h3>
                  <p className="text-xs text-content-secondary">
                    Define how the database handles incoming rows that match existing hostnames, tags, or staff IDs
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label
                    className={`p-4 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                      duplicatePolicy === 'skip'
                        ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary'
                        : 'border-surface-border bg-surface-muted hover:border-brand-primary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="duplicate_policy"
                      value="skip"
                      checked={duplicatePolicy === 'skip'}
                      onChange={() => setDuplicatePolicy('skip')}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-bold text-sm text-content-primary block">
                        Skip Duplicates (Recommended)
                      </span>
                      <span className="text-xs text-content-secondary block mt-0.5">
                        Existing records in the database remain unchanged. Duplicate rows are skipped and counted.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`p-4 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                      duplicatePolicy === 'update'
                        ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary'
                        : 'border-surface-border bg-surface-muted hover:border-brand-primary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="duplicate_policy"
                      value="update"
                      checked={duplicatePolicy === 'update'}
                      onChange={() => setDuplicatePolicy('update')}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-bold text-sm text-content-primary block">
                        Update Existing Records
                      </span>
                      <span className="text-xs text-content-secondary block mt-0.5">
                        Overwrites non-primary fields of matching existing records with the latest values from this spreadsheet.
                      </span>
                    </div>
                  </label>
                </div>
              </Card>

              {/* Parsed Rows Preview Table */}
              <Card className="p-6 bg-surface border-surface-border space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-border">
                  <div>
                    <h3 className="text-base font-bold text-content-primary">Parsed Rows Preview</h3>
                    <p className="text-xs text-content-secondary">
                      Showing preview of validated rows (inspection of first {previewData.previewRows.length} rows)
                    </p>
                  </div>

                  {/* Filter Badges */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('all')}
                      className={`px-2.5 py-1 rounded font-medium ${
                        previewFilter === 'all'
                          ? 'bg-brand-primary text-white'
                          : 'bg-surface-muted text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      All ({previewData.previewRows.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('valid')}
                      className={`px-2.5 py-1 rounded font-medium ${
                        previewFilter === 'valid'
                          ? 'bg-status-success text-white'
                          : 'bg-surface-muted text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      Valid
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('duplicate')}
                      className={`px-2.5 py-1 rounded font-medium ${
                        previewFilter === 'duplicate'
                          ? 'bg-status-warning text-white'
                          : 'bg-surface-muted text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      Duplicates
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('invalid')}
                      className={`px-2.5 py-1 rounded font-medium ${
                        previewFilter === 'invalid'
                          ? 'bg-status-error text-white'
                          : 'bg-surface-muted text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      Errors
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-surface-border rounded-md">
                  <table className="w-full text-left text-xs text-content-primary">
                    <thead className="bg-surface-muted border-b border-surface-border text-content-secondary uppercase">
                      <tr>
                        <th className="p-3">Row #</th>
                        <th className="p-3">Validation Status</th>
                        <th className="p-3">Key Identifier</th>
                        <th className="p-3">Summary Data</th>
                        <th className="p-3">Details / Validation Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {filteredPreviewRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-content-secondary">
                            No rows matching the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredPreviewRows.map((r) => (
                          <tr key={r.rowNumber} className="hover:bg-surface-muted/50">
                            <td className="p-3 font-mono font-bold">Line {r.rowNumber}</td>
                            <td className="p-3">
                              {r.status === 'valid' && <Badge variant="success">Valid New</Badge>}
                              {r.status === 'duplicate' && <Badge variant="warning">Duplicate</Badge>}
                              {r.status === 'invalid' && <Badge variant="error">Invalid</Badge>}
                            </td>
                            <td className="p-3 font-mono font-bold text-brand-primary">
                              {r.data.hostname || r.data.staff_id || r.data.title || 'N/A'}
                            </td>
                            <td className="p-3">
                              {r.data.full_name || r.data.asset_tag || r.data.category || 'N/A'}
                              {r.data.department ? ` (${r.data.department})` : ''}
                            </td>
                            <td className="p-3">
                              {r.status === 'invalid' ? (
                                <span className="text-status-error font-medium">{r.errors.join('; ')}</span>
                              ) : r.status === 'duplicate' ? (
                                <span className="text-status-warning font-medium">
                                  Matches existing {r.duplicateMatch?.key}: {r.duplicateMatch?.value}
                                </span>
                              ) : (
                                <span className="text-status-success flex items-center gap-1 font-medium">
                                  <CheckCircle className="w-3.5 h-3.5" /> Schema verified
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setWizardStep(2)}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Upload Different File
                </Button>

                <Button
                  variant="primary"
                  onClick={() => setConfirmModalOpen(true)}
                  disabled={previewData.validCount === 0 && previewData.duplicateCount === 0}
                >
                  Commit Import to Database <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>

              {/* Confirmation Modal */}
              {confirmModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                  <Card className="w-full max-w-md p-6 bg-surface border-surface-border space-y-4">
                    <h3 className="text-lg font-bold text-content-primary">Confirm Batch Import Commit</h3>

                    <div className="p-3 rounded bg-surface-muted border border-surface-border text-xs space-y-2">
                      <p className="font-semibold text-content-primary">Import Action Breakdown:</p>
                      <ul className="list-disc pl-4 space-y-1 text-content-secondary">
                        <li>
                          <strong>{previewData.validCount}</strong> new record(s) will be created.
                        </li>
                        <li>
                          <strong>{previewData.duplicateCount}</strong> duplicate record(s) will be{' '}
                          <span className="font-bold uppercase text-brand-primary">{duplicatePolicy}PED</span>.
                        </li>
                        {previewData.errorCount > 0 && (
                          <li className="text-status-error">
                            <strong>{previewData.errorCount}</strong> invalid row(s) will be excluded.
                          </li>
                        )}
                      </ul>
                      <p className="text-[11px] text-content-secondary pt-1 border-t border-surface-border">
                        This action executes within a strict MySQL transaction and writes an audit event.
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => setConfirmModalOpen(false)}
                        disabled={commitMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() =>
                          commitMutation.mutate({
                            jobId: previewData.jobId,
                            policy: duplicatePolicy,
                          })
                        }
                        disabled={commitMutation.isPending}
                      >
                        {commitMutation.isPending ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Committing Changes…
                          </>
                        ) : (
                          'Confirm & Commit'
                        )}
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Import Outcome */}
          {wizardStep === 4 && commitResult && (
            <Card className="p-8 text-center bg-surface border-surface-border space-y-6 max-w-2xl mx-auto">
              <div className="w-16 h-16 rounded-full bg-status-success-bg border border-status-success text-status-success flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-2xl font-bold text-content-primary">Batch Import Successfully Committed</h3>
                <p className="text-xs text-content-secondary mt-1">
                  Database transaction finalized & audit record emitted for Job #{commitResult.jobId}
                </p>
              </div>

              {/* Metric Breakdown Grid */}
              <div className="grid grid-cols-4 gap-2 text-center p-4 rounded-lg bg-surface-muted border border-surface-border text-xs">
                <div>
                  <span className="text-content-secondary block">Created</span>
                  <span className="text-xl font-bold text-status-success font-mono">
                    {commitResult.createdCount}
                  </span>
                </div>
                <div>
                  <span className="text-content-secondary block">Updated</span>
                  <span className="text-xl font-bold text-brand-primary font-mono">
                    {commitResult.updatedCount}
                  </span>
                </div>
                <div>
                  <span className="text-content-secondary block">Skipped</span>
                  <span className="text-xl font-bold text-status-warning font-mono">
                    {commitResult.skippedCount}
                  </span>
                </div>
                <div>
                  <span className="text-content-secondary block">Failed</span>
                  <span className="text-xl font-bold text-status-error font-mono">
                    {commitResult.failedCount}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button variant="outline" onClick={handleResetWizard}>
                  <Upload className="w-4 h-4 mr-1.5" /> Start Another Import
                </Button>

                {onNavigateToEntity && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (selectedEntity === 'inventory') onNavigateToEntity('inventory');
                      else if (selectedEntity === 'directory') onNavigateToEntity('directory');
                      else onNavigateToEntity('tickets');
                    }}
                  >
                    View {selectedEntity === 'inventory' ? 'Hardware Inventory' : selectedEntity === 'directory' ? 'Staff Directory' : 'Support Issues'} <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
