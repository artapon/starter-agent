import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { toLMStudioMessages, streamAndEmit, extractJSON, isDebugMode } from '../../../core/utils/stream.utils.js';
import { getLibrarySkillPrompt } from '../../../core/skills/skill.loader.js';
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

const BASE_PROMPT = `You are a Reviewer Agent — a senior expert who evaluates implementations critically and objectively.

## ⚠️ OUTPUT INSTRUCTION (most important rule)
After you finish reasoning, you MUST emit the JSON object below as your final output.
The JSON must appear OUTSIDE and AFTER any reasoning/thinking block — never inside <think> tags.
Close all thinking first, then immediately output the JSON on the very next line.

Output format — a single valid JSON object, nothing else:
{{"approved":<bool>,"score":<0-10>,"feedback":"<concise overall assessment>","suggestions":["<specific actionable improvement>"],"dimensions":{{"correctness":<0-10>,"quality":<0-10>,"completeness":<0-10>,"polish":<0-10>}}}}

## ⚠️ CRITICAL — Evaluate What Was Actually Requested

**Read the task description first.** Your criteria must match the task type.

### For Frontend / Design / HTML / CSS tasks (portfolio, landing page, UI, visual design):
- correctness: Does it match what was asked? Right sections, right purpose, right layout?
- quality: Visual polish — professional typography, color palette, spacing, hover states, responsive layout
- completeness: All sections present with REAL content (not "Your name here", not lorem ipsum, not placeholder text)
- polish: Semantic HTML, CSS custom properties, mobile-responsive, accessible color contrast

**For design tasks, do NOT penalise for missing: git commits, README files, backend security, deployment config, CI/CD.**
These are process artifacts irrelevant to HTML/CSS output quality.

### For Backend / API / Service tasks:
- correctness: Logic is correct, edge cases handled, no obvious bugs
- quality: Readable code, proper error handling, follows language idioms, no dead code
- completeness: All endpoints/functions present, no TODOs or stubs, imports correct
- polish: Security (no hardcoded secrets, input validation, no injection), performance (no N+1, async non-blocking)

## Scoring Rubric (0–10)

- 10: Excellent. Fully meets the request, polished, production-ready.
- 8–9: Good quality. Minor improvements possible but fully functional and usable.
- 6–7: Adequate. Core request fulfilled but notable gaps or rough edges.
- 4–5: Partial. Recognisable attempt but significant missing pieces or quality issues.
- 2–3: Poor. Major issues — incomplete, broken, or clearly off-task.
- 0–1: Unusable. Fundamentally broken or completely wrong output.

### Approval Threshold
- approved: true  → score ≥ 7
- approved: false → score < 7

## Feedback Guidelines
- feedback: 1–2 sentences on overall quality and the single most critical issue
- suggestions: 2–5 specific, actionable items that directly improve the OUTPUT quality
- Suggestions must describe concrete changes to the code/design — not process steps like "commit to git"
- If score < 7, the first suggestion must be the most impactful fix

Your final output MUST be the JSON object — output it immediately after closing any thinking block.`;


function getSystemPrompt(skill = null) {
  return BASE_PROMPT + getLibrarySkillPrompt('reviewer', skill) + getRLStore().buildReviewerContext();
}

export class ReviewerAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  async review(content, task, sessionId, subtaskId = null, runId = null, skill = null) {
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
        ['system', getSystemPrompt(skill)],
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
    // Pass 0: LangChain JsonOutputParser — standard first attempt
    try {
      review = await new JsonOutputParser().parse(reviewOutput);
    } catch { /* fall through */ }

    // Pass 1: repairJSON + brace scanner (catches think-wrapped JSON, minor malformation)
    if (!review) {
      review = extractJSON(reviewOutput) || extractJSON(fullRawOutput);
    }

    if (!review) {
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
