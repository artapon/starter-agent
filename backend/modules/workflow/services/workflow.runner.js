import { buildWorkflowGraph } from './workflow.graph.js';
import { getDb } from '../../../core/database/db.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { SocketEvents } from '../../../core/socket/socket.events.js';
import { createAbortController, abortById, clearAbortController } from '../../../core/abort/abort.registry.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('workflow');

// Map of runId → AbortController for active runs
const _activeRuns = new Map();

export function stopWorkflowRun(runId) {
  const aborted = abortById(runId);
  if (_activeRuns.has(runId)) {
    _activeRuns.get(runId).aborted = true;
  }
  return aborted;
}

export class WorkflowRunner {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
    this._graph = null;
  }

  getGraph() {
    if (!this._graph) {
      this._graph = buildWorkflowGraph(this.socketManager);
    }
    return this._graph;
  }

  async run(goal, sessionId, onRunId = null, presetRunId = null) {
    const runId = presetRunId || uuidv4();
    logger.info(`Starting workflow run ${runId}`, { goal, sessionId });

    onRunId?.(runId);

    // Persist run
    this.db.table('workflow_runs').insert({
      id: runId,
      session_id: sessionId,
      graph_state_json: JSON.stringify({ goal }),
      status: 'running',
      started_at: Math.floor(Date.now() / 1000),
    });

    this.socketManager?.emit(SocketEvents.WORKFLOW_STARTED, { runId, goal, sessionId });

    // Register abort controller
    const controller = createAbortController(runId);
    const runCtx = { aborted: false };
    _activeRuns.set(runId, runCtx);

    const graph = this.getGraph();
    let finalState = null;

    try {
      const stream = await graph.stream({
        sessionId,
        userGoal: goal,
        runId,
        status: 'running',
        currentStepIdx: 0,
        subtaskResults: [],
        retryCount: 0,
      });

      for await (const chunk of stream) {
        // Check abort between nodes
        if (runCtx.aborted || controller.signal.aborted) {
          logger.info(`Workflow ${runId} aborted between nodes`);
          break;
        }
        const [nodeName, partialState] = Object.entries(chunk)[0] || [];
        if (nodeName) {
          logger.info(`Workflow node complete: ${nodeName}`, { runId });
        }
        finalState = { ...finalState, ...partialState };
      }

      const wasAborted = runCtx.aborted || controller.signal.aborted;

      // Update run status
      this.db.table('workflow_runs').update({ id: runId }, {
        graph_state_json: JSON.stringify(finalState),
        status: wasAborted ? 'stopped' : 'complete',
        ended_at: Math.floor(Date.now() / 1000),
      });

      if (wasAborted) {
        this.socketManager?.emit(SocketEvents.WORKFLOW_STOPPED, { runId, sessionId });
        logger.info(`Workflow ${runId} stopped by user`);
        return { runId, finalAnswer: null, state: finalState, stopped: true };
      }

      this.socketManager?.emit(SocketEvents.WORKFLOW_COMPLETE, {
        runId,
        finalAnswer: finalState?.finalAnswer,
        sessionId,
      });

      logger.info(`Workflow ${runId} complete`, { runId });
      return { runId, finalAnswer: finalState?.finalAnswer, state: finalState };

    } catch (err) {
      const wasAborted = runCtx.aborted || controller.signal.aborted || err.name === 'AbortError';
      if (wasAborted) {
        this.db.table('workflow_runs').update({ id: runId }, { status: 'stopped', ended_at: Math.floor(Date.now() / 1000) });
        this.socketManager?.emit(SocketEvents.WORKFLOW_STOPPED, { runId, sessionId });
        logger.info(`Workflow ${runId} stopped (AbortError)`);
        return { runId, finalAnswer: null, stopped: true };
      }
      logger.error(`Workflow ${runId} failed: ${err.message}`, { runId });
      this.db.table('workflow_runs').update({ id: runId }, {
        status: 'error',
        ended_at: Math.floor(Date.now() / 1000),
      });
      this.socketManager?.emit(SocketEvents.WORKFLOW_ERROR, { runId, error: err.message });
      throw err;
    } finally {
      _activeRuns.delete(runId);
      clearAbortController(runId);
    }
  }

  getRuns(sessionId = null) {
    if (sessionId) {
      return this.db.table('workflow_runs').all({ session_id: sessionId }, { orderBy: 'started_at', order: 'desc' });
    }
    return this.db.table('workflow_runs').all({}, { orderBy: 'started_at', order: 'desc', limit: 50 });
  }

  getRun(runId) {
    return this.db.table('workflow_runs').first({ id: runId });
  }
}
