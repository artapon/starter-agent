import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('report-generator');

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const REPORTS_DIR = join(PROJECT_ROOT, 'reports');

// ── Tiny markdown-to-HTML converter ─────────────────────────────────────────
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
    .replace(/^(?!<[h1-6|ul|li|blockquote|hr|p])(.+)$/gm, '<p>$1</p>');
}

function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function scoreBar(score = 0) {
  const filled = Math.round(score / 2);
  const empty = 5 - filled;
  return `<span class="score-bar">${'<span class="bar-filled"></span>'.repeat(filled)}${'<span class="bar-empty"></span>'.repeat(empty)}</span>`;
}

function ts(unixSecs) {
  if (!unixSecs) return '—';
  return new Date(unixSecs * 1000).toLocaleString();
}

// ── Phase renderers ──────────────────────────────────────────────────────────

function phaseResearch(r) {
  if (!r) return '';
  const approaches = (r.approaches || []).map(a => `
    <div class="approach-card">
      <div class="approach-card__header">
        <span class="approach-card__icon">🚀</span>
        <div class="approach-card__name">${esc(a.name)}</div>
      </div>
      <div class="approach-card__columns">
        <div class="approach-col">
          <div class="tag-label tag-label--green">Strengths</div>
          <ul class="tag-list">
            ${(a.pros || []).map(p => `<li>${esc(p)}</li>`).join('')}
          </ul>
        </div>
        <div class="approach-col">
          <div class="tag-label tag-label--red">Weaknesses</div>
          <ul class="tag-list">
            ${(a.cons || []).map(c => `<li>${esc(c)}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>`).join('');

  const sources = (r.sources || []).map(s => {
    const url     = typeof s === 'string' ? s : s.url;
    const name    = typeof s === 'string' ? s : (s.snippet?.slice(0, 60) || s.title || s.name || url);
    const sType   = typeof s === 'object' ? (s.type || '') : '';
    let domain = 'web';
    try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
    const typeIcon = { github: '🐙', npm: '📦', stackoverflow: '💬', hackernews: '🔶', google: '🔍' }[sType] || '🌐';
    return `<li><a href="${esc(url)}" target="_blank" class="source-link"><span class="source-domain">${typeIcon} ${esc(domain)}</span> ${esc(name)}</a></li>`;
  }).join('');

  return `
  <div class="phase phase--research">
    <div class="phase__label">
      <div class="phase__label-left">
        <span class="phase__icon">🔬</span> 
        <span class="phase__name">Deep Research Phase</span>
      </div>
      <span class="badge badge--cyan">researcher agent</span>
    </div>
    <div class="phase__body">
      <div class="research-summary">
        <h3 class="research-topic">${esc(r.topic || 'Research Findings')}</h3>
        <p class="research-text">${esc(r.summary || 'No summary provided.')}</p>
      </div>

      ${approaches ? `
        <div class="section-title">Architectural Approaches</div>
        <div class="approaches-grid">${approaches}</div>
      ` : ''}

      <div class="research-details-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 24px;">
        <div class="research-details-col">
           ${(r.keyConsiderations || []).length ? `
            <div class="section-title">Key Considerations</div>
            <ul class="tag-list">
              ${(r.keyConsiderations || []).map(c => `<li>${esc(c)}</li>`).join('')}
            </ul>
          ` : ''}
          
          ${(r.techStack || []).length ? `
            <div class="section-title">Suggested Tech Stack</div>
            <div class="tech-pills">
              ${(r.techStack || []).map(t => `<span class="tech-pill">${esc(t)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        
        <div class="research-details-col">
           ${(r.potentialChallenges || []).length ? `
            <div class="section-title">Potential Blockers</div>
            <ul class="challenges-list">
              ${(r.potentialChallenges || []).map(c => `<li>${esc(c)}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      </div>

      ${r.recommendedApproach ? `
        <div class="section-title">Recommended Strategy</div>
        <div class="recommended-box" style="margin-bottom: 24px;">
          <span class="recommended-icon">⭐</span>
          <div class="recommended-text">${esc(r.recommendedApproach)}</div>
        </div>
      ` : ''}

      ${(r.recommendedPackages || []).length ? `
        <div class="section-title">Recommended Packages</div>
        <div class="pkg-grid">
          ${(r.recommendedPackages || []).map(p => {
            const dl = p.monthlyDownloads ? (p.monthlyDownloads >= 1000000 ? `${(p.monthlyDownloads/1000000).toFixed(1)}M` : `${Math.round(p.monthlyDownloads/1000)}k`) + '/mo' : '';
            const alts = (p.alternatives || []).map(a => `<span class="tech-pill">${esc(a)}</span>`).join('');
            return `<div class="pkg-card">
              <div class="pkg-card__header">
                <span class="pkg-name">${esc(p.name)}</span>
                ${p.version ? `<span class="pkg-version">${esc(p.version)}</span>` : ''}
                ${dl ? `<span class="pkg-dl">${dl}</span>` : ''}
              </div>
              <div class="pkg-purpose">${esc(p.purpose || '')}</div>
              ${alts ? `<div class="pkg-alts"><span class="pkg-alts-label">Alt:</span> ${alts}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      ` : ''}

      ${(r.antiPatterns || []).length ? `
        <div class="section-title">Anti-Patterns to Avoid</div>
        <ul class="antipatterns-list">
          ${(r.antiPatterns || []).map(a => `<li>${esc(a)}</li>`).join('')}
        </ul>
      ` : ''}

      ${(r.productionConsiderations || []).length ? `
        <div class="section-title">Production Checklist</div>
        <ul class="production-list">
          ${(r.productionConsiderations || []).map(c => `<li>${esc(c)}</li>`).join('')}
        </ul>
      ` : ''}

      ${r.versioningNotes ? `
        <div class="section-title">Versioning & Compatibility</div>
        <div class="versioning-box"><span class="versioning-icon">⚠️</span><div class="versioning-text">${esc(r.versioningNotes)}</div></div>
      ` : ''}

      ${sources ? `
        <div class="section-title">References & Sources</div>
        <ul class="sources-list">${sources}</ul>
      ` : ''}
    </div>
  </div>`;
}

function truncateDesc(text = '', max = 600) {
  const t = text.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function phasePlan(plan) {
  if (!plan) return '';
  const steps = (plan.steps || []).map((s, i) => {
    const raw = (s.description || s.task || '').trim();
    // Strip LLM-injected context blocks that shouldn't appear in the report
    const clean = raw
      .replace(/\[Research Context\][\s\S]*/i, '')
      .replace(/=== EXISTING WORKSPACE PROJECT ===[\s\S]*/i, '')
      .replace(/##\s+REQUIRED FIXES[\s\S]*/i, '')
      .replace(/##\s+RL SCORE TARGET[\s\S]*/i, '')
      .trim();
    return `
    <div class="step-row">
      <div class="step-num">${i + 1}</div>
      <div class="step-desc">${md(truncateDesc(clean || raw))}</div>
    </div>`;
  }).join('');
  return `
  <div class="phase">
    <div class="phase__label"><span class="phase__icon">📋</span> Plan <span class="badge badge--indigo">planner</span> <span class="meta">${plan.steps?.length || 0} step(s)</span></div>
    <div class="phase__body">${steps || '<p class="muted">No steps.</p>'}</div>
  </div>`;
}

function phaseWorker(subtaskResults, planSteps) {
  if (!Array.isArray(subtaskResults) || !subtaskResults.length) return '';
  const items = subtaskResults.map((r, i) => {
    const step = planSteps?.[i];
    const label = step?.description || step?.task || `Step ${i + 1}`;
    const result = typeof r === 'string' ? r : (r?.result || r?.output || JSON.stringify(r, null, 2));
    return `
    <div class="dev-step">
      <div class="dev-step__header"><span class="step-num">${i + 1}</span><span class="dev-step__title">${esc(label)}</span></div>
      <pre class="code-block"><code>${esc(result || '')}</code></pre>
    </div>`;
  }).join('');
  return `
  <div class="phase">
    <div class="phase__label"><span class="phase__icon">💻</span> Worker Work <span class="badge badge--green">worker</span> <span class="meta">${subtaskResults.length} step(s)</span></div>
    <div class="phase__body">${items}</div>
  </div>`;
}

/**
 * If feedback is a raw JSON string (reviewer fallback path — output was truncated
 * or could not be parsed), try to recover the human-readable feedback text and
 * the actual score from the partial JSON rather than displaying it verbatim.
 */
function normalizeReview(review) {
  if (!review) return review;
  const feedback = review.feedback || '';
  if (!feedback.trim().startsWith('{')) return review;

  // Looks like raw JSON was stored as feedback — try to extract fields
  let extracted = null;
  try { extracted = JSON.parse(feedback); } catch { /* truncated */ }
  if (!extracted) {
    // Regex for truncated JSON
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

function phaseReview(rawReview) {
  if (!rawReview) return '';
  const review = normalizeReview(rawReview);
  const score = review.score ?? 0;
  const color = score >= 10 ? 'var(--green)' : score >= 7 ? 'var(--amber)' : 'var(--red)';
  return `
  <div class="phase">
    <div class="phase__label"><span class="phase__icon">🔍</span> Review <span class="badge badge--amber">reviewer</span> <span class="badge ${review.approved ? 'badge--green' : 'badge--red'}">${review.approved ? '✓ Approved' : '✗ Needs work'}</span></div>
    <div class="phase__body">
      <div class="review-score">
        <span class="score-num" style="color:${color}">${score}<span class="score-denom">/10</span></span>
        ${scoreBar(score)}
      </div>
      ${review.feedback ? `<blockquote class="review-feedback">${esc(review.feedback)}</blockquote>` : ''}
      ${(review.suggestions || []).length ? `<div class="sub-heading">Suggestions</div><ul>${(review.suggestions || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    </div>
  </div>`;
}

// ── Build one iteration block ────────────────────────────────────────────────

function renderIteration({ loopIdx, researchFindings, plan, subtaskResults, reviewFeedback }, iterNum, totalIters) {
  const isFirst = iterNum === 1;
  const review = normalizeReview(reviewFeedback);
  const score = review?.score ?? '?';
  const scoreColor = score >= 10 ? '#10B981' : score >= 7 ? '#F59E0B' : '#EF4444';
  const iterLabel = isFirst ? 'Initial Run' : `Improvement Loop ${iterNum - 1}`;
  const scoreTag = reviewFeedback ? `<span class="iter-score" style="background:${scoreColor}22;border-color:${scoreColor}55;color:${scoreColor}">${score}/10</span>` : '';

  return `
  <section class="iter-section" id="iter-${iterNum}">
    <div class="iter-header">
      <span class="iter-badge">${iterNum}</span>
      <span class="iter-title">${iterLabel}</span>
      ${scoreTag}
      ${totalIters > 1 ? `<span class="iter-of">of ${totalIters}</span>` : ''}
    </div>
    <div class="iter-phases">
      ${isFirst ? phaseResearch(researchFindings) : ''}
      ${phasePlan(plan)}
      ${phaseWorker(subtaskResults, plan?.steps)}
      ${phaseReview(reviewFeedback)}
    </div>
  </section>`;
}

// ── Final answer ─────────────────────────────────────────────────────────────

function sectionFinalAnswer(answer) {
  if (!answer) return '';
  return `
  <section class="card" id="final">
    <div class="card__header">
      <span class="step-icon">✅</span>
      <span class="step-label">Final Answer</span>
      <span class="badge badge--cyan">assembler</span>
    </div>
    <div class="card__body prose">${md(answer)}</div>
  </section>`;
}

// ── Full HTML document ───────────────────────────────────────────────────────

function buildHtml({ state, runId, sessionId, startedAt, endedAt, status, loopIterations }) {
  const goal = state?.userGoal || 'Unknown goal';
  const allIters = [...(loopIterations || [])];

  // Add final state as last iteration
  allIters.push({
    loopIdx: state?.loopCount ?? 0,
    researchFindings: state?.researchFindings,
    plan: state?.plan,
    subtaskResults: Array.isArray(state?.subtaskResults) ? state.subtaskResults : [],
    reviewFeedback: state?.reviewFeedback,
  });

  const totalIters = allIters.length;
  const loopCount = loopIterations?.length ?? 0;
  const statusColor = { complete: '#10B981', error: '#EF4444', stopped: '#6B7280', running: '#F59E0B' }[status] || '#6B7280';

  const loopBadge = loopCount > 0
    ? `<span class="header-loop-badge">🔄 ${loopCount} improvement loop${loopCount !== 1 ? 's' : ''}</span>`
    : '';

  const tocItems = allIters.map((_, i) => {
    const label = i === 0 ? 'Initial Run' : `Loop ${i}`;
    return `<a class="toc-link" href="#iter-${i + 1}">${label}</a>`;
  }).join('');
  const toc = tocItems + (state?.finalAnswer ? `<a class="toc-link toc-link--final" href="#final">✅ Final Answer</a>` : '');

  const iterSections = allIters.map((iter, i) => renderIteration(iter, i + 1, totalIters)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Walkthrough — ${esc(goal).slice(0, 60)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#08080F;--surface:#0D0D1A;--surface2:#12121F;
    --border:rgba(255,255,255,0.07);
    --text:#FFFFFF;--muted:rgba(255,255,255,0.55);
    --cyan:#22D3EE;--indigo:#6366F1;--green:#10B981;--amber:#F59E0B;--red:#EF4444;
    --radius:10px;
  }
  body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.7}
  a{color:var(--cyan);text-decoration:none}a:hover{text-decoration:underline}
  code{background:rgba(255,255,255,.07);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;color:var(--cyan)}

  /* Header */
  .header{background:var(--surface);border-bottom:1px solid var(--border);padding:28px 48px 24px}
  .header__brand{font-size:11px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;margin-bottom:10px}
  .header__brand span{color:var(--cyan);font-weight:700}
  .header__goal{font-size:22px;font-weight:700;line-height:1.3;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .header__meta{display:flex;flex-wrap:wrap;gap:20px;font-size:12px;color:var(--muted)}
  .header__meta strong{color:var(--text)}
  .status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};margin-right:5px;vertical-align:middle}
  .header-loop-badge{font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.4);color:#A5B4FC}

  /* TOC */
  .toc{background:var(--surface2);border-bottom:1px solid var(--border);padding:12px 48px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .toc-link{font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid var(--border);color:var(--muted);transition:all .15s}
  .toc-link:hover{border-color:var(--cyan);color:var(--cyan);text-decoration:none}
  .toc-link--final{border-color:rgba(16,185,129,.3);color:var(--green)}
  .toc-link--final:hover{border-color:var(--green);color:var(--green)}

  /* Main layout */
  .main{padding:32px 48px 80px; margin: 0 auto;}

  /* Iteration sections */
  .iter-section{margin-bottom:40px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden; background: var(--surface); box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5)}
  .iter-header{display:flex;align-items:center;gap:12px;padding:18px 24px;background:linear-gradient(90deg, var(--surface2), transparent);border-bottom:1px solid var(--border)}
  .iter-badge{width:32px;height:32px;border-radius:8px;background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.4);color:#A5B4FC;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0; transform: rotate(-5deg)}
  .iter-title{font-weight:700;font-size:17px;flex:1; letter-spacing: -0.01em}
  .iter-score{font-size:12px;font-weight:700;padding:4px 12px;border-radius:6px;border:1px solid; letter-spacing: 0.05em}
  .iter-of{font-size:11px;color:var(--muted)}
  .iter-phases{display:flex;flex-direction:column;gap:0}

  /* Phase blocks */
  .phase{border-top:1px solid var(--border); transition: background 0.2s}
  .phase:hover{background: rgba(255,255,255,0.01)}
  .phase:first-child{border-top:none}
  .phase__label{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 24px;background:rgba(255,255,255,.03);font-size:11px;font-weight:700;color:var(--muted);border-bottom:1px solid var(--border); text-transform: uppercase; letter-spacing: 0.1em}
  .phase__label-left { display: flex; align-items: center; gap: 8px; }
  .phase__icon{font-size:16px; filter: drop-shadow(0 0 5px rgba(255,255,255,0.2))}
  .phase__body{padding:24px}
  .meta{font-size:11px;color:var(--muted);font-weight:400; text-transform: none; letter-spacing: 0}

  /* Research Specific */
  .research-summary { margin-bottom: 24px; padding: 20px; background: rgba(34, 211, 238, 0.03); border-radius: 12px; border: 1px solid rgba(34, 211, 238, 0.1); }
  .research-topic { font-size: 20px; font-weight: 800; margin-bottom: 12px; color: var(--cyan); letter-spacing: -0.02em; }
  .research-text { font-size: 15px; line-height: 1.7; color: rgba(255,255,255,0.85); }
  
  .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted); margin: 24px 0 12px; display: flex; align-items: center; gap: 8px; }
  .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .approaches-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .approach-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 12px; padding: 20px; transition: transform 0.2s, border-color 0.2s; position: relative; overflow: hidden; }
  .approach-card:hover { transform: translateY(-3px); border-color: rgba(34, 211, 238, 0.3); }
  .approach-card__header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .approach-card__icon { font-size: 20px; }
  .approach-card__name { font-weight: 800; font-size: 16px; color: var(--text); }
  .approach-card__columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .tag-label { font-size: 9px; font-weight: 900; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.05em; }
  .tag-label--green { color: var(--green); }
  .tag-label--red { color: var(--red); }
  .tag-list { list-style: none; padding: 0; }
  .tag-list li { font-size: 12px; margin-bottom: 6px; padding-left: 12px; position: relative; color: rgba(255,255,255,0.7); }
  .tag-list li::before { content: '•'; position: absolute; left: 0; color: inherit; opacity: 0.5; }

  .research-footer { display: grid; grid-template-columns: 1.5fr 1fr; gap: 32px; margin-top: 10px; }
  .recommended-box { background: rgba(99, 102, 241, 0.05); border-radius: 12px; border: 1px solid rgba(99, 102, 241, 0.2); padding: 20px; display: flex; gap: 16px; }
  .recommended-icon { font-size: 24px; }
  .recommended-text { font-size: 14px; font-weight: 500; line-height: 1.6; color: #A5B4FC; }

  .tech-pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .tech-pill { font-size: 11px; font-weight: 700; padding: 4px 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 6px; color: var(--cyan); transition: all 0.2s; }
  .tech-pill:hover { background: rgba(34, 211, 238, 0.1); border-color: var(--cyan); }

  .challenges-list { list-style: none; padding: 0; }
  .challenges-list li { font-size: 13px; color: var(--red); opacity: 0.8; margin-bottom: 8px; padding-left: 18px; position: relative; }
  .challenges-list li::before { content: '⚠️'; position: absolute; left: 0; font-size: 10px; top: 3px; }

  .sources-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .source-link { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 10px; font-size: 13px; color: var(--muted); transition: all 0.2s; }
  .source-link:hover { background: rgba(255,255,255,0.05); border-color: var(--cyan); color: var(--cyan); text-decoration: none; transform: translateX(5px); }
  .source-domain { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 3px 8px; background: rgba(255,255,255,0.05); border-radius: 6px; color: var(--muted); flex-shrink: 0; }

  /* Recommended Packages */
  .pkg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .pkg-card { background: rgba(34,211,238,0.03); border: 1px solid rgba(34,211,238,0.12); border-radius: 10px; padding: 14px 16px; }
  .pkg-card__header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
  .pkg-name { font-size: 14px; font-weight: 800; color: var(--cyan); font-family: monospace; }
  .pkg-version { font-size: 11px; padding: 2px 7px; background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.2); border-radius: 4px; color: var(--cyan); font-family: monospace; }
  .pkg-dl { font-size: 10px; padding: 2px 7px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); border-radius: 4px; color: var(--green); margin-left: auto; }
  .pkg-purpose { font-size: 12px; color: rgba(255,255,255,0.65); line-height: 1.5; margin-bottom: 8px; }
  .pkg-alts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pkg-alts-label { font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 700; }

  /* Anti-Patterns */
  .antipatterns-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
  .antipatterns-list li { font-size: 13px; color: rgba(239,68,68,0.9); padding: 10px 14px 10px 36px; background: rgba(239,68,68,0.04); border: 1px solid rgba(239,68,68,0.15); border-radius: 8px; position: relative; line-height: 1.5; }
  .antipatterns-list li::before { content: '⛔'; position: absolute; left: 10px; top: 10px; font-size: 13px; }

  /* Production Checklist */
  .production-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
  .production-list li { font-size: 13px; color: rgba(245,158,11,0.9); padding: 10px 14px 10px 36px; background: rgba(245,158,11,0.04); border: 1px solid rgba(245,158,11,0.15); border-radius: 8px; position: relative; line-height: 1.5; }
  .production-list li::before { content: '⚙️'; position: absolute; left: 10px; top: 10px; font-size: 13px; }

  /* Versioning Notes */
  .versioning-box { display: flex; align-items: flex-start; gap: 14px; padding: 16px 20px; background: rgba(245,158,11,0.05); border: 1px solid rgba(245,158,11,0.2); border-radius: 10px; margin-bottom: 24px; }
  .versioning-icon { font-size: 20px; flex-shrink: 0; margin-top: 2px; }
  .versioning-text { font-size: 13px; color: rgba(245,158,11,0.9); line-height: 1.6; font-weight: 500; }

  /* Final answer card */
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:24px;overflow:hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.4)}
  .card__header{display:flex;align-items:center;gap:12px;padding:18px 24px;border-bottom:1px solid var(--border);background:linear-gradient(90deg, var(--surface2), transparent)}
  .step-icon{font-size:20px}.step-label{font-weight:800;font-size:16px;color:var(--text);flex:1; letter-spacing: -0.01em}
  .card__body{padding:32px}

  /* Badges */
  .badge{font-size:10px;font-weight:800;padding:3px 10px;border-radius:6px;text-transform:uppercase;letter-spacing:.1em}
  .badge--cyan{background:rgba(34,211,238,.1);color:var(--cyan);border:1px solid rgba(34,211,238,.3)}
  .badge--indigo{background:rgba(99,102,241,.1);color:var(--indigo);border:1px solid rgba(99,102,241,.3)}
  .badge--green{background:rgba(16,185,129,.1);color:var(--green);border:1px solid rgba(16,185,129,.3)}
  .badge--amber{background:rgba(245,158,11,.1);color:var(--amber);border:1px solid rgba(245,158,11,.3)}
  .badge--red{background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.3)}

  /* Plan */
  .step-row{display:flex;align-items:flex-start;gap:16px;padding:12px 0;border-bottom:1px solid var(--border)}
  .step-row:last-child{border-bottom:none}
  .step-num{flex-shrink:0;width:28px;height:28px;border-radius:8px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);color:#A5B4FC;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
  .step-desc{font-size:14px;padding-top:4px;color:rgba(255,255,255,0.9); font-weight: 500; word-break: break-word;}
  .step-desc p{margin:0 0 4px}

  /* Worker */
  .dev-step{margin-bottom:24px}
  .dev-step__header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .dev-step__title{font-weight:700;font-size:14px;color:var(--text); letter-spacing: -0.01em}
  .code-block{background:#05050A;border:1px solid var(--border);border-radius:12px;padding:24px;overflow-x:auto;font-family:'JetBrains Mono','Cascadia Code','Fira Code',monospace;font-size:12px;line-height:1.7;color:#E2E8F0;white-space:pre-wrap;word-break:break-word; box-shadow: inset 0 2px 10px rgba(0,0,0,0.5)}

  /* Review */
  .review-score{display:flex;align-items:center;gap:16px;margin-bottom:16px}
  .score-num{font-size:48px;font-weight:900;line-height:1; letter-spacing: -0.05em}
  .score-denom{font-size:18px;color:var(--muted);font-weight:500}
  .score-bar{display:flex;gap:6px}
  .bar-filled{width:20px;height:10px;border-radius:3px;background:var(--amber); box-shadow: 0 0 10px rgba(245,158,11,0.3)}
  .bar-empty{width:20px;height:10px;border-radius:3px;background:rgba(245,158,11,.1)}
  .review-feedback{border-left:4px solid var(--amber);padding:16px 20px;background:rgba(245,158,11,.04);border-radius:0 12px 12px 0;font-style:italic;color:rgba(255,255,255,0.9);margin-top:12px; font-size: 14px}

  /* Prose */
  .prose h1,.prose h2,.prose h3,.prose h4{color:var(--text);margin:24px 0 12px; font-weight: 800; letter-spacing: -0.02em}
  .prose h1{font-size:22px}.prose h2{font-size:18px}.prose h3{font-size:16px}
  .prose p{margin-bottom:16px;color:rgba(255,255,255,0.85); line-height: 1.8}
  .prose ul, .prose ol{padding-left:24px;margin-bottom:16px}
  .prose li{color:rgba(255,255,255,0.85);margin-bottom:8px}
  .prose code{background:rgba(255,255,255,.07);padding:3px 8px;border-radius:6px;font-family:monospace;font-size:13px;color:var(--cyan)}
  .prose blockquote{border-left:4px solid var(--indigo);padding:16px 20px;background:rgba(99,102,241,.05);border-radius:0 12px 12px 0;margin:20px 0; font-style: italic}
  .prose hr{border:none;border-top:1px solid var(--border);margin:32px 0}
  .prose strong{color:var(--text);font-weight:800}

  /* Misc */
  ul{padding-left:18px}
  li{margin-bottom:4px;color:var(--text)}
  blockquote{border-left:3px solid var(--border);padding:6px 12px;color:var(--text)}
  .muted{color:var(--muted)}
  .footer{text-align:center;padding:48px;font-size:12px;color:var(--muted);border-top:1px solid var(--border);margin-top:60px; letter-spacing: 0.05em}

  /* Misc */
  ul{padding-left:18px}
  li{margin-bottom:4px;color:var(--text)}
  blockquote{border-left:3px solid var(--border);padding:6px 12px;color:var(--text)}
  .muted{color:var(--muted)}
  .footer{text-align:center;padding:24px;font-size:11px;color:var(--muted);border-top:1px solid var(--border);margin-top:40px}
</style>
</head>
<body>

<div class="header">
  <div class="header__brand">Starter Agent &nbsp;/&nbsp; <span>Workflow Report</span></div>
  <div class="header__goal">
    ${esc(goal)} ${loopBadge}
  </div>
  <div class="header__meta">
    <span><strong>Run ID</strong> ${runId}</span>
    <span><strong>Session</strong> ${sessionId}</span>
    <span><strong>Status</strong> <span class="status-dot"></span>${status}</span>
    <span><strong>Started</strong> ${ts(startedAt)}</span>
    ${endedAt ? `<span><strong>Ended</strong> ${ts(endedAt)}</span>` : ''}
    ${totalIters > 1 ? `<span><strong>Total Iterations</strong> ${totalIters}</span>` : ''}
  </div>
</div>

${toc ? `<nav class="toc">${toc}</nav>` : ''}

<main class="main">
  ${iterSections}
  ${sectionFinalAnswer(state?.finalAnswer)}
</main>

<footer class="footer">
  Generated by Starter Agent &bull; Run <code>${runId}</code>
  ${totalIters > 1 ? ` &bull; ${totalIters} iterations` : ''}
</footer>

</body>
</html>`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function generateReport({ state, runId, sessionId, startedAt, endedAt, status, loopIterations = [] }) {
  try {
    const dir = join(REPORTS_DIR, sessionId);
    mkdirSync(dir, { recursive: true });

    const html = buildHtml({ state, runId, sessionId, startedAt, endedAt, status, loopIterations });
    const filePath = join(dir, 'walkthrough.html');
    writeFileSync(filePath, html, 'utf8');

    logger.info(`Report saved: reports/${sessionId}/walkthrough.html`, { runId });
    return filePath;
  } catch (err) {
    logger.error(`Failed to generate report: ${err.message}`, { runId });
    return null;
  }
}
