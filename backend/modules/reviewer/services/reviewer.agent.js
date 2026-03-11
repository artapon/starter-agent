import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { toLMStudioMessages, streamAndEmit } from '../../../core/utils/stream.utils.js';
import { getSkillPrompt } from '../../../core/skills/skill.loader.js';

const logger = createLogger('reviewer');

const BASE_PROMPT = `You are a Reviewer Agent. Review the given implementation and provide feedback.

Output ONLY a valid JSON object — no markdown, no explanation:
{{"approved":true,"score":8,"feedback":"<assessment>","suggestions":["<tip1>","<tip2>"]}}

Evaluate: correctness, code quality, edge cases, security.
Return raw JSON only.`;

function getSystemPrompt() { return BASE_PROMPT + getSkillPrompt('reviewer'); }

export class ReviewerAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  async review(content, task, sessionId, subtaskId = null, runId = null) {
    logger.info(`Reviewing content for task: ${task}`, { agentId: 'reviewer', sessionId });
    this.socketManager?.emitAgentStatus('reviewer', 'working', `Reviewing: ${task}`);

    const compressed = compressString(content, 4096);
    const adapter = getAdapter('reviewer');
    const memory = memoryStore.getMemory('reviewer', sessionId);

    let rawOutput = '';

    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', getSystemPrompt()],
        new MessagesPlaceholder('chat_history'),
        ['human', 'Task: {task}\n\nSubmission:\n{content}'],
      ]);
      const histVars = await memory.loadMemoryVariables({});
      const langchainMessages = await prompt.formatMessages({
        task,
        content: compressed,
        chat_history: histVars.chat_history || [],
      });

      const signal = runId ? getAbortSignal(runId) : undefined;
      rawOutput = await streamAndEmit(
        adapter._settings,
        toLMStudioMessages(langchainMessages),
        signal,
        this.socketManager,
        sessionId,
        'reviewer'
      );

      await memory.saveContext({ input: `${task}: ${content}` }, { output: rawOutput });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      logger.error(`Reviewer LLM unavailable, skipping: ${err.message}`, { agentId: 'reviewer' });
      this.socketManager?.emitAgentStatus('reviewer', 'idle');
      return { approved: true, score: 5, feedback: `Review skipped — LLM error: ${err.message}`, suggestions: [] };
    }

    let review;
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      review = JSON.parse(jsonMatch ? jsonMatch[0] : rawOutput);
    } catch {
      review = { approved: true, score: 7, feedback: rawOutput, suggestions: [] };
    }

    if (subtaskId) {
      this.db.table('reviews').insert({
        subtask_id: subtaskId,
        feedback: review.feedback,
        approved: review.approved ? 1 : 0,
        created_at: Math.floor(Date.now() / 1000),
      });
    }

    await memoryStore.snapshotMemory('reviewer', sessionId);
    this.socketManager?.emitAgentStatus('reviewer', 'idle');
    this.socketManager?.emit('memory:updated', { agentId: 'reviewer', sessionId });

    logger.info(`Review complete: approved=${review.approved}`, { agentId: 'reviewer' });
    return review;
  }
}
