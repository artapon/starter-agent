import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('report-generator');

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const REPORTS_DIR  = join(PROJECT_ROOT, 'reports');

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a Unix-seconds timestamp as "20 Mar 2026, 14:32:07 UTC" */
function ts(unixSecs) {
  if (!unixSecs) return '—';
  return new Date(unixSecs * 1000).toUTCString().replace('GMT', 'UTC');
}

/** Format elapsed seconds as "1m 23s" or "45s" */
function duration(startSecs, endSecs) {
  if (!startSecs || !endSecs) return '—';
  const secs = Math.round(endSecs - startSecs);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/** Simple markdown → HTML (safe: input is already escaped if needed) */
function md(text = '') {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[h1-6ul\/li|blockquote|hr])(.+)$/gm, '<p>$1</p>');
}

/** Truncate description for plan steps */
function truncateDesc(text = '', max = 600) {
  const t = text.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * Coerce a research list item to a plain string.
 * Handles both the expected string format and object shapes the LLM sometimes
 * emits: {name, consequence}  {ops, specifics}  {observability, ...}
 */
function flattenItem(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    const { name, consequence, ops, specifics, observability, ...rest } = item;
    const parts = [name, ops, observability, consequence, specifics,
      ...Object.values(rest).filter(v => typeof v === 'string')].filter(Boolean);
    return parts.join(' — ');
  }
  return String(item);
}

/** Detect file extension and return an icon */
function fileIcon(path = '') {
  const ext = path.split('.').pop().toLowerCase();
  const icons = {
    html: '📄', htm: '📄',
    css: '🎨', scss: '🎨', sass: '🎨', less: '🎨',
    js: '⚡', mjs: '⚡', cjs: '⚡',
    ts: '🔷', tsx: '🔷',
    jsx: '⚛️',
    json: '📋',
    md: '📝', txt: '📝',
    py: '🐍',
    sh: '🖥️', bash: '🖥️',
    sql: '🗃️',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', svg: '🖼️', gif: '🖼️', webp: '🖼️',
    vue: '💚', svelte: '🔥',
  };
  return icons[ext] || '📄';
}

/** Parse "Implemented N file(s): a.html, b.css, c.js" from worker result string */
function parseWorkerFiles(resultStr = '') {
  // Match "Implemented N file(s): file1, file2, ..." pattern
  const m = resultStr.match(/implemented\s+(\d+)\s+file\(s\)\s*:\s*(.+)/i);
  if (!m) return [];
  return m[2].split(',').map(f => f.trim()).filter(Boolean);
}

/**
 * Render the research summary text as an <ul> bullet list when the content
 * is structured (JSON array or markdown bullet lines), otherwise as prose.
 *   – JSON array  → each element becomes a <li>
 *   – Lines all starting with - / * / • → strip prefix, wrap in <ul>
 *   – Anything else → md() prose
 */
