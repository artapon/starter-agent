import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { toLMStudioMessages, streamAndEmit } from '../../../core/utils/stream.utils.js';
import { getSkillPrompt } from '../../../core/skills/skill.loader.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('planner');

const BASE_PROMPT = `You are a Planner Agent. Decompose the user's goal into an ordered list of worker subtasks.

Output ONLY a valid JSON object — no markdown, no explanation:
{{"goal":"<original goal>","steps":[{{"id":"<uuid>","description":"<what to do>","dependsOn":[],"agentHint":"worker"}}],"priority":"medium","estimatedSteps":<number>}}

Rules:
- agentHint must be "worker" for coding tasks
- Be concise and actionable
- Return raw JSON only`;

function getSystemPrompt() { return BASE_PROMPT + getSkillPrompt('planner'); }

export class PlannerAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  async plan(goal, sessionId, runId = null) {
    logger.info(`Planning goal: ${goal}`, { agentId: 'planner', sessionId });
    this.socketManager?.emitAgentStatus('planner', 'working', goal);

    const compressedGoal = compressString(goal, 4096);
    const adapter = getAdapter('planner');
    const memory = memoryStore.getMemory('planner', sessionId);

    let rawOutput = '';

    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', getSystemPrompt()],
        new MessagesPlaceholder('chat_history'),
        ['human', '{goal}'],
      ]);
      const histVars = await memory.loadMemoryVariables({});
      const langchainMessages = await prompt.formatMessages({
        goal: compressedGoal,
        chat_history: histVars.chat_history || [],
      });

      const signal = runId ? getAbortSignal(runId) : undefined;
      rawOutput = await streamAndEmit(
        adapter._settings,
        toLMStudioMessages(langchainMessages),
        signal,
        this.socketManager,
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
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      plan = JSON.parse(jsonMatch ? jsonMatch[0] : rawOutput);
      plan.steps = (plan.steps || []).map((s) => ({ ...s, id: s.id || uuidv4() }));
    } catch {
      plan = {
        goal: compressedGoal,
        steps: [{ id: uuidv4(), description: compressedGoal, dependsOn: [], agentHint: 'worker' }],
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

    await memoryStore.snapshotMemory('planner', sessionId);
    this.socketManager?.emitAgentStatus('planner', 'idle');
    this.socketManager?.emit('memory:updated', { agentId: 'planner', sessionId });

    logger.info(`Plan created with ${plan.steps.length} steps`, { agentId: 'planner', planId });
    return { planId, ...plan };
  }
}
