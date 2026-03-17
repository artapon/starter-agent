import { getDb } from '../database/db.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('rl');

const TABLE = 'rl_outcomes';

export class RLStore {
  constructor() {
    this.db = getDb();
  }

  /**
   * Record the outcome of a reviewer step.
   * Called from workflow.nodes.js after every review.
   */
  recordOutcome({ runId, sessionId, goal, stepDesc, workerSummary, score, feedback, suggestions, approved, loopCount }) {
    this.db.table(TABLE).insert({
      run_id:         runId || '',
      session_id:     sessionId || '',
      goal:           (goal || '').slice(0, 400),
      step_desc:      (stepDesc || '').slice(0, 400),
      worker_summary: (workerSummary || '').slice(0, 600),
      score:          Number(score) || 0,
      feedback:       (feedback || '').slice(0, 600),
      suggestions:    JSON.stringify(suggestions || []),
      approved:       approved ? 1 : 0,
      loop_count:     loopCount || 0,
      created_at:     Math.floor(Date.now() / 1000),
    });
    logger.debug(`Recorded outcome score=${score} for run ${runId}`, { agentId: 'rl' });
  }

  /** Top N highest-scored outcomes (≥8) for "follow these" worker injection */
  getTopPatterns(limit = 3) {
    return this.db.table(TABLE)
      .all({}, { orderBy: 'score', order: 'desc' })
      .filter(r => r.score >= 8)
      .slice(0, limit);
  }

  /** Bottom N lowest-scored outcomes (<6) for "avoid these" worker injection */
  getWeakPatterns(limit = 3) {
    return this.db.table(TABLE)
      .all({}, { orderBy: 'score', order: 'asc' })
      .filter(r => r.score < 6)
      .slice(0, limit);
  }

  /** Top N excellent outcomes (≥9) for reviewer calibration */
  getExcellentPatterns(limit = 2) {
    return this.db.table(TABLE)
      .all({}, { orderBy: 'score', order: 'desc' })
      .filter(r => r.score >= 9)
      .slice(0, limit);
  }

  /** Bottom N failure outcomes (<5) for reviewer calibration */
  getFailurePatterns(limit = 2) {
    return this.db.table(TABLE)
      .all({}, { orderBy: 'score', order: 'asc' })
      .filter(r => r.score < 5)
      .slice(0, limit);
  }

