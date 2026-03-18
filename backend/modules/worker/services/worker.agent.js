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
import { getRLStore } from '../../../core/rl/rl.store.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('worker');

const BASE_PROMPT = `You are a Worker Agent — a senior full-stack engineer. Your job is to implement the given task by producing complete, production-ready file contents.

Respond with ONLY a valid JSON object — no markdown fences, no explanation outside the JSON:
{{"files":[{{"path":"relative/path/file.ext","content":"complete file content"}}],"summary":"concise description of what was implemented"}}

## ⚠️ CRITICAL: Working with an Existing Project

If the task contains an "=== EXISTING WORKSPACE PROJECT ===" section, you MUST:
1. **Read every relevant existing file shown** before writing anything
2. **Modify files in-place** — your output for any existing file must be the COMPLETE updated content of that file, preserving all logic not changed by this task
3. **Never recreate from scratch** what already exists — if server.js is shown, output the modified server.js, not a new one
4. **Match the existing code style exactly** — same indentation, import style (ESM vs CJS), naming conventions, framework patterns
5. **Use only the dependencies already in package.json** — do not introduce new packages unless absolutely required by the task
6. **Keep import paths consistent** — use the same relative import style already in use
7. **Only change what the task requires** — leave unrelated code untouched

## Implementation Standards

### Output Format
- paths are relative to workspace root (e.g. "src/routes/auth.js", "src/models/user.js")
- content must be the COMPLETE file content — never use placeholders like "// ... rest of file"
- include EVERY file that needs to be created or modified
- output raw JSON only — no text before or after the JSON object

### Code Quality
- Write idiomatic, readable code following best practices for the language/framework
- Use meaningful variable and function names
- Add error handling for I/O operations, async calls, and external APIs
- Validate inputs at system boundaries
- Structure code logically: imports → constants → helpers → main exports

### Node.js / JavaScript specifics
- Use ES modules (import/export) unless the project uses CommonJS
- Prefer async/await over callbacks or raw Promises
- Use const/let appropriately; avoid var
- Handle Promise rejections — never leave unhandled rejections

### API / Backend specifics
- Follow RESTful conventions: proper HTTP methods, status codes, response shapes
- Validate request body/params/query before processing
- Return consistent JSON responses: {{ data, error, message }}
- Use middleware for cross-cutting concerns (auth, validation, logging)

### Frontend specifics
- Prefer composition API for Vue components
- Keep components focused and small
- Use semantic HTML and accessible ARIA attributes where relevant
- Avoid inline styles; use CSS classes or scoped styles

### File Organization
- Follow the existing project's folder structure and naming conventions
- One responsibility per file
- Place helper utilities in dedicated utility files

Return raw JSON only. No text before or after the JSON object.`;


function getSystemPrompt() {
  return BASE_PROMPT + getSkillPrompt('worker') + getRLStore().buildWorkerContext();
}

export class WorkerAgent {
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
        logger.info(`Wrote: ${filePath}`, { agentId: 'worker' });
        this.socketManager?.emitChatChunk(sessionId, `\n✓ ${result}`, 'worker');
      }
    } catch (e) {
      logger.warn(`Blueprint apply failed: ${e.message}`, { agentId: 'worker' });
    }
    return written;
  }

  async execute(task, sessionId, planId = null, runId = null) {
    logger.info(`Executing task: ${task}`, { agentId: 'worker', sessionId });
    this.socketManager?.emitAgentStatus('worker', 'working', task);

    const compressedTask = compressString(task, 8192);
    const adapter = getAdapter('worker');
    // Use run-scoped memory to prevent cross-run context contamination
    const memory = memoryStore.getMemory('worker', runId || sessionId);

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
        'worker'
      );

      const written = await this._applyBlueprint(output, sessionId);
      await memory.saveContext({ input: task }, { output });
      result = written.length > 0
        ? `Implemented ${written.length} file(s): ${written.join(', ')}`
        : output;

    } catch (err) {
      if (err.name === 'AbortError') throw err;
      logger.error(`Worker LLM unavailable: ${err.message}`, { agentId: 'worker' });
      throw new Error(`Worker failed — check model name in Settings. Detail: ${err.message}`);
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

    await memoryStore.snapshotMemory('worker', runId || sessionId);
    this.socketManager?.emitAgentStatus('worker', 'idle');
    this.socketManager?.emit('memory:updated', { agentId: 'worker', sessionId });

    logger.info('Task execution complete', { agentId: 'worker', subtaskId });
    return { subtaskId, result };
  }
}
