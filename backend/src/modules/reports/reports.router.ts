import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';

export const reportsRouter = Router();

const summaryQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  officer_id: z.coerce.number().int().positive().optional(),
});

// GET /api/v1/reports/summary - Authoritative database-aggregated KPI metrics & chart data
reportsRouter.get('/summary', requireAuth, async (req: Request, res: Response) => {
  const parseResult = summaryQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_QUERY_PARAMS',
        message: 'Invalid query parameters for report summary',
        details: parseResult.error.format(),
      },
    });
  }

  const pool = getPool();
  const { date_from, date_to, department_id, officer_id } = parseResult.data;

  try {
    // Base where clauses for tickets
    const ticketWhere: string[] = ['t.is_draft = FALSE'];
  const ticketParams: any[] = [];

  if (date_from) {
    ticketWhere.push('DATE(t.created_at) >= ?');
    ticketParams.push(date_from);
  }

  if (date_to) {
    ticketWhere.push('DATE(t.created_at) <= ?');
    ticketParams.push(date_to);
  }

  if (department_id) {
    ticketWhere.push('t.department_id = ?');
    ticketParams.push(department_id);
  }

  if (officer_id) {
    ticketWhere.push('t.created_by_id = ?');
    ticketParams.push(officer_id);
  }

  const ticketWhereSql = ticketWhere.length > 0 ? `WHERE ${ticketWhere.join(' AND ')}` : '';

  // 1. KPI Counts
  const kpiSql = `
    SELECT 
      COUNT(*) as total_tickets,
      SUM(CASE WHEN t.status = 'resolved' THEN 1 ELSE 0 END) as resolved_tickets,
      SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) as pending_tickets,
      SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tickets,
      SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_tickets
    FROM tickets t
    ${ticketWhereSql}
  `;
  const [kpiRows]: any = await pool.query(kpiSql, ticketParams);
  const kpi = kpiRows[0] || {};

  const totalTickets = Number(kpi.total_tickets || 0);
  const resolvedTickets = Number(kpi.resolved_tickets || 0);
  const pendingTickets = Number(kpi.pending_tickets || 0);
  const inProgressTickets = Number(kpi.in_progress_tickets || 0);
  const cancelledTickets = Number(kpi.cancelled_tickets || 0);
  const resolutionRate = totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 0;

  // 2. Routine Maintenance Count
  const maintWhere: string[] = [];
  const maintParams: any[] = [];

  if (date_from) {
    maintWhere.push('m.maintenance_date >= ?');
    maintParams.push(date_from);
  }
  if (date_to) {
    maintWhere.push('m.maintenance_date <= ?');
    maintParams.push(date_to);
  }
  if (department_id) {
    maintWhere.push('m.department_id = ?');
    maintParams.push(department_id);
  }
  if (officer_id) {
    maintWhere.push('m.officer_id = ?');
    maintParams.push(officer_id);
  }

  const maintWhereSql = maintWhere.length > 0 ? `WHERE ${maintWhere.join(' AND ')}` : '';
  const maintSql = `
    SELECT COUNT(*) as completed_count
    FROM maintenance_records m
    ${maintWhereSql}
  `;
  const [maintRows]: any = await pool.query(maintSql, maintParams);
  const routineMaintenanceCompleted = Number(maintRows[0]?.completed_count || 0);

  // 3. Status Distribution (Strictly Solid Accessible Colors)
  const statusDistribution = [
    { name: 'Pending', count: pendingTickets, color: '#d97706' }, // Solid Amber
    { name: 'In Progress', count: inProgressTickets, color: '#2563eb' }, // Solid Blue
    { name: 'Resolved', count: resolvedTickets, color: '#059669' }, // Solid Emerald
    { name: 'Cancelled', count: cancelledTickets, color: '#e11d48' }, // Solid Rose
  ];

  // 4. Category Breakdown
  const catSql = `
    SELECT t.category, COUNT(*) as count
    FROM tickets t
    ${ticketWhereSql}
    GROUP BY t.category
    ORDER BY count DESC
  `;
  const [catRows]: any = await pool.query(catSql, ticketParams);
  const categoryLabels: Record<string, string> = {
    hardware: 'Computer / Hardware',
    network: 'Network / Internet',
    printer: 'Printer / Scanner',
    software: 'Software / Application',
    access: 'Account / Access',
    security: 'Security',
    maintenance: 'Maintenance',
    other: 'Other Support',
  };

  // Distinct solid colors for categories - NO GRADIENTS
  const categoryColors: Record<string, string> = {
    hardware: '#3b82f6',
    network: '#6366f1',
    printer: '#ec4899',
    software: '#8b5cf6',
    access: '#14b8a6',
    security: '#f43f5e',
    maintenance: '#f59e0b',
    other: '#64748b',
  };

  const categoryBreakdown = catRows.map((r: any) => ({
    category: r.category,
    label: categoryLabels[r.category] || r.category,
    count: Number(r.count),
    color: categoryColors[r.category] || '#64748b',
  }));

  // 5. Department Breakdown
  const deptSql = `
    SELECT d.id as department_id, d.name, d.code, COUNT(t.id) as ticket_count
    FROM departments d
    LEFT JOIN tickets t ON t.department_id = d.id AND t.is_draft = FALSE
      ${date_from ? 'AND DATE(t.created_at) >= ?' : ''}
      ${date_to ? 'AND DATE(t.created_at) <= ?' : ''}
      ${officer_id ? 'AND t.created_by_id = ?' : ''}
    WHERE d.is_active = TRUE
      ${department_id ? 'AND d.id = ?' : ''}
    GROUP BY d.id, d.name, d.code
    ORDER BY ticket_count DESC
    LIMIT 10
  `;
  const deptQueryParams: any[] = [];
  if (date_from) deptQueryParams.push(date_from);
  if (date_to) deptQueryParams.push(date_to);
  if (officer_id) deptQueryParams.push(officer_id);
  if (department_id) deptQueryParams.push(department_id);

  const [deptRows]: any = await pool.query(deptSql, deptQueryParams);
  const departmentBreakdown = deptRows.map((r: any) => ({
    department_id: r.department_id,
    name: r.name,
    code: r.code,
    ticket_count: Number(r.ticket_count),
  }));

  // 6. Timeline Trend (Daily Activity)
  const trendSql = `
    SELECT 
      DATE(t.created_at) as date,
      COUNT(*) as created_count,
      SUM(CASE WHEN t.status = 'resolved' THEN 1 ELSE 0 END) as resolved_count
    FROM tickets t
    ${ticketWhereSql}
    GROUP BY DATE(t.created_at)
    ORDER BY date ASC
    LIMIT 31
  `;
  const [trendRows]: any = await pool.query(trendSql, ticketParams);
  const timelineTrend = trendRows.map((r: any) => ({
    date: r.date ? new Date(r.date).toISOString().slice(0, 10) : '',
    created: Number(r.created_count),
    resolved: Number(r.resolved_count),
  }));

  // 7. Officer Workload & Resolution Metrics
  const officerSql = `
    SELECT 
      u.id as officer_id,
      u.full_name,
      u.username,
      COUNT(t.id) as total_handled,
      SUM(CASE WHEN t.status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
      SUM(CASE WHEN t.status IN ('pending', 'in_progress') THEN 1 ELSE 0 END) as active_count
    FROM app_users u
    INNER JOIN tickets t ON t.created_by_id = u.id AND t.is_draft = FALSE
      ${date_from ? 'AND DATE(t.created_at) >= ?' : ''}
      ${date_to ? 'AND DATE(t.created_at) <= ?' : ''}
      ${department_id ? 'AND t.department_id = ?' : ''}
    WHERE u.role IN ('ict_officer', 'administrator')
      ${officer_id ? 'AND u.id = ?' : ''}
    GROUP BY u.id, u.full_name, u.username
    ORDER BY total_handled DESC
  `;
  const officerQueryParams: any[] = [];
  if (date_from) officerQueryParams.push(date_from);
  if (date_to) officerQueryParams.push(date_to);
  if (department_id) officerQueryParams.push(department_id);
  if (officer_id) officerQueryParams.push(officer_id);

  const [officerRows]: any = await pool.query(officerSql, officerQueryParams);
  const officerWorkload = officerRows.map((r: any) => ({
    officer_id: r.officer_id,
    full_name: r.full_name,
    username: r.username,
    total_handled: Number(r.total_handled),
    resolved_count: Number(r.resolved_count),
    active_count: Number(r.active_count),
  }));

  res.json({
    success: true,
    data: {
      metrics: {
        total_tickets: totalTickets,
        resolved_tickets: resolvedTickets,
        pending_tickets: pendingTickets,
        in_progress_tickets: inProgressTickets,
        cancelled_tickets: cancelledTickets,
        resolution_rate: resolutionRate,
        routine_maintenance_completed: routineMaintenanceCompleted,
      },
      status_distribution: statusDistribution,
      category_breakdown: categoryBreakdown,
      department_breakdown: departmentBreakdown,
      timeline_trend: timelineTrend,
      officer_workload: officerWorkload,
      filters_applied: {
        date_from: date_from || null,
        date_to: date_to || null,
        department_id: department_id || null,
        officer_id: officer_id || null,
      },
    },
  });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'REPORT_QUERY_ERROR', message: err.message },
    });
  }
});

