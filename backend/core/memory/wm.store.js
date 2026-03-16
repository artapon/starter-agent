/**
 * Working Memory (WM) — per-agent, per-run in-memory context store.
 *
 * Holds the current task's intermediate state throughout a single workflow run.
 * Keyed by agentId + runId. Cleared by workflow.runner.js after each run.
 *
 * Schema per agent (informational — any keys may be set):
 *   researcher: { goal, sessionId }
 *   planner:    { goal, researchSummary, recommendedApproach }
 *   worker:     { planId, currentStep, stepIdx, totalSteps }
 *   reviewer:   { stepDescription, loopCount }
 *
 * WM is NOT persisted — it exists only for the lifetime of a run.
 * Use it to pass context between an agent's internal calls without
 * threading extra params through every function signature.
 */

const _wm = new Map(); // `${agentId}:${runId}` → plain object

const WorkingMemory = {
  /**
   * Merge new key-value pairs into the WM entry for agentId + runId.
   * Creates the entry if it doesn't exist.
   */
  set(agentId, runId, data) {
    const key      = `${agentId}:${runId}`;
    const existing = _wm.get(key) || {};
    _wm.set(key, { ...existing, ...data, _updatedAt: Date.now() });
  },

  /** Get the current WM context for agentId + runId. Returns {} if not set. */
  get(agentId, runId) {
    return _wm.get(`${agentId}:${runId}`) || {};
  },

  /** Clear WM for all agents in a specific run. Call after run completes. */
  clearRun(runId) {
    for (const key of _wm.keys()) {
      if (key.endsWith(`:${runId}`)) _wm.delete(key);
    }
  },

  /** Clear all WM entries for a specific agent (e.g. on agent reset). */
  clearAgent(agentId) {
    for (const key of _wm.keys()) {
      if (key.startsWith(`${agentId}:`)) _wm.delete(key);
    }
  },

  /** Returns a snapshot of all active WM entries (for stats/debug endpoints). */
  getAll() {
    const result = {};
    for (const [key, val] of _wm.entries()) {
      result[key] = val;
    }
    return result;
  },

  /** Returns per-agent active run counts. */
  getStats() {
    const counts = {};
    for (const key of _wm.keys()) {
      const agentId = key.split(':')[0];
      counts[agentId] = (counts[agentId] || 0) + 1;
    }
    return counts;
  },

  /**
   * Get the most recently updated WM entry for an agent (across all runs).
   * Useful for the frontend to display current context without knowing the runId.
   */
  getLatestForAgent(agentId) {
    let latest = null;
    for (const [key, val] of _wm.entries()) {
      if (!key.startsWith(`${agentId}:`)) continue;
      if (!latest || (val._updatedAt || 0) > (latest._updatedAt || 0)) latest = val;
    }
    return latest || {};
  },

  /** Returns all agents' latest context. */
  getAllLatest() {
    const agents = new Set([..._wm.keys()].map(k => k.split(':')[0]));
    const result = {};
    for (const agentId of agents) result[agentId] = WorkingMemory.getLatestForAgent(agentId);
    return result;
  },
};

export { WorkingMemory };
