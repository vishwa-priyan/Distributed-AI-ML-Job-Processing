import { Request, Response, NextFunction } from 'express';
import { query } from '../config/db.js';
import { redisClient } from '../config/redis.js';
import { broadcastWorkerUpdate } from '../sockets/socketManager.js';

export async function listWorkers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dbRes = await query(`
      SELECT id, name, hostname, status, max_concurrency, 
             cpu_cores, total_ram_mb, has_gpu, gpu_name, 
             supported_job_types, drain_mode, last_heartbeat_at, registered_at
      FROM workers
      ORDER BY registered_at ASC
    `);

    const workers = [];

    for (const w of dbRes.rows) {
      // Fetch live Redis heartbeat
      let activeTasks = 0;
      let cpuPercent = 0;
      let availableRamMb = w.total_ram_mb;
      let isLive = false;

      try {
        const hb = await redisClient.hGetAll(`worker:${w.id}:heartbeat`);
        if (hb && Object.keys(hb).length > 0) {
          activeTasks = parseInt(hb.active_tasks || '0', 10);
          cpuPercent = parseFloat(hb.cpu_percent || '0');
          availableRamMb = parseFloat(hb.available_ram_mb || String(w.total_ram_mb));
          isLive = true;
        }
      } catch (redisErr) {
        // Fallback
      }

      // Check if last heartbeat is older than 25 seconds
      const diffSec = (Date.now() - new Date(w.last_heartbeat_at).getTime()) / 1000;
      const status = diffSec > 25 ? 'OFFLINE' : (w.drain_mode ? 'DRAINING' : w.status);

      workers.push({
        ...w,
        status,
        active_tasks: activeTasks,
        cpu_percent: cpuPercent,
        available_ram_mb: availableRamMb,
        is_live: isLive && diffSec <= 25
      });
    }

    res.json({ success: true, data: workers });
  } catch (err) {
    next(err);
  }
}

export async function getWorkerById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workerId = req.params.id;

    const dbRes = await query('SELECT * FROM workers WHERE id = $1', [workerId]);
    if (dbRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Worker not found.' });
      return;
    }

    const worker = dbRes.rows[0];
    const hb = await redisClient.hGetAll(`worker:${workerId}:heartbeat`);

    res.json({
      success: true,
      data: {
        ...worker,
        live_telemetry: hb
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getWorkerMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workerId = req.params.id;
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const metricsRes = await query(
      `SELECT * FROM worker_heartbeats 
       WHERE worker_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [workerId, limit]
    );

    res.json({
      success: true,
      data: metricsRes.rows.reverse()
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleDrainWorker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workerId = req.params.id;
    const { drain } = req.body;

    const updateRes = await query(
      `UPDATE workers 
       SET drain_mode = $1, 
           status = CASE WHEN $1 THEN 'DRAINING' ELSE 'ONLINE' END,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [Boolean(drain), workerId]
    );

    if (updateRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Worker not found.' });
      return;
    }

    const updated = updateRes.rows[0];
    broadcastWorkerUpdate(workerId, { drain_mode: updated.drain_mode, status: updated.status });

    res.json({
      success: true,
      data: updated,
      message: `Worker ${workerId} drain mode set to ${updated.drain_mode}.`
    });
  } catch (err) {
    next(err);
  }
}
