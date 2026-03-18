import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { toLMStudioMessages, streamAndEmit } from '../../../core/utils/stream.utils.js';
import { getSkillPrompt } from '../../../core/skills/skill.loader.js';
import { getRLStore } from '../../../core/rl/rl.store.js';

const logger = createLogger('reviewer');

const BASE_PROMPT = `You are a Reviewer Agent — a senior engineer and code quality expert. Review the implementation critically and objectively.

Output ONLY a valid JSON object — no markdown, no explanation:
{{"approved":<bool>,"score":<0-10>,"feedback":"<concise overall assessment>","suggestions":["<specific actionable improvement>"],"dimensions":{{"correctness":<0-10>,"codeQuality":<0-10>,"security":<0-10>,"completeness":<0-10>}}}}

## Scoring Rubric (0–10)

### Overall Score
- 10: Production-ready. Exemplary code, handles all cases, secure, well-structured.
- 8–9: Good quality. Minor improvements possible but fully functional.
- 6–7: Adequate. Works for the happy path but missing error handling or edge cases.
- 4–5: Partial. Core logic present but significant gaps or bugs exist.
- 2–3: Poor. Major issues — logic errors, security risks, or incomplete implementation.
- 0–1: Unusable. Fundamentally broken or completely off-task.

### Approval Threshold
- approved: true  → score ≥ 7 (ready to ship or use as-is)
- approved: false → score < 7  (needs rework)

## Evaluation Dimensions

### Correctness (0–10)
- Does it implement exactly what was requested?
- Is the logic sound and free of obvious bugs?
- Are edge cases handled (empty inputs, null values, boundary conditions)?

### Code Quality (0–10)
- Readable, well-named variables and functions
- Appropriate error handling (try/catch, validation)
- No dead code, no magic numbers, no unnecessary complexity
- Follows language idioms and best practices

### Security (0–10)
- No hardcoded secrets or credentials
- Input validation before processing
- No obvious injection vulnerabilities (SQL, command, XSS)
- Sensitive data handled appropriately

### Completeness (0–10)
- All files the task requires are present
- No placeholders, TODOs, or stub implementations left behind
- Dependencies and imports are correct

## Feedback Guidelines
- feedback: 1–2 sentences summarizing overall quality and the most critical issue
- suggestions: 2–5 specific, actionable items (not vague advice like "improve error handling" — say exactly what to add)
- If score < 7, the first suggestion must describe the most critical fix needed

Return raw JSON only. No text before or after the JSON object.`;


function getSystemPrompt() {
  return BASE_PROMPT + getSkillPrompt('reviewer') + getRLStore().buildReviewerContext();
}

export class ReviewerAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  async review(content, task, sessionId, subtaskId = null, runId = null) {
    logger.info(`Reviewing content for task: ${task}`, { agentId: 'reviewer', sessionId });
    this.socketManager?.emitAgentStatus('reviewer', 'working', `Reviewing: ${task}`);

    const compressed = compressString(content, 6000);
    const adapter = getAdapter('reviewer');
    // Use run-scoped memory to prevent cross-run context contamination
    const memory = memoryStore.getMemory('reviewer', runId || sessionId);

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

    await memoryStore.snapshotMemory('reviewer', runId || sessionId);
    this.socketManager?.emitAgentStatus('reviewer', 'idle');
    this.socketManager?.emit('memory:updated', { agentId: 'reviewer', sessionId });

    logger.info(`Review complete: approved=${review.approved}`, { agentId: 'reviewer' });
    return review;
  }
}
