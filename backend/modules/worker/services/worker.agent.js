import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileTool } from '../../../core/tools/tool.implementations.js';
import { toLMStudioMessages, streamAndEmit, extractJSON } from '../../../core/utils/stream.utils.js';
import { getWorkspacePath } from '../../../core/workspace/workspace.path.js';
import { getSkillPrompt } from '../../../core/skills/skill.loader.js';
import { getRLStore } from '../../../core/rl/rl.store.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('worker');

const BASE_PROMPT = `You are a Worker Agent — an expert implementer. Your job is to produce complete, production-ready file contents that fulfil the given task. The active skill profile defines your domain expertise and quality standards.

## ⚠️ OUTPUT INSTRUCTION (most important rule)
After you finish reasoning, you MUST emit the JSON object below as your final output.
The JSON must appear OUTSIDE and AFTER any reasoning/thinking block — never inside <think> tags.
Do NOT end your response inside a thinking block. Close all thinking first, then output the JSON.

Output format — a single valid JSON object, nothing else:
{{"files":[{{"path":"relative/path/file.ext","content":"complete file content"}}],"summary":"concise description of what was implemented"}}

## ⚠️ JSON ENCODING RULES (strictly required)
- File content goes inside a JSON string — every newline MUST be written as the two-character escape sequence \n (backslash + n), NOT as an actual line break
- Every tab MUST be written as \t, every backslash as \\, every double-quote as \"
- The entire response must be parseable by JSON.parse() without any pre-processing
- Do NOT wrap the JSON in markdown code fences

## ⚠️ CRITICAL: Working with an Existing Project
If the task contains an "=== EXISTING WORKSPACE PROJECT ===" section, you MUST:
1. **Read every relevant existing file shown** before writing anything
2. **Modify files in-place** — your output for any existing file must be the COMPLETE updated content of that file, preserving all logic not changed by this task
3. **Never recreate from scratch** what already exists — if server.js is shown, output the modified server.js, not a new one
4. **Match the existing code style exactly** — same indentation, import style (ESM vs CJS), naming conventions, framework patterns
5. **Use only the dependencies already in package.json** — do not introduce new packages unless absolutely required by the task
6. **Keep import paths consistent** — use the same relative import style already in use
7. **Only change what the task requires** — leave unrelated code untouched

## Output Rules
- Paths are relative to workspace root (e.g. "src/routes/auth.js", "src/models/user.js")
- Content must be the COMPLETE file content — never use placeholders like "// ... rest of file"
- Include EVERY file that needs to be created or modified
- The JSON object is your ENTIRE response after reasoning — no prose, no markdown, no explanation

Your final output MUST be the JSON object — output it immediately after closing any thinking block.`;


function getSystemPrompt() {
  return BASE_PROMPT + getSkillPrompt('worker') + getRLStore().buildWorkerContext();
}

/**
 * Read a JSON string value from `text` starting at `pos` (the character AFTER
 * the opening double-quote). Returns { value, end } or null if unterminated.
 * Handles all standard JSON escape sequences; invalid escapes keep the char.
 */
function readJSONString(text, pos) {
  let value = '';
  let i = pos;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      const next = i + 1 < text.length ? text[i + 1] : '';
      switch (next) {
        case 'n':  value += '\n';                              i += 2; break;
        case 't':  value += '\t';                              i += 2; break;
        case 'r':  value += '\r';                              i += 2; break;
        case '"':  value += '"';                               i += 2; break;
        case '\\': value += '\\';                              i += 2; break;
        case '/':  value += '/';                               i += 2; break;
        case 'b':  value += '\b';                              i += 2; break;
        case 'f':  value += '\f';                              i += 2; break;
        case 'u': {
          const hex = text.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            value += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else {
            value += next; i += 2;
          }
          break;
        }
        default: value += next; i += 2; // invalid escape — keep the char
      }
    } else if (ch === '"') {
      return { value, end: i + 1 };
    } else {
      value += ch;
      i++;
    }
  }
  // Unterminated string (truncated output) — return whatever we accumulated
  return value.length > 0 ? { value, end: i } : null;
}

