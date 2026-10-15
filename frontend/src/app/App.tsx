import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/authContext';
import { LoginForm } from '../features/auth/LoginForm';
import { InventoryView } from '../features/inventory/InventoryView';
import { DirectoryView } from '../features/directory/DirectoryView';
import { TicketListView } from '../features/tickets/TicketListView';
import { TicketEntryForm } from '../features/tickets/TicketEntryForm';
import { TicketDetailView } from '../features/tickets/TicketDetailView';
import { DashboardView } from '../features/dashboard/DashboardView';
import { MaintenanceLogView } from '../features/maintenance/MaintenanceLogView';
import { ImportWizardView } from '../features/imports/ImportWizardView';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useTheme } from './theme';
import {
  Activity,
  Database,
  Server,
  RefreshCw,
  LogOut,
  UserCheck,
  ClipboardList,
  Eye,
  Settings,
  History,
  Monitor,
  Users,
  LayoutDashboard,
  Plus,
  Wrench,
  Upload,
} from 'lucide-react';

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  database: {
    connected: boolean;
    latencyMs: number;
  };
}

interface AuditLogItem {
  id: number;
  actor_id: number;
  actor_username: string;
  action: string;
  entity_type: string;
  ip_address: string;
  created_at: string;
}

type ActiveTab = 'dashboard' | 'tickets' | 'new-ticket' | 'ticket-detail' | 'maintenance' | 'inventory' | 'directory' | 'imports' | 'overview';

