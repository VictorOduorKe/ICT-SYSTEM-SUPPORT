import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  ArrowLeft,
  Clock,
  User,
  Monitor,
  Building,
  CheckCircle,
  AlertCircle,
  Play,
  RotateCcw,
  Ban,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';

interface TicketEvent {
  id: number;
  ticket_id: number;
  actor_id: number;
  event_type: 'created' | 'draft_saved' | 'status_changed' | 'note_added' | 'resolved' | 'reopened' | 'cancelled';
  previous_status: string | null;
  new_status: string | null;
  note: string;
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
  actor_username: string | null;
}

interface TicketDetail {
  id: number;
  ticket_number: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'resolved' | 'cancelled';
  department_id: number | null;
  department_name: string | null;
  department_code: string | null;
  asset_id: number | null;
  asset_hostname: string | null;
  asset_tag: string | null;
  device_type: string | null;
  affected_person_id: number | null;
  affected_person_name: string | null;
  affected_staff_id: string | null;
  creator_name: string | null;
  creator_role: string | null;
  resolver_name: string | null;
  resolved_at: string | null;
  resolution_summary: string | null;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
  events: TicketEvent[];
}

interface TicketDetailViewProps {
  ticketId: number;
  onBack: () => void;
}

export const TicketDetailView: React.FC<TicketDetailViewProps> = ({ ticketId, onBack }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOfficerOrAdmin = user?.role === 'ict_officer' || user?.role === 'administrator';

  // Modal / action states
  const [transitionTarget, setTransitionTarget] = useState<'in_progress' | 'resolved' | 'reopened' | 'cancelled' | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Quick note state
  const [quickNote, setQuickNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  // 1. Fetch ticket details with timeline events
  const { data: ticket, isLoading, error } = useQuery<TicketDetail>({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch issue details');
      return json.data;
    },
  });

  // 2. Status Transition Mutation
  const transitionMutation = useMutation({
    mutationFn: async (payload: { target_status: string; note: string; resolution_summary?: string }) => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to advance status');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setTransitionTarget(null);
      setTransitionNote('');
      setResolutionSummary('');
      setTransitionError(null);
    },
    onError: (err: any) => {
      setTransitionError(err.message);
    },
  });

  // 3. Quick Note Mutation
  const noteMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to add progress note');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      setQuickNote('');
      setNoteError(null);
    },
    onError: (err: any) => {
      setNoteError(err.message);
    },
  });

  const handleExecuteTransition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionTarget) return;

    if (!transitionNote.trim() || transitionNote.trim().length < 3) {
      setTransitionError('Please provide an operational note explaining this action (min 3 characters).');
      return;
    }

    if (transitionTarget === 'resolved' && (!resolutionSummary.trim() || resolutionSummary.trim().length < 5)) {
      setTransitionError('A resolution summary is required to close the issue (min 5 characters).');
      return;
    }

    setTransitionError(null);
    transitionMutation.mutate({
      target_status: transitionTarget === 'reopened' ? 'in_progress' : transitionTarget,
      note: transitionNote.trim(),
      resolution_summary: transitionTarget === 'resolved' ? resolutionSummary.trim() : undefined,
    });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNote.trim() || quickNote.trim().length < 2) {
      setNoteError('Progress note must contain at least 2 characters.');
      return;
    }
    setNoteError(null);
    noteMutation.mutate(quickNote.trim());
  };

  if (isLoading) {
    return (
      <Card className="p-8 text-center bg-surface border-surface-border">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-primary mb-3" />
        <p className="text-content-secondary">Loading issue history and details...</p>
      </Card>
    );
  }

  if (error || !ticket) {
    return (
      <Card className="p-8 text-center bg-surface border-surface-border space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto text-status-error" />
        <h3 className="text-lg font-bold text-content-primary">Failed to load issue</h3>
        <p className="text-sm text-content-secondary">{(error as any)?.message || 'Issue not found'}</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Issue List
        </Button>
      </Card>
    );
  }

  // Priority color styling (Solid colors only)
  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'critical':
        return <Badge variant="error">Critical Priority</Badge>;
      case 'high':
        return <Badge variant="warning">High Priority</Badge>;
      case 'normal':
        return <Badge variant="neutral">Normal Priority</Badge>;
      case 'low':
        return <Badge variant="neutral">Low Priority</Badge>;
      default:
        return <Badge variant="neutral">{p}</Badge>;
    }
  };

  // Status color styling (Solid colors only)
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Issue List
        </Button>

        <div className="flex items-center gap-3">
          {getStatusBadge(ticket.status)}
          {getPriorityBadge(ticket.priority)}
        </div>
      </div>

      {/* Ticket Header & Summary Card */}
      <Card className="p-6 bg-surface border-surface-border space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-surface-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-bold text-brand-primary">
                {ticket.ticket_number}
              </span>
              <span className="text-xs text-content-secondary px-2 py-0.5 rounded bg-surface-muted border border-surface-border">
                Category: {ticket.category.toUpperCase()}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-content-primary">{ticket.title}</h2>
          </div>

          {/* Action Buttons for ICT Officer / Admin */}
          {isOfficerOrAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              {ticket.status === 'pending' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setTransitionTarget('in_progress');
                    setTransitionNote('Acknowledged incident and commenced diagnostic work.');
                  }}
                >
                  <Play className="w-4 h-4 mr-1.5" /> Start Work (In Progress)
                </Button>
              )}

              {ticket.status === 'in_progress' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-status-success hover:bg-status-success/90 text-white"
                    onClick={() => {
                      setTransitionTarget('resolved');
                      setTransitionNote('Connectivity and functionality verified with user.');
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" /> Mark Resolved
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTransitionTarget('cancelled');
                      setTransitionNote('Support request cancelled.');
                    }}
                  >
                    <Ban className="w-4 h-4 mr-1.5" /> Cancel Issue
                  </Button>
                </>
              )}

              {ticket.status === 'resolved' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTransitionTarget('reopened');
                    setTransitionNote('Issue recurred; reopening issue for further investigation.');
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-1.5" /> Reopen Issue
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Detailed Description */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-content-secondary">
            Initial Description
          </h4>
          <div className="p-4 rounded-md bg-surface-muted text-content-primary text-sm whitespace-pre-wrap border border-surface-border font-sans leading-relaxed">
            {ticket.description}
          </div>
        </div>

        {/* Resolution Box if Resolved */}
        {ticket.status === 'resolved' && ticket.resolution_summary && (
          <div className="p-4 rounded-md bg-status-success-bg border border-status-success text-status-success-text space-y-1">
            <div className="flex items-center gap-2 font-bold text-sm">
              <CheckCircle className="w-4 h-4" />
              <span>Resolution Summary</span>
              {ticket.resolved_at && (
                <span className="font-normal text-xs opacity-90">
                  (Resolved {new Date(ticket.resolved_at).toLocaleString()} by {ticket.resolver_name || 'ICT Officer'})
                </span>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap">{ticket.resolution_summary}</p>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-surface-border text-sm">
          <div>
            <span className="text-xs text-content-secondary block">Department</span>
            <span className="font-semibold text-content-primary flex items-center gap-1.5 mt-0.5">
              <Building className="w-3.5 h-3.5 text-brand-primary" />
              {ticket.department_name || 'Unassigned'}
            </span>
          </div>

          <div>
            <span className="text-xs text-content-secondary block">Computer / Asset</span>
            <span className="font-semibold text-content-primary flex items-center gap-1.5 mt-0.5">
              <Monitor className="w-3.5 h-3.5 text-brand-primary" />
              {ticket.asset_hostname ? `${ticket.asset_hostname} (${ticket.asset_tag || 'No Tag'})` : 'Not Applicable'}
            </span>
          </div>

          <div>
            <span className="text-xs text-content-secondary block">Person Affected</span>
            <span className="font-semibold text-content-primary flex items-center gap-1.5 mt-0.5">
              <User className="w-3.5 h-3.5 text-brand-primary" />
              {ticket.affected_person_name
                ? `${ticket.affected_person_name} (${ticket.affected_staff_id || ''})`
                : 'Not specified'}
            </span>
          </div>

          <div>
            <span className="text-xs text-content-secondary block">Reporting Officer</span>
            <span className="font-semibold text-content-primary flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
              {ticket.creator_name || 'ICT Staff'}
            </span>
          </div>
        </div>
      </Card>

      {/* Status Transition Modal */}
      {transitionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <Card className="w-full max-w-lg p-6 bg-surface border-surface-border space-y-4">
            <h3 className="text-lg font-bold text-content-primary">
              {transitionTarget === 'in_progress' && 'Advance Issue to In Progress'}
              {transitionTarget === 'resolved' && 'Mark Issue as Resolved'}
              {transitionTarget === 'cancelled' && 'Cancel Support Issue'}
              {transitionTarget === 'reopened' && 'Reopen Support Issue'}
            </h3>

            {transitionError && (
              <div className="p-3 rounded bg-status-error-bg border border-status-error text-status-error-text text-sm">
                {transitionError}
              </div>
            )}

            <form onSubmit={handleExecuteTransition} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-content-primary mb-1">
                  Operational Progress Note <span className="text-status-error">*</span>
                </label>
                <textarea
                  rows={3}
                  value={transitionNote}
                  onChange={(e) => setTransitionNote(e.target.value)}
                  placeholder="Explain actions taken, diagnostics performed, or reasons for this status update..."
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary text-sm"
                />
              </div>

              {transitionTarget === 'resolved' && (
                <div>
                  <label className="block text-sm font-medium text-content-primary mb-1">
                    Resolution Summary <span className="text-status-error">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={resolutionSummary}
                    onChange={(e) => setResolutionSummary(e.target.value)}
                    placeholder="Provide a permanent record of the solution applied (e.g. replaced patch cord, configured static DNS)..."
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary text-sm"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setTransitionTarget(null);
                    setTransitionError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={transitionMutation.isPending}
                >
                  {transitionMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Recording…
                    </>
                  ) : (
                    'Confirm Status Update'
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Append Progress Note Box */}
      {isOfficerOrAdmin && ticket.status !== 'resolved' && ticket.status !== 'cancelled' && (
        <Card className="p-6 bg-surface border-surface-border space-y-4">
          <h4 className="text-base font-semibold text-content-primary flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-brand-primary" />
            <span>Add Progress Update to Timeline</span>
          </h4>

          {noteError && (
            <div className="p-3 rounded bg-status-error-bg border border-status-error text-status-error-text text-sm">
              {noteError}
            </div>
          )}

          <form onSubmit={handleAddNote} className="space-y-3">
            <textarea
              rows={2}
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="Record intermediate test results, equipment dispatch notes, or user follow-up..."
              className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-muted text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary text-sm"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={noteMutation.isPending || !quickNote.trim()}
              >
                {noteMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Appending…
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 mr-1.5" /> Append Note
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Append-Only Timeline Section */}
      <Card className="p-6 bg-surface border-surface-border space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border">
          <div>
            <h3 className="text-lg font-bold text-content-primary">
              Issue Progress & Audit History
            </h3>
            <p className="text-xs text-content-secondary">
              Append-only timeline: all operational updates and transitions are strictly preserved
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 bg-surface-muted text-content-secondary rounded border border-surface-border">
            {ticket.events.length} event(s) recorded
          </span>
        </div>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-border">
          {ticket.events.map((event) => (
            <div key={event.id} className="relative group">
              {/* Timeline Marker Dot */}
              <div
                className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-surface ${
                  event.event_type === 'resolved'
                    ? 'bg-status-success'
                    : event.event_type === 'created'
                    ? 'bg-brand-primary'
                    : event.event_type === 'cancelled'
                    ? 'bg-status-error'
                    : 'bg-brand-secondary'
                }`}
              />

              <div className="bg-surface-muted p-4 rounded-lg border border-surface-border space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-content-secondary">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-content-primary">
                      {event.actor_name || event.actor_username || 'System User'}
                    </span>
                    <span className="capitalize px-1.5 py-0.5 rounded bg-surface border border-surface-border text-[10px]">
                      {event.actor_role?.replace('_', ' ') || 'User'}
                    </span>
                  </div>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>

                {/* Transition notice if status changed */}
                {event.previous_status && event.new_status && event.previous_status !== event.new_status && (
                  <div className="text-xs font-medium text-brand-primary flex items-center gap-2">
                    <span>Status changed:</span>
                    <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-surface border border-surface-border">
                      {event.previous_status}
                    </span>
                    <span>&rarr;</span>
                    <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-surface border border-surface-border font-bold">
                      {event.new_status}
                    </span>
                  </div>
                )}

                {/* Note Content */}
                <p className="text-sm text-content-primary whitespace-pre-wrap leading-relaxed">
                  {event.note}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
