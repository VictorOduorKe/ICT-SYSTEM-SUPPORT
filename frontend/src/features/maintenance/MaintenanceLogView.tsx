import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  Wrench,
  Plus,
  Search,
  RefreshCw,
  Building,
  Monitor,
  User,
  Calendar,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

interface MaintenanceRecord {
  id: number;
  maintenance_date: string;
  maintenance_type: string;
  work_performed: string;
  result: string;
  notes: string | null;
  department_name: string;
  department_code: string;
  asset_hostname: string | null;
  asset_tag: string | null;
  device_type: string | null;
  officer_name: string;
  created_at: string;
}

interface MaintenanceResponse {
  items: MaintenanceRecord[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

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
}

export const MaintenanceLogView: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOfficerOrAdmin = user?.role === 'ict_officer' || user?.role === 'administrator';

  // Filters state
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formDeptId, setFormDeptId] = useState('');
  const [formAssetId, setFormAssetId] = useState('');
  const [formType, setFormType] = useState('Preventive Maintenance');
  const [formWork, setFormWork] = useState('');
  const [formResult, setFormResult] = useState('Completed');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Departments for filters and modal
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await fetch('/api/v1/departments');
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : json.data?.items || [];
    },
  });

  // Assets for modal
  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ['assets-quick-list'],
    queryFn: async () => {
      const res = await fetch('/api/v1/assets?limit=100&is_archived=false');
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : json.data?.items || [];
    },
  });

  // Maintenance query
  const { data, isLoading, error, refetch, isFetching } = useQuery<MaintenanceResponse>({
    queryKey: ['maintenance', search, departmentId, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy: 'maintenance_date',
        sortOrder: 'DESC',
      });
      if (search.trim()) params.set('search', search.trim());
      if (departmentId) params.set('department_id', departmentId);

      const res = await fetch(`/api/v1/maintenance?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch maintenance records');
      return json.data;
    },
  });

  // Create Maintenance Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/v1/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to record maintenance');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      queryClient.invalidateQueries({ queryKey: ['report-summary'] });
      setIsModalOpen(false);
      setFormWork('');
      setFormNotes('');
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err.message);
    },
  });

  const handleAssetSelect = (selectedId: string) => {
    setFormAssetId(selectedId);
    if (selectedId) {
      const match = assets.find((a) => a.id === Number(selectedId));
      if (match?.department_id) {
        setFormDeptId(String(match.department_id));
      }
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDeptId) {
      setFormError('Please select a department.');
      return;
    }
    if (!formWork.trim() || formWork.trim().length < 5) {
      setFormError('Work performed description must be at least 5 characters.');
      return;
    }

    setFormError(null);
    createMutation.mutate({
      maintenance_date: formDate,
      department_id: Number(formDeptId),
      asset_id: formAssetId ? Number(formAssetId) : null,
      maintenance_type: formType,
      work_performed: formWork.trim(),
      result: formResult,
      notes: formNotes.trim() || null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-content-primary">Routine Maintenance Log</h2>
          <p className="text-sm text-content-secondary">
            Structured records of preventive servicing, hardware cleaning, and scheduled diagnostics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>

          {isOfficerOrAdmin && (
            <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Record Maintenance
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 bg-surface border-surface-border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-content-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search maintenance type, work performed, notes, computer..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          <div>
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Records Table */}
      <Card className="overflow-hidden bg-surface border-surface-border">
        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-primary mb-3" />
            <p className="text-content-secondary">Loading maintenance records...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-status-error space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto" />
            <p>{(error as any).message || 'Failed to load maintenance records'}</p>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center text-content-secondary space-y-3">
            <Wrench className="w-10 h-10 mx-auto text-content-secondary opacity-60" />
            <p className="text-base font-semibold text-content-primary">No maintenance records logged</p>
            <p className="text-sm">
              {search || departmentId
                ? 'Try broadening your search criteria.'
                : 'Routine maintenance activities will appear here once recorded.'}
            </p>
            {isOfficerOrAdmin && (
              <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)} className="mt-2">
                <Plus className="w-4 h-4 mr-1.5" /> Log First Activity
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-content-primary">
              <thead className="bg-surface-muted text-content-secondary text-xs uppercase tracking-wider border-b border-surface-border">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type & Work Performed</th>
                  <th className="px-4 py-3">Department & Asset</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Logged By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {data.items.map((record) => (
                  <tr key={record.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-content-secondary flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-brand-primary" />
                      {record.maintenance_date}
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <div className="font-semibold text-content-primary">{record.maintenance_type}</div>
                      <p className="text-xs text-content-secondary line-clamp-2 mt-0.5 whitespace-pre-wrap">
                        {record.work_performed}
                      </p>
                      {record.notes && (
                        <p className="text-[11px] text-content-muted italic mt-0.5">
                          Note: {record.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-content-primary">
                        <Building className="w-3.5 h-3.5 text-content-secondary flex-shrink-0" />
                        <span>{record.department_name}</span>
                      </div>
                      {record.asset_hostname ? (
                        <div className="flex items-center gap-1.5 text-xs text-content-secondary mt-0.5">
                          <Monitor className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{record.asset_hostname} {record.asset_tag ? `(${record.asset_tag})` : ''}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-content-muted block mt-0.5">General Facility</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant="resolved" size="sm">
                        {record.result}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-content-secondary">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
                        <span>{record.officer_name}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {data && data.pagination.totalPages > 1 && (
          <div className="p-4 border-t border-surface-border flex items-center justify-between text-xs text-content-secondary">
            <span>
              Showing page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} records)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Record Maintenance Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <Card className="w-full max-w-xl p-6 bg-surface border-surface-border space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border">
              <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
                <Wrench className="w-5 h-5 text-brand-primary" />
                <span>Record Routine Maintenance Activity</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-content-secondary hover:text-content-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded bg-status-error-bg border border-status-error text-status-error-text text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-content-secondary mb-1">
                    Date Performed <span className="text-status-error">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    required
                  />
                </div>

                {/* Maintenance Type */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-content-secondary mb-1">
                    Activity Type <span className="text-status-error">*</span>
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  >
                    <option value="Preventive Maintenance">Preventive Servicing & Inspection</option>
                    <option value="Cleaning & Dust Extraction">Hardware Dust & Fan Cleaning</option>
                    <option value="Software & OS Patching">Software / OS Update & Security Patches</option>
                    <option value="UPS & Power Check">UPS Battery & Power Backup Testing</option>
                    <option value="Network Port Verification">Network Port & Patch Panel Audit</option>
                    <option value="Antivirus Full Scan">Antivirus Definition & Full Scan</option>
                    <option value="Peripheral Diagnostic">Printer / Scanner Calibration</option>
                    <option value="Other Routine Maintenance">Other Routine Maintenance</option>
                  </select>
                </div>

                {/* Asset Selection */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-content-secondary mb-1">
                    Equipment / Asset (Optional)
                  </label>
                  <select
                    value={formAssetId}
                    onChange={(e) => handleAssetSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  >
                    <option value="">-- General / Non-Device Facility --</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.hostname} {a.asset_tag ? `(${a.asset_tag})` : ''} - {a.device_type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Department Selection */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-content-secondary mb-1">
                    Department <span className="text-status-error">*</span>
                  </label>
                  <select
                    value={formDeptId}
                    onChange={(e) => setFormDeptId(e.target.value)}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    required
                  >
                    <option value="">-- Select Department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Work Performed */}
              <div>
                <label className="block text-xs font-semibold uppercase text-content-secondary mb-1">
                  Work Performed <span className="text-status-error">*</span>
                </label>
                <textarea
                  rows={3}
                  value={formWork}
                  onChange={(e) => setFormWork(e.target.value)}
                  placeholder="Describe the maintenance actions, checks conducted, and tests run..."
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Result */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-content-secondary mb-1">
                    Outcome / Result
                  </label>
                  <select
                    value={formResult}
                    onChange={(e) => setFormResult(e.target.value)}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  >
                    <option value="Completed">Completed - Normal Operation</option>
                    <option value="Completed with Notes">Completed with Observations</option>
                    <option value="Pending Spares">Parts / Replacement Recommended</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-content-secondary mb-1">
                    Observations / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. Next battery cycle recommended in 6 months"
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> Saving Log…
                    </>
                  ) : (
                    'Record Maintenance Entry'
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
