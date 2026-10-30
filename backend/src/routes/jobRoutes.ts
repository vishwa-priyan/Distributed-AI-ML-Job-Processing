import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { authenticate, checkJobOwnership } from '../middleware/auth.js';
import {
  createJob,
  listJobs,
  getJobById,
  cancelJob,
  retryJob,
  getJobLogs,
  getJobResults,
  downloadArtifact
} from '../controllers/jobController.js';

const router = Router();

// Configure storage with safe naming and folder auto-creation
fs.mkdirSync(env.STORAGE_UPLOADS_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, env.STORAGE_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const sanitizedExt = path.extname(file.originalname).toLowerCase();
    cb(null, `dataset-${uniqueSuffix}${sanitizedExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.json', '.txt', '.zip'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Disallowed file type. Only CSV, JSON, TXT, or ZIP archives allowed.'));
    }
  }
});

router.use(authenticate);

router.post('/', upload.single('dataset'), createJob);
router.get('/', listJobs);
router.get('/:id', checkJobOwnership, getJobById);
router.post('/:id/cancel', checkJobOwnership, cancelJob);
router.post('/:id/retry', checkJobOwnership, retryJob);
router.get('/:id/logs', checkJobOwnership, getJobLogs);
router.get('/:id/results', checkJobOwnership, getJobResults);
router.get('/:id/artifacts', checkJobOwnership, downloadArtifact);

export default router;
