import { z } from 'zod';

export type ImportEntityType = 'inventory' | 'directory' | 'issues';
export type DuplicatePolicy = 'skip' | 'update';

export interface ParsedRow {
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

export interface ImportPreviewResult {
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

export interface ImportCommitResult {
  jobId: number;
  status: 'committed';
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  completedAt: string;
}

// 1. Inventory Row Validation Schema
export const inventoryRowSchema = z.object({
  hostname: z
    .string({ required_error: 'Hostname is required' })
    .trim()
    .min(2, 'Hostname must be at least 2 characters')
    .max(100, 'Hostname must not exceed 100 characters'),
  asset_tag: z.string().trim().max(100).optional().nullable(),
  device_type: z.string().trim().default('Desktop'),
  department: z.string().trim().optional().nullable(),
  assigned_person: z.string().trim().optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  operating_system: z.string().trim().max(100).optional().nullable(),
  ip_address: z.string().trim().max(45).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

// 2. Directory Row Validation Schema
export const directoryRowSchema = z.object({
  staff_id: z
    .string({ required_error: 'Staff ID is required' })
    .trim()
    .min(1, 'Staff ID is required')
    .max(50, 'Staff ID must not exceed 50 characters'),
  full_name: z
    .string({ required_error: 'Full name is required' })
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(150, 'Full name must not exceed 150 characters'),
  email: z.string().trim().email('Invalid email address').optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(50).optional().nullable(),
  department: z.string().trim().optional().nullable(),
});

// 3. Issues Row Validation Schema
export const issuesRowSchema = z.object({
  title: z
    .string({ required_error: 'Issue title is required' })
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(255, 'Title must not exceed 255 characters'),
  description: z
    .string({ required_error: 'Description is required' })
    .trim()
    .min(5, 'Description must be at least 5 characters'),
  category: z
    .enum(['hardware', 'network', 'printer', 'software', 'access', 'security', 'maintenance', 'other'])
    .default('other'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  status: z.enum(['pending', 'in_progress', 'resolved', 'cancelled']).default('pending'),
  department: z.string().trim().optional().nullable(),
  computer_hostname: z.string().trim().optional().nullable(),
  staff_id: z.string().trim().optional().nullable(),
  resolution_summary: z.string().trim().optional().nullable(),
});
