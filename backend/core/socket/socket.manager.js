import { Server } from 'socket.io';
import { SocketEvents } from './socket.events.js';
import { createLogger } from '../logger/winston.logger.js';
import { setSocketTransport } from '../logger/winston.logger.js';
import { SocketTransport } from '../logger/log.transport.socket.js';
import { getDb } from '../database/db.js';
import { abortById } from '../abort/abort.registry.js';

const logger = createLogger('socket');

let _io = null;

export function createSocketManager(httpServer) {
  _io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  const db = getDb();

  _io.on('connection', (socket) => {
    logger.info('Client connected', { socketId: socket.id });

    socket.on('disconnect', () => {
      logger.info('Client disconnected', { socketId: socket.id });
    });

    // Chat namespace
    socket.on(SocketEvents.CHAT_MESSAGE, async (data) => {
      socket.broadcast.emit(SocketEvents.CHAT_AGENT_TYPING, { agentId: 'planner', typing: true });
    });

    socket.on(SocketEvents.REQUEST_STATS, () => {
      emitDashboardStats();
    });

    // Stop workflow via socket
    socket.on(SocketEvents.WORKFLOW_STOP, ({ runId } = {}) => {
      if (runId) abortById(runId);
    });
  });

  // Register Winston socket transport (deferred to after socketManager is defined)
  process.nextTick(() => {
    const socketTransport = new SocketTransport(socketManager, { level: 'info' });
    setSocketTransport(socketTransport);
  });

  function emitDashboardStats() {
    try {
      _io.emit(SocketEvents.DASHBOARD_STATS, {
        workflowRuns: db.table('workflow_runs').count(),
        totalMessages: db.table('messages').count(),
        ts: Date.now(),
      });
    } catch (_) {}
  }

  const socketManager = {
    io: _io,

    emit(event, data) {
      try { _io.emit(event, data); } catch { /* ignore disconnected client */ }
    },

    emitToSession(sessionId, event, data) {
      try { _io.to(`session:${sessionId}`).emit(event, data); } catch { /* ignore */ }
    },

    emitLog(logEntry) {
      // Persist to DB
      try {
        db.table('logs').insert({
          level: logEntry.level,
          message: logEntry.message,
          agent_id: logEntry.agentId || null,
          meta_json: JSON.stringify(logEntry),
          ts: Date.now(),
        });
      } catch (_) {}
      _io.emit(SocketEvents.LOG_ENTRY, logEntry);
    },

    emitAgentStatus(agentId, status, currentTask = null) {
      _io.emit(SocketEvents.AGENT_STATUS_UPDATE, { agentId, status, currentTask, ts: Date.now() });
    },

    emitWorkflowNode(runId, node, state) {
      _io.emit(SocketEvents.WORKFLOW_NODE_COMPLETE, { runId, node, state, ts: Date.now() });
    },

    emitChatChunk(sessionId, chunk, agentId) {
      try { _io.emit(SocketEvents.CHAT_RESPONSE_CHUNK, { sessionId, chunk, agentId, ts: Date.now() }); } catch { /* ignore */ }
    },

    emitChatResponse(sessionId, content, agentId) {
      try { _io.emit(SocketEvents.CHAT_RESPONSE, { sessionId, content, agentId, ts: Date.now() }); } catch { /* ignore */ }
    },
  };

  return socketManager;
}

export function getSocketManager() {
  return _io;
}