export const App: React.FC = () => {
  const { theme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const { data: health, isLoading: healthLoading, isError: healthError, error, refetch, isFetching } = useQuery<HealthResponse>({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      return res.json();
    },
    refetchInterval: 15000,
  });

  // Query audit logs if user is an Administrator
  const { data: auditLogs } = useQuery<AuditLogItem[]>({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const res = await fetch('/api/v1/audit-logs');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    },
    enabled: isAuthenticated && user?.role === 'administrator',
    refetchInterval: 10000,
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'administrator':
        return 'cancelled'; // Rose badge for Admin
      case 'supervisor':
        return 'pending'; // Amber badge for Supervisor
      case 'ict_officer':
        return 'brand'; // Blue badge for ICT Officer
      default:
        return 'neutral';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'administrator':
        return 'Administrator';
      case 'supervisor':
        return 'Supervisor';
      case 'ict_officer':
        return 'ICT Officer';
      default:
        return role;
    }
  };

  return (
    <div className="min-h-screen bg-surface-base text-content-primary flex flex-col">
      {/* Top Navigation Header */}
      <header className="border-b border-surface-border bg-surface-card px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-600 text-white rounded-md flex items-center justify-center font-bold text-lg">
              ICT
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-content-primary">
                ICT Daily Support & Issue Tracking System
              </h1>
              <p className="text-xs text-content-muted">
                Internal LAN Operations Portal — Phase 5: Dashboards, Routine Maintenance & Reporting Analytics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isAuthenticated && user && (
              <div className="flex items-center gap-3 pr-4 border-r border-surface-border">
                <div className="text-right">
                  <p className="text-sm font-semibold text-content-primary">{user.full_name}</p>
                  <p className="text-xs text-content-muted">@{user.username}</p>
                </div>
                <Badge variant={getRoleBadgeVariant(user.role)}>
                  {getRoleDisplayName(user.role)}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logout()}
                  title="Sign out of current session"
                  className="gap-1.5 ml-1"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </Button>
              </div>
            )}

            <Badge variant={theme === 'dark' ? 'brand' : 'neutral'}>
              {theme.toUpperCase()}
            </Badge>
            <ThemeToggle />
          </div>
        </div>

        {/* Navigation Tabs (When Authenticated) */}
        {isAuthenticated && (
          <div className="max-w-7xl mx-auto mt-4 pt-3 border-t border-surface-border flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-hover hover:bg-surface-border text-content-primary'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Operations Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tickets')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'tickets' || activeTab === 'ticket-detail'
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-hover hover:bg-surface-border text-content-primary'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Support Issues</span>
            </button>

            {(user?.role === 'ict_officer' || user?.role === 'administrator') && (
              <button
                type="button"
                onClick={() => setActiveTab('new-ticket')}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'new-ticket'
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-hover hover:bg-surface-border text-content-primary'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>New Issue Entry</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('maintenance')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'maintenance'
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-hover hover:bg-surface-border text-content-primary'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Routine Maintenance</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'inventory'
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-hover hover:bg-surface-border text-content-primary'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>Computer Inventory</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('directory')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'directory'
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-hover hover:bg-surface-border text-content-primary'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Staff Directory</span>
            </button>

            {(user?.role === 'ict_officer' || user?.role === 'administrator') && (
              <button
                type="button"
                onClick={() => setActiveTab('imports')}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'imports'
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-hover hover:bg-surface-border text-content-primary'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Batch Import</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-hover hover:bg-surface-border text-content-primary'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Telemetry & Audit</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {!isAuthenticated ? (
          <div className="py-8">
            <LoginForm />
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && <DashboardView />}

            {activeTab === 'tickets' && (
              <TicketListView
                onSelectTicket={(id) => {
                  setSelectedTicketId(id);
                  setActiveTab('ticket-detail');
                }}
                onNewTicket={() => setActiveTab('new-ticket')}
              />
            )}

            {activeTab === 'new-ticket' && (
              <TicketEntryForm
                onSubmitted={(id) => {
                  setSelectedTicketId(id);
                  setActiveTab('ticket-detail');
                }}
                onCancel={() => setActiveTab('tickets')}
              />
            )}

            {activeTab === 'ticket-detail' && selectedTicketId && (
              <TicketDetailView
                ticketId={selectedTicketId}
                onBack={() => setActiveTab('tickets')}
              />
            )}

            {activeTab === 'maintenance' && <MaintenanceLogView />}

            {activeTab === 'inventory' && <InventoryView />}

            {activeTab === 'directory' && <DirectoryView />}

            {activeTab === 'imports' && (
              <ImportWizardView onNavigateToEntity={(tab) => setActiveTab(tab)} />
            )}

            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Authenticated Welcome Banner */}
                <div className="bg-surface-card border border-surface-border rounded-lg p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="inline-flex items-center gap-2 mb-2">
                        <UserCheck className="w-5 h-5 text-emerald-600" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                          Authenticated Session Active
                        </span>
                      </div>
                      <h2 className="text-2xl font-bold text-content-primary">
                        System Operations: {user?.full_name}
                      </h2>
                      <p className="text-sm text-content-secondary mt-1 max-w-3xl">
                        Active role: <strong>{getRoleDisplayName(user?.role || '')}</strong>.
                        Computer and staff directories are live with duplicate prevention rules and server-side pagination.
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                      disabled={isFetching}
                      className="gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                      Refresh Health
                    </Button>
                  </div>
                </div>

                {/* Health & Infrastructure Telemetry Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold uppercase text-content-muted">Backend Service</span>
                      <Server className="w-5 h-5 text-brand-600" />
                    </div>
                    {healthLoading ? (
                      <div className="animate-pulse space-y-2">
                        <div className="h-6 bg-surface-hover rounded w-1/2"></div>
                        <div className="h-4 bg-surface-hover rounded w-3/4"></div>
                      </div>
                    ) : healthError ? (
                      <div className="text-status-cancelled">
                        <p className="font-semibold text-lg">Offline / Error</p>
                        <p className="text-xs mt-1">{(error as Error)?.message}</p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold">{health?.service}</span>
                          <Badge variant="resolved">ONLINE</Badge>
                        </div>
                        <p className="text-xs text-content-muted mt-1">
                          Uptime: {health?.uptimeSeconds}s | Version: {health?.version}
                        </p>
                      </div>
                    )}
                  </Card>

                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold uppercase text-content-muted">MySQL Connection Pool</span>
                      <Database className="w-5 h-5 text-brand-600" />
                    </div>
                    {healthLoading ? (
                      <div className="animate-pulse space-y-2">
                        <div className="h-6 bg-surface-hover rounded w-1/2"></div>
                        <div className="h-4 bg-surface-hover rounded w-3/4"></div>
                      </div>
                    ) : healthError || !health?.database.connected ? (
                      <div className="text-status-cancelled">
                        <p className="font-semibold text-lg">Disconnected</p>
                        <p className="text-xs mt-1">Database unreachable</p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold">11 Tables</span>
                          <Badge variant="resolved">Active</Badge>
                        </div>
                        <p className="text-xs text-content-muted mt-1">
                          InnoDB Pool ping: {health.database.latencyMs}ms | Connection pool verified
                        </p>
                      </div>
                    )}
                  </Card>

                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold uppercase text-content-muted">Active Role Context</span>
                      <Activity className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">{getRoleDisplayName(user?.role || '')}</span>
                      </div>
                      <p className="text-xs text-content-muted mt-1">
                        Permissions derived strictly from server session
                      </p>
                    </div>
                  </Card>
                </div>

                {/* Role Capabilities Matrix */}
                <Card>
                  <h3 className="text-base font-bold text-content-primary mb-4">
                    Assigned Operational Permissions: {getRoleDisplayName(user?.role || '')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={`p-4 rounded border ${user?.role === 'ict_officer' ? 'bg-brand-50/50 dark:bg-brand-950/20 border-brand-500' : 'bg-surface-base border-surface-border'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <ClipboardList className="w-4 h-4 text-brand-600" />
                        <h4 className="text-sm font-semibold">ICT Officer Operations</h4>
                      </div>
                      <ul className="text-xs text-content-secondary space-y-1 list-disc list-inside">
                        <li>Register & search computers</li>
                        <li>Maintain staff directory & assignments</li>
                        <li>Create & autosave support issues</li>
                        <li>Log routine maintenance records</li>
                      </ul>
                    </div>

                    <div className={`p-4 rounded border ${user?.role === 'supervisor' ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-500' : 'bg-surface-base border-surface-border'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Eye className="w-4 h-4 text-amber-600" />
                        <h4 className="text-sm font-semibold">Supervisor Oversight</h4>
                      </div>
                      <ul className="text-xs text-content-secondary space-y-1 list-disc list-inside">
                        <li>Search inventory and staff directories</li>
                        <li>View live KPI dashboards & reports</li>
                        <li>Read-only enforcement (No direct modifications)</li>
                      </ul>
                    </div>

                    <div className={`p-4 rounded border ${user?.role === 'administrator' ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500' : 'bg-surface-base border-surface-border'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Settings className="w-4 h-4 text-rose-600" />
                        <h4 className="text-sm font-semibold">Administrator Controls</h4>
                      </div>
                      <ul className="text-xs text-content-secondary space-y-1 list-disc list-inside">
                        <li>Manage accounts, roles, & departments</li>
                        <li>Hardware inventory & staff administration</li>
                        <li>Audit log monitoring & security inspection</li>
                      </ul>
                    </div>
                  </div>
                </Card>

                {/* Administrator Live Audit Logs Table (If Administrator) */}
                {user?.role === 'administrator' && (
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <History className="w-5 h-5 text-rose-600" />
                        <h3 className="text-base font-bold text-content-primary">
                          Recent System Audit Logs (Admin Access Verified)
                        </h3>
                      </div>
                      <span className="text-xs text-content-muted">
                        {auditLogs?.length || 0} events recorded
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-surface-border rounded-md">
                      <table className="w-full text-left text-xs text-content-primary">
                        <thead className="bg-surface-hover border-b border-surface-border text-content-muted uppercase">
                          <tr>
                            <th className="py-2.5 px-3">Timestamp</th>
                            <th className="py-2.5 px-3">Action</th>
                            <th className="py-2.5 px-3">Entity</th>
                            <th className="py-2.5 px-3">Actor</th>
                            <th className="py-2.5 px-3">IP Address</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-border">
                          {auditLogs && auditLogs.length > 0 ? (
                            auditLogs.slice(0, 5).map((log) => (
                              <tr key={log.id} className="hover:bg-surface-hover/50">
                                <td className="py-2 px-3 text-content-muted font-mono">
                                  {new Date(log.created_at).toLocaleString()}
                                </td>
                                <td className="py-2 px-3 font-semibold">{log.action}</td>
                                <td className="py-2 px-3">{log.entity_type}</td>
                                <td className="py-2 px-3">@{log.actor_username || 'system'}</td>
                                <td className="py-2 px-3 font-mono text-content-muted">
                                  {log.ip_address || '127.0.0.1'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="py-4 text-center text-content-muted">
                                No audit logs available yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-border bg-surface-card px-6 py-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-xs text-content-muted gap-2">
          <span>ICT Daily Support & Issue Tracking System &copy; 2026 ICT Department</span>
          <span>Phase 5: Dashboards, Routine Maintenance & Reporting Analytics</span>
        </div>
      </footer>
    </div>
  );
};
