import { ResearcherAgent } from '../../researcher/services/researcher.agent.js';
import { PlannerAgent }    from '../../planner/services/planner.agent.js';
import { WorkerAgent }     from '../../worker/services/worker.agent.js';
import { ReviewerAgent }   from '../../reviewer/services/reviewer.agent.js';
import { memoryStore }     from '../../memory/services/memory.store.js';

export function createNodes(socketManager) {
  const researcherAgent = new ResearcherAgent(socketManager);
  const plannerAgent    = new PlannerAgent(socketManager);
  const workerAgent     = new WorkerAgent(socketManager);
  const reviewerAgent   = new ReviewerAgent(socketManager);

  function emitStatus(sessionId, agentId, text) {
    socketManager?.emitChatChunk(sessionId, text, agentId);
  }

  // ── Node 1: Analyze (researcher + planner) ──────────────────────────────
  async function analyzeNode(state) {
    // Research phase
    memoryStore.setWorkingContext('researcher', state.runId, { goal: state.userGoal, sessionId: state.sessionId });
    socketManager?.emitWorkflowNode(state.runId, 'analyze', { status: 'running', phase: 'research' });
    emitStatus(state.sessionId, 'researcher', `\n🔬 **Researching:** ${state.userGoal}\n\n`);

    const findings = await researcherAgent.research(state.userGoal, state.sessionId, state.runId);

    const approaches = (findings.approaches || []).map((a) => `  - **${a.name}**`).join('\n');
    emitStatus(
      state.sessionId, 'researcher',
      `\n✅ **Research complete** — ${findings.topic || state.userGoal}\n${findings.summary || ''}\n${approaches ? `\nApproaches:\n${approaches}` : ''}\n\n> Recommended: ${findings.recommendedApproach || 'N/A'}\n`,
    );

    // Plan phase
    memoryStore.setWorkingContext('planner', state.runId, {
      goal:                state.userGoal,
      researchSummary:     findings.summary || '',
      recommendedApproach: findings.recommendedApproach || '',
    });
    socketManager?.emitWorkflowNode(state.runId, 'analyze', { status: 'running', phase: 'plan' });
    emitStatus(state.sessionId, 'planner', `\n📋 **Planning:** ${state.userGoal}\n\n`);

    const goalWithContext = `${state.userGoal}\n\n[Research findings]\nSummary: ${findings.summary || ''}\nRecommended approach: ${findings.recommendedApproach || ''}\nTech stack: ${(findings.techStack || []).join(', ')}\nChallenges: ${(findings.potentialChallenges || []).join(', ')}`;
    const plan = await plannerAgent.plan(goalWithContext, state.sessionId, state.runId);

    const stepList = (plan.steps || []).map((s, i) => `  ${i + 1}. ${s.description}`).join('\n');
    emitStatus(state.sessionId, 'planner', `\n\n✅ **Plan ready** — ${plan.steps?.length || 0} step(s):\n${stepList}\n`);

    socketManager?.emitWorkflowNode(state.runId, 'analyze', { status: 'complete', findings, plan });
    return { researchFindings: findings, plan, currentStepIdx: 0, status: 'running' };
  }

  // ── Node 2: Worker ───────────────────────────────────────────────────────
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

    const result = await workerAgent.execute(
      step.description, state.sessionId, state.plan?.planId, state.runId,
    );

    socketManager?.emitWorkflowNode(state.runId, 'worker', {
      status: 'complete', stepIdx: state.currentStepIdx, result: result.result,
    });
    return { subtaskResults: result, currentStepIdx: state.currentStepIdx + 1 };
  }

  // ── Node 3: Reviewer (review + loop_reset + assembler) ───────────────────
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

    const review   = await reviewerAgent.review(
      lastResult.result || '', step?.description || 'Review task',
      state.sessionId, lastResult.subtaskId, state.runId,
    );
    const score    = review.score ?? 10;
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

    // Not all steps done, or revision needed with retries remaining → back to worker
    const maxRetries = 3;
    if (!allDone || (state.status === 'revision_needed' && state.retryCount < maxRetries)) {
      return {
        reviewFeedback: review,
        retryCount: review.approved ? 0 : state.retryCount + 1,
        status: review.approved ? 'approved' : 'revision_needed',
      };
    }

    // All done — improvement loop (was loop_reset node)
    if (willLoop) {
      const nextLoop    = state.loopCount + 1;
      const suggestions = (review.suggestions || []).length
        ? review.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')
        : review.feedback || 'Improve overall code quality.';

      emitStatus(
        state.sessionId, 'worker',
        `\n\n🔄 **Improvement Loop ${nextLoop}/${state.maxLoops}** — Score: **${score}/10**. Sending back to Worker:\n${(review.suggestions || []).map(s => `  - ${s}`).join('\n') || `  - ${review.feedback}`}\n\n`,
      );
      socketManager?.emitWorkflowNode(state.runId, 'reviewer', { status: 'loop', loop: nextLoop, score });

      return {
        reviewFeedback: review,
        loopCount:      nextLoop,
        plan: {
          ...state.plan,
          steps: [{
            description: `Improvement pass (loop ${nextLoop}) — previous score was ${score}/10.\n\nApply ALL of the following review suggestions to the existing code:\n${suggestions}`,
          }],
        },
        subtaskResults: null,
        currentStepIdx: 0,
        retryCount:     0,
        status:         'running',
      };
    }

    // All done — final assembly (was assembler node)
    const results     = (Array.isArray(state.subtaskResults) ? state.subtaskResults : [])
      .map((r, i) => `Step ${i + 1}:\n${r.result}`)
      .join('\n\n---\n\n');
    const finalAnswer = `# Completed: ${state.userGoal}\n\n${results}`;
    socketManager?.emitWorkflowNode(state.runId, 'reviewer', { status: 'assembled' });
    return { finalAnswer, status: 'complete' };
  }

  return { analyzeNode, workerNode, reviewerNode };
}
