import { Router } from 'express';
import authRoutes from './authRoutes.js';
import jobRoutes from './jobRoutes.js';
import workerRoutes from './workerRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import adminRoutes from './adminRoutes.js';
import { query } from '../config/db.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/jobs', jobRoutes);
router.use('/workers', workerRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/admin', adminRoutes);

// Public model registry query
router.get('/models', async (req, res, next) => {
  try {
    const modelsRes = await query('SELECT * FROM model_registry WHERE is_active = TRUE ORDER BY model_name ASC');
    res.json({ success: true, data: modelsRes.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
