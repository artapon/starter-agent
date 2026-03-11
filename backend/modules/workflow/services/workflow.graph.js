import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './workflow.state.js';
import { createNodes } from './workflow.nodes.js';

export function buildWorkflowGraph(socketManager) {
  const { plannerNode, developerNode, reviewerNode, assemblerNode } = createNodes(socketManager);

  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('planner', plannerNode)
    .addNode('developer', developerNode)
    .addNode('reviewer', reviewerNode)
    .addNode('assembler', assemblerNode)

    // Entry: always start with planner
    .addEdge('__start__', 'planner')
    .addEdge('planner', 'developer')

    // After developer: go to reviewer
    .addEdge('developer', 'reviewer')

    // After reviewer: conditional routing
    .addConditionalEdges('reviewer', (state) => {
      const steps = state.plan?.steps || [];
      const allDone = state.currentStepIdx >= steps.length;
      const maxRetries = 3;

      if (state.status === 'revision_needed' && state.retryCount < maxRetries) {
        return 'developer'; // retry current step
      }
      if (!allDone) {
        return 'developer'; // next step
      }
      return 'assembler'; // all done
    })

    .addEdge('assembler', END);

  return graph.compile();
}
