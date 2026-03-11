import { ResearcherAgent } from '../../researcher/services/researcher.agent.js';
import { PlannerAgent } from '../../planner/services/planner.agent.js';
import { WorkerAgent } from '../../worker/services/worker.agent.js';
import { ReviewerAgent } from '../../reviewer/services/reviewer.agent.js';

export function createNodes(socketManager) {
  const researcherAgent = new ResearcherAgent(socketManager);
  const plannerAgent = new PlannerAgent(socketManager);
  const workerAgent = new WorkerAgent(socketManager);
  const reviewerAgent = new ReviewerAgent(socketManager);

  // Emit a visible status line to the chat stream (not a token — a formatted message)
  function emitStatus(sessionId, agentId, text) {
    socketManager?.emitChatChunk(sessionId, text, agentId);
  }

  async function researcherNode(state) {
    socketManager?.emitWorkflowNode(state.runId, 'researcher', { status: 'running' });
    emitStatus(state.sessionId, 'researcher', `\n🔬 **Researching:** ${state.userGoal}\n\n`);

    const findings = await researcherAgent.research(state.userGoal, state.sessionId, state.runId);

    const approaches = (findings.approaches || []).map((a) => `  - **${a.name}**`).join('\n');
    emitStatus(
      state.sessionId, 'researcher',
      `\n✅ **Research complete** — ${findings.topic || state.userGoal}\n${findings.summary || ''}\n${approaches ? `\nApproaches:\n${approaches}` : ''}\n\n> Recommended: ${findings.recommendedApproach || 'N/A'}\n`
    );

    socketManager?.emitWorkflowNode(state.runId, 'researcher', { status: 'complete', findings });
    return { researchFindings: findings };
  }

  async function plannerNode(state) {
    socketManager?.emitWorkflowNode(state.runId, 'planner', { status: 'running' });
    emitStatus(state.sessionId, 'planner', `\n📋 **Planning:** ${state.userGoal}\n\n`);

    const goalWithContext = state.researchFindings
      ? `${state.userGoal}\n\n[Research findings]\nSummary: ${state.researchFindings.summary || ''}\nRecommended approach: ${state.researchFindings.recommendedApproach || ''}\nTech stack: ${(state.researchFindings.techStack || []).join(', ')}\nChallenges: ${(state.researchFindings.potentialChallenges || []).join(', ')}`
      : state.userGoal;

    const plan = await plannerAgent.plan(goalWithContext, state.sessionId, state.runId);

    // Show the resolved steps to the user
    const stepList = (plan.steps || [])
      .map((s, i) => `  ${i + 1}. ${s.description}`)
      .join('\n');
    emitStatus(state.sessionId, 'planner', `\n\n✅ **Plan ready** — ${plan.steps?.length || 0} step(s):\n${stepList}\n`);

    socketManager?.emitWorkflowNode(state.runId, 'planner', { status: 'complete', plan });
    return { plan, currentStepIdx: 0, status: 'running' };
  }

  async function workerNode(state) {
    const steps = state.plan?.steps || [];
    const step = steps[state.currentStepIdx];
    if (!step) return { status: 'review_ready' };

    const label = `Step ${state.currentStepIdx + 1}/${steps.length}`;
    socketManager?.emitWorkflowNode(state.runId, 'worker', {
      status: 'running',
      step: step.description,
      stepIdx: state.currentStepIdx,
    });
    emitStatus(state.sessionId, 'worker', `\n---\n💻 **${label}:** ${step.description}\n\n`);

    const result = await workerAgent.execute(
      step.description,
      state.sessionId,
      state.plan?.planId,
      state.runId
    );

    socketManager?.emitWorkflowNode(state.runId, 'worker', {
      status: 'complete',
      stepIdx: state.currentStepIdx,
      result: result.result,
    });

    return {
      subtaskResults: result,
      currentStepIdx: state.currentStepIdx + 1,
    };
  }

  async function reviewerNode(state) {
    const lastResult = state.subtaskResults[state.subtaskResults.length - 1];
    if (!lastResult) return { status: 'complete', finalAnswer: 'No results to review.' };

    const steps = state.plan?.steps || [];
    const stepIdx = Math.max(0, state.currentStepIdx - 1);
    const step = steps[stepIdx];

    socketManager?.emitWorkflowNode(state.runId, 'reviewer', { status: 'running' });
    emitStatus(state.sessionId, 'reviewer', `\n---\n🔍 **Reviewing:** ${step?.description || 'output'}\n\n`);

    const review = await reviewerAgent.review(
      lastResult.result || '',
      step?.description || 'Review task',
      state.sessionId,
      lastResult.subtaskId,
      state.runId
    );

    const scoreBar = '█'.repeat(Math.round((review.score || 0) / 2)) + '░'.repeat(5 - Math.round((review.score || 0) / 2));
    const allDone = (state.currentStepIdx) >= (state.plan?.steps || []).length;
    const willLoop = allDone && state.loopEnabled && state.loopCount < state.maxLoops && (review.score ?? 10) < 10;
    const suggestionLines = (review.suggestions || []).map(s => `  - ${s}`).join('\n');
    const loopHint = willLoop
      ? `\n⏩ Score below 10/10 — sending back to Worker to apply suggestions (loop ${state.loopCount + 1}/${state.maxLoops})`
      : (review.score >= 10 ? '\n🎯 Perfect score — proceeding to final assembly.' : '');
    emitStatus(
      state.sessionId, 'reviewer',
      `\n✅ **Review complete** — Score: ${review.score}/10 [${scoreBar}]\n${review.feedback ? `> ${review.feedback}` : ''}${suggestionLines ? `\n\n**Suggestions:**\n${suggestionLines}` : ''}${loopHint}\n`
    );

    socketManager?.emitWorkflowNode(state.runId, 'reviewer', {
      status: 'complete',
      approved: review.approved,
      score: review.score,
    });

    return {
      reviewFeedback: review,
      retryCount: review.approved ? 0 : state.retryCount + 1,
      status: review.approved ? 'approved' : 'revision_needed',
    };
  }

  async function assemblerNode(state) {
    const results = (Array.isArray(state.subtaskResults) ? state.subtaskResults : []).map((r, i) => `Step ${i + 1}:\n${r.result}`).join('\n\n---\n\n');
    const finalAnswer = `# Completed: ${state.userGoal}\n\n${results}`;
    socketManager?.emitWorkflowNode(state.runId, 'assembler', { status: 'complete' });
    return { finalAnswer, status: 'complete' };
  }

  async function loopResetNode(state) {
    const nextLoop = state.loopCount + 1;
    const review = state.reviewFeedback ?? {};
    const score = review.score ?? 0;
    const suggestions = (review.suggestions || []).length
      ? review.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : review.feedback || 'Improve overall code quality.';

    emitStatus(
      state.sessionId, 'worker',
      `\n\n🔄 **Improvement Loop ${nextLoop}/${state.maxLoops}** — Review score was **${score}/10**. Sending back to Worker to apply suggestions:\n${(review.suggestions || []).map(s => `  - ${s}`).join('\n') || `  - ${review.feedback}`}\n\n`
    );
    socketManager?.emitWorkflowNode(state.runId, 'loop_reset', { status: 'running', loop: nextLoop, score });

    // Build a focused one-step fix plan from the review suggestions
    const fixPlan = {
      ...state.plan,
      steps: [{
        description: `Improvement pass (loop ${nextLoop}) — previous score was ${score}/10.\n\nApply ALL of the following review suggestions to the existing code:\n${suggestions}`,
      }],
    };

    return {
      loopCount: nextLoop,
      plan: fixPlan,
      subtaskResults: null,  // sentinel → reset to [] via reducer
      currentStepIdx: 0,
      retryCount: 0,
      reviewFeedback: null,
      status: 'running',
    };
  }

  return { researcherNode, plannerNode, workerNode, reviewerNode, assemblerNode, loopResetNode };
}
