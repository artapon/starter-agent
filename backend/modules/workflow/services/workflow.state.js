import { Annotation } from '@langchain/langgraph';

export const AgentStateAnnotation = Annotation.Root({
  sessionId: Annotation({ reducer: (_, b) => b, default: () => '' }),
  userGoal: Annotation({ reducer: (_, b) => b, default: () => '' }),
  researchFindings: Annotation({ reducer: (_, b) => b, default: () => null }),
  plan: Annotation({ reducer: (_, b) => b, default: () => null }),
  currentStepIdx: Annotation({ reducer: (_, b) => b, default: () => 0 }),
  subtaskResults: Annotation({
    // null acts as a reset signal (used when looping back to restart a cycle)
    reducer: (a, b) => b === null ? [] : [...(a || []), ...(Array.isArray(b) ? b : [b])],
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
});
