import fs                     from 'node:fs';
import path                   from 'node:path';
import { buildWorkflowGraph } from './workflow.graph.js';
import { getDb }              from '../../../core/database/db.js';
import { createLogger }       from '../../../core/logger/winston.logger.js';
import { SocketEvents }       from '../../../core/socket/socket.events.js';
import { createAbortController, abortById, clearAbortController } from '../../../core/abort/abort.registry.js';
import { generateReport }     from '../../../core/reports/report.generator.js';
import { memoryStore }        from '../../memory/services/memory.store.js';
import { deleteSTM }         from '../../../core/memory/stm.store.js';
import { setActiveRunWorkspace, clearActiveRunWorkspace } from '../../../core/tools/tool.implementations.js';
import { projectStore }       from '../../../core/projects/project.store.js';
import { getWorkspacePath, toFolderName } from '../../../core/workspace/workspace.path.js';
import { v4 as uuidv4 }       from 'uuid';

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
  }

  async run(goal, sessionId, onRunId = null, presetRunId = null, projectId = null) {
    const runId = presetRunId || uuidv4();
    logger.info(`Starting workflow run ${runId}`, { goal, sessionId });

    onRunId?.(runId);

    // Resolve the project's workspace subfolder (if a project is selected)
    let workspaceFolder = null;
    if (projectId) {
      const project = projectStore.get(projectId);
      if (project) {
        const folderName = project.folderName || toFolderName(project.title);
        workspaceFolder  = path.join(getWorkspacePath(), folderName);
        fs.mkdirSync(workspaceFolder, { recursive: true });
        setActiveRunWorkspace(workspaceFolder);
        logger.info(`Project workspace: ${workspaceFolder}`, { runId });
      }
    }

    // Persist run
    this.db.table('workflow_runs').insert({
      id: runId,
      session_id: sessionId,
      project_id: projectId || null,
      graph_state_json: JSON.stringify({ goal }),
      status: 'running',
      started_at: Math.floor(Date.now() / 1000),
    });

    this.socketManager?.emit(SocketEvents.WORKFLOW_STARTED, { runId, goal, sessionId });

    // Register abort controller
    const controller = createAbortController(runId);
    const runCtx = { aborted: false };
    _activeRuns.set(runId, runCtx);

    // Wrap socketManager to buffer every chat chunk for this session so we can
    // save the full streamed content (step-by-step work) alongside the final answer.
    let streamBuffer = '';
    const sm = this.socketManager;
    const bufferingSocketManager = sm ? {
      // Forward all methods unchanged
      emit:              (...a) => sm.emit(...a),
      emitToSession:     (...a) => sm.emitToSession(...a),
      emitLog:           (...a) => sm.emitLog(...a),
      emitAgentStatus:   (...a) => sm.emitAgentStatus(...a),
      emitWorkflowNode:  (...a) => sm.emitWorkflowNode(...a),
      emitChatResponse:  (...a) => sm.emitChatResponse(...a),
      // Intercept chat chunks — buffer them, then forward
      emitChatChunk(sid, chunk, agentId) {
        if (sid === sessionId) streamBuffer += chunk;
        sm.emitChatChunk(sid, chunk, agentId);
      },
    } : null;

    // Read workflow loop settings from global_settings
    const globalRows = this.db.table('global_settings').all();
    const globalMap  = Object.fromEntries(globalRows.map(r => [r.key, r.value]));
    const loopEnabled = globalMap.workflow_loop_enabled === '1';
    const maxLoops    = Math.max(1, parseInt(globalMap.workflow_max_loops || '3', 10));
    const rawLimit    = parseInt(globalMap.workflow_recursion_limit || '200', 10);
    const recursionLimit = (!rawLimit || rawLimit <= 0) ? 99999 : rawLimit;

    // Rebuild graph with buffering socket manager so agents use it for this run
    const graph = buildWorkflowGraph(bufferingSocketManager);
    const initialState = {
      sessionId,
      userGoal: goal,
      runId,
      projectId: projectId || null,
      workspaceFolder,
      status: 'running',
      currentStepIdx: 0,
      subtaskResults: [],
      retryCount: 0,
      loopEnabled,
      maxLoops,
      loopCount: 0,
    };
    let finalState = initialState;

    try {
      const stream = await graph.stream(initialState, { recursionLimit });

      const loopIterations = []; // snapshots of each cycle before loop_reset clears state

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
        // Capture current iteration state when reviewer triggers an improvement loop
        if (nodeName === 'reviewer' && partialState?.loopCount > (finalState?.loopCount ?? 0)) {
          loopIterations.push({
            loopIdx:          finalState.loopCount ?? 0,
            researchFindings: finalState.researchFindings,
            plan:             finalState.plan,
            subtaskResults:   Array.isArray(finalState.subtaskResults) ? [...finalState.subtaskResults] : [],
            reviewFeedback:   finalState.reviewFeedback,
          });
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

      const runRow = this.db.table('workflow_runs').first({ id: runId });

      if (wasAborted) {
        generateReport({ state: finalState, runId, sessionId, startedAt: runRow?.started_at, endedAt: runRow?.ended_at, status: 'stopped', loopIterations });
        this.socketManager?.emit(SocketEvents.WORKFLOW_STOPPED, { runId, sessionId });
        logger.info(`Workflow ${runId} stopped by user`);
        return { runId, finalAnswer: null, streamBuffer, state: finalState, stopped: true };
      }

      generateReport({ state: finalState, runId, sessionId, startedAt: runRow?.started_at, endedAt: runRow?.ended_at, status: 'complete', loopIterations });

      this.socketManager?.emit(SocketEvents.WORKFLOW_COMPLETE, {
        runId,
        finalAnswer: finalState?.finalAnswer,
        sessionId,
      });

      logger.info(`Workflow ${runId} complete`, { runId });
      return { runId, finalAnswer: finalState?.finalAnswer, streamBuffer, state: finalState };

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
      const errRow = this.db.table('workflow_runs').first({ id: runId });
      generateReport({ state: finalState, runId, sessionId, startedAt: errRow?.started_at, endedAt: errRow?.ended_at, status: 'error', loopIterations });
      this.socketManager?.emit(SocketEvents.WORKFLOW_ERROR, { runId, error: err.message });
      throw err;
    } finally {
      _activeRuns.delete(runId);
      clearAbortController(runId);
      memoryStore.clearWorkingMemory(runId);
      clearActiveRunWorkspace();
      // Release per-session STM so memory doesn't accumulate across runs
      for (const agentId of ['researcher', 'planner', 'worker', 'reviewer']) {
        deleteSTM(agentId, sessionId);
      }
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
