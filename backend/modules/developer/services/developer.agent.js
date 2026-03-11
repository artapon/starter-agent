import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { writeFileTool } from '../../../core/tools/tool.implementations.js';
import { toLMStudioMessages, streamAndEmit } from '../../../core/utils/stream.utils.js';
import { getSkillPrompt } from '../../../core/skills/skill.loader.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('developer');

const BASE_PROMPT = `You are a Developer Agent. Implement the given task.

Respond with ONLY a valid JSON object — no markdown fences, no explanation outside the JSON:
{{"files":[{{"path":"relative/path/file.ext","content":"complete file content"}}],"summary":"what was implemented"}}

Rules:
- paths are relative to workspace root (e.g. "demo.controller.js", "src/utils/helper.js")
- content must be the COMPLETE file content, not a snippet
- include every file that needs to be created or modified
- output raw JSON only`;

function getSystemPrompt() { return BASE_PROMPT + getSkillPrompt('developer'); }

export class DeveloperAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  async _applyBlueprint(output, sessionId) {
    const written = [];
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return written;
      const blueprint = JSON.parse(jsonMatch[0]);
      const files = Array.isArray(blueprint.files) ? blueprint.files : [];
      for (const { path: filePath, content } of files) {
        if (!filePath || content == null) continue;
        const result = await writeFileTool.func({ path: filePath, content: String(content) });
        written.push(filePath);
        logger.info(`Wrote: ${filePath}`, { agentId: 'developer' });
        this.socketManager?.emitChatChunk(sessionId, `\n✓ ${result}`, 'developer');
      }
    } catch (e) {
      logger.warn(`Blueprint apply failed: ${e.message}`, { agentId: 'developer' });
    }
    return written;
  }

  async execute(task, sessionId, planId = null, runId = null) {
    logger.info(`Executing task: ${task}`, { agentId: 'developer', sessionId });
    this.socketManager?.emitAgentStatus('developer', 'working', task);

    const compressedTask = compressString(task, 8192);
    const adapter = getAdapter('developer');
    const memory = memoryStore.getMemory('developer', sessionId);

    let result = '';

    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', getSystemPrompt()],
        new MessagesPlaceholder('chat_history'),
        ['human', 'Task: {task}'],
      ]);
      const histVars = await memory.loadMemoryVariables({});
      const langchainMessages = await prompt.formatMessages({
        task: compressedTask,
        chat_history: histVars.chat_history || [],
      });

      const signal = runId ? getAbortSignal(runId) : undefined;
      const output = await streamAndEmit(
        adapter._settings,
        toLMStudioMessages(langchainMessages),
        signal,
        this.socketManager,
        sessionId,
        'developer'
      );

      const written = await this._applyBlueprint(output, sessionId);
      await memory.saveContext({ input: task }, { output });
      result = written.length > 0
        ? `Implemented ${written.length} file(s): ${written.join(', ')}`
        : output;

    } catch (err) {
      if (err.name === 'AbortError') throw err;
      logger.error(`Developer LLM unavailable: ${err.message}`, { agentId: 'developer' });
      throw new Error(`Developer failed — check model name in Settings. Detail: ${err.message}`);
    }

    const subtaskId = uuidv4();
    this.db.table('subtasks').insert({
      id: subtaskId,
      plan_id: planId || '',
      step_id: uuidv4(),
      description: task,
      result_json: JSON.stringify({ content: result }),
      status: 'complete',
      created_at: Math.floor(Date.now() / 1000),
    });

    await memoryStore.snapshotMemory('developer', sessionId);
    this.socketManager?.emitAgentStatus('developer', 'idle');
    this.socketManager?.emit('memory:updated', { agentId: 'developer', sessionId });

    logger.info('Task execution complete', { agentId: 'developer', subtaskId });
    return { subtaskId, result };
  }
}
