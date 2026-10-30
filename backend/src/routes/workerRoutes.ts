import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  listWorkers,
  getWorkerById,
  getWorkerMetrics,
  toggleDrainWorker
} from '../controllers/workerController.js';

const router = Router();

router.use(authenticate);

router.get('/', listWorkers);
router.get('/:id', getWorkerById);
router.get('/:id/metrics', getWorkerMetrics);
router.post('/:id/drain', requireRole('admin'), toggleDrainWorker);

export default router;