// GET /api/v1/reports/daily-export - Formatted daily report dataset
reportsRouter.get('/daily-export', requireAuth, async (req: Request, res: Response) => {
  const pool = getPool();
  const targetDate = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  // Tickets on that day
  const [ticketRows]: any = await pool.query(
    `SELECT t.id, t.ticket_number, t.title, t.category, t.priority, t.status,
            t.resolution_summary, t.created_at, t.resolved_at,
            d.name as department_name, a.hostname as asset_hostname,
            p.full_name as affected_person_name,
            u_creator.full_name as officer_name
     FROM tickets t
     LEFT JOIN departments d ON t.department_id = d.id
     LEFT JOIN assets a ON t.asset_id = a.id
     LEFT JOIN directory_people p ON t.affected_person_id = p.id
     LEFT JOIN app_users u_creator ON t.created_by_id = u_creator.id
     WHERE DATE(t.created_at) = ? AND t.is_draft = FALSE
     ORDER BY t.created_at ASC`,
    [targetDate]
  );

  // Maintenance on that day
  const [maintRows]: any = await pool.query(
    `SELECT m.id, m.maintenance_type, m.work_performed, m.result, m.notes,
            d.name as department_name, a.hostname as asset_hostname,
            u.full_name as officer_name
     FROM maintenance_records m
     LEFT JOIN departments d ON m.department_id = d.id
     LEFT JOIN assets a ON m.asset_id = a.id
     LEFT JOIN app_users u ON m.officer_id = u.id
     WHERE m.maintenance_date = ?
     ORDER BY m.id ASC`,
    [targetDate]
  );

  res.json({
    success: true,
    data: {
      report_date: targetDate,
      summary: {
        total_tickets: ticketRows.length,
        resolved_count: ticketRows.filter((t: any) => t.status === 'resolved').length,
        pending_count: ticketRows.filter((t: any) => t.status === 'pending').length,
        in_progress_count: ticketRows.filter((t: any) => t.status === 'in_progress').length,
        maintenance_count: maintRows.length,
      },
      tickets: ticketRows,
      maintenance_activities: maintRows,
    },
  });
});
