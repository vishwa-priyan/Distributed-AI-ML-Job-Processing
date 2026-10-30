import { Request, Response, NextFunction } from 'express';
import { query } from '../config/db.js';
import { redisClient } from '../config/redis.js';
import { env } from '../config/env.js';

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const usersRes = await query(`
      SELECT id, username, email, role, created_at, updated_at
      FROM users
      ORDER BY created_at ASC
    `);
    res.json({ success: true, data: usersRes.rows });
  } catch (err) {
    next(err);
  }
}

export async function getSystemHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Check PostgreSQL
    let dbStatus = 'healthy';
    let dbLatencyMs = 0;
    try {
      const t0 = Date.now();
      await query('SELECT 1');
      dbLatencyMs = Date.now() - t0;
    } catch (e) {
      dbStatus = 'unhealthy';
    }

    // 2. Check Redis
    let redisStatus = 'healthy';
    let redisLatencyMs = 0;
    try {
      const t0 = Date.now();
      await redisClient.ping();
      redisLatencyMs = Date.now() - t0;
    } catch (e) {
      redisStatus = 'unhealthy';
    }

    // 3. Check Scheduler Service
    let schedulerStatus = 'healthy';
    try {
      const resp = await fetch(`${env.SCHEDULER_URL}/health`);
      if (!resp.ok) schedulerStatus = 'degraded';
    } catch (e) {
      schedulerStatus = 'unreachable';
    }

    // 4. Count active workers
    const workersRes = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status != 'OFFLINE' AND last_heartbeat_at >= CURRENT_TIMESTAMP - INTERVAL '25 seconds' THEN 1 ELSE 0 END) as active
      FROM workers
    `);

    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        overall: (dbStatus === 'healthy' && redisStatus === 'healthy') ? 'UP' : 'DEGRADED',
        components: {
          database: { status: dbStatus, latency_ms: dbLatencyMs },
          redis: { status: redisStatus, latency_ms: redisLatencyMs },
          scheduler: { status: schedulerStatus, url: env.SCHEDULER_URL },
          workers: {
            total: Number(workersRes.rows[0].total || 0),
            active: Number(workersRes.rows[0].active || 0)
          }
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getSchedulingPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({
      success: true,
      data: {
        available_policies: [
          { id: 'round_robin', name: 'Round Robin', description: 'Equally distributes tasks among workers in rotation' },
          { id: 'least_loaded', name: 'Least Loaded', description: 'Assigns tasks to workers with minimum queue and active load' },
          { id: 'resource_aware', name: 'Resource-Aware', description: 'Evaluates real-time CPU, RAM, GPU, and slot capacity' },
          { id: 'predictive', name: 'Predictive Scheduling', description: 'Estimates completion time using a trained ML regression model' }
        ],
        current_default: 'resource_aware',
        max_task_retries: 3,
        default_task_timeout_seconds: 600
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function updateSchedulingPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { default_policy, max_retries, task_timeout_seconds } = req.body;
    // Log audit event
    await query(
      `INSERT INTO audit_logs (user_id, action, target_entity, details_json)
       VALUES ($1, 'UPDATE_SCHEDULING_POLICIES', 'SCHEDULER', $2)`,
      [
        req.user?.id || null,
        JSON.stringify({ default_policy, max_retries, task_timeout_seconds })
      ]
    );

    res.json({
      success: true,
      message: 'Scheduling policies updated successfully.',
      data: { default_policy, max_retries, task_timeout_seconds }
    });
  } catch (err) {
    next(err);
  }
}
