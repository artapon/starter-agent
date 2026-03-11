import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './workflow.state.js';
import { createNodes } from './workflow.nodes.js';

export function buildWorkflowGraph(socketManager) {
  const { researcherNode, plannerNode, developerNode, reviewerNode, assemblerNode, loopResetNode } = createNodes(socketManager);

  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('researcher', researcherNode)
    .addNode('planner', plannerNode)
    .addNode('developer', developerNode)
    .addNode('reviewer', reviewerNode)
    .addNode('assembler', assemblerNode)
    .addNode('loop_reset', loopResetNode)

    // Entry: researcher → planner → developer
    .addEdge('__start__', 'researcher')
    .addEdge('researcher', 'planner')
    .addEdge('planner', 'developer')

    // After developer: go to reviewer
    .addEdge('developer', 'reviewer')

    // After reviewer: per-step retry, advance, improvement loop, or assemble
    .addConditionalEdges('reviewer', (state) => {
      const steps = state.plan?.steps || [];
      const allDone = state.currentStepIdx >= steps.length;
      const maxRetries = 3;

      if (state.status === 'revision_needed' && state.retryCount < maxRetries) {
        return 'developer'; // retry the current step
      }
      if (!allDone) {
        return 'developer'; // advance to next step
      }
      // All steps done — check if improvement loop should run
      const score = state.reviewFeedback?.score ?? 10;
      if (state.loopEnabled && state.loopCount < state.maxLoops && score < 10) {
        return 'loop_reset'; // send developer back with fix instructions
      }
      return 'assembler'; // score is 10/10 or loops exhausted
    })

    // assembler always finishes
    .addEdge('assembler', END)

    // loop_reset feeds directly back into developer (skip researcher + planner)
    .addEdge('loop_reset', 'developer');

  return graph.compile();
}
