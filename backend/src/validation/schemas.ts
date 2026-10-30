import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100)
});

export const loginSchema = z.object({
  usernameOrEmail: z.string().min(3),
  password: z.string().min(1)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10)
});

export const createJobSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  job_type: z.enum([
    'csv_batch_inference',
    'data_preprocessing',
    'model_evaluation',
    'model_training',
    'image_classification'
  ]),
  scheduling_strategy: z.enum([
    'round_robin',
    'least_loaded',
    'resource_aware',
    'predictive'
  ]).default('resource_aware'),
  priority: z.coerce.number().int().min(1).max(10).default(5),
  batch_size: z.coerce.number().int().min(10).max(10000).default(500),
  max_retries: z.coerce.number().int().min(0).max(5).default(3),
  timeout_seconds: z.coerce.number().int().min(30).max(3600).default(600),
  model_id: z.string().optional(),
  model_path: z.string().optional(),
  parameters: z.record(z.any()).optional().default({})
});

export const updatePolicySchema = z.object({
  default_policy: z.enum(['round_robin', 'least_loaded', 'resource_aware', 'predictive']),
  max_retries: z.number().int().min(0).max(10).optional(),
  task_timeout_seconds: z.number().int().min(30).max(7200).optional()
});
