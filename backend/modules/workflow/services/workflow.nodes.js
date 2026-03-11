import { PlannerAgent } from '../../planner/services/planner.agent.js';
import { DeveloperAgent } from '../../developer/services/developer.agent.js';
import { ReviewerAgent } from '../../reviewer/services/reviewer.agent.js';

export function createNodes(socketManager) {
  const plannerAgent = new PlannerAgent(socketManager);
  const developerAgent = new DeveloperAgent(socketManager);
  const reviewerAgent = new ReviewerAgent(socketManager);

  // Emit a visible status line to the chat stream (not a token — a formatted message)
  function emitStatus(sessionId, agentId, text) {
    socketManager?.emitChatChunk(sessionId, text, agentId);
  }

  async function plannerNode(state) {
    socketManager?.emitWorkflowNode(state.runId, 'planner', { status: 'running' });
    emitStatus(state.sessionId, 'planner', `\n📋 **Planning:** ${state.userGoal}\n\n`);

    const plan = await plannerAgent.plan(state.userGoal, state.sessionId, state.runId);

    // Show the resolved steps to the user
    const stepList = (plan.steps || [])
      .map((s, i) => `  ${i + 1}. ${s.description}`)
      .join('\n');
    emitStatus(state.sessionId, 'planner', `\n\n✅ **Plan ready** — ${plan.steps?.length || 0} step(s):\n${stepList}\n`);

    socketManager?.emitWorkflowNode(state.runId, 'planner', { status: 'complete', plan });
    return { plan, currentStepIdx: 0, status: 'running' };
  }

  async function developerNode(state) {
    const steps = state.plan?.steps || [];
    const step = steps[state.currentStepIdx];
    if (!step) return { status: 'review_ready' };

    const label = `Step ${state.currentStepIdx + 1}/${steps.length}`;
    socketManager?.emitWorkflowNode(state.runId, 'developer', {
      status: 'running',
      step: step.description,
      stepIdx: state.currentStepIdx,
    });
    emitStatus(state.sessionId, 'developer', `\n---\n💻 **${label}:** ${step.description}\n\n`);

    const result = await developerAgent.execute(
      step.description,
      state.sessionId,
      state.plan?.planId,
      state.runId
    );

    socketManager?.emitWorkflowNode(state.runId, 'developer', {
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
    emitStatus(
      state.sessionId, 'reviewer',
      `\n✅ **Review complete** — Score: ${review.score}/10 [${scoreBar}]\n${review.feedback ? `> ${review.feedback}` : ''}\n`
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
    const results = state.subtaskResults.map((r, i) => `Step ${i + 1}:\n${r.result}`).join('\n\n---\n\n');
    const finalAnswer = `# Completed: ${state.userGoal}\n\n${results}`;
    socketManager?.emitWorkflowNode(state.runId, 'assembler', { status: 'complete' });
    return { finalAnswer, status: 'complete' };
  }

  return { plannerNode, developerNode, reviewerNode, assemblerNode };
}
