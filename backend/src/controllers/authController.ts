import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { registerSchema, loginSchema, refreshSchema } from '../validation/schemas.js';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await query('SELECT id FROM users WHERE username = $1 OR email = $2', [
      data.username,
      data.email
    ]);
    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, error: 'Username or email already exists.' });
      return;
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(data.password, saltRounds);

    const result = await query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'standard_user')
       RETURNING id, username, email, role, created_at`,
      [data.username, data.email, passwordHash]
    );

    const user = result.rows[0];
    res.status(201).json({
      success: true,
      data: {
        user,
        message: 'Registration successful. You may now log in.'
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = loginSchema.parse(req.body);

    const result = await query(
      'SELECT id, username, email, password_hash, role FROM users WHERE username = $1 OR email = $1',
      [data.usernameOrEmail]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Invalid username/email or password.' });
      return;
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(data.password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ success: false, error: 'Invalid username/email or password.' });
      return;
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id }, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Store hashed refresh token in database
    const tokenHash = await bcrypt.hash(refreshToken, 8);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { id: string };

    const result = await query(
      'SELECT id, username, email, role FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'User no longer exists.' });
      return;
    }

    const user = result.rows[0];
    const newAccessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      success: true,
      data: { accessToken: newAccessToken }
    });
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user) {
      await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [req.user.id]);
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized.' });
      return;
    }
    const result = await query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}
