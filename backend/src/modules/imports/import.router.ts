import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireRole } from '../../middleware/auth.js';
import { ImportService } from './import.service.js';
import { ImportEntityType, DuplicatePolicy } from './import.types.js';
import { config } from '../../config/index.js';

export const importRouter = Router();

// Multer memory storage configuration with file size limit and mime/extension filter
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.UPLOAD_MAX_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const originalName = file.originalname.toLowerCase();
    const allowedExtensions = ['.csv', '.tsv', '.xlsx', '.xls'];
    const hasValidExt = allowedExtensions.some((ext) => originalName.endsWith(ext));

    if (!hasValidExt) {
      return cb(new Error('Invalid file format. Only CSV (.csv, .tsv) and Excel (.xlsx, .xls) files are supported.'));
    }
    cb(null, true);
  },
});

// Middleware to handle Multer upload errors gracefully
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File exceeds maximum allowed upload size of ${config.UPLOAD_MAX_MB}MB.`,
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: err.message },
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FILE', message: err.message },
      });
    }
    next();
  });
}

// 1. Download CSV / Excel Import Template
importRouter.get(
  '/templates/:type',
  requireRole(['ict_officer', 'administrator']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = req.params.type as ImportEntityType;
      if (!['inventory', 'directory', 'issues'].includes(type)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ENTITY_TYPE', message: "Entity type must be 'inventory', 'directory', or 'issues'." },
        });
      }

      const format = (req.query.format as string)?.toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
      const template = await ImportService.generateTemplate(type, format);

      res.setHeader('Content-Type', template.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
      res.send(template.buffer);
    } catch (err) {
      next(err);
    }
  }
);

// 2. Upload File and Preview Parsed Rows with Duplicate & Error Checks
importRouter.post(
  '/preview',
  requireRole(['ict_officer', 'administrator']),
  handleUpload,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'No file was uploaded. Please attach a CSV or Excel file.' },
        });
      }

      const entityType = req.body.entity_type as ImportEntityType;
      if (!['inventory', 'directory', 'issues'].includes(entityType)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ENTITY_TYPE', message: "entity_type must be 'inventory', 'directory', or 'issues'." },
        });
      }

      const preview = await ImportService.previewImport(
        entityType,
        req.file.originalname,
        req.file.buffer,
        req.user!.id
      );

      res.json({
        success: true,
        data: preview,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { code: 'PARSE_FAILED', message: err.message },
      });
    }
  }
);

// 3. Commit Staged Import Job
importRouter.post(
  '/commit',
  requireRole(['ict_officer', 'administrator']),
  async (req: Request, res: Response) => {
    try {
      const { jobId, duplicate_policy } = req.body;

      if (!jobId || typeof jobId !== 'number') {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_JOB_ID', message: 'Valid jobId is required.' },
        });
      }

      const policy: DuplicatePolicy = duplicate_policy === 'update' ? 'update' : 'skip';
      const result = await ImportService.commitImport(jobId, policy, req.user!.id);

      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { code: 'COMMIT_FAILED', message: err.message },
      });
    }
  }
);

// 4. Retrieve Import History & Audit Jobs
importRouter.get(
  '/jobs',
  requireRole(['ict_officer', 'administrator']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

      const result = await ImportService.listJobs(page, limit);
      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
);
