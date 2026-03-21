import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { toLMStudioMessages, streamAndEmit, extractJSON, isDebugMode } from '../../../core/utils/stream.utils.js';
import { getSkillPrompt } from '../../../core/skills/skill.loader.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('planner');

const BASE_PROMPT = `You are a Planner Agent — a senior software architect responsible for decomposing complex goals into precise, executable subtasks.

## ⚠️ OUTPUT INSTRUCTION (most important rule)
After you finish reasoning, you MUST emit the JSON object below as your final output.
The JSON must appear OUTSIDE and AFTER any reasoning/thinking block — never inside <think> tags.
Close all thinking first, then immediately output the JSON on the very next line.

Output format — a single valid JSON object, nothing else:
{{"goal":"<original goal>","steps":[{{"id":"<uuid>","description":"<detailed actionable description>","researchQuery":"<focused research question the Researcher should answer before this step is implemented>","dependsOn":[],"agentHint":"worker"}}],"priority":"<low|medium|high|critical>","estimatedSteps":<number>}}

## ⚠️ CRITICAL: Working with an Existing Project

If the prompt contains an "=== EXISTING WORKSPACE PROJECT ===" section, you MUST:
1. **Read the file tree carefully** — understand what already exists before planning anything
2. **Plan additive steps only** — modify, extend, or add to existing files; never recreate what already exists
3. **Reference real file paths** — every step must name the exact existing file to modify OR the new file to add, using the same folder structure shown in the tree
4. **Respect the existing stack** — use the same framework, language, and dependencies already in package.json
5. **Do NOT start from scratch** — if a project already has a server, routes, or components, build on them

### Examples
- ❌ Bad: "Create a new Express server" (server already exists)
- ✅ Good: "Add POST /api/orders route to the existing backend/routes/api.js"
- ❌ Bad: "Set up a new React project" (React app already exists)
- ✅ Good: "Create frontend/src/components/OrderForm.vue and wire it into App.vue"

## Planning Principles

### Step Quality
- Each step must be **self-contained**: the Worker Agent should be able to implement it from the description alone
- Include the **what** (what to build/change), **where** (exact file path), and **how** (key implementation details)
- Bad: "Create the API" — Good: "Add POST /api/products and GET /api/products routes to backend/routes/products.js (create if missing), using the same middleware pattern as the existing routes"

### Step Granularity
- 1 step = 1 logical unit (one file group, one feature, one integration)
- Aim for 3–8 steps for most tasks; split large tasks further if needed
- Sequence steps so each builds on the previous (dependencies first)

### Step Order — follow this sequence when applicable:
1. Configuration / environment changes (package.json, .env, config files)
2. Data models / database schemas
3. Business logic / services / utilities
4. API routes / controllers
5. Frontend components / pages
6. Tests / verification

### Priority Rules
- critical: system is broken / security issue
- high: core feature, blocks other work
- medium: standard feature (default)
- low: enhancement, nice-to-have

### researchQuery
- Write a focused, specific question the Researcher Agent should answer before this step is implemented
- Good: "What is the best approach to implement JWT refresh token rotation in Express.js? What packages and security patterns should be used?"
- Bad: "Research authentication" (too vague)
- The query should target what the Worker needs to know to implement this step correctly

### agentHint
- Always "worker" — the Worker Agent handles all implementation

Your final output MUST be the JSON object — output it immediately after closing any thinking block.`;


function getSystemPrompt() { return BASE_PROMPT + getSkillPrompt('planner'); }

export class PlannerAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  async plan(goal, sessionId, runId = null) {
    logger.info(`Planning goal${isDebugMode() ? ': ' + goal : ''}`, { agentId: 'planner', sessionId });
    this.socketManager?.emitAgentStatus('planner', 'working', goal);

    const compressedGoal = compressString(goal, 12000);
    const adapter = getAdapter('planner');
    // Use run-scoped memory to prevent cross-run context contamination
    const memory = memoryStore.getMemory('planner', runId || sessionId);

    let rawOutput = '';

    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', getSystemPrompt()],
        new MessagesPlaceholder('chat_history'),
        ['human', '{goal}'],
      ]);
      // Workflow runs (runId set): skip STM history — each plan is independent.
      // Chat/direct calls: load history for continuity.
      const chatHistory = runId ? [] : (await memory.loadMemoryVariables({})).chat_history || [];
      const langchainMessages = await prompt.formatMessages({
        goal: compressedGoal,
        chat_history: chatHistory,
      });

      const signal = runId ? getAbortSignal(runId) : undefined;
      // Suppress raw JSON streaming — only the formatted step list is shown in chat
      rawOutput = await streamAndEmit(
        adapter._settings,
        toLMStudioMessages(langchainMessages),
        signal,
        null,
        sessionId,
        'planner'
      );

      await memory.saveContext({ input: goal }, { output: rawOutput });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      logger.error(`Planner LLM unavailable: ${err.message}`, { agentId: 'planner' });
      throw new Error(`Planner failed — check model name in Settings. Detail: ${err.message}`);
    }

    let plan;
    try {
      const parsed = extractJSON(rawOutput);
      if (!parsed) throw new Error('No JSON found');
      plan = parsed;
      plan.steps = (plan.steps || []).map((s) => ({
        ...s,
        id: s.id || uuidv4(),
        description: (s.description || '').replace(/\s+/g, ' ').trim(),
        researchQuery: (s.researchQuery || '').replace(/\s+/g, ' ').trim() || undefined,
      }));
    } catch {
      // Strip research/workspace context injected for the LLM — use only the user's original goal
      const baseGoal = compressedGoal
        .split('\n[Research Context]')[0]
        .split('\n=== EXISTING WORKSPACE PROJECT ===')[0]
        .trim() || compressedGoal;
      plan = {
        goal: baseGoal,
        steps: [{ id: uuidv4(), description: baseGoal, dependsOn: [], agentHint: 'worker' }],
        priority: 'medium',
        estimatedSteps: 1,
      };
    }

    const planId = uuidv4();
    this.db.table('plans').insert({
      id: planId,
      session_id: sessionId,
      goal,
      steps_json: JSON.stringify(plan.steps),
      status: 'active',
      created_at: Math.floor(Date.now() / 1000),
    });

    await memoryStore.snapshotMemory('planner', runId || sessionId);
    this.socketManager?.emitAgentStatus('planner', 'idle');
    this.socketManager?.emit('memory:updated', { agentId: 'planner', sessionId });

    logger.info(`Plan created with ${plan.steps.length} steps`, { agentId: 'planner', planId });
    return { planId, ...plan };
  }
}
