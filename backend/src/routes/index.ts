import { Router } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs';
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

// Internal cluster synchronization endpoints for remote physical worker nodes
router.get('/internal/storage/:category/:filename', (req, res) => {
  const category = req.params.category;
  const safeFilename = path.basename(req.params.filename);

  let targetDir = path.resolve(__dirname, '../../../storage', category);
  if (category === 'models') {
    targetDir = path.resolve(__dirname, '../../../ml/models');
  } else if (category === 'sample_data') {
    targetDir = path.resolve(__dirname, '../../../ml/sample_data');
  }

  let filePath = path.join(targetDir, safeFilename);
  if (!fs.existsSync(filePath)) {
    const fallbackPath = path.resolve(__dirname, '../../storage', category, safeFilename);
    if (fs.existsSync(fallbackPath)) {
      filePath = fallbackPath;
    } else {
      res.status(404).json({ success: false, error: `File not found in ${category}: ${safeFilename}` });
      return;
    }
  }
  res.sendFile(filePath);
});

router.post('/internal/storage/:category/:filename', express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
  const category = req.params.category;
  const safeFilename = path.basename(req.params.filename);

  let targetDir = path.resolve(__dirname, '../../../storage', category);
  if (category === 'models') {
    targetDir = path.resolve(__dirname, '../../../ml/models');
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, safeFilename);
  fs.writeFileSync(filePath, req.body);
  res.json({ success: true, message: `Synced ${safeFilename} to master ${category}` });
});

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
