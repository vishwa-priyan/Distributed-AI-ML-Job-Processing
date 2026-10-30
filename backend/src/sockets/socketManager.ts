import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { env } from '../config/env.js';

let io: SocketIOServer | null = null;

export function initSocketIO(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('join_job', (jobId: string) => {
      socket.join(`job_${jobId}`);
      console.log(`[Socket.IO] Client ${socket.id} joined room job_${jobId}`);
    });

    socket.on('leave_job', (jobId: string) => {
      socket.leave(`job_${jobId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function broadcastJobUpdate(jobId: string, payload: any) {
  if (!io) return;
  io.to(`job_${jobId}`).emit('job_updated', payload);
  io.emit('job_status_change', payload);
}

export function broadcastWorkerUpdate(workerId: string, payload: any) {
  if (!io) return;
  io.emit('worker_updated', { workerId, ...payload });
}
