import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  listUsers,
  getSystemHealth,
  getSchedulingPolicies,
  updateSchedulingPolicies
} from '../controllers/adminController.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('admin'));

router.get('/users', listUsers);
router.get('/system-health', getSystemHealth);
router.get('/scheduling-policies', getSchedulingPolicies);
router.put('/scheduling-policies', updateSchedulingPolicies);

export default router;
