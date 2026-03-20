import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { toLMStudioMessages, streamAndEmit, extractJSON, isDebugMode } from '../../../core/utils/stream.utils.js';
import { getSkillPrompt } from '../../../core/skills/skill.loader.js';
import { getRLStore } from '../../../core/rl/rl.store.js';

const logger = createLogger('reviewer');

/**
 * Regex-based fallback for when the reviewer output is truncated JSON.
 * Extracts known fields (score, approved, feedback) from partial JSON text.
 */
function parseReviewFallback(text) {
  const scoreMatch   = text.match(/"score"\s*:\s*(\d+)/);
  const approvedMatch = text.match(/"approved"\s*:\s*(true|false)/);
  const feedbackMatch = text.match(/"feedback"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 7;
  const feedback = feedbackMatch
    ? feedbackMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
    : '';
  return {
    approved:    approvedMatch ? approvedMatch[1] === 'true' : score >= 7,
    score,
    feedback,
    suggestions: [],
  };
}

const BASE_PROMPT = `You are a Reviewer Agent — a senior engineer and code quality expert. Review the implementation critically and objectively.

## ⚠️ OUTPUT INSTRUCTION (most important rule)
After you finish reasoning, you MUST emit the JSON object below as your final output.
The JSON must appear OUTSIDE and AFTER any reasoning/thinking block — never inside <think> tags.
Close all thinking first, then immediately output the JSON on the very next line.

Output format — a single valid JSON object, nothing else:
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

Your final output MUST be the JSON object — output it immediately after closing any thinking block.`;


function getSystemPrompt() {
  return BASE_PROMPT + getSkillPrompt('reviewer') + getRLStore().buildReviewerContext();
}

export class ReviewerAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  async review(content, task, sessionId, subtaskId = null, runId = null) {
    logger.info(`Reviewing content${isDebugMode() ? ' for task: ' + task : ''}`, { agentId: 'reviewer', sessionId });
    this.socketManager?.emitAgentStatus('reviewer', 'working', `Reviewing: ${task}`);

    const compressed = compressString(content, 12000);
    const adapter = getAdapter('reviewer');
    // Use run-scoped memory to prevent cross-run context contamination
    const memory = memoryStore.getMemory('reviewer', runId || sessionId);

    let reviewOutput = '';
    let fullRawOutput = '';

    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', getSystemPrompt()],
        new MessagesPlaceholder('chat_history'),
        ['human', 'Task: {task}\n\nSubmission:\n{content}'],
      ]);
      // Workflow runs (runId set): skip STM history — reviews are self-contained.
      const chatHistory = runId ? [] : (await memory.loadMemoryVariables({})).chat_history || [];
      const langchainMessages = await prompt.formatMessages({
        task,
        content: compressed,
        chat_history: chatHistory,
      });

      const signal = runId ? getAbortSignal(runId) : undefined;
      const streamResult = await streamAndEmit(
        adapter._settings,
        toLMStudioMessages(langchainMessages),
        signal,
        this.socketManager,
        sessionId,
        'reviewer',
        true  // returnRaw — needed so we can search inside think blocks as fallback
      );
      reviewOutput    = streamResult.output;
      fullRawOutput   = streamResult.rawOutput;

      await memory.saveContext({ input: `${task}: ${content}` }, { output: reviewOutput });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      logger.error(`Reviewer LLM unavailable, skipping: ${err.message}`, { agentId: 'reviewer' });
      this.socketManager?.emitAgentStatus('reviewer', 'idle');
      return { approved: true, score: 5, feedback: `Review skipped — LLM error: ${err.message}`, suggestions: [] };
    }

    let review;
    // Try stripped output first, then full raw (catches JSON inside <think> blocks)
    const parsed = extractJSON(reviewOutput) || extractJSON(fullRawOutput);
    if (parsed) {
      review = parsed;
    } else {
      // Last resort: regex extraction from partial/truncated JSON
      const regexResult = parseReviewFallback(reviewOutput) || parseReviewFallback(fullRawOutput);
      if (regexResult.score !== 7 || regexResult.feedback) {
        // Regex found something useful
        review = regexResult;
        logger.error(`Reviewer JSON truncated — extracted via regex: score=${regexResult.score}`, { agentId: 'reviewer' });
      } else {
        logger.error(`Reviewer produced no parseable JSON (${reviewOutput.length} chars)`, { agentId: 'reviewer' });
        review = { approved: true, score: 7, feedback: reviewOutput.slice(0, 500) || 'Review output could not be parsed.', suggestions: [] };
      }
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
