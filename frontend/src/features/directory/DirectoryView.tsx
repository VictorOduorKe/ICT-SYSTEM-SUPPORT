import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Search, Plus, UserPlus, AlertCircle, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface StaffMember {
  id: number;
  staff_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department_id: number;
  department_name: string;
  department_code: string;
  is_active: boolean;
  created_at: string;
}

interface DirectoryResponse {
  items: StaffMember[];
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

export const DirectoryView: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [staffId, setStaffId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [formDeptId, setFormDeptId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Query Departments for Filter & Form
  const { data: departments } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await fetch('/api/v1/departments');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    },
  });

  // Query Staff Directory
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DirectoryResponse>({
    queryKey: ['directory-people', search, departmentId, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        search: search.trim(),
      });
      if (departmentId) params.append('department_id', departmentId);

      const res = await fetch(`/api/v1/directory/people?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch staff directory');
      const json = await res.json();
      return json.data;
    },
  });

  // Create Staff Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: { staff_id: string; full_name: string; email?: string; phone?: string; department_id: number }) => {
      const res = await fetch('/api/v1/directory/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to create staff record');
      }
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory-people'] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const resetForm = () => {
    setStaffId('');
    setFullName('');
    setEmail('');
    setPhone('');
    setFormDeptId('');
    setFormError(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId.trim() || !fullName.trim() || !formDeptId) {
      setFormError('Please fill in Staff ID, Full Name, and Department.');
      return;
    }

    setFormError(null);
    createMutation.mutate({
      staff_id: staffId.trim(),
      full_name: fullName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      department_id: Number(formDeptId),
    });
  };

  const canManage = user?.role === 'ict_officer' || user?.role === 'administrator';

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content-primary">Organization User Directory</h2>
          <p className="text-xs text-content-secondary mt-0.5">
            Searchable personnel directory associated with hardware assets and support issues.
          </p>
        </div>

        {canManage && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsModalOpen(true)}
            className="gap-2 shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </Button>
        )}
      </div>

      {/* Search & Filter Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by staff ID, full name, email, or phone…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="w-full md:w-64">
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Departments</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="md"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </Card>

      {/* Directory Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-content-primary">
            <thead className="bg-surface-hover border-b border-surface-border text-content-muted uppercase">
              <tr>
                <th className="py-3 px-4 font-semibold">Staff ID</th>
                <th className="py-3 px-4 font-semibold">Full Name</th>
                <th className="py-3 px-4 font-semibold">Department</th>
                <th className="py-3 px-4 font-semibold">Email</th>
                <th className="py-3 px-4 font-semibold">Phone</th>
                <th className="py-3 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-content-muted">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-brand-600" />
                      <span>Loading staff directory…</span>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-status-cancelled">
                    <p className="font-semibold">Failed to load directory</p>
                    <p className="text-xs mt-1">{(error as Error)?.message}</p>
                  </td>
                </tr>
              ) : data?.items && data.items.length > 0 ? (
                data.items.map((person) => (
                  <tr key={person.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-brand-600 dark:text-brand-400">
                      {person.staff_id}
                    </td>
                    <td className="py-3 px-4 font-medium text-content-primary">
                      {person.full_name}
                    </td>
                    <td className="py-3 px-4">
                      {person.department_name ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span>{person.department_name}</span>
                          <span className="text-content-muted">({person.department_code})</span>
                        </span>
                      ) : (
                        <span className="text-content-muted italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-content-secondary">
                      {person.email || '—'}
                    </td>
                    <td className="py-3 px-4 text-content-secondary">
                      {person.phone || '—'}
                    </td>
                    <td className="py-3 px-4">
                      {person.is_active ? (
                        <Badge variant="resolved" size="sm">Active</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Archived</Badge>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-content-muted">
                    <p className="text-sm font-semibold">No staff directory records found</p>
                    <p className="text-xs mt-1">Try adjusting your search criteria or add a new staff member.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border bg-surface-card">
            <span className="text-xs text-content-muted">
              Showing page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} records)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.pagination.totalPages}
                className="gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Staff Member Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-surface-card border border-surface-border rounded-lg max-w-lg w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-4">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand-600" />
                <h3 className="text-base font-bold text-content-primary">Add Staff Directory Member</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="text-content-muted hover:text-content-primary p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Staff ID <span className="text-status-cancelled">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    placeholder="e.g. STF-1002"
                    className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                  <p className="text-[10px] text-content-muted mt-1">Unique organization identifier</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Department <span className="text-status-cancelled">*</span>
                  </label>
                  <select
                    required
                    value={formDeptId}
                    onChange={(e) => setFormDeptId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Select department</option>
                    {departments?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-primary mb-1">
                  Full Name <span className="text-status-cancelled">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Robert Mwangi"
                  className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@organization.org"
                    className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+254 700 000000"
                    className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={createMutation.isPending}
                >
                  Save Staff Member
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
