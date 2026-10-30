export type UserRole = 'admin' | 'standard_user';

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export type JobType = 
  | 'csv_batch_inference' 
  | 'data_preprocessing' 
  | 'model_evaluation' 
  | 'model_training' 
  | 'image_classification';

export type JobStatus = 
  | 'SUBMITTED' 
  | 'VALIDATING' 
  | 'QUEUED' 
  | 'SCHEDULED' 
  | 'RUNNING' 
  | 'RETRYING' 
  | 'AGGREGATING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'CANCEL_REQUESTED' 
  | 'CANCELLED' 
  | 'TIMED_OUT';

export type SchedulingStrategy = 
  | 'round_robin' 
  | 'least_loaded' 
  | 'resource_aware' 
  | 'predictive';

export interface Job {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  job_type: JobType;
  status: JobStatus;
  scheduling_strategy: SchedulingStrategy;
  priority: number;
  dataset_path?: string;
  result_path?: string;
  max_retries: number;
  timeout_seconds: number;
  parameters_json: Record<string, any>;
  total_batches: number;
  completed_batches: number;
  failed_batches: number;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkerInfo {
  id: string;
  name: string;
  hostname: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'DRAINING' | 'STOPPED';
  max_concurrency: number;
  cpu_cores: number;
  total_ram_mb: number;
  has_gpu: boolean;
  gpu_name?: string;
  supported_job_types: string[];
  drain_mode: boolean;
  last_heartbeat_at: Date;
  registered_at: Date;
  active_tasks?: number;
  cpu_percent?: number;
}
