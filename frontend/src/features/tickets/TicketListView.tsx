import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  Search,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Building,
  Monitor,
  AlertCircle,
} from 'lucide-react';

interface TicketListItem {
  id: number;
  ticket_number: string;
  title: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'resolved' | 'cancelled';
  department_name: string | null;
  department_code: string | null;
  asset_hostname: string | null;
  asset_tag: string | null;
  affected_person_name: string | null;
  creator_name: string | null;
  created_at: string;
}

interface TicketListResponse {
  data: TicketListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface Department {
  id: number;
  name: string;
  code: string;
}

interface TicketListViewProps {
  onSelectTicket: (ticketId: number) => void;
  onNewTicket: () => void;
}

export const TicketListView: React.FC<TicketListViewProps> = ({ onSelectTicket, onNewTicket }) => {
  const { user } = useAuth();
  const isOfficerOrAdmin = user?.role === 'ict_officer' || user?.role === 'administrator';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [priority, setPriority] = useState('all');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  // Fetch departments for filter
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await fetch('/api/v1/departments');
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : (json.data?.items || []);
    },
  });

  // Fetch tickets
  const { data, isLoading, error, refetch } = useQuery<TicketListResponse>({
    queryKey: ['tickets', search, status, category, priority, departmentId, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy: 'created_at',
        sortOrder: 'DESC',
      });

      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      if (category !== 'all') params.set('category', category);
      if (priority !== 'all') params.set('priority', priority);
      if (departmentId) params.set('department_id', departmentId);

      const res = await fetch(`/api/v1/tickets?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch issues');
      return json;
    },
  });

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'in_progress':
        return <Badge variant="info">In Progress</Badge>;
      case 'resolved':
        return <Badge variant="success">Resolved</Badge>;
      case 'cancelled':
        return <Badge variant="neutral">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{s}</Badge>;
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'critical':
        return <Badge variant="error">Critical</Badge>;
      case 'high':
        return <Badge variant="warning">High</Badge>;
      case 'normal':
        return <Badge variant="neutral">Normal</Badge>;
      case 'low':
        return <Badge variant="neutral">Low</Badge>;
      default:
        return <Badge variant="neutral">{p}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-content-primary">ICT Support Issues</h2>
          <p className="text-sm text-content-secondary">
            Manage daily incident logs, track issue progression, and view append-only histories
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>

          {isOfficerOrAdmin && (
            <Button variant="primary" size="sm" onClick={onNewTicket}>
              <Plus className="w-4 h-4 mr-1.5" /> New Issue Entry
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 bg-surface border-surface-border space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-2 md:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-content-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search reference #, title, computer, person..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="all">All Categories</option>
              <option value="hardware">Computer / Hardware</option>
              <option value="network">Network / Internet</option>
              <option value="printer">Printer / Scanner</option>
              <option value="software">Software / App</option>
              <option value="access">Account / Access</option>
              <option value="security">Security</option>
              <option value="maintenance">Maintenance</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Department Filter */}
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

      {/* Issues Table Card */}
      <Card className="overflow-hidden bg-surface border-surface-border">
        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-primary mb-3" />
            <p className="text-content-secondary">Loading support issues...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-status-error space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto" />
            <p>{(error as any).message || 'Failed to load issues'}</p>
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="p-12 text-center text-content-secondary space-y-3">
            <p className="text-base font-semibold text-content-primary">No issues found</p>
            <p className="text-sm">
              {search || status !== 'all' || category !== 'all' || departmentId
                ? 'Try broadening your search or clearing active filters.'
                : 'No support entries have been logged yet.'}
            </p>
            {isOfficerOrAdmin && (
              <Button variant="primary" size="sm" onClick={onNewTicket} className="mt-2">
                <Plus className="w-4 h-4 mr-1.5" /> Create First Issue
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-content-primary">
              <thead className="bg-surface-muted text-content-secondary text-xs uppercase tracking-wider border-b border-surface-border">
                <tr>
                  <th className="px-4 py-3">Issue #</th>
                  <th className="px-4 py-3">Title & Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Department & Asset</th>
                  <th className="px-4 py-3">Reported</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {data.data.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="hover:bg-surface-muted/50 transition-colors cursor-pointer"
                    onClick={() => onSelectTicket(ticket.id)}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-brand-primary whitespace-nowrap">
                      {ticket.ticket_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-content-primary">{ticket.title}</div>
                      <div className="text-xs text-content-secondary capitalize">
                        {ticket.category}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(ticket.status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getPriorityBadge(ticket.priority)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-content-primary">
                        <Building className="w-3.5 h-3.5 text-content-secondary flex-shrink-0" />
                        <span>{ticket.department_name || 'N/A'}</span>
                      </div>
                      {ticket.asset_hostname && (
                        <div className="flex items-center gap-1.5 text-xs text-content-secondary mt-0.5">
                          <Monitor className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{ticket.asset_hostname}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-content-secondary">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTicket(ticket.id);
                        }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {data && data.meta.totalPages > 1 && (
          <div className="p-4 border-t border-surface-border flex items-center justify-between text-xs text-content-secondary">
            <span>
              Showing page {data.meta.page} of {data.meta.totalPages} ({data.meta.total} total issues)
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
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
