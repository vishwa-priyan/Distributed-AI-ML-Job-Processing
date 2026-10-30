import http from 'http';
import express from 'express';
import cors from 'cors';
import client from 'prom-client';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { initSocketIO } from './sockets/socketManager.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initSocketIO(server);

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Prometheus Metrics setup
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'distml_' });

const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'distml_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDurationMicroseconds
      .labels(req.method, req.route ? req.route.path : req.path, String(res.statusCode))
      .observe(duration);
  });
  next();
});

// Metrics and Health endpoints
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use(env.API_PREFIX, apiRouter);

// Centralized Error Handling
app.use(errorHandler);

async function startServer() {
  try {
    // Verify database connection
    await pool.query('SELECT 1');
    console.log('[PostgreSQL] Database pool connected successfully.');

    // Verify Redis connection
    await connectRedis();

    server.listen(env.PORT, () => {
      console.log(`=======================================================`);
      console.log(` Distributed AI/ML Platform Backend API Running `);
      console.log(` Port:     http://localhost:${env.PORT}`);
      console.log(` API Base: http://localhost:${env.PORT}${env.API_PREFIX}`);
      console.log(` Health:   http://localhost:${env.PORT}/health`);
      console.log(` Metrics:  http://localhost:${env.PORT}/metrics`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

startServer();
