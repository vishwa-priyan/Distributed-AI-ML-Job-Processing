import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getOverviewStats,
  getSchedulingAnalytics,
  getJobsAnalytics
} from '../controllers/analyticsController.js';

const router = Router();

router.use(authenticate);

router.get('/overview', getOverviewStats);
router.get('/scheduling', getSchedulingAnalytics);
router.get('/jobs', getJobsAnalytics);

export default router;
