import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { query, getClient } from '../config/db.js';
import { env } from '../config/env.js';
import { createJobSchema } from '../validation/schemas.js';
import { partitionAndCreateTasks } from '../services/batchService.js';
import { broadcastJobUpdate } from '../sockets/socketManager.js';

function resolveProjectPath(relPath: string): string {
  if (path.isAbsolute(relPath)) return relPath;
  const fromCwd = path.resolve(process.cwd(), relPath);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromRoot = path.resolve(__dirname, '../../../', relPath);
  if (fs.existsSync(fromRoot)) return fromRoot;
  return fromCwd;
}

export async function createJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const data = createJobSchema.parse(req.body);

    let datasetPath = '';

    // If a file was uploaded via multipart/form-data
    if (req.file) {
      datasetPath = req.file.path;
    } else if (req.body.sample_dataset) {
      // Use built-in approved sample datasets
      const sampleMap: Record<string, string> = {
        'customer_churn': 'ml/sample_data/customer_churn.csv',
        'housing_prices': 'ml/sample_data/housing_prices.csv',
        'credit_risk': 'ml/sample_data/credit_risk.csv',
        'evaluation_test': 'ml/sample_data/evaluation_test.csv'
      };
      const rawPath = sampleMap[req.body.sample_dataset] || 'ml/sample_data/customer_churn.csv';
      datasetPath = resolveProjectPath(rawPath);
    } else {
      res.status(400).json({
        success: false,
        error: 'Either a dataset file upload or a valid sample_dataset identifier is required.'
      });
      return;
    }

    if (!fs.existsSync(datasetPath)) {
      res.status(404).json({ success: false, error: `Dataset file does not exist: ${datasetPath}` });
      return;
    }

    // Map model selection if provided
    let modelPath = data.model_path || '';
    if (!modelPath && data.model_id) {
      const modelRes = await query('SELECT model_path FROM model_registry WHERE id = $1', [data.model_id]);
      if (modelRes.rows.length > 0) {
        modelPath = modelRes.rows[0].model_path;
      }
    }
    if (!modelPath) {
      if (data.job_type === 'csv_batch_inference') {
        modelPath = 'ml/models/customer_churn_rf.joblib';
      } else if (data.job_type === 'model_evaluation') {
        modelPath = 'ml/models/customer_churn_rf.joblib';
      }
    }
    if (modelPath) {
      modelPath = resolveProjectPath(modelPath);
    }

    const parameters = {
      ...data.parameters,
      model_path: modelPath,
      batch_size: data.batch_size
    };

    // 1. Insert Job record with status VALIDATING
    const insertRes = await query(
      `INSERT INTO jobs (
        user_id, name, description, job_type, status,
        scheduling_strategy, priority, dataset_path, max_retries,
        timeout_seconds, parameters_json, total_batches
      )
      VALUES ($1, $2, $3, $4, 'VALIDATING', $5, $6, $7, $8, $9, $10, 1)
      RETURNING *`,
      [
        userId,
        data.name,
        data.description || '',
        data.job_type,
        data.scheduling_strategy,
        data.priority,
        datasetPath,
        data.max_retries,
        data.timeout_seconds,
        JSON.stringify(parameters)
      ]
    );

    const job = insertRes.rows[0];

    // Record initial transition
    await query(
      `INSERT INTO job_state_transitions (job_id, from_status, to_status, trigger_event, message)
       VALUES ($1, 'SUBMITTED', 'VALIDATING', 'JOB_CREATED', 'Job successfully submitted and validating input data')`,
      [job.id]
    );

    // 2. Partition dataset into batches & create individual tasks
    const { totalBatches, totalRecords } = await partitionAndCreateTasks(
      job.id,
      datasetPath,
      data.job_type,
      data.batch_size,
      parameters
    );

    broadcastJobUpdate(job.id, {
      jobId: job.id,
      status: 'QUEUED',
      totalBatches,
      totalRecords
    });

    res.status(201).json({
      success: true,
      data: {
        job: {
          ...job,
          status: 'QUEUED',
          total_batches: totalBatches,
          total_records: totalRecords
        },
        message: `Job ${job.id} created and queued with ${totalBatches} batch tasks.`
      }
    });

  } catch (err) {
    next(err);
  }
}

