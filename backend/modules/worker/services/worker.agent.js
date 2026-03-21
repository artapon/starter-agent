import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileTool } from '../../../core/tools/tool.implementations.js';
import { toLMStudioMessages, streamAndEmit, extractJSON, isDebugMode } from '../../../core/utils/stream.utils.js';
import { getWorkspacePath } from '../../../core/workspace/workspace.path.js';
import { getSkillPrompt, getRawLibrarySkillPrompt, getLibrarySkillPrompt } from '../../../core/skills/skill.loader.js';
import { getRLStore } from '../../../core/rl/rl.store.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('worker');

const BASE_PROMPT = `You are a Worker Agent — an expert full-stack implementer. Your job is to produce complete, production-ready files that precisely fulfil the given task. Every import must resolve, every function must be implemented, zero TODOs.

## ⚠️ OUTPUT INSTRUCTION
After reasoning, emit ONE valid JSON object as your final output — immediately after closing any <think> block.
Never emit JSON inside a <think> block. Close all thinking first, then output JSON.

Output format — exactly this shape, nothing else:
{{"files":[{{"path":"relative/path/file.ext","content":"complete file content"}}],"summary":"one sentence: what was built and which files"}}

## ⚠️ JSON ENCODING RULES (strictly required)
- Every newline inside a string value → \\n (backslash + n), NOT a real line break
- Every tab → \\t, every backslash → \\\\, every double-quote → \\"
- The entire response must be parseable by JSON.parse() with zero pre-processing
- Do NOT wrap the JSON in markdown fences

## ⚠️ PRE-OUTPUT ACCURACY CHECK
Before finalising your JSON, silently verify each file:
1. Every import path resolves — to a file already in the workspace OR one you are outputting right now
2. Every function/variable you call is defined in the same file or in an import you've listed
3. Zero placeholder comments: no TODO, no "// implement", no "// add logic here", no "// rest of code"
4. Every exported function has a complete body — not an empty stub
5. Naming is consistent across all files (same function names, same variable names, same path conventions)

If any check fails, fix the issue before outputting.

## ⚠️ WORKING WITH AN EXISTING PROJECT
If the task contains "=== EXISTING WORKSPACE PROJECT ===":
1. Study every relevant file shown — understand its structure, imports, and patterns before writing
2. Output the COMPLETE updated content of any modified file — preserving all existing logic not changed by this task
3. Never recreate from scratch what already exists
4. Match the existing code style exactly: indentation, import style (ESM vs CJS), naming conventions
5. Use only dependencies already in package.json — no new packages unless absolutely required
6. Only change what the task requires — leave unrelated code untouched

## Output Rules
- Paths are relative to workspace root (e.g. "src/routes/auth.js")
- Content = COMPLETE file — never use "// ... rest of file" or any placeholder
- Include EVERY file that needs creating or modifying for the task to work end-to-end
- After reasoning: output ONLY the JSON — no prose, no markdown, no explanation

Your final output MUST be the JSON object — emit it immediately after closing any thinking block.`;


function getSystemPrompt(skill = null) {
  // Used by _executeSingleCall via ChatPromptTemplate — must be brace-escaped
  return BASE_PROMPT + getLibrarySkillPrompt('worker', skill) + getRLStore().buildWorkerContext();
}

// ── File-by-file mode prompts ──────────────────────────────────────────────

const PLAN_PROMPT = `You are a Worker Agent — expert implementer. Plan which files to create.

Output ONLY a single valid JSON object listing every file needed:
{"files":[{"path":"relative/path/file.ext","description":"what this file does"}],"summary":"one sentence: what will be built"}

Rules:
- List EVERY file that needs creating or modifying for the task to work end-to-end
- Paths are relative to workspace root (e.g. "src/routes/auth.js")
- No markdown, no explanation — ONLY the JSON`;

