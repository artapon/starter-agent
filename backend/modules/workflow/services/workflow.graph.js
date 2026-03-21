import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './workflow.state.js';
import { createNodes } from './workflow.nodes.js';

export function buildWorkflowGraph(socketManager) {
  const { plannerNode, researcherNode, workerNode, reviewerNode } = createNodes(socketManager);

  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('planner',    plannerNode)
    .addNode('researcher', researcherNode)
    .addNode('worker',     workerNode)
    .addNode('reviewer',   reviewerNode)

    .addEdge('__start__', 'planner')
    .addEdge('planner',   'researcher')
    .addEdge('researcher','worker')
    .addEdge('worker',    'reviewer')

    // reviewer decides:
    //   complete         → END
    //   revision_needed  → back to worker (retry current step, no re-research)
    //   anything else    → researcher (next step research or improvement loop)
    .addConditionalEdges('reviewer', (state) => {
      if (state.status === 'complete')         return END;
      if (state.status === 'revision_needed')  return 'worker';
      return 'researcher';
    });

  return graph.compile();
}
