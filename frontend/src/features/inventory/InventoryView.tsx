import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  Search,
  Plus,
  Monitor,
  AlertCircle,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Archive,
} from 'lucide-react';

interface Asset {
  id: number;
  hostname: string;
  asset_tag: string | null;
  device_type: string;
  department_id: number | null;
  department_name: string | null;
  department_code: string | null;
  assigned_person_id: number | null;
  assigned_person_name: string | null;
  assigned_person_staff_id: string | null;
  location: string | null;
  operating_system: string | null;
  ip_address: string | null;
  is_archived: boolean;
  notes: string | null;
  created_at: string;
}

interface InventoryResponse {
  items: Asset[];
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

interface StaffMember {
  id: number;
  staff_id: string;
  full_name: string;
  department_id: number;
}

export const InventoryView: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [deviceType, setDeviceType] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [hostname, setHostname] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [formDeviceType, setFormDeviceType] = useState('Desktop');
  const [formDeptId, setFormDeptId] = useState<string>('');
  const [formPersonId, setFormPersonId] = useState<string>('');
  const [location, setLocation] = useState('');
  const [os, setOs] = useState('Windows 11 Pro');
  const [ipAddress, setIpAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Query Departments
  const { data: departments } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await fetch('/api/v1/departments');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    },
  });

  // Query Staff Directory for Assignment Selector
  const { data: staffList } = useQuery<StaffMember[]>({
    queryKey: ['staff-selector'],
    queryFn: async () => {
      const res = await fetch('/api/v1/directory/people?limit=100');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data?.items || [];
    },
  });

  // Query Hardware Assets
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<InventoryResponse>({
    queryKey: ['inventory-assets', search, departmentId, deviceType, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        search: search.trim(),
      });
      if (departmentId) params.append('department_id', departmentId);
      if (deviceType && deviceType !== 'ALL') params.append('device_type', deviceType);

      const res = await fetch(`/api/v1/assets?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch computer assets');
      const json = await res.json();
      return json.data;
    },
  });

  // Create Asset Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: {
      hostname: string;
      asset_tag?: string;
      device_type: string;
      department_id?: number | null;
      assigned_person_id?: number | null;
      location?: string;
      operating_system?: string;
      ip_address?: string;
      notes?: string;
    }) => {
      const res = await fetch('/api/v1/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to register asset');
      }
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-assets'] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  // Archive / Toggle Asset Mutation
  const toggleArchiveMutation = useMutation({
    mutationFn: async ({ id, is_archived }: { id: number; is_archived: boolean }) => {
      const res = await fetch(`/api/v1/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to update asset');
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-assets'] });
    },
  });

  const resetForm = () => {
    setHostname('');
    setAssetTag('');
    setFormDeviceType('Desktop');
    setFormDeptId('');
    setFormPersonId('');
    setLocation('');
    setOs('Windows 11 Pro');
    setIpAddress('');
    setNotes('');
    setFormError(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostname.trim() || !formDeviceType) {
      setFormError('Please enter computer hostname and device type.');
      return;
    }

    setFormError(null);
    createMutation.mutate({
      hostname: hostname.trim(),
      asset_tag: assetTag.trim() || undefined,
      device_type: formDeviceType,
      department_id: formDeptId ? Number(formDeptId) : null,
      assigned_person_id: formPersonId ? Number(formPersonId) : null,
      location: location.trim() || undefined,
      operating_system: os.trim() || undefined,
      ip_address: ipAddress.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const canManage = user?.role === 'ict_officer' || user?.role === 'administrator';

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content-primary">Computer & Hardware Inventory</h2>
          <p className="text-xs text-content-secondary mt-0.5">
            Registered workstations, servers, laptops, and network equipment with unique hostname and asset tag enforcement.
          </p>
        </div>

        {canManage && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsModalOpen(true)}
            className="gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Computer Asset</span>
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
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
              placeholder="Search hostname, asset tag, IP, location, or user…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
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

          <div className="flex items-center gap-2">
            <select
              value={deviceType}
              onChange={(e) => {
                setDeviceType(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Device Types</option>
              <option value="Desktop">Desktop</option>
              <option value="Laptop">Laptop</option>
              <option value="Server">Server</option>
              <option value="Printer">Printer</option>
              <option value="Network Device">Network Device</option>
              <option value="Other">Other</option>
            </select>

            <Button
              variant="outline"
              size="md"
              onClick={() => refetch()}
              disabled={isFetching}
              className="shrink-0"
              title="Refresh inventory"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Inventory Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-content-primary">
            <thead className="bg-surface-hover border-b border-surface-border text-content-muted uppercase">
              <tr>
                <th className="py-3 px-4 font-semibold">Hostname</th>
                <th className="py-3 px-4 font-semibold">Asset Tag</th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold">Department</th>
                <th className="py-3 px-4 font-semibold">Assigned User</th>
                <th className="py-3 px-4 font-semibold">Location / IP</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                {canManage && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="py-8 text-center text-content-muted">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-brand-600" />
                      <span>Loading computer inventory…</span>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="py-8 text-center text-status-cancelled">
                    <p className="font-semibold">Failed to load inventory</p>
                    <p className="text-xs mt-1">{(error as Error)?.message}</p>
                  </td>
                </tr>
              ) : data?.items && data.items.length > 0 ? (
                data.items.map((asset) => (
                  <tr key={asset.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-content-primary">
                      {asset.hostname}
                    </td>
                    <td className="py-3 px-4 font-mono text-content-secondary">
                      {asset.asset_tag ? (
                        <span className="px-1.5 py-0.5 rounded bg-surface-hover border border-surface-border">
                          {asset.asset_tag}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium">
                      {asset.device_type}
                    </td>
                    <td className="py-3 px-4">
                      {asset.department_name ? (
                        <span>{asset.department_name}</span>
                      ) : (
                        <span className="text-content-muted italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {asset.assigned_person_name ? (
                        <span className="font-medium text-brand-700 dark:text-brand-300">
                          {asset.assigned_person_name}{' '}
                          <span className="text-content-muted text-[10px]">
                            ({asset.assigned_person_staff_id})
                          </span>
                        </span>
                      ) : (
                        <span className="text-content-muted italic">Shared / None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-content-secondary">
                      <div>{asset.location || 'Location unrecorded'}</div>
                      {asset.ip_address && (
                        <div className="font-mono text-[10px] text-content-muted">{asset.ip_address}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {asset.is_archived ? (
                        <Badge variant="neutral" size="sm">Archived</Badge>
                      ) : (
                        <Badge variant="resolved" size="sm">Operational</Badge>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            toggleArchiveMutation.mutate({
                              id: asset.id,
                              is_archived: !asset.is_archived,
                            })
                          }
                          className="text-content-muted hover:text-content-primary text-xs underline inline-flex items-center gap-1"
                          title={asset.is_archived ? 'Restore asset' : 'Archive asset'}
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>{asset.is_archived ? 'Restore' : 'Archive'}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="py-10 text-center text-content-muted">
                    <p className="text-sm font-semibold">No assets found matching criteria</p>
                    <p className="text-xs mt-1">Try clearing filters or add a new hardware asset.</p>
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
              Showing page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} assets)
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

      {/* Add Computer Asset Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-surface-card border border-surface-border rounded-lg max-w-xl w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-4">
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-brand-600" />
                <h3 className="text-base font-bold text-content-primary">Register New Hardware Asset</h3>
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
                    Hostname / Device Name <span className="text-status-cancelled">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder="e.g. HQ-DESK-005"
                    className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                  <p className="text-[10px] text-content-muted mt-1">Must be unique on the network</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Asset Tag (Optional)
                  </label>
                  <input
                    type="text"
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value)}
                    placeholder="e.g. AST-90210"
                    className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                  <p className="text-[10px] text-content-muted mt-1">Physical barcode/sticker tag</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Device Type <span className="text-status-cancelled">*</span>
                  </label>
                  <select
                    value={formDeviceType}
                    onChange={(e) => setFormDeviceType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="Desktop">Desktop PC</option>
                    <option value="Laptop">Laptop</option>
                    <option value="Server">Server</option>
                    <option value="Printer">Network Printer</option>
                    <option value="Network Device">Network Switch / AP</option>
                    <option value="Other">Other Equipment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Department
                  </label>
                  <select
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
                  Assigned Staff User (Optional)
                </label>
                <select
                  value={formPersonId}
                  onChange={(e) => {
                    setFormPersonId(e.target.value);
                    // Automatically pre-fill department if user is selected and dept was empty
                    if (e.target.value && !formDeptId) {
                      const person = staffList?.find((p) => p.id === Number(e.target.value));
                      if (person?.department_id) setFormDeptId(String(person.department_id));
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">No primary user (Shared / Pool device)</option>
                  {staffList?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.staff_id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Physical Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Block B, 3rd Floor"
                    className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Operating System
                  </label>
                  <input
                    type="text"
                    value={os}
                    onChange={(e) => setOs(e.target.value)}
                    placeholder="e.g. Windows 11 Enterprise"
                    className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-primary mb-1">
                  Static IP Address (Optional)
                </label>
                <input
                  type="text"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="e.g. 192.168.10.45"
                  className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-primary mb-1">
                  Notes / Specifications
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="RAM, Storage, warranty, or peripherals notes…"
                  className="w-full px-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
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
                  Save Hardware Asset
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
