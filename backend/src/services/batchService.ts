import fs from 'fs';
import path from 'path';
import { getClient } from '../config/db.js';
import { env } from '../config/env.js';

export async function partitionAndCreateTasks(
  jobId: string,
  filePath: string,
  jobType: string,
  batchSize: number,
  parameters: Record<string, any>
): Promise<{ totalBatches: number; totalRecords: number }> {
  // Ensure directories exist
  fs.mkdirSync(env.STORAGE_BATCHES_DIR, { recursive: true });

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Read file lines (preserving header)
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    
    if (lines.length <= 1) {
      throw new Error('Dataset is empty or contains only a header line.');
    }

    const header = lines[0];
    const dataRows = lines.slice(1);
    const totalRecords = dataRows.length;
    const totalBatches = Math.max(1, Math.ceil(totalRecords / batchSize));

    // Update job batches count
    await client.query(
      `UPDATE jobs SET total_batches = $1, status = 'QUEUED', updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [totalBatches, jobId]
    );

    // Record transition
    await client.query(
      `INSERT INTO job_state_transitions (job_id, from_status, to_status, trigger_event, message)
       VALUES ($1, 'VALIDATING', 'QUEUED', 'BATCH_PARTITION_COMPLETE', $2)`,
      [jobId, `Dataset partitioned into ${totalBatches} batches (${totalRecords} records)`]
    );

    // 2. Create chunks and job_batches + job_tasks
    for (let i = 0; i < totalBatches; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, totalRecords);
      const chunkRows = dataRows.slice(startIndex, endIndex);
      const chunkCount = chunkRows.length;

      const chunkFileName = `${jobId}_batch_${i}.csv`;
      const chunkFilePath = path.join(env.STORAGE_BATCHES_DIR, chunkFileName);
      const relChunkPath = `storage/batches/${chunkFileName}`;
      const relResultPath = `storage/batches/${jobId}_batch_${i}_result.csv`;
      
      const chunkContent = [header, ...chunkRows].join('\n');
      fs.writeFileSync(chunkFilePath, chunkContent, 'utf-8');

      // Insert job_batch
      const batchRes = await client.query(
        `INSERT INTO job_batches (job_id, batch_index, total_batches, record_start_index, record_count, status, chunk_path)
         VALUES ($1, $2, $3, $4, $5, 'QUEUED', $6)
         RETURNING id`,
        [jobId, i, totalBatches, startIndex, chunkCount, relChunkPath]
      );
      const batchId = batchRes.rows[0].id;

      // Insert job_task
      await client.query(
        `INSERT INTO job_tasks (job_id, batch_id, task_type, status, input_data_path, output_data_path)
         VALUES ($1, $2, $3, 'QUEUED', $4, $5)`,
        [
          jobId,
          batchId,
          jobType,
          relChunkPath,
          relResultPath
        ]
      );
    }

    await client.query('COMMIT');
    return { totalBatches, totalRecords };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
