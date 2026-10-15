import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import {
  Calendar,
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  Clock,
  PlayCircle,
  Wrench,
  Percent,
  Table as TableIcon,
  PieChart as PieIcon,
  Download,
  Building,
  UserCheck,
  AlertCircle,
} from 'lucide-react';

interface Metrics {
  total_tickets: number;
  resolved_tickets: number;
  pending_tickets: number;
  in_progress_tickets: number;
  cancelled_tickets: number;
  resolution_rate: number;
  routine_maintenance_completed: number;
}

interface StatusItem {
  name: string;
  count: number;
  color: string;
}

interface CategoryItem {
  category: string;
  label: string;
  count: number;
  color: string;
}

interface DepartmentItem {
  department_id: number;
  name: string;
  code: string;
  ticket_count: number;
}

interface TrendItem {
  date: string;
  created: number;
  resolved: number;
}

interface OfficerWorkloadItem {
  officer_id: number;
  full_name: string;
  username: string;
  total_handled: number;
  resolved_count: number;
  active_count: number;
}

interface ReportSummaryData {
  metrics: Metrics;
  status_distribution: StatusItem[];
  category_breakdown: CategoryItem[];
  department_breakdown: DepartmentItem[];
  timeline_trend: TrendItem[];
  officer_workload: OfficerWorkloadItem[];
}

interface Department {
  id: number;
  name: string;
  code: string;
}

