import { Annotation } from '@langchain/langgraph';

export const AgentStateAnnotation = Annotation.Root({
  sessionId: Annotation({ reducer: (_, b) => b, default: () => '' }),
  userGoal: Annotation({ reducer: (_, b) => b, default: () => '' }),
  researchFindings: Annotation({ reducer: (_, b) => b, default: () => null }),
  plan: Annotation({ reducer: (_, b) => b, default: () => null }),
  currentStepIdx: Annotation({ reducer: (_, b) => b, default: () => 0 }),
  subtaskResults: Annotation({
    // null   → reset to []          (loop restart)
    // array  → replace entirely     (reviewer popping a failed retry attempt)
    // object → append single result (worker completing a step)
    reducer: (a, b) => b === null ? [] : Array.isArray(b) ? b : [...(a || []), b],
    default: () => [],
  }),
  reviewFeedback: Annotation({ reducer: (_, b) => b, default: () => null }),
  finalAnswer: Annotation({ reducer: (_, b) => b, default: () => null }),
  status: Annotation({ reducer: (_, b) => b, default: () => 'running' }),
  retryCount: Annotation({ reducer: (_, b) => b, default: () => 0 }),
  runId: Annotation({ reducer: (_, b) => b, default: () => '' }),
  loopEnabled: Annotation({ reducer: (_, b) => b, default: () => false }),
  maxLoops: Annotation({ reducer: (_, b) => b, default: () => 3 }),
  loopCount: Annotation({ reducer: (_, b) => b, default: () => 0 }),
  workspaceContext: Annotation({ reducer: (_, b) => b, default: () => null }),
  workspaceSummary: Annotation({ reducer: (_, b) => b, default: () => null }),
  projectId: Annotation({ reducer: (_, b) => b, default: () => null }),
  workspaceFolder: Annotation({ reducer: (_, b) => b, default: () => null }),
  agentSkills: Annotation({ reducer: (_, b) => b, default: () => null }),
});
