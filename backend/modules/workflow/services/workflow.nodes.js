import { ResearcherAgent } from '../../researcher/services/researcher.agent.js';
import { PlannerAgent }    from '../../planner/services/planner.agent.js';
import { WorkerAgent }     from '../../worker/services/worker.agent.js';
import { ReviewerAgent }   from '../../reviewer/services/reviewer.agent.js';
import { memoryStore }     from '../../memory/services/memory.store.js';
import { getRLStore }      from '../../../core/rl/rl.store.js';
import { buildWorkspaceContext, buildWorkspaceSummary } from '../../../core/workspace/workspace.reader.js';

export function createNodes(socketManager) {
  const researcherAgent = new ResearcherAgent(socketManager);
  const plannerAgent    = new PlannerAgent(socketManager);
  const workerAgent     = new WorkerAgent(socketManager);
  const reviewerAgent   = new ReviewerAgent(socketManager);

  function emitStatus(sessionId, agentId, text) {
    socketManager?.emitChatChunk(sessionId, text, agentId);
  }

  // ── Node 1: Planner ─────────────────────────────────────────────────────
  async function plannerNode(state) {
    // Scan workspace for context — compact summary for planner, full context saved for worker
    const ws         = buildWorkspaceContext(state.workspaceFolder || undefined);
    const wsSummary  = buildWorkspaceSummary(state.workspaceFolder || undefined);
    const workspaceContext  = ws.isEmpty ? null : ws.context;
    const workspaceSummary  = wsSummary.isEmpty ? null : wsSummary.summary;

    if (!ws.isEmpty) {
      emitStatus(state.sessionId, 'planner',
        `\n📂 **Workspace scanned** — ${ws.fileCount} file${ws.fileCount !== 1 ? 's' : ''} found. Agents will extend the existing project.\n`);
    }

    memoryStore.setWorkingContext('planner', state.runId, { goal: state.userGoal, sessionId: state.sessionId });
    socketManager?.emitWorkflowNode(state.runId, 'planner', { status: 'running' });
    emitStatus(state.sessionId, 'planner', `\n📋 **Planning:** ${state.userGoal}\n\n`);

    // Planner receives goal + workspace summary (no research context — researcher runs after)
    const goalWithContext = workspaceSummary
      ? `${workspaceSummary}\n${state.userGoal}`
      : state.userGoal;

    const plannerMemKey = state.projectId ? `${state.projectId}:${state.runId}` : state.runId;
    const plan = await plannerAgent.plan(goalWithContext, state.sessionId, plannerMemKey);

    const stepList = (plan.steps || []).map((s, i) => `  ${i + 1}. ${s.description}`).join('\n');
    emitStatus(state.sessionId, 'planner', `\n\n✅ **Plan ready** — ${plan.steps?.length || 0} step(s):\n${stepList}\n`);

    socketManager?.emitWorkflowNode(state.runId, 'planner', { status: 'complete', plan });
    return { plan, currentStepIdx: 0, status: 'running', workspaceContext, workspaceSummary };
  }

  // ── Node 2: Researcher ───────────────────────────────────────────────────
  async function researcherNode(state) {
    const steps = state.plan?.steps || [];
    const step  = steps[state.currentStepIdx];
    // Use planner-defined research query if available, fall back to step description then overall goal
    const researchGoal = step?.researchQuery || step?.description || state.userGoal;

    memoryStore.setWorkingContext('researcher', state.runId, { goal: researchGoal, sessionId: state.sessionId });
    socketManager?.emitWorkflowNode(state.runId, 'researcher', { status: 'running' });
    emitStatus(state.sessionId, 'researcher', `\n🔬 **Researching:** ${researchGoal}\n\n`);

    const findings = await researcherAgent.research(researchGoal, state.sessionId, state.runId);

    const approaches = (findings.approaches || []).map((a) => `  - **${a.name}**`).join('\n');
    emitStatus(
      state.sessionId, 'researcher',
      `\n✅ **Research complete** — ${findings.topic || researchGoal}\n${findings.summary || ''}\n${approaches ? `\nApproaches:\n${approaches}` : ''}\n\n> Recommended: ${findings.recommendedApproach || 'N/A'}\n`,
    );

    socketManager?.emitWorkflowNode(state.runId, 'researcher', { status: 'complete', findings });
    return { researchFindings: findings };
  }

  // ── Node 3: Worker ───────────────────────────────────────────────────────
  async function workerNode(state) {
    const steps = state.plan?.steps || [];
    const step  = steps[state.currentStepIdx];
    if (!step) return { status: 'review_ready' };

    const label = `Step ${state.currentStepIdx + 1}/${steps.length}`;
    memoryStore.setWorkingContext('worker', state.runId, {
      planId:      state.plan?.planId,
      currentStep: step.description,
      stepIdx:     state.currentStepIdx,
      totalSteps:  steps.length,
    });
    socketManager?.emitWorkflowNode(state.runId, 'worker', {
      status: 'running', step: step.description, stepIdx: state.currentStepIdx,
    });
    emitStatus(state.sessionId, 'worker', `\n---\n💻 **${label}:** ${step.description}\n\n`);

    // Enrich task with research context from researcherNode
    const findings = state.researchFindings || {};
    const techHint = [
      findings.recommendedApproach ? `Approach: ${findings.recommendedApproach}` : '',
      findings.techStack?.length ? `Tech stack: ${findings.techStack.join(', ')}` : '',
      findings.recommendedPackages?.length
        ? `Packages to use: ${findings.recommendedPackages.map(p => typeof p === 'string' ? p : p.name).filter(Boolean).join(', ')}`
        : '',
      findings.antiPatterns?.length ? `Avoid these anti-patterns: ${findings.antiPatterns.slice(0, 4).join('; ')}` : '',
      findings.potentialChallenges?.length ? `Watch out for: ${findings.potentialChallenges.slice(0, 3).join('; ')}` : '',
      findings.productionConsiderations?.length ? `Production requirements: ${findings.productionConsiderations.slice(0, 3).join('; ')}` : '',
    ].filter(Boolean).join('\n');

    // Build summary of previously completed steps so worker doesn't re-implement them
    const previousResults = (state.subtaskResults || [])
      .map((r, i) => r?.result ? `Step ${i + 1}: ${r.result}` : null)
      .filter(Boolean);
    const priorContext = previousResults.length
      ? `\n[Previously completed — ${previousResults.length} of ${steps.length} step(s) done]\n${previousResults.join('\n')}\nDo NOT re-implement or overwrite files already created above unless this task explicitly modifies them.\n`
      : '';

    // Step 0: reuse planner's workspace scan — no new files exist yet.
    // Step 1+: re-scan to pick up files written by previous steps.
    const currentWorkspaceContext = state.currentStepIdx === 0
      ? state.workspaceContext
      : (() => {
          const ws = buildWorkspaceContext(state.workspaceFolder || undefined);
          return ws.isEmpty ? null : ws.context;
        })();

    const enrichedTask = [
      `# Overall Goal: ${state.userGoal}\n`,
      `# Current Task (step ${state.currentStepIdx + 1} of ${steps.length}):\n${step.description}`,
      techHint ? `\n[Research Guidance]\n${techHint}` : '',
      priorContext,
      currentWorkspaceContext ? `\n${currentWorkspaceContext}` : '',
    ].join('');

    const workerMemKey = state.projectId ? `${state.projectId}:${state.runId}` : state.runId;
    const result = await workerAgent.execute(
      enrichedTask, state.sessionId, state.plan?.planId, workerMemKey,
    );

    socketManager?.emitWorkflowNode(state.runId, 'worker', {
      status: 'complete', stepIdx: state.currentStepIdx, result: result.result,
    });
    return { subtaskResults: result, currentStepIdx: state.currentStepIdx + 1 };
  }

  // ── Node 4: Reviewer ─────────────────────────────────────────────────────
  async function reviewerNode(state) {
    const lastResult = state.subtaskResults[state.subtaskResults.length - 1];
    if (!lastResult) return { status: 'complete', finalAnswer: 'No results to review.' };

    const steps   = state.plan?.steps || [];
    const stepIdx = Math.max(0, state.currentStepIdx - 1);
    const step    = steps[stepIdx];
    const allDone = state.currentStepIdx >= steps.length;

    memoryStore.setWorkingContext('reviewer', state.runId, {
      stepDescription: step?.description || '',
      loopCount:       state.loopCount,
    });
    socketManager?.emitWorkflowNode(state.runId, 'reviewer', { status: 'running' });
    emitStatus(state.sessionId, 'reviewer', `\n---\n🔍 **Reviewing:** ${step?.description || 'output'}\n\n`);

    const reviewContent = state.workspaceContext
      ? `${lastResult.result || ''}\n\n${state.workspaceContext}`
      : (lastResult.result || '');

    const reviewTask = state.userGoal
      ? `Goal: ${state.userGoal}\nStep being reviewed: ${step?.description || 'Review task'}`
      : (step?.description || 'Review task');

    const reviewerMemKey = state.projectId ? `${state.projectId}:${state.runId}` : state.runId;
    const review = await reviewerAgent.review(
      reviewContent, reviewTask,
      state.sessionId, lastResult.subtaskId, reviewerMemKey,
    );
    const score = review.score ?? 10;

    // Record outcome for reinforcement learning
    getRLStore().recordOutcome({
      runId:         state.runId,
      sessionId:     state.sessionId,
      goal:          state.userGoal,
      stepDesc:      step?.description || '',
      workerSummary: lastResult.result || '',
      score,
      feedback:      review.feedback || '',
      suggestions:   review.suggestions || [],
      approved:      review.approved,
      loopCount:     state.loopCount || 0,
    });

    const scoreBar = '█'.repeat(Math.round(score / 2)) + '░'.repeat(5 - Math.round(score / 2));
    const willLoop = allDone && state.loopEnabled && state.loopCount < state.maxLoops && score < 10;
    const suggestionLines = (review.suggestions || []).map(s => `  - ${s}`).join('\n');
    const loopHint = willLoop
      ? `\n⏩ Score below 10/10 — sending back to Worker (loop ${state.loopCount + 1}/${state.maxLoops})`
      : (score >= 10 ? '\n🎯 Perfect score — proceeding to final assembly.' : '');

    emitStatus(
      state.sessionId, 'reviewer',
      `\n✅ **Review complete** — Score: ${score}/10 [${scoreBar}]\n${review.feedback ? `> ${review.feedback}` : ''}${suggestionLines ? `\n\n**Suggestions:**\n${suggestionLines}` : ''}${loopHint}\n`,
    );
    socketManager?.emitWorkflowNode(state.runId, 'reviewer', {
      status: 'complete', approved: review.approved, score,
    });

    // Route: approved → next step (researcher) or final assembly; revision_needed → retry same step
    const maxRetries = 3;
    const newRetryCount = (state.retryCount || 0) + 1;

    if (!review.approved && newRetryCount < maxRetries) {
      // Retry the same step: decrement currentStepIdx so worker re-processes it
      return {
        reviewFeedback: review,
        retryCount:     newRetryCount,
        currentStepIdx: state.currentStepIdx - 1,
        status:         'revision_needed',
      };
    }

    if (!review.approved) {
      // Max retries exhausted — warn and fall through to advance or assemble
      emitStatus(state.sessionId, 'reviewer',
        `\n⚠️ **Max retries (${maxRetries}) reached** — moving past this step.\n`);
    }

    // Approved (or max retries hit) with steps remaining → advance to researcher
    if (!allDone) {
      return { reviewFeedback: review, retryCount: 0, status: 'approved' };
    }

    // All done — improvement loop (researcher will research the improvement goal)
    if (willLoop) {
      const nextLoop = state.loopCount + 1;
      const improvementDesc = getRLStore().buildImprovementContext(
        step?.description || '',
        score,
        review.feedback || '',
        review.suggestions || [],
        nextLoop,
        state.userGoal || '',
      );

      emitStatus(
        state.sessionId, 'worker',
        `\n\n🔄 **Improvement Loop ${nextLoop}/${state.maxLoops}** — Score: **${score}/10** → target ≥${score < 8 ? 9 : 10}/10\n${(review.suggestions || []).map(s => `  - ${s}`).join('\n') || `  - ${review.feedback}`}\n\n`,
      );
      socketManager?.emitWorkflowNode(state.runId, 'reviewer', { status: 'loop', loop: nextLoop, score });

      // Return 'running' — graph routes to researcher for improvement research
      return {
        reviewFeedback: review,
        loopCount:      nextLoop,
        plan: {
          ...state.plan,
          steps: [{ description: improvementDesc }],
        },
        subtaskResults: null,
        currentStepIdx: 0,
        retryCount:     0,
        status:         'running',
      };
    }

    // All done — final assembly
    const results = (Array.isArray(state.subtaskResults) ? state.subtaskResults : [])
      .map((r, i) => {
        const stepLabel = steps[i]?.description ? `**Step ${i + 1}:** ${steps[i].description}` : `**Step ${i + 1}**`;
        return `### ${stepLabel}\n\n${r.result}`;
      })
      .join('\n\n---\n\n');

    const loopSummary = state.loopCount > 0
      ? `\n\n> ✨ Refined through ${state.loopCount} improvement loop${state.loopCount > 1 ? 's' : ''}.`
      : '';
    const scoreInfo = score > 0 ? `\n\n> **Quality score:** ${score}/10` : '';
    const finalAnswer = `# ✅ Completed: ${state.userGoal}${loopSummary}${scoreInfo}\n\n---\n\n${results}`;

    socketManager?.emitWorkflowNode(state.runId, 'reviewer', { status: 'assembled' });
    return { finalAnswer, status: 'complete' };
  }

  return { plannerNode, researcherNode, workerNode, reviewerNode };
}
