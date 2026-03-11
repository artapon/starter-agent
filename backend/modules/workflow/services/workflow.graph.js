import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './workflow.state.js';
import { createNodes } from './workflow.nodes.js';

export function buildWorkflowGraph(socketManager) {
  const { researcherNode, plannerNode, workerNode, reviewerNode, assemblerNode, loopResetNode } = createNodes(socketManager);

  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('researcher', researcherNode)
    .addNode('planner', plannerNode)
    .addNode('worker', workerNode)
    .addNode('reviewer', reviewerNode)
    .addNode('assembler', assemblerNode)
    .addNode('loop_reset', loopResetNode)

    // Entry: researcher → planner → worker
    .addEdge('__start__', 'researcher')
    .addEdge('researcher', 'planner')
    .addEdge('planner', 'worker')

    // After worker: go to reviewer
    .addEdge('worker', 'reviewer')

    // After reviewer: per-step retry, advance, improvement loop, or assemble
    .addConditionalEdges('reviewer', (state) => {
      const steps = state.plan?.steps || [];
      const allDone = state.currentStepIdx >= steps.length;
      const maxRetries = 3;

      if (state.status === 'revision_needed' && state.retryCount < maxRetries) {
        return 'worker'; // retry the current step
      }
      if (!allDone) {
        return 'worker'; // advance to next step
      }
      // All steps done — check if improvement loop should run
      const score = state.reviewFeedback?.score ?? 10;
      if (state.loopEnabled && state.loopCount < state.maxLoops && score < 10) {
        return 'loop_reset'; // send worker back with fix instructions
      }
      return 'assembler'; // score is 10/10 or loops exhausted
    })

    // assembler always finishes
    .addEdge('assembler', END)

    // loop_reset feeds directly back into worker (skip researcher + planner)
    .addEdge('loop_reset', 'worker');

  return graph.compile();
}