export async function listJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const status = req.query.status as string | undefined;
    const limit = Math.min(Number(req.query.limit || 50), 100);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    let sql = `
      SELECT j.*, u.username as owner_username,
             ROUND((j.completed_batches::numeric / GREATEST(j.total_batches, 1)::numeric) * 100, 1) as progress_percent
      FROM jobs j
      JOIN users u ON j.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (role !== 'admin') {
      params.push(userId);
      sql += ` AND j.user_id = $${params.length}`;
    }

    if (status) {
      params.push(status.toUpperCase());
      sql += ` AND j.status = $${params.length}`;
    }

    sql += ` ORDER BY j.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Total count for pagination
    let countSql = `SELECT COUNT(*) FROM jobs j WHERE 1=1`;
    const countParams: any[] = [];
    if (role !== 'admin') {
      countParams.push(userId);
      countSql += ` AND j.user_id = $1`;
    }
    const countRes = await query(countSql, countParams);

    res.json({
      success: true,
      data: {
        jobs: result.rows,
        total: Number(countRes.rows[0].count),
        limit,
        offset
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getJobById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jobId = req.params.id;

    const jobRes = await query(
      `SELECT j.*, u.username as owner_username,
              ROUND((j.completed_batches::numeric / GREATEST(j.total_batches, 1)::numeric) * 100, 1) as progress_percent
       FROM jobs j
       JOIN users u ON j.user_id = u.id
       WHERE j.id = $1`,
      [jobId]
    );

    if (jobRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Job not found.' });
      return;
    }

    const job = jobRes.rows[0];

    // Fetch batches and tasks
    const tasksRes = await query(
      `SELECT jt.*, jb.batch_index, jb.record_count, w.name as worker_name
       FROM job_tasks jt
       LEFT JOIN job_batches jb ON jt.batch_id = jb.id
       LEFT JOIN workers w ON jt.assigned_worker_id = w.id
       WHERE jt.job_id = $1
       ORDER BY COALESCE(jb.batch_index, 0) ASC`,
      [jobId]
    );

    // Fetch state transitions
    const transitionsRes = await query(
      `SELECT * FROM job_state_transitions WHERE job_id = $1 ORDER BY created_at ASC`,
      [jobId]
    );

    // Fetch scheduling decisions
    const decisionsRes = await query(
      `SELECT sd.*, w.name as worker_name 
       FROM scheduling_decisions sd
       LEFT JOIN workers w ON sd.selected_worker_id = w.id
       WHERE sd.job_id = $1
       ORDER BY sd.created_at DESC`,
      [jobId]
    );

    // Fetch artifacts
    const artifactsRes = await query(
      `SELECT * FROM result_artifacts WHERE job_id = $1 ORDER BY created_at DESC`,
      [jobId]
    );

    res.json({
      success: true,
      data: {
        job,
        tasks: tasksRes.rows,
        transitions: transitionsRes.rows,
        decisions: decisionsRes.rows,
        artifacts: artifactsRes.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function cancelJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jobId = req.params.id;

    const jobRes = await query('SELECT status FROM jobs WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Job not found.' });
      return;
    }

    const currentStatus = jobRes.rows[0].status;
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(currentStatus)) {
      res.status(400).json({
        success: false,
        error: `Cannot cancel job in terminal state: ${currentStatus}`
      });
      return;
    }

    await query(
      `UPDATE jobs SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [jobId]
    );

    await query(
      `UPDATE job_tasks SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE job_id = $1 AND status IN ('QUEUED', 'SCHEDULED')`,
      [jobId]
    );

    await query(
      `INSERT INTO job_state_transitions (job_id, from_status, to_status, trigger_event, message)
       VALUES ($1, $2, 'CANCELLED', 'USER_CANCELLED', 'Job cancelled by user request')`,
      [jobId, currentStatus]
    );

    broadcastJobUpdate(jobId, { jobId, status: 'CANCELLED' });

    res.json({ success: true, message: 'Job cancelled successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function retryJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jobId = req.params.id;

    const jobRes = await query('SELECT status FROM jobs WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Job not found.' });
      return;
    }

    // Reset failed tasks to QUEUED
    await query(
      `UPDATE job_tasks 
       SET status = 'QUEUED', assigned_worker_id = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE job_id = $1 AND status IN ('FAILED', 'CANCELLED', 'TIMED_OUT')`,
      [jobId]
    );

    await query(
      `UPDATE jobs 
       SET status = 'QUEUED', failed_batches = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [jobId]
    );

    await query(
      `INSERT INTO job_state_transitions (job_id, from_status, to_status, trigger_event, message)
       VALUES ($1, 'FAILED', 'QUEUED', 'MANUAL_RETRY', 'Job retried by user')`,
      [jobId]
    );

    broadcastJobUpdate(jobId, { jobId, status: 'QUEUED' });

    res.json({ success: true, message: 'Job retry initiated.' });
  } catch (err) {
    next(err);
  }
}

export async function getJobLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jobId = req.params.id;

    const attemptsRes = await query(
      `SELECT ta.*, jt.task_type, w.name as worker_name
       FROM task_attempts ta
       JOIN job_tasks jt ON ta.task_id = jt.id
       LEFT JOIN workers w ON ta.worker_id = w.id
       WHERE jt.job_id = $1
       ORDER BY ta.started_at DESC`,
      [jobId]
    );

    const transitionsRes = await query(
      `SELECT * FROM job_state_transitions WHERE job_id = $1 ORDER BY created_at DESC`,
      [jobId]
    );

    res.json({
      success: true,
      data: {
        attempts: attemptsRes.rows,
        state_transitions: transitionsRes.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getJobResults(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jobId = req.params.id;

    const jobRes = await query('SELECT result_path, job_type, status FROM jobs WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Job not found.' });
      return;
    }

    const { result_path, job_type, status } = jobRes.rows[0];

    if (status !== 'COMPLETED' || !result_path || !fs.existsSync(result_path)) {
      res.status(404).json({
        success: false,
        error: 'Results are not yet available or job has not completed.'
      });
      return;
    }

    let parsedResult: any = null;

    if (result_path.endsWith('.json')) {
      parsedResult = JSON.parse(fs.readFileSync(result_path, 'utf-8'));
    } else if (result_path.endsWith('.csv')) {
      const content = fs.readFileSync(result_path, 'utf-8');
      const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
      const headers = lines[0].split(',');
      const previewRows = lines.slice(1, 21).map(l => l.split(','));

      parsedResult = {
        total_rows: lines.length - 1,
        headers,
        sample_rows: previewRows
      };
    }

    res.json({
      success: true,
      data: {
        job_id: jobId,
        job_type,
        result_path,
        preview: parsedResult
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadArtifact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jobId = req.params.id;

    const jobRes = await query('SELECT result_path, name FROM jobs WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Job not found.' });
      return;
    }

    const resultPath = jobRes.rows[0].result_path;
    if (!resultPath || !fs.existsSync(resultPath)) {
      res.status(404).json({ success: false, error: 'Result artifact file not found on disk.' });
      return;
    }

    const filename = path.basename(resultPath);
    res.download(path.resolve(resultPath), filename);
  } catch (err) {
    next(err);
  }
}