/**
 * Extract blueprint by scanning for "path" / "content" string pairs directly.
 * Does NOT attempt JSON.parse — processes each string value character-by-character.
 * Handles malformed JSON, unescaped backslashes, truncated output, and any
 * encoding quirk that breaks full-document JSON parsing.
 */
function extractBlueprintByStrings(text) {
  if (!text) return null;
  if (!text.includes('"files"') && !text.includes('"path"')) return null;

  const files = [];
  let pos = 0;

  while (pos < text.length) {
    // Locate the next "path" key
    const pathKeyIdx = text.indexOf('"path"', pos);
    if (pathKeyIdx === -1) break;

    // Skip to the opening quote of the path value (past colon and whitespace)
    let i = pathKeyIdx + 6;
    while (i < text.length && text[i] !== '"') i++;
    if (i >= text.length) break;
    i++; // step past opening quote

    const pathResult = readJSONString(text, i);
    if (!pathResult || !pathResult.value.includes('.')) {
      pos = pathKeyIdx + 6;
      continue;
    }

    // Locate "content" key that follows this "path"
    const contentKeyIdx = text.indexOf('"content"', pathResult.end);
    if (contentKeyIdx === -1) break;

    // Skip to the opening quote of the content value
    let j = contentKeyIdx + 9;
    while (j < text.length && text[j] !== '"') j++;
    if (j >= text.length) break;
    j++; // step past opening quote

    const contentResult = readJSONString(text, j);
    if (!contentResult) break;

    files.push({ path: pathResult.value, content: contentResult.value });
    pos = contentResult.end;
  }

  if (!files.length) return null;
  logger.info(`String-level extraction: ${files.length} file(s)`, { agentId: 'worker' });
  return { files, summary: 'Extracted via string-level parsing' };
}

/**
 * Last-resort fallback: extract a files blueprint from a markdown prose response.
 * Handles the common Qwen3 pattern where the model outputs explanations + code fences
 * instead of the requested raw JSON blueprint.
 *
 * Supported patterns (in priority order):
 *  1. **filename.ext** or ### filename.ext heading directly before a code fence
 *  2. First line of a code fence is a path comment: // src/file.js  or  # file.py
 *  3. Bare filename label on its own line before a fence: `src/server.js`
 */
// Regex that matches anything resembling a relative file path with an extension.
const PATH_RE = /((?:[\w][\w.\-]*\/)*[\w][\w.\-]*\.(?:js|ts|jsx|tsx|vue|css|scss|html|json|md|py|go|java|rb|rs|sh|env|yml|yaml|toml|txt|sql|graphql|proto|lock|config))\b/i;