const FILE_PROMPT = `You are a Worker Agent — expert implementer writing one file at a time.

## Output instruction
After reasoning, output ONLY this JSON — immediately after closing any <think> block:
{"path":"the/file/path.ext","content":"complete file content"}

## JSON encoding rules
- Every newline inside content → \\n (backslash + n)
- Every tab → \\t, every backslash → \\\\, every double-quote → \\"
- Response must be parseable by JSON.parse()
- Do NOT wrap in markdown fences

## Completeness (non-negotiable)
- Write the COMPLETE file — no placeholders, no TODOs, no stubs, no "// rest of code"
- Every import must resolve to a file in the workspace or a file already listed as written
- Every function you reference must be implemented

Your final output MUST be the JSON object.`;

function getPlanSystemPrompt(skill = null) {
  // Plain messages — use raw (no brace-escaping)
  return PLAN_PROMPT + getRawLibrarySkillPrompt('worker', skill);
}

function getFileSystemPrompt(skill = null) {
  // Plain messages — use raw (no brace-escaping)
  return FILE_PROMPT + getRawLibrarySkillPrompt('worker', skill) + getRLStore().buildWorkerContext();
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

    // Skip to the opening quote (or backtick) of the content value
    let j = contentKeyIdx + 9;
    while (j < text.length && text[j] !== '"' && text[j] !== '`') j++;
    if (j >= text.length) break;
    const contentDelim = text[j];
    j++; // step past opening delimiter

    let contentResult;
    if (contentDelim === '`') {
      // Model used template-literal syntax: read until closing backtick
      const btEnd = text.indexOf('`', j);
      contentResult = btEnd !== -1
        ? { value: text.slice(j, btEnd), end: btEnd + 1 }
        : { value: text.slice(j), end: text.length };
    } else {
      contentResult = readJSONString(text, j);
    }
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
      // Pass 0: LangChain JsonOutputParser — standard first attempt (strips markdown fences)
      let blueprint = null;
      try {
        blueprint = await new JsonOutputParser().parse(output);
      } catch { /* fall through to manual passes */ }

      // Pass 1: repairJSON + multi-pass brace scanner (handles minor malformed JSON)
      if (!blueprint) {
        blueprint = extractJSON(output) || extractJSON(fullRaw);
        if (!blueprint && output.trim().startsWith('{')) {
          try { JSON.parse(output.trim()); } catch (e) {
            logger.error(`JSON.parse failed: ${e.message} (at char ~${e.message.match(/position (\d+)/)?.[1] ?? '?'})`, { agentId: 'worker' });
          }
        }
      }

      // Pass 2: string-level extraction — JSON.parse failed but the model DID output
      // the blueprint format; scan for "path"/"content" pairs without parsing the
      // full document (handles unbalanced braces, invalid escapes, trailing prose, etc.)
      if (!blueprint) {
        blueprint = extractBlueprintByStrings(output) || extractBlueprintByStrings(fullRaw);
        if (blueprint) {
          logger.error(`Worker JSON unparseable — recovered ${blueprint.files?.length ?? 0} file(s) via string-level scan.`, { agentId: 'worker' });
        }
      }

      // Pass 3: markdown fallback — model wrote prose + code fences instead of raw JSON
      if (!blueprint) {
        blueprint = extractBlueprintFromMarkdown(output) || extractBlueprintFromMarkdown(fullRaw);
        if (blueprint) {
          logger.error(`Worker produced markdown instead of JSON — extracted ${blueprint.files?.length ?? 0} file(s) via markdown parser. Consider using a model that follows JSON instructions more reliably.`, { agentId: 'worker' });
        }
      }

      if (!blueprint) {
        const isLikelyThinkOnly = !output.trim() && fullRaw.includes('<think>');
        if (isLikelyThinkOnly) {
          logger.error(`Worker output was entirely inside <think> blocks — model did not emit JSON after reasoning. Increase max_tokens in Settings.`, { agentId: 'worker' });
        } else {
          logger.error(`No JSON found in worker output (${output.length} chars). Model produced prose with no recognisable file structure.`, { agentId: 'worker' });
          if (isDebugMode()) logger.error(`Worker output preview (first 800 chars): ${output.slice(0, 800)}`, { agentId: 'worker' });
        }
        return { written, summary: '' };
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
          logger.error(`Worker JSON returned single-file object — treating as one-file blueprint.`, { agentId: 'worker' });
          files = [blueprint];
        }
      } else {
        logger.error(`Worker JSON has no "files" array (keys: ${Object.keys(blueprint).join(', ')})`, { agentId: 'worker' });
        files = [];
      }
      for (const { path: filePath, content } of files) {
        if (!filePath || content == null) continue;
        const contentStr = String(content);
        if (contentStr.trim().length < 5) {
          logger.error(`Skipping ${filePath} — content is empty or near-empty (${contentStr.length} chars)`, { agentId: 'worker' });
          continue;
        }
        const result = await writeFileTool.func({ path: filePath, content: contentStr });
        written.push(filePath);
        logger.info(`Wrote: ${filePath}`, { agentId: 'worker' });
        this.socketManager?.emitChatChunk(sessionId, `\n✓ ${result}`, 'worker');
      }
      return { written, summary: blueprint?.summary || '' };
    } catch (e) {
      logger.error(`Blueprint apply failed: ${e.message}`, { agentId: 'worker' });
    }
    return { written, summary: '' };
  }

  async execute(task, sessionId, planId = null, runId = null, skill = null) {
    logger.info(`Executing task${isDebugMode() ? ': ' + task : ''}${skill ? ` [skill: ${skill}]` : ''}`, { agentId: 'worker', sessionId });
    this.socketManager?.emitAgentStatus('worker', 'working', task);

    const compressedTask = compressString(task, 2000);
    const adapter = getAdapter('worker');
    const memory  = memoryStore.getMemory('worker', runId || sessionId);
    const signal  = runId ? getAbortSignal(runId) : undefined;

    let result        = '';
    let fullRawOutput = '';

    try {
      // ── Phase 1: Ask the model which files it will create ─────────────────
      const planMessages = [
        { role: 'system', content: getPlanSystemPrompt(skill) },
        { role: 'user',   content: `Task:\n${compressedTask}\n\nOutput ONLY the JSON file plan.` },
      ];
      const planStream = await streamAndEmit(
        adapter._settings, planMessages, signal,
        this.socketManager, sessionId, 'worker', true
      );

      let filePlan = null;
      try { filePlan = await new JsonOutputParser().parse(planStream.output); } catch { /* fall through */ }
      if (!filePlan) filePlan = extractJSON(planStream.output) || extractJSON(planStream.rawOutput);

      if (!filePlan?.files?.length) {
        // Plan parsing failed — fall back to single-call mode
        logger.warn('File plan not parseable — falling back to single-call mode', { agentId: 'worker' });
        return await this._executeSingleCall(task, compressedTask, sessionId, planId, runId, signal, memory, skill);
      }

      this.socketManager?.emitChatChunk(sessionId,
        `\n📋 **File plan** (${filePlan.files.length} file${filePlan.files.length !== 1 ? 's' : ''}): ${filePlan.summary || ''}\n`,
        'worker');

      // ── Phase 2: Write each file in its own LLM call ──────────────────────
      const allWritten = [];
      for (let i = 0; i < filePlan.files.length; i++) {
        const fileSpec = filePlan.files[i];
        if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });

        const label = `${i + 1}/${filePlan.files.length}`;
        this.socketManager?.emitChatChunk(sessionId,
          `\n📝 **Writing ${label}:** \`${fileSpec.path}\`\n`, 'worker');

        const writtenContext = allWritten.length
          ? `\nFiles already written:\n${allWritten.map(p => `  - ${p}`).join('\n')}`
          : '';

        const fileMessages = [
          { role: 'system', content: getFileSystemPrompt(skill) },
          { role: 'user',   content: [
              `## Overall Task\n${compressedTask}`,
              `## File to write now (${label})\nPath: ${fileSpec.path}\nPurpose: ${fileSpec.description || fileSpec.path}`,
              writtenContext,
              `\nOutput the JSON object with the complete content of this file.`,
            ].filter(Boolean).join('\n\n'),
          },
        ];

        const fileStream = await streamAndEmit(
          adapter._settings, fileMessages, signal,
          this.socketManager, sessionId, 'worker', true
        );
        fullRawOutput += fileStream.rawOutput + '\n';

        // Parse single-file JSON — try all extraction methods
        let fileBP = null;
        try { fileBP = await new JsonOutputParser().parse(fileStream.output); } catch { /* fall through */ }
        if (!fileBP) fileBP = extractJSON(fileStream.output) || extractJSON(fileStream.rawOutput);
        if (!fileBP?.content) {
          const bp = extractBlueprintByStrings(fileStream.output) || extractBlueprintByStrings(fileStream.rawOutput);
          if (bp?.files?.[0]) fileBP = bp.files[0];
        }

        if (fileBP?.content != null) {
          const contentStr = String(fileBP.content);
          const filePath   = fileBP.path || fileSpec.path;
          if (contentStr.trim().length >= 5) {
            const writeResult = await writeFileTool.func({ path: filePath, content: contentStr });
            allWritten.push(filePath);
            logger.info(`Wrote: ${filePath}`, { agentId: 'worker' });
            this.socketManager?.emitChatChunk(sessionId, `\n✓ ${writeResult}`, 'worker');
          } else {
            logger.error(`Skipping ${fileSpec.path} — content empty or near-empty (${contentStr.length} chars)`, { agentId: 'worker' });
          }
        } else {
          logger.error(`Could not extract content for ${fileSpec.path} — skipping`, { agentId: 'worker' });
        }
      }

      result = allWritten.length > 0
        ? `Implemented ${allWritten.length} file(s): ${allWritten.join(', ')} — ${filePlan.summary || ''}`
        : 'No files were written';

      await memory.saveContext({ input: task }, { output: result });

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
    return { subtaskId, result, truncated: false, rawOutput: fullRawOutput };
  }

  /**
   * Fallback: write all files in a single LLM call (used when file-plan parsing fails).
   * Kept for resilience — file-by-file mode is preferred.
   */
  async _executeSingleCall(task, compressedTask, sessionId, planId, runId, signal, memory, skill = null) {
    const adapter = getAdapter('worker');
    let result = '';
    let fullRawOutput = '';
    let truncated = false;

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', getSystemPrompt(skill)],
      new MessagesPlaceholder('chat_history'),
      ['human', 'Task: {task}\n\nRemember: output ONLY the JSON blueprint starting with {{"files":[. No explanations, no markdown fences around the JSON, no prose.'],
    ]);
    const chatHistory = runId ? [] : (await memory.loadMemoryVariables({})).chat_history || [];
    const langchainMessages = await prompt.formatMessages({ task: compressedTask, chat_history: chatHistory });

    const streamResult = await streamAndEmit(
      adapter._settings,
      toLMStudioMessages(langchainMessages),
      signal,
      this.socketManager, sessionId, 'worker', true
    );
    let output = streamResult.output;
    fullRawOutput = streamResult.rawOutput;
    const combinedTrimmed = fullRawOutput.trimEnd();
    truncated = streamResult.truncated ||
      (combinedTrimmed.includes('{') && !combinedTrimmed.endsWith('}') && !combinedTrimmed.endsWith(']'));

    if (truncated) {
      // One minimal continuation attempt
      const tail = output.slice(-600);
      const contMessages = [
        { role: 'system', content: 'You are a JSON completion assistant. Output ONLY the continuation of the truncated JSON — no preamble, no explanation, no restart.' },
        { role: 'user', content: `Continue this truncated JSON from exactly where it stopped:\n\n...${tail}\n\nContinue immediately:` },
      ];
      const contResult = await streamAndEmit(
        adapter._settings, contMessages, signal,
        this.socketManager, sessionId, 'worker', true
      );
      output        += contResult.output;
      fullRawOutput += contResult.rawOutput;
      truncated = contResult.truncated;
    }

    if (truncated) {
      logger.error(`Worker response truncated — file content may be incomplete. Increase context window in LM Studio.`, { agentId: 'worker' });
    }

    const { written, summary: blueprintSummary } = await this._applyBlueprint(output, fullRawOutput, sessionId);
    await memory.saveContext({ input: task }, { output });
    result = written.length > 0
      ? `Implemented ${written.length} file(s): ${written.join(', ')}${blueprintSummary ? ` — ${blueprintSummary}` : ''}`
      : output;

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

    logger.info('Task execution complete (single-call fallback)', { agentId: 'worker', subtaskId });
    return { subtaskId, result, truncated, rawOutput: fullRawOutput };
  }
}
