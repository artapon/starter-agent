import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './workflow.state.js';
import { createNodes } from './workflow.nodes.js';

export function buildWorkflowGraph(socketManager) {
  const { analyzeNode, workerNode, reviewerNode } = createNodes(socketManager);

  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('analyze',  analyzeNode)
    .addNode('worker',   workerNode)
    .addNode('reviewer', reviewerNode)

    .addEdge('__start__', 'analyze')
    .addEdge('analyze', 'worker')
    .addEdge('worker', 'reviewer')

    // reviewer decides: done → END, anything else → back to worker
    .addConditionalEdges('reviewer', (state) => {
      if (state.status === 'complete') return END;
      return 'worker';
    });

  return graph.compile();
}
