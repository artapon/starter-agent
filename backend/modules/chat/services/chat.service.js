import { getDb } from '../../../core/database/db.js';
import { WorkflowRunner } from '../../workflow/services/workflow.runner.js';
import { stopWorkflowRun } from '../../workflow/services/workflow.runner.js';
import { agentQueue } from '../../../core/queue/agent.queue.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { SocketEvents } from '../../../core/socket/socket.events.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('chat');

export class ChatService {
  constructor(socketManager) {
    this.db = getDb();
    this.socketManager = socketManager;
    this.workflowRunner = new WorkflowRunner(socketManager);
    this._active = new Map(); // sessionId → { jobId, runId }
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
      // Enqueue — runs after any currently active job finishes
      const result = await agentQueue.enqueue(
        'chat',
        content,
        () => this.workflowRunner.run(content, sessionId, (runId) => {
          // Update the active map with the real runId once the runner assigns it
          const entry = this._active.get(sessionId);
          if (entry) entry.runId = runId;
          agentQueue.setRunId(this._active.get(sessionId)?.jobId, runId);
        }),
        null,
        (jobId) => {
          // Fired synchronously as soon as the job is registered in the queue
          this._active.set(sessionId, { jobId, runId: null });
        },
      );

      this._active.delete(sessionId);

      if (result?.stopped) {
        const stoppedMsg = 'Process was stopped by user.';
        this.saveMessage(sessionId, 'assistant', stoppedMsg, 'system');
        this.socketManager?.emitChatResponse(sessionId, stoppedMsg, 'system');
        this.socketManager?.emit(SocketEvents.CHAT_AGENT_TYPING, { agentId: 'planner', typing: false, sessionId });
        this.socketManager?.emit(SocketEvents.CHAT_STOPPED, { sessionId });
        return { sessionId, content: stoppedMsg, stopped: true };
      }

      const finalAnswer  = result.finalAnswer || 'Task completed.';
      const streamBuffer = result.streamBuffer || '';

      const fullContent = streamBuffer
        ? `${streamBuffer}\n\n---\n\n${finalAnswer}`
        : finalAnswer;

      this.saveMessage(sessionId, 'assistant', fullContent, 'workflow');
      this.socketManager?.emitChatResponse(sessionId, finalAnswer, 'workflow');
      this.socketManager?.emit(SocketEvents.CHAT_AGENT_TYPING, { agentId: 'planner', typing: false, sessionId });

      return { sessionId, content: fullContent, agentId: 'workflow', runId: result.runId };
    } catch (err) {
      this._active.delete(sessionId);

      if (err.cancelled) {
        // Job was cancelled while queued — treat as a user stop
        const stoppedMsg = 'Process was stopped by user.';
        this.saveMessage(sessionId, 'assistant', stoppedMsg, 'system');
        this.socketManager?.emitChatResponse(sessionId, stoppedMsg, 'system');
        this.socketManager?.emit(SocketEvents.CHAT_AGENT_TYPING, { agentId: 'planner', typing: false, sessionId });
        this.socketManager?.emit(SocketEvents.CHAT_STOPPED, { sessionId });
        return { sessionId, content: stoppedMsg, stopped: true };
      }

      const detail = err.error?.message || err.message || 'Unknown error';
      const errMsg = `LLM error: ${detail}`;
      this.saveMessage(sessionId, 'assistant', errMsg, 'system');
      this.socketManager?.emitChatResponse(sessionId, errMsg, 'system');
      this.socketManager?.emit(SocketEvents.CHAT_AGENT_TYPING, { agentId: 'planner', typing: false, sessionId });
      return { sessionId, content: errMsg, agentId: 'system' };
    }
  }

  stopSession(sessionId) {
    const entry = this._active.get(sessionId);
    if (!entry) return false;

    const { jobId, runId } = entry;

    // If the job is still waiting in the queue, cancel it before it starts
    if (jobId && agentQueue.cancel(jobId)) return true;

    // If the job is already running, abort the underlying workflow
    if (runId) { stopWorkflowRun(runId); return true; }

    return false;
  }

  clearSession(sessionId) {
    this.db.table('messages').delete({ session_id: sessionId });
    logger.info(`Session cleared: ${sessionId}`);
  }
}
