import { getDb } from '../../../core/database/db.js';
import { WorkflowRunner } from '../../workflow/services/workflow.runner.js';
import { stopWorkflowRun } from '../../workflow/services/workflow.runner.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { SocketEvents } from '../../../core/socket/socket.events.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('chat');

export class ChatService {
  constructor(socketManager) {
    this.db = getDb();
    this.socketManager = socketManager;
    this.workflowRunner = new WorkflowRunner(socketManager);
    this._activeRunIds = new Map(); // sessionId → runId
  }

  createOrGetSession(sessionId = null) {
    const id = sessionId || uuidv4();
    const existing = this.db.table('sessions').first({ id });
    if (!existing) {
      this.db.table('sessions').insert({ id, agent_id: 'chat', created_at: Math.floor(Date.now() / 1000), last_active: Math.floor(Date.now() / 1000) });
    } else {
      this.db.table('sessions').update({ id }, { last_active: Math.floor(Date.now() / 1000) });
    }
    return id;
  }

  saveMessage(sessionId, role, content, agentId = null) {
    this.db.table('messages').insert({
      session_id: sessionId,
      role,
      content,
      agent_id: agentId,
      ts: Date.now(),
    });
  }

  getHistory(sessionId) {
    return this.db.table('messages').all({ session_id: sessionId }, { orderBy: 'ts', order: 'asc' });
  }

  getSessions() {
    const sessions = this.db.table('sessions').all({}, { orderBy: 'last_active', order: 'desc', limit: 50 });
    return sessions.map(s => ({
      ...s,
      message_count: this.db.table('messages').count({ session_id: s.id }),
    }));
  }

  async handleMessage(sessionId, content) {
    sessionId = this.createOrGetSession(sessionId);

    // Save user message
    this.saveMessage(sessionId, 'user', content);

    // Emit typing indicator
    this.socketManager?.emit(SocketEvents.CHAT_AGENT_TYPING, { agentId: 'planner', typing: true, sessionId });

    logger.info(`Chat message received`, { sessionId, contentLength: content.length });

    try {
      // Run through workflow, tracking the active runId for this session
      const result = await this.workflowRunner.run(content, sessionId, (runId) => {
        this._activeRunIds.set(sessionId, runId);
      });

      this._activeRunIds.delete(sessionId);

      if (result?.stopped) {
        const stoppedMsg = 'Process was stopped by user.';
        this.saveMessage(sessionId, 'assistant', stoppedMsg, 'system');
        this.socketManager?.emitChatResponse(sessionId, stoppedMsg, 'system');
        this.socketManager?.emit(SocketEvents.CHAT_AGENT_TYPING, { agentId: 'planner', typing: false, sessionId });
        this.socketManager?.emit(SocketEvents.CHAT_STOPPED, { sessionId });
        return { sessionId, content: stoppedMsg, stopped: true };
      }

      const finalAnswer = result.finalAnswer || 'Task completed.';
      const streamBuffer = result.streamBuffer || '';

      // Combine streamed work content with the assembled final answer
      const fullContent = streamBuffer
        ? `${streamBuffer}\n\n---\n\n${finalAnswer}`
        : finalAnswer;

      // Save assistant response
      this.saveMessage(sessionId, 'assistant', fullContent, 'workflow');

      // Emit response
      this.socketManager?.emitChatResponse(sessionId, finalAnswer, 'workflow');
      this.socketManager?.emit(SocketEvents.CHAT_AGENT_TYPING, { agentId: 'planner', typing: false, sessionId });

      return { sessionId, content: fullContent, agentId: 'workflow', runId: result.runId };
    } catch (err) {
      this._activeRunIds.delete(sessionId);
      const detail = err.error?.message || err.message || 'Unknown error';
      const errMsg = `LLM error: ${detail}`;
      this.saveMessage(sessionId, 'assistant', errMsg, 'system');
      this.socketManager?.emitChatResponse(sessionId, errMsg, 'system');
      this.socketManager?.emit(SocketEvents.CHAT_AGENT_TYPING, { agentId: 'planner', typing: false, sessionId });
      return { sessionId, content: errMsg, agentId: 'system' };
    }
  }

  stopSession(sessionId) {
    const runId = this._activeRunIds.get(sessionId);
    if (runId) {
      stopWorkflowRun(runId);
      return true;
    }
    return false;
  }

  clearSession(sessionId) {
    this.db.table('messages').delete({ session_id: sessionId });
    logger.info(`Session cleared: ${sessionId}`);
  }
}