  /**
   * Build the RL context block injected into the Worker system prompt.
   * Returns empty string if no history yet.
   */
  buildWorkerContext() {
    const top  = this.getTopPatterns(3);
    const weak = this.getWeakPatterns(3);
    if (!top.length && !weak.length) return '';

    const lines = ['\n\n## REINFORCEMENT LEARNING — QUALITY PATTERNS\n'];
    lines.push('Use past outcomes to guide this implementation.\n');

    if (top.length) {
      lines.push('### ✅ High-Quality Patterns (score ≥ 8) — follow these approaches:');
      for (const r of top) {
        lines.push(`- [Score ${r.score}/10] Task: "${r.step_desc}"`);
        if (r.worker_summary) lines.push(`  Result: ${r.worker_summary}`);
        if (r.feedback) lines.push(`  Reviewer: ${r.feedback}`);
      }
    }

    if (weak.length) {
      lines.push('\n### ❌ Anti-Patterns (score < 6) — avoid these mistakes:');
      for (const r of weak) {
        lines.push(`- [Score ${r.score}/10] Task: "${r.step_desc}"`);
        if (r.feedback) lines.push(`  Problem: ${r.feedback}`);
        const suggestions = _parseSuggestions(r.suggestions);
        if (suggestions.length) lines.push(`  Fix: ${suggestions.slice(0, 2).join('; ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build the RL context block injected into the Reviewer system prompt.
   * Returns empty string if no history yet.
   */
  buildReviewerContext() {
    const stats     = this.getStats();
    const excellent = this.getExcellentPatterns(2);
    const failures  = this.getFailurePatterns(2);
    if (stats.totalRuns === 0) return '';

    const lines = ['\n\n## REVIEWER CALIBRATION\n'];
    lines.push(`Historical baseline: ${stats.totalRuns} reviews, avg score ${stats.avgScore}/10, approval rate ${stats.approvalRate}%.`);
    if (stats.recentAvg !== null) {
      lines.push(`Recent trend (last 10): avg ${stats.recentAvg}/10.`);
    }
    lines.push('Calibrate your score consistently with past reviews.\n');

    if (excellent.length) {
      lines.push('### Examples of excellent work (scored ≥ 9):');
      for (const r of excellent) {
        lines.push(`- Task: "${r.step_desc}" → Score ${r.score}/10`);
        if (r.feedback) lines.push(`  Why high: ${r.feedback}`);
      }
    }

    if (failures.length) {
      lines.push('\n### Examples of poor work (scored < 5):');
      for (const r of failures) {
        lines.push(`- Task: "${r.step_desc}" → Score ${r.score}/10`);
        if (r.feedback) lines.push(`  Why low: ${r.feedback}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build a targeted improvement task description for the Worker improvement loop.
   *
   * Combines:
   *   - The reviewer's specific feedback + suggestions for this pass
   *   - Historically similar high-scoring outcomes (what "good" looks like for this task type)
   *   - A score target derived from RL history
   *
   * @param {string} stepDesc   - The original step description
   * @param {number} score      - Current score from reviewer
   * @param {string} feedback   - Reviewer feedback text
   * @param {string[]} suggestions - Reviewer suggestions list
   * @param {number} loopNum    - Which improvement loop this is (1-based)
   * @returns {string} Full improvement task description
   */
  buildImprovementContext(stepDesc, score, feedback, suggestions, loopNum = 1) {
    const stats   = this.getStats();
    const target  = score < 8 ? 9 : 10;
    const similar = _findSimilar(
      this.db.table(TABLE).all({}, { orderBy: 'score', order: 'desc' }).filter(r => r.score >= 8),
      stepDesc,
      2
    );
    const prevLoopImproved = _findImproved(
      this.db.table(TABLE).all({}, { orderBy: 'loop_count', order: 'desc' }).filter(r => r.loop_count > 0 && r.score >= 8),
      stepDesc,
      2
    );

    const lines = [
      `Improvement pass (loop ${loopNum}) — current score: ${score}/10, target: ${target}/10.`,
      '',
    ];

    // Section 1: Required fixes from this reviewer pass
    lines.push('## REQUIRED FIXES (apply all of these):');
    if (suggestions && suggestions.length) {
      suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    } else if (feedback) {
      lines.push(`1. ${feedback}`);
    }
    lines.push('');

    // Section 2: RL-guided improvement target
    if (stats.totalRuns > 0) {
      const gap = target - score;
      lines.push(`## RL SCORE TARGET: ${target}/10 (gap: +${gap} points)`);
      if (stats.avgScore !== null) {
        lines.push(`Historical avg for this workflow: ${stats.avgScore}/10. Push above this baseline.`);
      }
      lines.push('');
    }

    // Section 3: What worked for similar tasks (best evidence)
    if (similar.length) {
      lines.push('## WHAT HIGH-SCORING IMPLEMENTATIONS LOOK LIKE (similar tasks):');
      for (const r of similar) {
        lines.push(`[Score ${r.score}/10] Task: "${r.step_desc}"`);
        if (r.worker_summary) lines.push(`  Approach: ${r.worker_summary}`);
        if (r.feedback) lines.push(`  Praised for: ${r.feedback}`);
      }
      lines.push('');
    }

    // Section 4: What worked after previous improvement loops
    if (prevLoopImproved.length) {
      lines.push('## PATTERNS THAT BOOSTED SCORES IN PAST IMPROVEMENT LOOPS:');
      for (const r of prevLoopImproved) {
        lines.push(`[Loop ${r.loop_count} → Score ${r.score}/10]: "${r.step_desc}"`);
        if (r.feedback) lines.push(`  Key change: ${r.feedback}`);
        const sugg = _parseSuggestions(r.suggestions);
        if (sugg.length) lines.push(`  Applied: ${sugg.slice(0, 2).join('; ')}`);
      }
      lines.push('');
    }

    // Section 5: Fallback guidance when no history yet
    if (!similar.length && !prevLoopImproved.length) {
      lines.push('## QUALITY CHECKLIST:');
      lines.push('- Ensure complete, production-ready file content (no stubs or placeholders)');
      lines.push('- Handle edge cases and error conditions explicitly');
      lines.push('- Follow consistent code style and naming conventions');
      lines.push('- Verify all imports, exports, and dependencies are correct');
      lines.push('');
    }

    lines.push('Return the improved implementation as a JSON blueprint with ALL affected files.');
    return lines.join('\n');
  }

  /**
   * Aggregate stats for dashboard display.
   */
  getStats() {
    const all = this.db.table(TABLE).all({});
    if (!all.length) return { totalRuns: 0, avgScore: null, recentAvg: null, minScore: null, maxScore: null, trend: 'none', approvalRate: null };

    const scores  = all.map(r => r.score);
    const avg     = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    const recent  = all.slice(-10).map(r => r.score);
    const recentAvg = recent.length >= 3
      ? +(recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(1)
      : null;
    const approved = all.filter(r => r.approved === 1 || r.approved === true).length;

    let trend = 'stable';
    if (recentAvg !== null && avg !== null) {
      if (recentAvg > avg + 0.5) trend = 'improving';
      else if (recentAvg < avg - 0.5) trend = 'declining';
    }

    return {
      totalRuns:    all.length,
      avgScore:     avg,
      recentAvg,
      minScore:     Math.min(...scores),
      maxScore:     Math.max(...scores),
      trend,
      approvalRate: +(approved / all.length * 100).toFixed(1),
    };
  }
}

function _parseSuggestions(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

/** Extract lowercase words (≥4 chars) from a string for similarity matching */
function _keywords(str) {
  return (str || '').toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
}

/** Jaccard-like overlap score between two strings */
function _similarity(a, b) {
  const ka = new Set(_keywords(a));
  const kb = new Set(_keywords(b));
  if (!ka.size || !kb.size) return 0;
  let overlap = 0;
  for (const w of ka) { if (kb.has(w)) overlap++; }
  return overlap / Math.max(ka.size, kb.size);
}

/** Return top N records from pool most similar to stepDesc, threshold ≥ 0.1 */
function _findSimilar(pool, stepDesc, n) {
  return pool
    .map(r => ({ r, sim: _similarity(r.step_desc, stepDesc) }))
    .filter(({ sim }) => sim >= 0.1)
    .sort((a, b) => b.sim - a.sim || b.r.score - a.r.score)
    .slice(0, n)
    .map(({ r }) => r);
}

/** Like _findSimilar but for improvement-loop records */
function _findImproved(pool, stepDesc, n) {
  return _findSimilar(pool, stepDesc, n);
}

// Singleton
let _rlStore = null;
export function getRLStore() {
  if (!_rlStore) _rlStore = new RLStore();
  return _rlStore;
}
