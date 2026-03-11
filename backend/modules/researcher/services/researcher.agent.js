import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { toLMStudioMessages, streamAndEmit } from '../../../core/utils/stream.utils.js';
import { getSkillPrompt } from '../../../core/skills/skill.loader.js';

const logger = createLogger('researcher');

const BASE_PROMPT = `You are a Research Agent. Your job is to deeply analyze a goal before any code is written.

Output ONLY a valid JSON object — no markdown, no explanation:
{{"topic":"<goal summary>","summary":"<2-3 sentence analysis>","approaches":[{{"name":"<approach>","pros":["<pro>"],"cons":["<con>"]}}],"keyConsiderations":["<consideration>"],"recommendedApproach":"<which approach and why>","techStack":["<tech>"],"potentialChallenges":["<challenge>"]}}

Rules:
- Identify the best architectural patterns and frameworks for the goal
- List 2-3 concrete approaches with trade-offs
- Flag security, performance, and scalability concerns
- Return raw JSON only`;

function getSystemPrompt() { return BASE_PROMPT + getSkillPrompt('researcher'); }

export class ResearcherAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  async research(goal, sessionId, runId = null) {
    logger.info(`Researching goal: ${goal}`, { agentId: 'researcher', sessionId });
    this.socketManager?.emitAgentStatus('researcher', 'working', goal);

    const compressedGoal = compressString(goal, 4096);
    const adapter = getAdapter('researcher');
    const memory = memoryStore.getMemory('researcher', sessionId);

    let rawOutput = '';

    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', getSystemPrompt()],
        new MessagesPlaceholder('chat_history'),
        ['human', 'Research this goal and provide findings: {goal}'],
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
        'researcher'
      );

      await memory.saveContext({ input: goal }, { output: rawOutput });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      logger.error(`Researcher LLM unavailable: ${err.message}`, { agentId: 'researcher' });
      throw new Error(`Researcher failed — check model name in Settings. Detail: ${err.message}`);
    }

    let findings;
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      findings = JSON.parse(jsonMatch ? jsonMatch[0] : rawOutput);
    } catch {
      findings = {
        topic: goal,
        summary: rawOutput,
        approaches: [],
        keyConsiderations: [],
        recommendedApproach: '',
        techStack: [],
        potentialChallenges: [],
      };
    }

    await memoryStore.snapshotMemory('researcher', sessionId);
    this.socketManager?.emitAgentStatus('researcher', 'idle');
    this.socketManager?.emit('memory:updated', { agentId: 'researcher', sessionId });

    logger.info(`Research complete for: ${goal}`, { agentId: 'researcher' });
    return findings;
  }
}
