const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { isOriginAllowed } = require('../utils/corsHelper');
const { EVENTS, buildPayload } = require('./events');

let io = null;

// Track active sockets per user to enforce connection limit (max 5)
// Map<userId, socketId[]>
const userSocketsMap = new Map();

// WeakMap holding pending post-commit actions keyed by session
const pendingCommitEvents = new WeakMap();

/**
 * Initializes the Socket.IO server on an existing HTTP server.
 */
function initRealtime(httpServer) {
  if (env.REALTIME_ENABLED === false) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Realtime] REALTIME_ENABLED=false: Socket.IO disabled');
    }
    return null;
  }

  io = new Server(httpServer, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin, env.ALLOWED_ORIGINS)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true
    }
  });

  // 3.2 Authentication Middleware (io.use)
  io.use(async (socket, next) => {
    try {
      // Token must come ONLY from auth.token, NEVER query string
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token || typeof token !== 'string') {
        return next(new Error('Unauthorized'));
      }

      let decoded;
      try {
        decoded = jwt.verify(token, env.JWT_SECRET);
      } catch (err) {
        return next(new Error('Unauthorized'));
      }

      const user = await User.findById(decoded.id).select('_id role email');
      if (!user) {
        return next(new Error('Unauthorized'));
      }

      const userIdStr = user._id.toString();
      socket.data.user = {
        id: userIdStr,
        role: user.role
      };

      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const userIdStr = user.id;

    // R4: Server decides rooms: user:<id> and role:<role>
    socket.join(`user:${userIdStr}`);
    socket.join(`role:${user.role}`);

    // Enforce max 5 simultaneous sockets per user
    const existingSockets = userSocketsMap.get(userIdStr) || [];
    existingSockets.push(socket.id);
    userSocketsMap.set(userIdStr, existingSockets);

    if (existingSockets.length > 5) {
      const oldestSocketId = existingSockets.shift();
      const oldestSocket = io.sockets.sockets.get(oldestSocketId);
      if (oldestSocket) {
        oldestSocket.disconnect(true);
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Realtime] User connected: ${userIdStr} (${user.role}), socket: ${socket.id}`);
    }

    // Ignore client-to-server business events (client never joins rooms or emits business events)
    socket.onAny((eventName) => {
      // Discard any incoming client custom events
    });

    socket.on('disconnect', () => {
      const currentSockets = userSocketsMap.get(userIdStr) || [];
      const updated = currentSockets.filter(id => id !== socket.id);
      if (updated.length > 0) {
        userSocketsMap.set(userIdStr, updated);
      } else {
        userSocketsMap.delete(userIdStr);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Realtime] User disconnected: ${userIdStr}, socket: ${socket.id}`);
      }
    });
  });

  return io;
}

/**
 * Emit event to a specific user's room: `user:<userId>`
 */
function emitToUser(userId, event, payload) {
  try {
    if (!io || !userId) return;
    const userIdStr = userId._id ? userId._id.toString() : userId.toString();
    const cleanPayload = buildPayload(event, payload);
    io.to(`user:${userIdStr}`).emit(event, cleanPayload);
  } catch (err) {
    // R3. EMITTING NEVER BREAKS BUSINESS CODE
  }
}

/**
 * Emit event to a specific role's room: `role:<role>` (brand | creator)
 */
function emitToRole(role, event, payload) {
  try {
    if (!io || !role) return;
    const cleanPayload = buildPayload(event, payload);
    io.to(`role:${role}`).emit(event, cleanPayload);
  } catch (err) {
    // R3. EMITTING NEVER BREAKS BUSINESS CODE
  }
}

/**
 * Queue an event action to be dispatched strictly AFTER the transaction commits.
 * If no session is active or provided, executes immediately.
 */
function afterCommit(session, fn) {
  if (!session) {
    try {
      fn();
    } catch (err) {
      // Silent suppression per R3
    }
    return;
  }

  let list = pendingCommitEvents.get(session);
  if (!list) {
    list = [];
    pendingCommitEvents.set(session, list);
  }
  list.push(fn);
}

/**
 * Flush all actions registered on a transaction session.
 * Called only upon successful commit.
 */
function flushAfterCommit(session) {
  if (!session) return;
  const list = pendingCommitEvents.get(session);
  pendingCommitEvents.delete(session);
  if (Array.isArray(list)) {
    for (const fn of list) {
      try {
        fn();
      } catch (err) {
        // R3: never breaks
      }
    }
  }
}

/**
 * Clear actions on session retry or rollback.
 */
function clearAfterCommit(session) {
  if (!session) return;
  pendingCommitEvents.delete(session);
}

/**
 * Close Socket.IO instance (used for test teardown)
 */
function closeRealtime() {
  if (io) {
    io.close();
    io = null;
  }
  userSocketsMap.clear();
}

/**
 * Helper to get current io instance
 */
function getIO() {
  return io;
}

module.exports = {
  initRealtime,
  emitToUser,
  emitToRole,
  afterCommit,
  flushAfterCommit,
  clearAfterCommit,
  closeRealtime,
  getIO,
  EVENTS,
  buildPayload
};