function renderSummary(text) {
  if (!text) return '';
  const trimmed = text.trim();

  // ── Detect raw JSON dump stored as summary (parseFindings fallback path) ──
  // This happens when extractJSON fails and rawOutput was saved as summary.
  // Try to recover the actual "summary" string from the embedded JSON.
  if (trimmed.startsWith('{') || /```json/.test(trimmed) || /"topic"\s*:/.test(trimmed)) {
    const m = trimmed.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) {
      const recovered = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
      if (recovered) return renderSummary(recovered); // recurse with the clean sentence
    }
    return ''; // nothing recoverable — hide the blob
  }

  // ── JSON array from the LLM (e.g. ["point one", "point two"]) ─────────────
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.length) {
      const items = parsed.map(item => `<li>${esc(String(item))}</li>`).join('');
      return `<ul class="summary-list">${items}</ul>`;
    }
  } catch { /* not JSON */ }

  // ── Markdown / plain bullet list (every non-empty line starts with - * •) ──
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every(l => /^[-*•]\s/.test(l))) {
    const items = lines.map(l => `<li>${esc(l.replace(/^[-*•]\s+/, ''))}</li>`).join('');
    return `<ul class="summary-list">${items}</ul>`;
  }

  // ── Prose fallback — md() handles bold, code, headers, etc. ────────────────
  return md(text);
}

/** Score color: ≥8 green, 5–7 amber, <5 red */
function scoreColor(score) {
  if (score >= 8) return '#10B981';
  if (score >= 5) return '#F59E0B';
  return '#EF4444';
}

/** Score bar using dynamic color */
function scoreBar(score = 0) {
  const color = scoreColor(score);
  const filled = Math.round(score / 2);
  const empty  = 5 - filled;
  return `<span class="score-bar">
    ${'<span class="bar-seg bar-filled" style="background:' + color + ';box-shadow:0 0 8px ' + color + '55"></span>'.repeat(filled)}
    ${'<span class="bar-seg bar-empty"></span>'.repeat(empty)}
  </span>`;
}

/**
 * If feedback is stored as a raw JSON string (fallback path), try to recover
 * the human-readable fields.
 */
function normalizeReview(review) {
  if (!review) return review;
  const feedback = review.feedback || '';
  if (!feedback.trim().startsWith('{')) return review;

  let extracted = null;
  try { extracted = JSON.parse(feedback); } catch { /* truncated */ }
  if (!extracted) {
    const sm = feedback.match(/"score"\s*:\s*(\d+)/);
    const am = feedback.match(/"approved"\s*:\s*(true|false)/);
    const fm = feedback.match(/"feedback"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (sm) {
      const score = parseInt(sm[1], 10);
      extracted = {
        score,
        approved: am ? am[1] === 'true' : score >= 7,
        feedback: fm ? fm[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '',
        suggestions: [],
      };
    }
  }
  if (!extracted) return review;
  return {
    ...review,
    score:       extracted.score    ?? review.score,
    approved:    extracted.approved ?? review.approved,
    feedback:    extracted.feedback ?? '',
    suggestions: extracted.suggestions?.length ? extracted.suggestions : (review.suggestions || []),
  };
}

// ── Phase renderers ──────────────────────────────────────────────────────────

function phaseResearch(r) {
  if (!r) return '';

  const approaches = (r.approaches || []).map(a => `
    <div class="approach-card">
      <div class="approach-card__name">
        <span class="approach-icon">🚀</span>${esc(a.name)}
      </div>
      <div class="approach-cols">
        <div>
          <div class="col-label col-label--green">Strengths</div>
          <ul class="tag-list">${(a.pros || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        </div>
        <div>
          <div class="col-label col-label--red">Weaknesses</div>
          <ul class="tag-list">${(a.cons || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
        </div>
      </div>
    </div>`).join('');

  const sources = (r.sources || []).map(s => {
    const url    = typeof s === 'string' ? s : s.url;
    const name   = typeof s === 'string' ? s : (s.snippet?.slice(0, 60) || s.title || s.name || url);
    const sType  = typeof s === 'object' ? (s.type || '') : '';
    let domain = url;
    try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
    const typeIcon = { github: '🐙', npm: '📦', stackoverflow: '💬', hackernews: '🔶', google: '🔍' }[sType] || '🌐';
    return `<li><a href="${esc(url)}" target="_blank" class="source-link">
      <span class="source-tag">${typeIcon} ${esc(domain)}</span>
      <span class="source-name">${esc(name)}</span>
    </a></li>`;
  }).join('');

  return `
  <div class="phase phase--research">
    <div class="phase__label">
      <div class="phase__label-left"><span class="phase__icon">🔬</span><span>Research Phase</span></div>
      <span class="badge badge--cyan">researcher</span>
    </div>
    <div class="phase__body">

      ${r.topic || r.summary ? `
        <div class="research-hero">
          ${r.topic ? `<div class="research-topic">${esc(r.topic)}</div>` : ''}
          ${r.summary ? `<div class="research-summary">${renderSummary(r.summary)}</div>` : ''}
        </div>` : ''}

      ${r.recommendedApproach ? `
        <div class="recommend-box">
          <span class="recommend-icon">⭐</span>
          <div>
            <div class="recommend-label">Recommended Strategy</div>
            <div class="recommend-text">${esc(r.recommendedApproach)}</div>
          </div>
        </div>` : ''}

      ${approaches ? `<div class="section-label">Architectural Approaches</div><div class="approaches-grid">${approaches}</div>` : ''}

      <div class="research-details-grid">
        <div>
          ${(r.keyConsiderations || []).length ? `
            <div class="section-label">Key Considerations</div>
            <ul class="consider-list">${(r.keyConsiderations).map(c => `<li>${esc(flattenItem(c))}</li>`).join('')}</ul>` : ''}
          ${(r.techStack || []).length ? `
            <div class="section-label" style="margin-top:20px">Tech Stack</div>
            <div class="tech-pills">${(r.techStack).map(t => `<span class="tech-pill">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div>
          ${(r.potentialChallenges || []).length ? `
            <div class="section-label">Potential Blockers</div>
            <ul class="challenges-list">${(r.potentialChallenges).map(c => `<li>${esc(flattenItem(c))}</li>`).join('')}</ul>` : ''}
        </div>
      </div>

      ${(r.recommendedPackages || []).length ? `
        <div class="section-label">Recommended Packages</div>
        <div class="pkg-grid">${(r.recommendedPackages).map(p => {
          const dl = p.monthlyDownloads
            ? (p.monthlyDownloads >= 1e6 ? `${(p.monthlyDownloads/1e6).toFixed(1)}M` : `${Math.round(p.monthlyDownloads/1000)}k`) + '/mo'
            : '';
          const alts = (p.alternatives || []).map(a => `<span class="tech-pill">${esc(a)}</span>`).join('');
          return `<div class="pkg-card">
            <div class="pkg-card__head">
              <span class="pkg-name">${esc(p.name)}</span>
              ${p.version ? `<span class="pkg-ver">${esc(p.version)}</span>` : ''}
              ${dl ? `<span class="pkg-dl">${dl}</span>` : ''}
            </div>
            <div class="pkg-purpose">${esc(p.purpose || '')}</div>
            ${alts ? `<div class="pkg-alts"><span class="pkg-alts-label">Alt:</span> ${alts}</div>` : ''}
          </div>`;
        }).join('')}</div>` : ''}

      ${(r.antiPatterns || []).length ? `
        <div class="section-label">Anti-Patterns to Avoid</div>
        <ul class="warn-list warn-list--red">${(r.antiPatterns).map(a => `<li>${esc(flattenItem(a))}</li>`).join('')}</ul>` : ''}

      ${(r.productionConsiderations || []).length ? `
        <div class="section-label">Production Checklist</div>
        <ul class="warn-list warn-list--amber">${(r.productionConsiderations).map(c => `<li>${esc(flattenItem(c))}</li>`).join('')}</ul>` : ''}

      ${r.versioningNotes ? `
        <div class="section-label">Versioning & Compatibility</div>
        <div class="info-box info-box--amber">
          <span>⚠️</span><span>${esc(r.versioningNotes)}</span>
        </div>` : ''}

      ${sources ? `<div class="section-label">References</div><ul class="sources-list">${sources}</ul>` : ''}
    </div>
  </div>`;
}

function phasePlan(plan) {
  if (!plan) return '';
  const steps = (plan.steps || []).map((s, i) => {
    const raw = (s.description || s.task || '').trim();
    const clean = raw
      .replace(/\[Research Context\][\s\S]*/i, '')
      .replace(/=== EXISTING WORKSPACE PROJECT ===[\s\S]*/i, '')
      .replace(/##\s+REQUIRED FIXES[\s\S]*/i, '')
      .replace(/##\s+RL SCORE TARGET[\s\S]*/i, '')
      .trim();
    return `
    <div class="step-row">
      <div class="step-num">${i + 1}</div>
      <div class="step-text">${md(truncateDesc(clean || raw))}</div>
    </div>`;
  }).join('');

  return `
  <div class="phase">
    <div class="phase__label">
      <div class="phase__label-left"><span class="phase__icon">📋</span><span>Implementation Plan</span></div>
      <div class="phase__label-right">
        <span class="meta">${plan.steps?.length || 0} step${plan.steps?.length !== 1 ? 's' : ''}</span>
        <span class="badge badge--indigo">planner</span>
      </div>
    </div>
    <div class="phase__body">${steps || '<p class="muted">No steps recorded.</p>'}</div>
  </div>`;
}

function phaseWorker(subtaskResults, planSteps) {
  if (!Array.isArray(subtaskResults) || !subtaskResults.length) return '';

  // Collect all files implemented across all steps
  const allFiles = [];
  const items = subtaskResults.map((r, i) => {
    const step    = planSteps?.[i];
    const label   = step?.description || step?.task || `Step ${i + 1}`;
    const cleanLabel = label
      .replace(/\[Research Context\][\s\S]*/i, '')
      .replace(/=== EXISTING WORKSPACE PROJECT ===[\s\S]*/i, '')
      .replace(/##\s+.*$/gim, '')
      .trim()
      .slice(0, 200);

    // Result is "Implemented N file(s): file1, file2, ..." or a plain string
    const resultStr = typeof r === 'string' ? r : (r?.result || r?.output || '');
    const files = parseWorkerFiles(resultStr);
    const truncated = r?.truncated ?? false;
    allFiles.push(...files);

    const filesHtml = files.length
      ? `<div class="file-list">${files.map(f => `
          <span class="file-chip">
            <span class="file-chip__icon">${fileIcon(f)}</span>
            <span class="file-chip__name">${esc(f)}</span>
          </span>`).join('')}</div>`
      : resultStr
        ? `<div class="result-text">${esc(resultStr)}</div>`
        : '';

    return `
    <div class="worker-step">
      <div class="worker-step__head">
        <div class="step-num">${i + 1}</div>
        <div class="worker-step__title">${esc(cleanLabel)}</div>
        ${truncated ? `<span class="trunc-badge">⚠ truncated</span>` : ''}
      </div>
      ${filesHtml}
    </div>`;
  }).join('');

  // Summary: unique files
  const uniqueFiles = [...new Set(allFiles)];
  const fileSummary = uniqueFiles.length
    ? `<div class="worker-summary">
        <span class="worker-summary__label">📦 ${uniqueFiles.length} file${uniqueFiles.length !== 1 ? 's' : ''} delivered</span>
        <div class="file-list file-list--compact">${uniqueFiles.map(f => `
          <span class="file-chip file-chip--sm">
            <span class="file-chip__icon">${fileIcon(f)}</span>
            <span class="file-chip__name">${esc(f)}</span>
          </span>`).join('')}</div>
      </div>`
    : '';

  return `
  <div class="phase">
    <div class="phase__label">
      <div class="phase__label-left"><span class="phase__icon">💻</span><span>Implementation</span></div>
      <div class="phase__label-right">
        <span class="meta">${subtaskResults.length} step${subtaskResults.length !== 1 ? 's' : ''}</span>
        <span class="badge badge--green">worker</span>
      </div>
    </div>
    <div class="phase__body">
      ${fileSummary}
      <div class="worker-steps">${items}</div>
    </div>
  </div>`;
}

function phaseReview(rawReview) {
  if (!rawReview) return '';
  const review = normalizeReview(rawReview);
  const score  = review.score ?? 0;
  const color  = scoreColor(score);

  return `
  <div class="phase">
    <div class="phase__label">
      <div class="phase__label-left"><span class="phase__icon">🔍</span><span>Quality Review</span></div>
      <div class="phase__label-right">
        <span class="badge ${review.approved ? 'badge--green' : 'badge--red'}">${review.approved ? '✓ Approved' : '✗ Needs work'}</span>
        <span class="badge badge--amber">reviewer</span>
      </div>
    </div>
    <div class="phase__body">
      <div class="review-score-row">
        <div class="score-display">
          <span class="score-num" style="color:${color}">${score}</span>
          <span class="score-denom">/10</span>
        </div>
        ${scoreBar(score)}
        <div class="score-label" style="color:${color}">
          ${score >= 9 ? 'Excellent' : score >= 7 ? 'Good' : score >= 5 ? 'Acceptable' : 'Needs improvement'}
        </div>
      </div>
      ${review.feedback
        ? `<blockquote class="review-feedback">${esc(review.feedback)}</blockquote>`
        : ''}
      ${(review.suggestions || []).length
        ? `<div class="sub-heading">Suggestions for improvement</div>
           <ul class="suggestions-list">${(review.suggestions).map(s => `<li>${esc(s)}</li>`).join('')}</ul>`
        : ''}
    </div>
  </div>`;
}

// ── Stats summary panel ──────────────────────────────────────────────────────

function sectionStats({ goal, status, startedAt, endedAt, loopCount, allIters, statusColor }) {
  // Collect score progression
  const scores = allIters
    .map(it => normalizeReview(it.reviewFeedback)?.score)
    .filter(s => s != null);
  const finalScore = scores.at(-1) ?? null;
  const scoreColor_ = finalScore != null ? scoreColor(finalScore) : '#6B7280';

  // Collect all files delivered
  const allFiles = new Set();
  for (const iter of allIters) {
    for (const r of (iter.subtaskResults || [])) {
      const resultStr = typeof r === 'string' ? r : (r?.result || '');
      for (const f of parseWorkerFiles(resultStr)) allFiles.add(f);
    }
  }

  const statItems = [
    {
      icon: '⏱',
      label: 'Duration',
      value: duration(startedAt, endedAt),
    },
    {
      icon: '🔄',
      label: 'Iterations',
      value: `${allIters.length}${loopCount > 0 ? ` (${loopCount} loop${loopCount !== 1 ? 's' : ''})` : ''}`,
    },
    {
      icon: '📦',
      label: 'Files Delivered',
      value: allFiles.size > 0 ? String(allFiles.size) : '—',
    },
    finalScore != null ? {
      icon: '🏆',
      label: 'Final Score',
      value: `${finalScore}/10`,
      color: scoreColor_,
    } : null,
    {
      icon: '🔵',
      label: 'Status',
      value: status.charAt(0).toUpperCase() + status.slice(1),
      color: statusColor,
    },
  ].filter(Boolean);

  // Score progression bar
  const progressHtml = scores.length > 1
    ? `<div class="score-progress">
        <div class="score-progress__label">Score progression</div>
        <div class="score-progress__track">
          ${scores.map((s, i) => `
            <div class="score-progress__step">
              <div class="score-progress__dot" style="background:${scoreColor(s)};height:${Math.round(s/10*32)+8}px" title="${i === 0 ? 'Initial' : `Loop ${i}`}: ${s}/10"></div>
              <div class="score-progress__val" style="color:${scoreColor(s)}">${s}</div>
            </div>`).join('')}
        </div>
      </div>`
    : '';

  return `
  <section class="stats-panel">
    <div class="stats-grid">
      ${statItems.map(it => `
        <div class="stat-card">
          <div class="stat-card__icon">${it.icon}</div>
          <div class="stat-card__label">${it.label}</div>
          <div class="stat-card__value" ${it.color ? `style="color:${it.color}"` : ''}>${esc(String(it.value))}</div>
        </div>`).join('')}
    </div>
    ${progressHtml}
  </section>`;
}

// ── Iteration block ──────────────────────────────────────────────────────────

function renderIteration({ researchFindings, plan, subtaskResults, reviewFeedback }, iterNum, totalIters) {
  const isFirst  = iterNum === 1;
  const review   = normalizeReview(reviewFeedback);
  const score    = review?.score ?? null;
  const color    = score != null ? scoreColor(score) : '#6B7280';
  const iterLabel = isFirst ? 'Initial Run' : `Improvement Loop ${iterNum - 1}`;

  return `
  <section class="iter-section" id="iter-${iterNum}">
    <div class="iter-header">
      <div class="iter-badge">${iterNum}</div>
      <div class="iter-info">
        <div class="iter-title">${iterLabel}</div>
        ${totalIters > 1 ? `<div class="iter-sub">Iteration ${iterNum} of ${totalIters}</div>` : ''}
      </div>
      ${score != null ? `
        <div class="iter-score-chip" style="background:${color}18;border-color:${color}50;color:${color}">
          ${score}/10 &nbsp; ${review?.approved ? '✓ Approved' : '✗ Rework'}
        </div>` : ''}
    </div>
    <div class="iter-phases">
      ${phasePlan(plan)}
      ${isFirst ? phaseResearch(researchFindings) : ''}
      ${phaseWorker(subtaskResults, plan?.steps)}
      ${phaseReview(reviewFeedback)}
    </div>
  </section>`;
}

// ── Final answer ─────────────────────────────────────────────────────────────

function sectionFinalAnswer(answer) {
  if (!answer) return '';
  return `
  <section class="final-card" id="final">
    <div class="final-card__head">
      <span class="final-icon">✅</span>
      <div>
        <div class="final-title">Final Answer</div>
        <div class="final-sub">Assembled output from all agents</div>
      </div>
      <span class="badge badge--green" style="margin-left:auto">Complete</span>
    </div>
    <div class="final-card__body prose">${md(answer)}</div>
  </section>`;
}

// ── Full HTML document ───────────────────────────────────────────────────────

function buildHtml({ state, runId, sessionId, startedAt, endedAt, status, loopIterations }) {
  const goal       = state?.userGoal || 'Unknown goal';
  const allIters   = [...(loopIterations || [])];
  const loopCount  = loopIterations?.length ?? 0;
  const statusColor = { complete: '#10B981', error: '#EF4444', stopped: '#6B7280', running: '#F59E0B' }[status] || '#6B7280';

  // Final iteration (current state)
  allIters.push({
    loopIdx:          state?.loopCount ?? 0,
    researchFindings: state?.researchFindings,
    plan:             state?.plan,
    subtaskResults:   Array.isArray(state?.subtaskResults) ? state.subtaskResults : [],
    reviewFeedback:   state?.reviewFeedback,
  });

  const totalIters = allIters.length;

  const tocLinks = allIters.map((_, i) => {
    const label = i === 0 ? 'Initial Run' : `Loop ${i}`;
    return `<a class="toc-link" href="#iter-${i + 1}">${label}</a>`;
  }).join('');
  const toc = tocLinks + (state?.finalAnswer ? `<a class="toc-link toc-link--final" href="#final">✅ Final Answer</a>` : '');

  const iterSections = allIters.map((iter, i) => renderIteration(iter, i + 1, totalIters)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(goal).slice(0, 70)} — Workflow Report</title>
<style>
/* ── Reset ───────────────────────────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ── Design tokens ───────────────────────────────────────────────────────── */
:root{
  --bg:        #07070E;
  --surface:   #0D0D1A;
  --surface2:  #11111E;
  --surface3:  #161625;
  --border:    rgba(255,255,255,0.07);
  --border2:   rgba(255,255,255,0.04);
  --text:      #E8EAF0;
  --text-dim:  rgba(232,234,240,0.55);
  --text-faint:rgba(232,234,240,0.3);
  --cyan:      #22D3EE;
  --indigo:    #818CF8;
  --green:     #34D399;
  --amber:     #FBBF24;
  --red:       #F87171;
  --radius:    12px;
  --shadow:    0 8px 32px rgba(0,0,0,0.45);
  --glow-cyan: 0 0 20px rgba(34,211,238,0.12);
}

/* ── Base ────────────────────────────────────────────────────────────────── */
html{scroll-behavior:smooth}
body{
  background:var(--bg);color:var(--text);
  font-family:'Inter','Segoe UI',system-ui,sans-serif;
  font-size:14px;line-height:1.65;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--cyan);text-decoration:none}
a:hover{text-decoration:underline}
code,kbd{
  background:rgba(255,255,255,.07);
  padding:2px 6px;border-radius:5px;
  font-family:'JetBrains Mono','Cascadia Code','Fira Code',monospace;
  font-size:12px;color:var(--cyan);
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.report-header{
  background:var(--surface);
  border-bottom:1px solid var(--border);
  padding:32px 48px 28px;
  position:relative;overflow:hidden;
}
.report-header::before{
  content:'';position:absolute;inset:0;
  background:radial-gradient(ellipse 60% 120% at 80% -30%, rgba(99,102,241,0.08) 0%, transparent 70%);
  pointer-events:none;
}
.brand{
  font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
  color:var(--text-faint);margin-bottom:14px;display:flex;align-items:center;gap:8px;
}
.brand-sep{opacity:.3}
.brand-highlight{color:var(--cyan)}
.goal-title{
  font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-.02em;
  color:var(--text);margin-bottom:16px;
}
.header-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.header-chip{
  font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;
  border:1px solid var(--border);color:var(--text-dim);
  display:flex;align-items:center;gap:5px;
}
.header-meta{display:flex;flex-wrap:wrap;gap:20px;font-size:12px;color:var(--text-faint)}
.header-meta strong{color:var(--text-dim);font-weight:600}
.status-dot{
  display:inline-block;width:7px;height:7px;border-radius:50%;
  background:${statusColor};vertical-align:middle;margin-right:4px;
  box-shadow:0 0 8px ${statusColor}88;
}

/* ── TOC nav ─────────────────────────────────────────────────────────────── */
.toc-bar{
  background:var(--surface2);border-bottom:1px solid var(--border);
  padding:10px 48px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;
  position:sticky;top:0;z-index:100;backdrop-filter:blur(12px);
}
.toc-link{
  font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;
  border:1px solid var(--border);color:var(--text-faint);
  transition:all .15s;white-space:nowrap;
}
.toc-link:hover{border-color:var(--cyan);color:var(--cyan);text-decoration:none;background:rgba(34,211,238,.05)}
.toc-link--final{border-color:rgba(52,211,153,.25);color:var(--green)}
.toc-link--final:hover{border-color:var(--green);background:rgba(52,211,153,.05)}

/* ── Main layout ─────────────────────────────────────────────────────────── */
.main{padding:32px 48px 96px}

/* ── Stats panel ─────────────────────────────────────────────────────────── */
.stats-panel{
  background:var(--surface2);border:1px solid var(--border);
  border-radius:var(--radius);padding:24px;margin-bottom:32px;
  box-shadow:var(--shadow);
}
.stats-grid{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:0}
.stat-card{
  flex:1;min-width:120px;
  background:rgba(255,255,255,.025);border:1px solid var(--border2);
  border-radius:10px;padding:16px;
}
.stat-card__icon{font-size:20px;margin-bottom:8px}
.stat-card__label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-faint);margin-bottom:4px}
.stat-card__value{font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--text)}

/* Score progression */
.score-progress{margin-top:20px;padding-top:20px;border-top:1px solid var(--border2)}
.score-progress__label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-faint);margin-bottom:12px}
.score-progress__track{display:flex;align-items:flex-end;gap:16px;height:60px}
.score-progress__step{display:flex;flex-direction:column;align-items:center;gap:4px}
.score-progress__dot{width:24px;border-radius:6px 6px 3px 3px;transition:height .3s;min-height:8px}
.score-progress__val{font-size:11px;font-weight:700}

/* ── Iteration section ───────────────────────────────────────────────────── */
.iter-section{
  margin-bottom:32px;
  border:1px solid var(--border);border-radius:var(--radius);
  overflow:hidden;background:var(--surface);
  box-shadow:var(--shadow);
}
.iter-header{
  display:flex;align-items:center;gap:16px;
  padding:20px 24px;
  background:linear-gradient(90deg,var(--surface2) 0%,transparent 100%);
  border-bottom:1px solid var(--border);
}
.iter-badge{
  width:36px;height:36px;border-radius:10px;flex-shrink:0;
  background:rgba(129,140,248,.15);border:1px solid rgba(129,140,248,.3);
  color:var(--indigo);font-size:15px;font-weight:900;
  display:flex;align-items:center;justify-content:center;
}
.iter-info{flex:1}
.iter-title{font-size:16px;font-weight:800;letter-spacing:-.015em;color:var(--text)}
.iter-sub{font-size:11px;color:var(--text-faint);margin-top:2px}
.iter-score-chip{
  font-size:12px;font-weight:700;padding:6px 14px;
  border-radius:20px;border:1px solid;letter-spacing:.03em;
  white-space:nowrap;
}
.iter-phases{display:flex;flex-direction:column}

/* ── Phase blocks ────────────────────────────────────────────────────────── */
.phase{border-top:1px solid var(--border)}
.phase:first-child{border-top:none}
.phase__label{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 20px;
  background:rgba(255,255,255,.02);
  border-bottom:1px solid var(--border2);
  font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;
  color:var(--text-faint);
}
.phase__label-left,.phase__label-right{display:flex;align-items:center;gap:8px}
.phase__icon{font-size:14px}
.phase__body{padding:24px}
.meta{font-size:11px;color:var(--text-faint);font-weight:400;text-transform:none;letter-spacing:0}

/* ── Research ────────────────────────────────────────────────────────────── */
.research-hero{
  padding:22px 24px;margin-bottom:20px;
  background:rgba(34,211,238,.03);
  border-left:3px solid rgba(34,211,238,.35);
  border-radius:0 10px 10px 0;
}
.research-topic{
  font-size:18px;font-weight:800;color:var(--cyan);
  letter-spacing:-.02em;margin-bottom:14px;line-height:1.3;
}
.research-summary{
  font-size:15px;line-height:1.85;color:rgba(232,234,240,.92);
  font-weight:400;
}
.research-summary p{margin:0 0 10px}
.research-summary p:last-child{margin-bottom:0}
.research-summary strong{color:var(--text);font-weight:700}
.research-summary code{font-size:13px}
.summary-list{
  list-style:none;padding:0;margin:0;
  display:flex;flex-direction:column;gap:8px;
}
.summary-list li{
  padding:8px 12px 8px 32px;
  position:relative;
  background:rgba(255,255,255,.025);
  border-radius:7px;
  line-height:1.6;
}
.summary-list li::before{
  content:'›';
  position:absolute;left:11px;top:8px;
  font-size:15px;font-weight:700;
  color:var(--cyan);line-height:1.6;
}
.section-label{
  font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.15em;
  color:var(--text-faint);margin:24px 0 12px;
  display:flex;align-items:center;gap:10px;
}
.section-label::after{content:'';flex:1;height:1px;background:var(--border)}
.research-details-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:24px}

/* Approaches */
.approaches-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:24px}
.approach-card{
  background:var(--surface3);border:1px solid var(--border);
  border-radius:10px;padding:18px;
  transition:transform .2s,border-color .2s;
}
.approach-card:hover{transform:translateY(-2px);border-color:rgba(34,211,238,.25)}
.approach-card__name{display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px;color:var(--text);margin-bottom:14px}
.approach-icon{font-size:18px}
.approach-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.col-label{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.col-label--green{color:var(--green)}
.col-label--red{color:var(--red)}
.tag-list{list-style:none;padding:0}
.tag-list li{font-size:12px;padding-left:14px;position:relative;color:var(--text-dim);margin-bottom:6px;line-height:1.55}
.tag-list li::before{content:'·';position:absolute;left:2px;top:1px;opacity:.5}

/* Key considerations list — checkmark icon */
.consider-list{list-style:none;padding:0}
.consider-list li{
  font-size:13px;padding:7px 10px 7px 30px;
  position:relative;color:rgba(232,234,240,.85);
  margin-bottom:6px;line-height:1.55;
  background:rgba(255,255,255,.02);border-radius:6px;
}
.consider-list li::before{
  content:'✓';position:absolute;left:9px;top:7px;
  font-size:11px;color:var(--green);font-weight:700;
}

/* Tech pills */
.tech-pills{display:flex;flex-wrap:wrap;gap:7px}
.tech-pill{
  font-size:11px;font-weight:600;padding:3px 11px;
  background:rgba(255,255,255,.05);border:1px solid var(--border);
  border-radius:6px;color:var(--cyan);transition:all .15s;
}
.tech-pill:hover{background:rgba(34,211,238,.1);border-color:var(--cyan)}

/* Challenges */
.challenges-list{list-style:none;padding:0}
.challenges-list li{
  font-size:13px;color:var(--red);opacity:.85;
  margin-bottom:8px;padding-left:20px;position:relative;line-height:1.5;
}
.challenges-list li::before{content:'⚠';position:absolute;left:0;font-size:11px;top:2px}

/* Warning lists */
.warn-list{list-style:none;padding:0;display:flex;flex-direction:column;gap:8px;margin-bottom:24px}
.warn-list li{
  font-size:13px;padding:10px 14px 10px 38px;
  border-radius:8px;position:relative;line-height:1.5;
}
.warn-list--red li{
  color:rgba(248,113,113,.9);background:rgba(248,113,113,.04);
  border:1px solid rgba(248,113,113,.15);
}
.warn-list--red li::before{content:'⛔';position:absolute;left:10px;top:10px;font-size:13px}
.warn-list--amber li{
  color:rgba(251,191,36,.9);background:rgba(251,191,36,.04);
  border:1px solid rgba(251,191,36,.15);
}
.warn-list--amber li::before{content:'⚙️';position:absolute;left:10px;top:10px;font-size:13px}

/* Recommend box */
.recommend-box{
  background:rgba(129,140,248,.06);
  border:1px solid rgba(129,140,248,.25);
  border-radius:10px;padding:18px 20px;
  display:flex;align-items:flex-start;gap:14px;margin-bottom:20px;
}
.recommend-icon{font-size:20px;flex-shrink:0;margin-top:2px}
.recommend-label{
  font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;
  color:var(--indigo);margin-bottom:5px;opacity:.8;
}
.recommend-text{font-size:14px;font-weight:500;line-height:1.65;color:#C7D2FE}

/* Info box */
.info-box{display:flex;align-items:flex-start;gap:14px;padding:16px;border-radius:9px;margin-bottom:24px}
.info-box--amber{background:rgba(251,191,36,.05);border:1px solid rgba(251,191,36,.2);color:rgba(251,191,36,.9);font-size:13px;line-height:1.6}

/* Packages */
.pkg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-bottom:24px}
.pkg-card{
  background:rgba(34,211,238,.02);border:1px solid rgba(34,211,238,.1);
  border-radius:9px;padding:14px;
}
.pkg-card__head{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.pkg-name{font-size:13px;font-weight:800;color:var(--cyan);font-family:monospace}
.pkg-ver{font-size:10px;padding:2px 6px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.2);border-radius:4px;color:var(--cyan);font-family:monospace}
.pkg-dl{font-size:10px;padding:2px 6px;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.2);border-radius:4px;color:var(--green);margin-left:auto}
.pkg-purpose{font-size:12px;color:var(--text-faint);line-height:1.5;margin-bottom:7px}
.pkg-alts{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.pkg-alts-label{font-size:9px;color:var(--text-faint);text-transform:uppercase;font-weight:700}

/* Sources */
.sources-list{list-style:none;padding:0;display:flex;flex-direction:column;gap:8px}
.source-link{
  display:flex;align-items:center;gap:12px;
  padding:11px 14px;
  background:rgba(255,255,255,.02);border:1px solid var(--border);
  border-radius:9px;font-size:12px;color:var(--text-faint);
  transition:all .2s;
}
.source-link:hover{background:rgba(255,255,255,.04);border-color:var(--cyan);color:var(--cyan);text-decoration:none;transform:translateX(4px)}
.source-tag{font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 7px;background:rgba(255,255,255,.05);border-radius:5px;flex-shrink:0}
.source-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Plan ────────────────────────────────────────────────────────────────── */
.step-row{display:flex;align-items:flex-start;gap:14px;padding:12px 0;border-bottom:1px solid var(--border2)}
.step-row:last-child{border-bottom:none}
.step-num{
  flex-shrink:0;width:26px;height:26px;border-radius:7px;
  background:rgba(129,140,248,.1);border:1px solid rgba(129,140,248,.25);
  color:var(--indigo);font-size:11px;font-weight:800;
  display:flex;align-items:center;justify-content:center;
}
.step-text{font-size:13px;padding-top:3px;color:rgba(232,234,240,.88);word-break:break-word;line-height:1.6}
.step-text p{margin:0}

/* ── Worker ──────────────────────────────────────────────────────────────── */
.worker-summary{
  background:rgba(52,211,153,.03);border:1px solid rgba(52,211,153,.12);
  border-radius:9px;padding:14px 16px;margin-bottom:20px;
}
.worker-summary__label{font-size:12px;font-weight:700;color:var(--green);display:block;margin-bottom:10px}
.worker-steps{display:flex;flex-direction:column;gap:14px}
.worker-step{background:var(--surface3);border:1px solid var(--border2);border-radius:9px;padding:16px;transition:border-color .15s}
.worker-step:hover{border-color:var(--border)}
.worker-step__head{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}
.worker-step__title{flex:1;font-size:13px;font-weight:600;color:var(--text-dim);line-height:1.5;word-break:break-word}
.trunc-badge{
  flex-shrink:0;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;
  padding:2px 8px;border-radius:5px;
  background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);color:var(--amber);
}

/* File chips */
.file-list{display:flex;flex-wrap:wrap;gap:7px}
.file-list--compact{margin-top:8px}
.file-chip{
  display:inline-flex;align-items:center;gap:6px;
  padding:5px 11px;
  background:rgba(255,255,255,.04);border:1px solid var(--border);
  border-radius:7px;transition:all .15s;
}
.file-chip:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.15)}
.file-chip--sm{padding:3px 9px}
.file-chip__icon{font-size:13px}
.file-chip__name{font-size:12px;font-weight:600;font-family:'JetBrains Mono','Cascadia Code',monospace;color:var(--text-dim)}
.result-text{font-size:13px;color:var(--text-faint);font-style:italic}

/* ── Review ──────────────────────────────────────────────────────────────── */
.review-score-row{display:flex;align-items:center;gap:20px;margin-bottom:20px;flex-wrap:wrap}
.score-display{display:flex;align-items:baseline;gap:4px}
.score-num{font-size:52px;font-weight:900;line-height:1;letter-spacing:-.05em}
.score-denom{font-size:20px;color:var(--text-faint);font-weight:500}
.score-label{font-size:13px;font-weight:700}
.score-bar{display:flex;gap:5px;align-items:center}
.bar-seg{width:22px;height:9px;border-radius:3px}
.bar-empty{background:rgba(255,255,255,.08)}
.review-feedback{
  border-left:3px solid var(--amber);padding:14px 18px;
  background:rgba(251,191,36,.04);border-radius:0 9px 9px 0;
  font-style:italic;color:rgba(232,234,240,.9);
  margin-bottom:16px;font-size:14px;line-height:1.7;
}
.sub-heading{
  font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
  color:var(--text-faint);margin:16px 0 10px;
}
.suggestions-list{padding-left:18px;display:flex;flex-direction:column;gap:7px}
.suggestions-list li{font-size:13px;color:var(--text-dim);line-height:1.6}

/* ── Final answer ────────────────────────────────────────────────────────── */
.final-card{
  background:var(--surface);border:1px solid rgba(52,211,153,.2);
  border-radius:var(--radius);overflow:hidden;
  box-shadow:0 0 40px rgba(52,211,153,.06),var(--shadow);
  margin-bottom:24px;
}
.final-card__head{
  display:flex;align-items:center;gap:16px;padding:20px 24px;
  border-bottom:1px solid var(--border);
  background:linear-gradient(90deg,rgba(52,211,153,.05) 0%,transparent 100%);
}
.final-icon{font-size:24px}
.final-title{font-size:16px;font-weight:800;color:var(--text)}
.final-sub{font-size:11px;color:var(--text-faint);margin-top:2px}
.final-card__body{padding:32px}

/* ── Prose ───────────────────────────────────────────────────────────────── */
.prose h1,.prose h2,.prose h3,.prose h4{color:var(--text);margin:24px 0 12px;font-weight:800;letter-spacing:-.02em}
.prose h1{font-size:22px}.prose h2{font-size:18px}.prose h3{font-size:15px}
.prose p{margin-bottom:14px;color:rgba(232,234,240,.85);line-height:1.8}
.prose ul,.prose ol{padding-left:22px;margin-bottom:14px}
.prose li{color:rgba(232,234,240,.85);margin-bottom:7px}
.prose code{background:rgba(255,255,255,.07);padding:2px 7px;border-radius:5px;font-family:monospace;font-size:12px;color:var(--cyan)}
.prose blockquote{border-left:3px solid var(--indigo);padding:14px 18px;background:rgba(129,140,248,.05);border-radius:0 9px 9px 0;margin:18px 0;font-style:italic}
.prose hr{border:none;border-top:1px solid var(--border);margin:28px 0}
.prose strong{color:var(--text);font-weight:800}

/* ── Badges ──────────────────────────────────────────────────────────────── */
.badge{font-size:10px;font-weight:800;padding:3px 10px;border-radius:6px;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap}
.badge--cyan{background:rgba(34,211,238,.1);color:var(--cyan);border:1px solid rgba(34,211,238,.25)}
.badge--indigo{background:rgba(129,140,248,.1);color:var(--indigo);border:1px solid rgba(129,140,248,.25)}
.badge--green{background:rgba(52,211,153,.1);color:var(--green);border:1px solid rgba(52,211,153,.25)}
.badge--amber{background:rgba(251,191,36,.1);color:var(--amber);border:1px solid rgba(251,191,36,.25)}
.badge--red{background:rgba(248,113,113,.1);color:var(--red);border:1px solid rgba(248,113,113,.25)}

/* ── Footer ──────────────────────────────────────────────────────────────── */
.report-footer{
  text-align:center;padding:40px 48px;
  font-size:11px;color:var(--text-faint);
  border-top:1px solid var(--border);margin-top:60px;
  letter-spacing:.05em;line-height:2;
}
.report-footer code{font-size:11px}

/* ── Responsive ──────────────────────────────────────────────────────────── */
@media(max-width:800px){
  .report-header,.toc-bar,.main,.report-footer{padding-left:20px;padding-right:20px}
  .stats-grid{gap:10px}
  .stat-card{min-width:80px}
  .research-details-grid,.approach-cols{grid-template-columns:1fr}
  .score-num{font-size:38px}
}

/* ── Print ───────────────────────────────────────────────────────────────── */
@media print{
  body{background:#fff;color:#000}
  .toc-bar{display:none}
  .report-header{border:none;padding:16px 0 12px}
  .goal-title,.iter-title,.final-title{color:#111}
  .iter-section,.final-card{break-inside:avoid;box-shadow:none;border:1px solid #ddd}
  .phase__label{background:#f5f5f5;color:#555}
  code{background:#f0f0f0;color:#333}
}
</style>
</head>
<body>

<!-- ── Header ───────────────────────────────────────────────────────────── -->
<header class="report-header">
  <div class="brand">
    Starter Agent <span class="brand-sep">|</span>
    <span class="brand-highlight">Workflow Report</span>
  </div>
  <h1 class="goal-title">${esc(goal)}</h1>
  <div class="header-chips">
    <span class="header-chip"><span class="status-dot"></span>${esc(status)}</span>
    ${loopCount > 0 ? `<span class="header-chip">🔄 ${loopCount} improvement loop${loopCount !== 1 ? 's' : ''}</span>` : ''}
    ${totalIters > 1 ? `<span class="header-chip">📊 ${totalIters} iterations</span>` : ''}
  </div>
  <div class="header-meta">
    <span><strong>Run ID</strong>&nbsp; ${esc(runId)}</span>
    <span><strong>Session</strong>&nbsp; ${esc(sessionId)}</span>
    ${startedAt ? `<span><strong>Started</strong>&nbsp; ${ts(startedAt)}</span>` : ''}
    ${endedAt   ? `<span><strong>Ended</strong>&nbsp; ${ts(endedAt)}</span>` : ''}
  </div>
</header>

<!-- ── Sticky TOC ────────────────────────────────────────────────────────── -->
${toc ? `<nav class="toc-bar" aria-label="Jump to section">${toc}</nav>` : ''}

<!-- ── Main ─────────────────────────────────────────────────────────────── -->
<main class="main">

  ${sectionStats({ goal, status, startedAt, endedAt, loopCount, allIters, statusColor })}

  ${iterSections}

  ${sectionFinalAnswer(state?.finalAnswer)}

</main>

<!-- ── Footer ───────────────────────────────────────────────────────────── -->
<footer class="report-footer">
  Generated by <strong>Starter Agent</strong> &bull;
  Run <code>${esc(runId)}</code>
  ${totalIters > 1 ? `&bull; ${totalIters} iterations` : ''}
  &bull; ${ts(endedAt || startedAt)}
</footer>

</body>
</html>`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function generateReport({ state, runId, sessionId, startedAt, endedAt, status, loopIterations = [] }) {
  try {
    const dir  = join(REPORTS_DIR, sessionId);
    mkdirSync(dir, { recursive: true });

    const html     = buildHtml({ state, runId, sessionId, startedAt, endedAt, status, loopIterations });
    const filePath = join(dir, 'walkthrough.html');
    writeFileSync(filePath, html, 'utf8');

    logger.info(`Report saved: reports/${sessionId}/walkthrough.html`, { runId });
    return filePath;
  } catch (err) {
    logger.error(`Failed to generate report: ${err.message}`, { runId });
    return null;
  }
}
