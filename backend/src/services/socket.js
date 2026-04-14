import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let ioInstance = null;

const extractToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (authToken) return authToken;

  const authHeader = socket.handshake.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }

  return null;
};

export const initSocket = (server) => {
  ioInstance = new Server(server, {
    cors: {
      // Use FRONTEND_URL environment variable for CORS in production
      // Set FRONTEND_URL in your .env file (e.g., FRONTEND_URL=https://your-frontend.com)
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true
    }
  });

  ioInstance.use((socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) {
        return next(new Error('Unauthorized'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const role = socket.user?.role;
    const userId = socket.user?.id;

    if (role) {
      socket.join(`role:${role}`);
    }

    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.emit('labtrack:connected', {
      ok: true,
      role,
      userId
    });
  });

  return ioInstance;
};

export const getIO = () => ioInstance;

export const emitRoleUpdate = (role, payload) => {
  if (!ioInstance || !role) return;
  ioInstance.to(`role:${role}`).emit('labtrack:update', payload);
};

export const emitUserUpdate = (userId, payload) => {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${userId}`).emit('labtrack:update', payload);
};