function extractBlueprintFromMarkdown(text) {
  if (!text) return null;
  const files = [];
  const seen  = new Set();

  function addFile(rawPath, content) {
    const p = (rawPath || '').trim().replace(/\\/g, '/').replace(/^['"`*#\s]+|['"`*#\s]+$/g, '');
    if (!p || !p.includes('.') || seen.has(p)) return;
    seen.add(p);
    files.push({ path: p, content: content ?? '' });
  }

  // ── Collect all fenced code blocks with their positions ──────────────────
  const fenceRe = /```[\w-]*\n([\s\S]*?)```/gm;
  const fences  = [];
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    fences.push({ start: m.index, content: m[1] });
  }

  if (fences.length === 0) return null;

  // ── Strategy 1: path comment as FIRST line inside the fence ──────────────
  for (const fence of fences) {
    const firstLine = fence.content.split('\n')[0];
    const cm = firstLine.match(/^[ \t]*(?:\/\/|\/\*|#|<!--)[ \t]*(.+)/);
    if (cm) {
      const pm = cm[1].match(PATH_RE);
      if (pm) { addFile(pm[1], fence.content.slice(firstLine.length + 1)); continue; }
    }
  }

  if (files.length) {
    logger.info(`Markdown fallback: ${files.length} file(s) via path comments`, { agentId: 'worker' });
    return { files, summary: 'Extracted from markdown response' };
  }

  // ── Strategy 2: scan up to 8 lines BEFORE each fence for a path-like label ─
  for (const fence of fences) {
    const before    = text.slice(0, fence.start);
    const lines     = before.split('\n');
    const lookback  = lines.slice(-8);
    let   found     = false;
    for (let i = lookback.length - 1; i >= 0; i--) {
      const pm = lookback[i].match(PATH_RE);
      if (pm) { addFile(pm[1], fence.content); found = true; break; }
    }
    // If nothing found in lookback, check first line of fence content itself
    if (!found) {
      const fl = fence.content.split('\n')[0];
      const pm = fl.match(PATH_RE);
      if (pm) addFile(pm[1], fence.content.slice(fl.length + 1));
    }
  }

  if (files.length) {
    logger.info(`Markdown fallback: ${files.length} file(s) via pre-fence label scan`, { agentId: 'worker' });
    return { files, summary: 'Extracted from markdown response' };
  }

  // ── Strategy 3: last resort — assign fence index as synthetic filename ───
  // Only if fences contain substantial code (>3 lines), use fence order + lang hint
  const langExt = { javascript:'js', typescript:'ts', python:'py', go:'go', rust:'rs', java:'java', css:'css', html:'html', json:'json', bash:'sh', sh:'sh', vue:'vue' };
  const substFences = fences.filter(f => (f.content.match(/\n/g) || []).length > 3);
  if (substFences.length > 0) {
    const langRe = /```([\w-]+)\n/g;
    const langs  = [];
    let lm;
    while ((lm = langRe.exec(text)) !== null) langs.push(lm[1]);
    substFences.forEach((fence, i) => {
      const lang = langs[i] || '';
      const ext  = langExt[lang.toLowerCase()] || 'txt';
      addFile(`file_${i + 1}.${ext}`, fence.content);
    });
    logger.info(`Markdown fallback: ${files.length} file(s) via synthetic names (no labels found)`, { agentId: 'worker' });
    return { files, summary: 'Extracted from markdown response (synthetic filenames — check paths)' };
  }

  return null;
}

export class WorkerAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  async _applyBlueprint(output, fullRaw, sessionId) {
    const written = [];
    try {
      // Pass 1: standard JSON extraction (stripped output, then full raw for think-wrapped JSON)
      let blueprint = extractJSON(output) || extractJSON(fullRaw);
      if (!blueprint && output.trim().startsWith('{')) {
        // Log the exact JSON parse error to help diagnose the issue
        try { JSON.parse(output.trim()); } catch (e) {
          logger.warn(`JSON.parse failed: ${e.message} (at char ~${e.message.match(/position (\d+)/)?.[1] ?? '?'})`, { agentId: 'worker' });
        }
      }

      // Pass 2: string-level extraction — JSON.parse failed but the model DID output
      // the blueprint format; scan for "path"/"content" pairs without parsing the
      // full document (handles unbalanced braces, invalid escapes, trailing prose, etc.)
      if (!blueprint) {
        blueprint = extractBlueprintByStrings(output) || extractBlueprintByStrings(fullRaw);
        if (blueprint) {
          logger.warn(`Worker JSON unparseable — recovered ${blueprint.files?.length ?? 0} file(s) via string-level scan.`, { agentId: 'worker' });
        }
      }

      // Pass 3: markdown fallback — model wrote prose + code fences instead of raw JSON
      if (!blueprint) {
        blueprint = extractBlueprintFromMarkdown(output) || extractBlueprintFromMarkdown(fullRaw);
        if (blueprint) {
          logger.warn(`Worker produced markdown instead of JSON — extracted ${blueprint.files?.length ?? 0} file(s) via markdown parser. Consider using a model that follows JSON instructions more reliably.`, { agentId: 'worker' });
        }
      }

      if (!blueprint) {
        const isLikelyThinkOnly = !output.trim() && fullRaw.includes('<think>');
        if (isLikelyThinkOnly) {
          logger.warn(`Worker output was entirely inside <think> blocks — model did not emit JSON after reasoning. Increase max_tokens in Settings.`, { agentId: 'worker' });
        } else {
          logger.warn(`No JSON found in worker output (${output.length} chars). Model produced prose with no recognisable file structure.`, { agentId: 'worker' });
          logger.warn(`Worker output preview (first 800 chars): ${output.slice(0, 800)}`, { agentId: 'worker' });
        }
        return written;
      }
      // Normalise: model sometimes returns a single file object instead of the
      // full blueprint (brace-scanner edge case: Pass 4 of extractJSON iterates
      // blocks last-to-first and may find a trailing single-file excerpt before
      // the full blueprint — meaning extractBlueprintByStrings was never tried).
      let files;
      if (Array.isArray(blueprint.files)) {
        files = blueprint.files;
      } else if (blueprint.path && blueprint.content != null) {
        // extractJSON returned a single-file object — it may have matched a
        // trailing excerpt rather than the full blueprint. Try the string-level
        // scanner to recover all files before falling back to one-file mode.
        const multiBlueprint = extractBlueprintByStrings(output) || extractBlueprintByStrings(fullRaw);
        if (multiBlueprint?.files?.length > 1) {
          logger.info(`extractJSON returned single-file object; string scan recovered ${multiBlueprint.files.length} file(s).`, { agentId: 'worker' });
          files = multiBlueprint.files;
        } else {
          logger.warn(`Worker JSON returned single-file object — treating as one-file blueprint.`, { agentId: 'worker' });
          files = [blueprint];
        }
      } else {
        logger.warn(`Worker JSON has no "files" array (keys: ${Object.keys(blueprint).join(', ')})`, { agentId: 'worker' });
        files = [];
      }
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

  async execute(task, sessionId, planId = null, runId = null, continueFrom = null) {
    logger.info(`Executing task: ${task}`, { agentId: 'worker', sessionId });
    this.socketManager?.emitAgentStatus('worker', 'working', task);

    const compressedTask = compressString(task, 8192);
    const adapter = getAdapter('worker');
    // Use run-scoped memory to prevent cross-run context contamination
    const memory = memoryStore.getMemory('worker', runId || sessionId);

    let result        = '';
    let truncated     = false;
    let fullRawOutput = '';

    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', getSystemPrompt()],
        new MessagesPlaceholder('chat_history'),
        ['human', 'Task: {task}\n\nRemember: output ONLY the JSON blueprint starting with {{"files":[. No explanations, no markdown fences around the JSON, no prose.'],
      ]);
      // Workflow runs (runId set): skip STM history — previous step JSON blobs
      // in chat history confuse the model. Context is already injected via enrichedTask.
      const chatHistory = runId ? [] : (await memory.loadMemoryVariables({})).chat_history || [];
      let langchainMessages = await prompt.formatMessages({
        task: compressedTask,
        chat_history: chatHistory,
      });

      // Continuation mode: inject only the TAIL of the previous output as context.
      // Do NOT inject the full continueFrom as an AIMessage — at 8000+ chars it
      // consumes ~2000 tokens before generation even starts, leaving almost no room
      // for the continuation output and causing it to also truncate.
      // Instead, send only the last 600 chars as a HumanMessage reference so the
      // model knows exactly where to continue from, preserving most of the budget.
      if (continueFrom) {
        const TAIL_LEN = 600;
        const tail = continueFrom.slice(-TAIL_LEN);
        langchainMessages = [
          ...langchainMessages,
          new HumanMessage(
            `Your previous response was truncated mid-output. Continue the JSON from EXACTLY where it stopped.\n` +
            `The last ${Math.min(TAIL_LEN, continueFrom.length)} characters of your previous output were:\n\n` +
            `...${tail}\n\n` +
            `Output ONLY the continuation — no preamble, no restart, no repetition. ` +
            `Begin immediately from the next character after the cut-off point.`
          ),
        ];
        logger.info(`Continue mode: tail context ${Math.min(TAIL_LEN, continueFrom.length)} chars (full output was ${continueFrom.length} chars)`, { agentId: 'worker' });
      }

      const signal = runId ? getAbortSignal(runId) : undefined;
      const streamResult = await streamAndEmit(
        adapter._settings,
        toLMStudioMessages(langchainMessages),
        signal,
        this.socketManager,
        sessionId,
        'worker',
        true  // returnRaw — needed so we can search inside think blocks as fallback
      );
      // In continue mode, concatenate previous output with the new continuation
      let output    = continueFrom ? continueFrom + streamResult.output    : streamResult.output;
      fullRawOutput = continueFrom ? continueFrom + streamResult.rawOutput : streamResult.rawOutput;
      // Re-check truncation on the combined output — a continuation stream may have
      // completed normally while the full combined JSON is still malformed/incomplete.
      let combinedTrimmed = fullRawOutput.trimEnd();
      truncated = streamResult.truncated ||
        (combinedTrimmed.includes('{') && !combinedTrimmed.endsWith('}') && !combinedTrimmed.endsWith(']'));

      // Auto-continuation: if the model was cut off, re-prompt up to 2 more times
      const MAX_AUTO_CONTINUATIONS = 2;
      let autoContCount = 0;
      while (truncated && autoContCount < MAX_AUTO_CONTINUATIONS) {
        autoContCount++;
        logger.info(`Auto-continuing truncated output (attempt ${autoContCount}/${MAX_AUTO_CONTINUATIONS})`, { agentId: 'worker' });
        this.socketManager?.emitChatChunk(sessionId, `\n[Continuing truncated output…]\n`, 'worker');

        const TAIL_LEN = 600;
        const tail = output.slice(-TAIL_LEN);
        const contPromptMessages = await prompt.formatMessages({ task: compressedTask, chat_history: [] });
        const contMessages = [
          ...contPromptMessages,
          new HumanMessage(
            `Your previous response was truncated mid-output. Continue from EXACTLY where it stopped.\n` +
            `Last ${Math.min(TAIL_LEN, output.length)} characters of your previous output:\n\n...${tail}\n\n` +
            `Output ONLY the continuation — no preamble, no restart, no repetition. Begin immediately from the next character.`
          ),
        ];

        const contResult = await streamAndEmit(
          adapter._settings,
          toLMStudioMessages(contMessages),
          signal,
          this.socketManager, sessionId, 'worker', true
        );

        output        = output        + contResult.output;
        fullRawOutput = fullRawOutput + contResult.rawOutput;
        combinedTrimmed = fullRawOutput.trimEnd();
        truncated = contResult.truncated ||
          (combinedTrimmed.includes('{') && !combinedTrimmed.endsWith('}') && !combinedTrimmed.endsWith(']'));
      }

      // Always write the full raw LLM response to a debug file for inspection
      try {
        const debugDir = join(getWorkspacePath(), 'debug');
        mkdirSync(debugDir, { recursive: true });
        const debugFile = join(debugDir, '_debug_llm_response.txt');
        writeFileSync(debugFile,
          `=== Worker LLM Response Debug ===\n` +
          `Timestamp : ${new Date().toISOString()}\n` +
          `Task      : ${task.slice(0, 300)}\n` +
          `Output    : ${output.length} chars (stripped)\n` +
          `Raw       : ${fullRawOutput.length} chars (with think blocks)\n` +
          `Truncated : ${truncated}\n` +
          `\n=== STRIPPED OUTPUT ===\n${output}` +
          `\n\n=== FULL RAW OUTPUT (incl. think blocks) ===\n${fullRawOutput}`
        );
        logger.info(`LLM response written to workspace/debug/_debug_llm_response.txt`, { agentId: 'worker' });
      } catch (e) {
        logger.warn(`Could not write debug response file: ${e.message}`, { agentId: 'worker' });
      }

      if (truncated) {
        logger.warn(`Worker response was truncated — file content may be incomplete. Consider increasing context window in LM Studio or simplifying the task.`, { agentId: 'worker' });
      }

      const written = await this._applyBlueprint(output, fullRawOutput, sessionId);
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
    return { subtaskId, result, truncated, rawOutput: fullRawOutput };
  }
}
