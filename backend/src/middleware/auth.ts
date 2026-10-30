import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { UserRole } from '../types/index.js';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. No Bearer token provided.'
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired access token.'
    });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: requires one of [${roles.join(', ')}] roles.`
      });
      return;
    }
    next();
  };
}

export async function checkJobOwnership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const jobId = req.params.id;
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  if (req.user.role === 'admin') {
    next();
    return;
  }

  try {
    const result = await query('SELECT user_id FROM jobs WHERE id = $1', [jobId]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Job not found.' });
      return;
    }
    if (result.rows[0].user_id !== req.user.id) {
      res.status(403).json({ success: false, error: 'You do not have permission to access this job.' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
