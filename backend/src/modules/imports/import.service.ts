import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { getPool } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';
import {
  ImportEntityType,
  DuplicatePolicy,
  ParsedRow,
  ImportPreviewResult,
  ImportCommitResult,
  inventoryRowSchema,
  directoryRowSchema,
  issuesRowSchema,
} from './import.types.js';

// Prevent CSV formula injection by prepending a single quote if the field starts with =, +, -, @
function sanitizeCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export class ImportService {
  // 1. Generate Downloadable CSV / XLSX Templates
  static async generateTemplate(entityType: ImportEntityType, format: 'csv' | 'xlsx'): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    let headers: string[] = [];
    let sampleRows: string[][] = [];

    if (entityType === 'inventory') {
      headers = ['hostname', 'asset_tag', 'device_type', 'department', 'assigned_person', 'location', 'operating_system', 'ip_address', 'notes'];
      sampleRows = [
        ['PC-FIN-001', 'AST-0091', 'Desktop', 'Finance', 'EMP001', 'Block B Floor 2', 'Windows 11 Pro', '192.168.1.101', 'Workstation for Accounts'],
        ['LPT-HR-002', 'AST-0092', 'Laptop', 'Human Resources', 'EMP002', 'Block A Floor 1', 'Windows 11 Pro', '192.168.1.102', 'HR Executive Laptop'],
      ];
    } else if (entityType === 'directory') {
      headers = ['staff_id', 'full_name', 'email', 'phone', 'department'];
      sampleRows = [
        ['EMP001', 'Alice Wanjiku', 'alice.wanjiku@agency.lan', '+254 700 111 222', 'Finance'],
        ['EMP002', 'Bob Kiprono', 'bob.kiprono@agency.lan', '+254 700 333 444', 'Human Resources'],
      ];
    } else {
      // issues
      headers = ['title', 'description', 'category', 'priority', 'status', 'department', 'computer_hostname', 'staff_id', 'resolution_summary'];
      sampleRows = [
        ['Finance LAN Switch Port Failure', 'Intermittent disconnects on Floor 2 LAN switch', 'network', 'high', 'resolved', 'Finance', 'PC-FIN-001', 'EMP001', 'Replaced faulty patch lead and re-terminated port'],
        ['HP LaserJet Toner Low', 'Toner warning indicator on department multi-function printer', 'printer', 'normal', 'pending', 'Human Resources', '', 'EMP002', ''],
      ];
    }

    if (format === 'csv') {
      const csvLines = [
        headers.map(sanitizeCsvValue).join(','),
        ...sampleRows.map((r) => r.map(sanitizeCsvValue).join(',')),
      ];
      const buffer = Buffer.from(csvLines.join('\r\n'), 'utf-8');
      return {
        buffer,
        contentType: 'text/csv; charset=utf-8',
        filename: `${entityType}_template.csv`,
      };
    }

    // XLSX generation via ExcelJS
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ICT Support System';
    const worksheet = workbook.addWorksheet(`${entityType.toUpperCase()} Template`);

    worksheet.columns = headers.map((h) => ({
      header: h,
      key: h,
      width: Math.max(h.length + 6, 18),
    }));

    // Style header row (solid background)
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }, // Brand blue
    };
    headerRow.commit();

    sampleRows.forEach((row) => {
      worksheet.addRow(row);
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${entityType}_template.xlsx`,
    };
  }

  // 2. Parse Raw Upload Buffer into Row Records
  static async parseBuffer(buffer: Buffer, originalFilename: string): Promise<{ headers: string[]; rawRows: Record<string, string>[] }> {
    const ext = originalFilename.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('Spreadsheet file contains no worksheets.');
      }

      const headers: string[] = [];
      const rawRows: Record<string, string>[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell) => {
            headers.push(String(cell.value || '').trim().toLowerCase().replace(/[\s\-_]+/g, '_'));
          });
        } else {
          const rowObj: Record<string, string> = {};
          let hasContent = false;
          headers.forEach((h, idx) => {
            const cellValue = row.getCell(idx + 1).value;
            let str = '';
            if (cellValue !== null && cellValue !== undefined) {
              if (typeof cellValue === 'object' && 'text' in cellValue) {
                str = String((cellValue as any).text).trim();
              } else {
                str = String(cellValue).trim();
              }
            }
            if (str) hasContent = true;
            rowObj[h] = str;
          });
          if (hasContent) {
            rawRows.push(rowObj);
          }
        }
      });

      return { headers, rawRows };
    }

    // Default to CSV
    const textContent = buffer.toString('utf-8');
    const records = parseCsv(textContent, {
      columns: (headerList: string[]) =>
        headerList.map((h) => h.trim().toLowerCase().replace(/[\s\-_]+/g, '_')),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];

    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    return { headers, rawRows: records };
  }

  // 3. Process Preview and Detect Duplicate / Invalid Rows
  static async previewImport(
    entityType: ImportEntityType,
    fileName: string,
    buffer: Buffer,
    userId: number
  ): Promise<ImportPreviewResult> {
    const pool = getPool();
    const { headers, rawRows } = await this.parseBuffer(buffer, fileName);

    if (rawRows.length === 0) {
      throw new Error('The uploaded file contains no data rows.');
    }

    if (rawRows.length > 5000) {
      throw new Error('Batch import limit exceeded. Maximum allowed rows per import is 5,000.');
    }

    // Pre-load reference lookup tables for relational resolution
    const [deptRows] = await pool.query<any[]>('SELECT id, name, code FROM departments WHERE is_active = TRUE');
    const deptByNameOrCode = new Map<string, number>();
    deptRows.forEach((d) => {
      deptByNameOrCode.set(d.name.toLowerCase().trim(), d.id);
      deptByNameOrCode.set(d.code.toLowerCase().trim(), d.id);
    });

    const [peopleRows] = await pool.query<any[]>('SELECT id, staff_id, full_name, department_id FROM directory_people');
    const peopleByStaffId = new Map<string, { id: number; full_name: string; department_id: number | null }>();
    const peopleByName = new Map<string, { id: number; staff_id: string; department_id: number | null }>();
    peopleRows.forEach((p) => {
      peopleByStaffId.set(p.staff_id.toLowerCase().trim(), p);
      peopleByName.set(p.full_name.toLowerCase().trim(), p);
    });

    const [assetRows] = await pool.query<any[]>('SELECT id, hostname, asset_tag, department_id FROM assets');
    const assetByHostname = new Map<string, { id: number; asset_tag: string | null; department_id: number | null }>();
    const assetByTag = new Map<string, { id: number; hostname: string }>();
    assetRows.forEach((a) => {
      assetByHostname.set(a.hostname.toLowerCase().trim(), a);
      if (a.asset_tag) assetByTag.set(a.asset_tag.toLowerCase().trim(), a);
    });

    // In-file duplicate trackers
    const seenHostnames = new Set<string>();
    const seenAssetTags = new Set<string>();
    const seenStaffIds = new Set<string>();

    const parsedRows: ParsedRow[] = [];
    let validCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // Row number in spreadsheet (1-based, accounting for header)
      const errors: string[] = [];
      let duplicateMatch: ParsedRow['duplicateMatch'] | undefined;
      let status: ParsedRow['status'] = 'valid';

      if (entityType === 'inventory') {
        const hostnameKey = Object.keys(row).find((k) => k === 'hostname' || k === 'computer_name' || k === 'computer') || 'hostname';
        const tagKey = Object.keys(row).find((k) => k === 'asset_tag' || k === 'tag') || 'asset_tag';
        const typeKey = Object.keys(row).find((k) => k === 'device_type' || k === 'type') || 'device_type';
        const deptKey = Object.keys(row).find((k) => k === 'department' || k === 'dept') || 'department';
        const personKey = Object.keys(row).find((k) => k === 'assigned_person' || k === 'user' || k === 'person') || 'assigned_person';

        const rowData = {
          hostname: row[hostnameKey] || '',
          asset_tag: row[tagKey] || null,
          device_type: row[typeKey] || 'Desktop',
          department: row[deptKey] || null,
          assigned_person: row[personKey] || null,
          location: row['location'] || null,
          operating_system: row['operating_system'] || row['os'] || null,
          ip_address: row['ip_address'] || row['ip'] || null,
          notes: row['notes'] || null,
        };

        const result = inventoryRowSchema.safeParse(rowData);
        if (!result.success) {
          result.error.errors.forEach((e) => errors.push(`${e.path.join('.')}: ${e.message}`));
          status = 'invalid';
        } else {
          const normHostname = rowData.hostname.toLowerCase().trim();
          const normTag = rowData.asset_tag ? rowData.asset_tag.toLowerCase().trim() : null;

          // Check in-file duplicate
          if (seenHostnames.has(normHostname)) {
            errors.push(`Duplicate hostname '${rowData.hostname}' within uploaded file.`);
            status = 'duplicate';
            duplicateMatch = { id: 0, key: 'hostname', value: rowData.hostname };
          } else if (normTag && seenAssetTags.has(normTag)) {
            errors.push(`Duplicate asset tag '${rowData.asset_tag}' within uploaded file.`);
            status = 'duplicate';
            duplicateMatch = { id: 0, key: 'asset_tag', value: rowData.asset_tag! };
          } else if (assetByHostname.has(normHostname)) {
            // Check DB duplicate
            const existing = assetByHostname.get(normHostname)!;
            status = 'duplicate';
            duplicateMatch = { id: existing.id, key: 'hostname', value: rowData.hostname };
          } else if (normTag && assetByTag.has(normTag)) {
            const existing = assetByTag.get(normTag)!;
            status = 'duplicate';
            duplicateMatch = { id: existing.id, key: 'asset_tag', value: rowData.asset_tag! };
          }

          seenHostnames.add(normHostname);
          if (normTag) seenAssetTags.add(normTag);
        }

        parsedRows.push({
          rowNumber: rowNum,
          raw: row,
          data: rowData,
          status,
          errors,
          duplicateMatch,
        });
      } else if (entityType === 'directory') {
        const staffKey = Object.keys(row).find((k) => k === 'staff_id' || k === 'employee_id' || k === 'id') || 'staff_id';
        const nameKey = Object.keys(row).find((k) => k === 'full_name' || k === 'name') || 'full_name';
        const emailKey = Object.keys(row).find((k) => k === 'email' || k === 'e_mail') || 'email';
        const phoneKey = Object.keys(row).find((k) => k === 'phone' || k === 'telephone') || 'phone';
        const deptKey = Object.keys(row).find((k) => k === 'department' || k === 'dept') || 'department';

        const rowData = {
          staff_id: row[staffKey] || '',
          full_name: row[nameKey] || '',
          email: row[emailKey] || null,
          phone: row[phoneKey] || null,
          department: row[deptKey] || null,
        };

        const result = directoryRowSchema.safeParse(rowData);
        if (!result.success) {
          result.error.errors.forEach((e) => errors.push(`${e.path.join('.')}: ${e.message}`));
          status = 'invalid';
        } else {
          const normStaffId = rowData.staff_id.toLowerCase().trim();

          if (seenStaffIds.has(normStaffId)) {
            errors.push(`Duplicate staff ID '${rowData.staff_id}' within uploaded file.`);
            status = 'duplicate';
            duplicateMatch = { id: 0, key: 'staff_id', value: rowData.staff_id };
          } else if (peopleByStaffId.has(normStaffId)) {
            const existing = peopleByStaffId.get(normStaffId)!;
            status = 'duplicate';
            duplicateMatch = { id: existing.id, key: 'staff_id', value: rowData.staff_id };
          }

          seenStaffIds.add(normStaffId);
        }

        parsedRows.push({
          rowNumber: rowNum,
          raw: row,
          data: rowData,
          status,
          errors,
          duplicateMatch,
        });
      } else {
        // issues
        const titleKey = Object.keys(row).find((k) => k === 'title' || k === 'issue_title' || k === 'subject') || 'title';
        const descKey = Object.keys(row).find((k) => k === 'description' || k === 'details') || 'description';
        const catKey = Object.keys(row).find((k) => k === 'category') || 'category';
        const prioKey = Object.keys(row).find((k) => k === 'priority') || 'priority';
        const statusKey = Object.keys(row).find((k) => k === 'status') || 'status';
        const deptKey = Object.keys(row).find((k) => k === 'department' || k === 'dept') || 'department';
        const compKey = Object.keys(row).find((k) => k === 'computer_hostname' || k === 'hostname' || k === 'computer') || 'computer_hostname';
        const staffKey = Object.keys(row).find((k) => k === 'staff_id' || k === 'affected_person') || 'staff_id';
        const resKey = Object.keys(row).find((k) => k === 'resolution_summary' || k === 'resolution') || 'resolution_summary';

        const rowData = {
          title: row[titleKey] || '',
          description: row[descKey] || '',
          category: (row[catKey] || 'other').toLowerCase(),
          priority: (row[prioKey] || 'normal').toLowerCase(),
          status: (row[statusKey] || 'pending').toLowerCase(),
          department: row[deptKey] || null,
          computer_hostname: row[compKey] || null,
          staff_id: row[staffKey] || null,
          resolution_summary: row[resKey] || null,
        };

        const result = issuesRowSchema.safeParse(rowData);
        if (!result.success) {
          result.error.errors.forEach((e) => errors.push(`${e.path.join('.')}: ${e.message}`));
          status = 'invalid';
        }

        parsedRows.push({
          rowNumber: rowNum,
          raw: row,
          data: rowData,
          status,
          errors,
          duplicateMatch,
        });
      }

      if (status === 'valid') validCount++;
      else if (status === 'duplicate') duplicateCount++;
      else errorCount++;
    }

    // Persist preview job in import_jobs table
    const [insertResult] = await pool.query<any>(
      `INSERT INTO import_jobs (
        file_name, entity_type, status, total_rows, created_count, 
        updated_count, skipped_count, failed_count, imported_by_id, 
        staged_data, duplicate_policy
      ) VALUES (?, ?, 'previewing', ?, 0, 0, 0, 0, ?, ?, 'skip')`,
      [fileName, entityType, parsedRows.length, userId, JSON.stringify(parsedRows)]
    );

    const jobId = insertResult.insertId;

    return {
      jobId,
      fileName,
      entityType,
      totalRows: parsedRows.length,
      validCount,
      duplicateCount,
      errorCount,
      headers,
      previewRows: parsedRows.slice(0, 30), // First 30 rows for responsive preview
      duplicatePolicy: 'skip',
    };
  }

  // 4. Commit Validated & Staged Rows into MySQL Transactionally
  static async commitImport(
    jobId: number,
    duplicatePolicy: DuplicatePolicy,
    userId: number
  ): Promise<ImportCommitResult> {
    const pool = getPool();

    // 1. Fetch staged job
    const [jobs] = await pool.query<any[]>(
      'SELECT id, file_name, entity_type, status, staged_data FROM import_jobs WHERE id = ?',
      [jobId]
    );

    if (jobs.length === 0) {
      throw new Error(`Import job #${jobId} not found.`);
    }

    const job = jobs[0];
    if (job.status === 'committed') {
      throw new Error(`Import job #${jobId} has already been committed.`);
    }

    const rows: ParsedRow[] = typeof job.staged_data === 'string' ? JSON.parse(job.staged_data) : job.staged_data;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`No staged rows found for import job #${jobId}.`);
    }

    // 2. Pre-load department and directory caches for foreign keys
    const [deptRows] = await pool.query<any[]>('SELECT id, name, code FROM departments');
    const deptMap = new Map<string, number>();
    deptRows.forEach((d) => {
      deptMap.set(d.name.toLowerCase().trim(), d.id);
      deptMap.set(d.code.toLowerCase().trim(), d.id);
    });

    const [peopleRows] = await pool.query<any[]>('SELECT id, staff_id, full_name, department_id FROM directory_people');
    const peopleMap = new Map<string, number>();
    peopleRows.forEach((p) => {
      peopleMap.set(p.staff_id.toLowerCase().trim(), p.id);
      peopleMap.set(p.full_name.toLowerCase().trim(), p.id);
    });

    const [assetRows] = await pool.query<any[]>('SELECT id, hostname, asset_tag FROM assets');
    const assetMap = new Map<string, number>();
    assetRows.forEach((a) => {
      assetMap.set(a.hostname.toLowerCase().trim(), a.id);
      if (a.asset_tag) assetMap.set(a.asset_tag.toLowerCase().trim(), a.id);
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      for (const row of rows) {
        if (row.status === 'invalid') {
          failedCount++;
          continue;
        }

        const isDuplicate = row.status === 'duplicate';

        if (isDuplicate && duplicatePolicy === 'skip') {
          skippedCount++;
          continue;
        }

        if (job.entity_type === 'inventory') {
          const deptId = row.data.department ? deptMap.get(row.data.department.toLowerCase().trim()) || null : null;
          const assignedId = row.data.assigned_person ? peopleMap.get(row.data.assigned_person.toLowerCase().trim()) || null : null;

          if (isDuplicate && duplicatePolicy === 'update' && row.duplicateMatch?.id) {
            await connection.query(
              `UPDATE assets 
               SET asset_tag = COALESCE(?, asset_tag),
                   device_type = COALESCE(?, device_type),
                   department_id = COALESCE(?, department_id),
                   assigned_person_id = COALESCE(?, assigned_person_id),
                   location = COALESCE(?, location),
                   operating_system = COALESCE(?, operating_system),
                   ip_address = COALESCE(?, ip_address),
                   notes = COALESCE(?, notes),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [
                row.data.asset_tag || null,
                row.data.device_type,
                deptId,
                assignedId,
                row.data.location || null,
                row.data.operating_system || null,
                row.data.ip_address || null,
                row.data.notes || null,
                row.duplicateMatch.id,
              ]
            );
            updatedCount++;
          } else {
            await connection.query(
              `INSERT INTO assets (
                hostname, asset_tag, device_type, department_id, 
                assigned_person_id, location, operating_system, ip_address, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.data.hostname,
                row.data.asset_tag || null,
                row.data.device_type || 'Desktop',
                deptId,
                assignedId,
                row.data.location || null,
                row.data.operating_system || null,
                row.data.ip_address || null,
                row.data.notes || null,
              ]
            );
            createdCount++;
          }
        } else if (job.entity_type === 'directory') {
          const deptId = row.data.department ? deptMap.get(row.data.department.toLowerCase().trim()) || null : null;

          if (isDuplicate && duplicatePolicy === 'update' && row.duplicateMatch?.id) {
            await connection.query(
              `UPDATE directory_people 
               SET full_name = ?,
                   email = COALESCE(?, email),
                   phone = COALESCE(?, phone),
                   department_id = COALESCE(?, department_id),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [
                row.data.full_name,
                row.data.email || null,
                row.data.phone || null,
                deptId,
                row.duplicateMatch.id,
              ]
            );
            updatedCount++;
          } else {
            await connection.query(
              `INSERT INTO directory_people (staff_id, full_name, email, phone, department_id)
               VALUES (?, ?, ?, ?, ?)`,
              [
                row.data.staff_id,
                row.data.full_name,
                row.data.email || null,
                row.data.phone || null,
                deptId,
              ]
            );
            createdCount++;
          }
        } else if (job.entity_type === 'issues') {
          const deptId = row.data.department ? deptMap.get(row.data.department.toLowerCase().trim()) || null : null;
          const assetId = row.data.computer_hostname ? assetMap.get(row.data.computer_hostname.toLowerCase().trim()) || null : null;
          const personId = row.data.staff_id ? peopleMap.get(row.data.staff_id.toLowerCase().trim()) || null : null;

          // Generate reference number: TKT-YYYYMMDD-XXXX
          const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const randomSuffix = Math.floor(1000 + Math.random() * 9000);
          const ticketNumber = `TKT-${todayStr}-${randomSuffix}`;

          const [ticketRes] = await connection.query<any>(
            `INSERT INTO tickets (
              ticket_number, title, description, category, priority, status,
              department_id, asset_id, affected_person_id, created_by_id,
              resolution_summary, resolved_at, resolved_by_id, is_draft
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
            [
              ticketNumber,
              row.data.title,
              row.data.description,
              row.data.category,
              row.data.priority,
              row.data.status,
              deptId,
              assetId,
              personId,
              userId,
              row.data.resolution_summary || null,
              row.data.status === 'resolved' ? new Date() : null,
              row.data.status === 'resolved' ? userId : null,
            ]
          );

          const newTicketId = ticketRes.insertId;

          // Insert append-only timeline event
          await connection.query(
            `INSERT INTO ticket_events (ticket_id, actor_id, event_type, note)
             VALUES (?, ?, 'created', ?)`,
            [newTicketId, userId, 'Issue imported from batch file']
          );

          createdCount++;
        }
      }

      // 3. Record Audit Log
      await connection.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
         VALUES (?, 'IMPORT_COMMITTED', 'import_job', ?, ?)`,
        [
          userId,
          String(jobId),
          JSON.stringify({
            file_name: job.file_name,
            entity_type: job.entity_type,
            duplicate_policy: duplicatePolicy,
            created_count: createdCount,
            updated_count: updatedCount,
            skipped_count: skippedCount,
            failed_count: failedCount,
          }),
        ]
      );

      // 4. Update Import Job status
      const completedAt = new Date().toISOString();
      await connection.query(
        `UPDATE import_jobs 
         SET status = 'committed',
             duplicate_policy = ?,
             created_count = ?,
             updated_count = ?,
             skipped_count = ?,
             failed_count = ?,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [duplicatePolicy, createdCount, updatedCount, skippedCount, failedCount, jobId]
      );

      await connection.commit();

      logger.info(
        { jobId, createdCount, updatedCount, skippedCount, failedCount },
        'Batch import committed successfully'
      );

      return {
        jobId,
        status: 'committed',
        totalRows: rows.length,
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        completedAt,
      };
    } catch (err) {
      await connection.rollback();
      logger.error({ jobId, err }, 'Failed to commit batch import; transaction rolled back');
      throw err;
    } finally {
      connection.release();
    }
  }

  // 5. Retrieve Import History
  static async listJobs(page = 1, limit = 20): Promise<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const pool = getPool();
    const offset = (page - 1) * limit;

    const [countRows] = await pool.query<any[]>('SELECT COUNT(*) as total FROM import_jobs');
    const total = countRows[0].total;

    const [rows] = await pool.query<any[]>(
      `SELECT j.id, j.file_name, j.entity_type, j.status, j.total_rows, 
              j.created_count, j.updated_count, j.skipped_count, j.failed_count,
              j.duplicate_policy, j.created_at, j.completed_at,
              u.full_name as imported_by_name, u.username as imported_by_username
       FROM import_jobs j
       LEFT JOIN app_users u ON j.imported_by_id = u.id
       ORDER BY j.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