export const DashboardView: React.FC = () => {
  // Filters state
  const [datePreset, setDatePreset] = useState<'today' | '7days' | '30days' | 'all' | 'custom'>('30days');
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState<string>('');
  const [showTabularData, setShowTabularData] = useState<boolean>(false);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);

  // Departments for filter
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await fetch('/api/v1/departments');
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : json.data?.items || [];
    },
  });

  // Handle Preset Changes
  const handlePresetChange = (preset: 'today' | '7days' | '30days' | 'all' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setDateFrom(d.toISOString().slice(0, 10));
      setDateTo(todayStr);
    } else if (preset === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setDateFrom(d.toISOString().slice(0, 10));
      setDateTo(todayStr);
    } else if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    }
  };

  // Fetch Dashboard Analytics Summary
  const { data, isLoading, error, refetch, isFetching } = useQuery<ReportSummaryData>({
    queryKey: ['report-summary', dateFrom, dateTo, departmentId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (departmentId) params.set('department_id', departmentId);

      const res = await fetch(`/api/v1/reports/summary?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch dashboard data');
      return json.data;
    },
  });

  // Fetch Daily Export Data
  const { data: dailyExportData, isLoading: exportLoading } = useQuery({
    queryKey: ['daily-export', dateTo || new Date().toISOString().slice(0, 10)],
    queryFn: async () => {
      const target = dateTo || new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/v1/reports/daily-export?date=${target}`);
      const json = await res.json();
      return json.data;
    },
    enabled: exportModalOpen,
  });

  const metrics = data?.metrics || {
    total_tickets: 0,
    resolved_tickets: 0,
    pending_tickets: 0,
    in_progress_tickets: 0,
    cancelled_tickets: 0,
    resolution_rate: 0,
    routine_maintenance_completed: 0,
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Export Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-content-primary">Operations & Support Dashboard</h2>
          <p className="text-sm text-content-secondary">
            Authoritative performance metrics, issue distribution, and routine maintenance oversight
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTabularData(!showTabularData)}
            title="Toggle between charts and accessible data tables"
          >
            {showTabularData ? (
              <>
                <PieIcon className="w-4 h-4 mr-1.5" /> Show Visual Charts
              </>
            ) : (
              <>
                <TableIcon className="w-4 h-4 mr-1.5" /> Show Data Tables
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportModalOpen(true)}
            title="Generate and view daily report summary"
          >
            <Download className="w-4 h-4 mr-1.5" /> Daily Report
          </Button>

          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Date & Department Filter Bar */}
      <Card className="p-4 bg-surface border-surface-border space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="font-semibold text-content-secondary mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Period:
            </span>
            {(['today', '7days', '30days', 'all'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetChange(preset)}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  datePreset === preset
                    ? 'bg-brand-primary text-white'
                    : 'bg-surface-muted text-content-primary hover:bg-surface-border'
                }`}
              >
                {preset === 'today' && 'Today'}
                {preset === '7days' && 'Past 7 Days'}
                {preset === '30days' && 'Past 30 Days'}
                {preset === 'all' && 'All Time'}
              </button>
            ))}
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-content-secondary">
              <Building className="w-3.5 h-3.5" /> Department:
            </div>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="px-3 py-1.5 text-xs border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Date Range Row */}
        <div className="pt-2 border-t border-surface-border flex flex-wrap items-center gap-3 text-xs text-content-secondary">
          <span>Date Range:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setDatePreset('custom');
            }}
            className="px-2.5 py-1 border border-surface-border rounded bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
          <span>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setDatePreset('custom');
            }}
            className="px-2.5 py-1 border border-surface-border rounded bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>
      </Card>

      {/* KPI Cards Grid (Strictly Solid Colors - NO GRADIENTS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Tickets */}
        <Card className="p-4 bg-surface border-surface-border">
          <div className="flex items-center justify-between text-content-secondary mb-2">
            <span className="text-xs uppercase font-bold tracking-wider">Total Issues</span>
            <TrendingUp className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="text-3xl font-extrabold text-content-primary">{metrics.total_tickets}</div>
          <p className="text-[11px] text-content-secondary mt-1">Logged in selected period</p>
        </Card>

        {/* Resolved Tickets */}
        <Card className="p-4 bg-surface border-surface-border">
          <div className="flex items-center justify-between text-content-secondary mb-2">
            <span className="text-xs uppercase font-bold tracking-wider">Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-status-success" />
          </div>
          <div className="text-3xl font-extrabold text-status-success">{metrics.resolved_tickets}</div>
          <p className="text-[11px] text-content-secondary mt-1">Verified resolutions</p>
        </Card>

        {/* Pending Tickets */}
        <Card className="p-4 bg-surface border-surface-border">
          <div className="flex items-center justify-between text-content-secondary mb-2">
            <span className="text-xs uppercase font-bold tracking-wider">Pending</span>
            <Clock className="w-4 h-4 text-status-warning" />
          </div>
          <div className="text-3xl font-extrabold text-status-warning">{metrics.pending_tickets}</div>
          <p className="text-[11px] text-content-secondary mt-1">Awaiting triage/action</p>
        </Card>

        {/* In Progress */}
        <Card className="p-4 bg-surface border-surface-border">
          <div className="flex items-center justify-between text-content-secondary mb-2">
            <span className="text-xs uppercase font-bold tracking-wider">In Progress</span>
            <PlayCircle className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="text-3xl font-extrabold text-brand-primary">{metrics.in_progress_tickets}</div>
          <p className="text-[11px] text-content-secondary mt-1">Under active investigation</p>
        </Card>

        {/* Resolution Rate */}
        <Card className="p-4 bg-surface border-surface-border">
          <div className="flex items-center justify-between text-content-secondary mb-2">
            <span className="text-xs uppercase font-bold tracking-wider">Resolution Rate</span>
            <Percent className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="text-3xl font-extrabold text-content-primary">{metrics.resolution_rate}%</div>
          <p className="text-[11px] text-content-secondary mt-1">Resolved vs reported ratio</p>
        </Card>

        {/* Routine Maintenance Completed */}
        <Card className="p-4 bg-surface border-surface-border">
          <div className="flex items-center justify-between text-content-secondary mb-2">
            <span className="text-xs uppercase font-bold tracking-wider">Maintenance</span>
            <Wrench className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-600">{metrics.routine_maintenance_completed}</div>
          <p className="text-[11px] text-content-secondary mt-1">Completed routine sessions</p>
        </Card>
      </div>

      {isLoading ? (
        <Card className="p-12 text-center bg-surface border-surface-border">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-primary mb-3" />
          <p className="text-content-secondary">Aggregating database statistics and charts...</p>
        </Card>
      ) : error ? (
        <Card className="p-8 text-center bg-surface border-surface-border text-status-error space-y-2">
          <AlertCircle className="w-8 h-8 mx-auto" />
          <p>{(error as any).message || 'Failed to load report analytics'}</p>
        </Card>
      ) : (
        <>
          {/* Charts Row: Status Distribution & Category Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Distribution Pie Chart */}
            <Card className="p-6 bg-surface border-surface-border space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <h3 className="font-bold text-base text-content-primary">Issue Status Distribution</h3>
                <span className="text-xs text-content-secondary font-mono">{metrics.total_tickets} Total</span>
              </div>

              {!showTabularData ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data?.status_distribution || []}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={45}
                        paddingAngle={3}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {(data?.status_distribution || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          borderColor: '#334155',
                          color: '#f8fafc',
                          borderRadius: '6px',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                /* Tabular Alternative for Accessibility */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted text-content-secondary uppercase">
                      <tr>
                        <th className="p-2">Status</th>
                        <th className="p-2 text-right">Count</th>
                        <th className="p-2 text-right">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {(data?.status_distribution || []).map((s) => (
                        <tr key={s.name}>
                          <td className="p-2 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.name}
                          </td>
                          <td className="p-2 text-right font-mono font-bold">{s.count}</td>
                          <td className="p-2 text-right font-mono">
                            {metrics.total_tickets > 0
                              ? `${((s.count / metrics.total_tickets) * 100).toFixed(1)}%`
                              : '0%'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Issue Category Breakdown */}
            <Card className="p-6 bg-surface border-surface-border space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <h3 className="font-bold text-base text-content-primary">Issues by Category</h3>
                <span className="text-xs text-content-secondary font-mono">
                  {(data?.category_breakdown || []).length} Categories
                </span>
              </div>

              {!showTabularData ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data?.category_breakdown || []}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          borderColor: '#334155',
                          color: '#f8fafc',
                          borderRadius: '6px',
                        }}
                      />
                      <Bar dataKey="count" name="Issues" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                        {(data?.category_breakdown || []).map((entry, index) => (
                          <Cell key={`bar-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                /* Tabular Alternative */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted text-content-secondary uppercase">
                      <tr>
                        <th className="p-2">Category</th>
                        <th className="p-2 text-right">Issues</th>
                        <th className="p-2 text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {(data?.category_breakdown || []).map((c) => (
                        <tr key={c.category}>
                          <td className="p-2 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.label}
                          </td>
                          <td className="p-2 text-right font-mono font-bold">{c.count}</td>
                          <td className="p-2 text-right font-mono">
                            {metrics.total_tickets > 0
                              ? `${((c.count / metrics.total_tickets) * 100).toFixed(1)}%`
                              : '0%'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Department Breakdown & Daily Timeline Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Breakdown */}
            <Card className="p-6 bg-surface border-surface-border space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <h3 className="font-bold text-base text-content-primary">Issues by Department</h3>
                <span className="text-xs text-content-secondary">High-frequency areas</span>
              </div>

              {!showTabularData ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data?.department_breakdown || []}
                      margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis
                        dataKey="code"
                        interval={0}
                        tick={{ fontSize: 11 }}
                        angle={-25}
                        textAnchor="end"
                      />
                      <YAxis allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          borderColor: '#334155',
                          color: '#f8fafc',
                          borderRadius: '6px',
                        }}
                      />
                      <Bar dataKey="ticket_count" name="Issues" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted text-content-secondary uppercase">
                      <tr>
                        <th className="p-2">Code</th>
                        <th className="p-2">Department Name</th>
                        <th className="p-2 text-right">Issues</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {(data?.department_breakdown || []).map((d) => (
                        <tr key={d.department_id}>
                          <td className="p-2 font-mono font-bold text-brand-primary">{d.code}</td>
                          <td className="p-2">{d.name}</td>
                          <td className="p-2 text-right font-mono font-bold">{d.ticket_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Daily Timeline Activity */}
            <Card className="p-6 bg-surface border-surface-border space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <h3 className="font-bold text-base text-content-primary">Activity Timeline</h3>
                <span className="text-xs text-content-secondary">Reported vs. Resolved</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data?.timeline_trend || []}
                    margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderColor: '#334155',
                        color: '#f8fafc',
                        borderRadius: '6px',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="created"
                      name="Reported"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="resolved"
                      name="Resolved"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Supervisor & Admin Oversight: Officer Workload & Productivity Table */}
          <Card className="p-6 bg-surface border-surface-border space-y-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div>
                <h3 className="font-bold text-base text-content-primary">Officer Workload & Resolution Oversight</h3>
                <p className="text-xs text-content-secondary">
                  Accountability tracking for active and completed support requests
                </p>
              </div>
              <Badge variant="brand">Supervisor Oversight</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-content-primary">
                <thead className="bg-surface-muted text-content-secondary text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-3">ICT Officer</th>
                    <th className="p-3">Username</th>
                    <th className="p-3 text-right">Total Handled</th>
                    <th className="p-3 text-right">Active (Pending/In Progress)</th>
                    <th className="p-3 text-right">Resolved</th>
                    <th className="p-3 text-right">Resolution Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border text-xs">
                  {(!data?.officer_workload || data.officer_workload.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-content-secondary">
                        No officer activity logged during this reporting window.
                      </td>
                    </tr>
                  ) : (
                    data.officer_workload.map((o) => {
                      const ratio =
                        o.total_handled > 0 ? Math.round((o.resolved_count / o.total_handled) * 100) : 0;
                      return (
                        <tr key={o.officer_id} className="hover:bg-surface-muted/50">
                          <td className="p-3 font-semibold text-content-primary flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-brand-primary" />
                            {o.full_name}
                          </td>
                          <td className="p-3 font-mono text-content-secondary">@{o.username}</td>
                          <td className="p-3 text-right font-mono font-bold">{o.total_handled}</td>
                          <td className="p-3 text-right font-mono text-status-warning font-semibold">
                            {o.active_count}
                          </td>
                          <td className="p-3 text-right font-mono text-status-success font-semibold">
                            {o.resolved_count}
                          </td>
                          <td className="p-3 text-right font-mono">
                            <Badge
                              variant={ratio >= 75 ? 'resolved' : ratio >= 40 ? 'inprogress' : 'pending'}
                              size="sm"
                            >
                              {ratio}%
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Daily Report Export Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <Card className="w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 bg-surface border-surface-border space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Daily ICT Operations Report</h3>
                <p className="text-xs text-content-secondary">
                  Consolidated summary for {dateTo || new Date().toISOString().slice(0, 10)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setExportModalOpen(false)}>
                Close
              </Button>
            </div>

            {exportLoading ? (
              <div className="py-8 text-center">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-primary mb-2" />
                <p className="text-xs text-content-secondary">Generating report summary...</p>
              </div>
            ) : dailyExportData ? (
              <div className="space-y-4 text-xs">
                {/* Metrics Summary Strip */}
                <div className="grid grid-cols-4 gap-2 text-center p-3 rounded-lg bg-surface-muted border border-surface-border">
                  <div>
                    <span className="text-content-secondary block">Total Reported</span>
                    <span className="text-base font-bold text-content-primary font-mono">
                      {dailyExportData.summary.total_tickets}
                    </span>
                  </div>
                  <div>
                    <span className="text-content-secondary block">Resolved</span>
                    <span className="text-base font-bold text-status-success font-mono">
                      {dailyExportData.summary.resolved_count}
                    </span>
                  </div>
                  <div>
                    <span className="text-content-secondary block">Pending</span>
                    <span className="text-base font-bold text-status-warning font-mono">
                      {dailyExportData.summary.pending_count}
                    </span>
                  </div>
                  <div>
                    <span className="text-content-secondary block">Maintenance</span>
                    <span className="text-base font-bold text-emerald-600 font-mono">
                      {dailyExportData.summary.maintenance_count}
                    </span>
                  </div>
                </div>

                {/* Tickets Table */}
                <div className="space-y-1">
                  <h4 className="font-bold text-content-primary">Reported Issues</h4>
                  <div className="border border-surface-border rounded overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-surface-muted text-content-secondary">
                        <tr>
                          <th className="p-2">Ref #</th>
                          <th className="p-2">Title</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Department</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border">
                        {dailyExportData.tickets.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-3 text-center text-content-secondary">
                              No issues recorded on this day.
                            </td>
                          </tr>
                        ) : (
                          dailyExportData.tickets.map((t: any) => (
                            <tr key={t.id}>
                              <td className="p-2 font-mono font-bold text-brand-primary">{t.ticket_number}</td>
                              <td className="p-2">{t.title}</td>
                              <td className="p-2 capitalize">{t.status}</td>
                              <td className="p-2">{t.department_name || 'N/A'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Maintenance Activities */}
                <div className="space-y-1">
                  <h4 className="font-bold text-content-primary">Routine Maintenance Performed</h4>
                  <div className="border border-surface-border rounded overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-surface-muted text-content-secondary">
                        <tr>
                          <th className="p-2">Type</th>
                          <th className="p-2">Work Performed</th>
                          <th className="p-2">Asset</th>
                          <th className="p-2">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border">
                        {dailyExportData.maintenance_activities.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-3 text-center text-content-secondary">
                              No routine maintenance logged on this day.
                            </td>
                          </tr>
                        ) : (
                          dailyExportData.maintenance_activities.map((m: any) => (
                            <tr key={m.id}>
                              <td className="p-2 font-semibold">{m.maintenance_type}</td>
                              <td className="p-2">{m.work_performed}</td>
                              <td className="p-2">{m.asset_hostname || 'General'}</td>
                              <td className="p-2 text-status-success font-medium">{m.result}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
};
