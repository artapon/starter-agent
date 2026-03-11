import { Annotation } from '@langchain/langgraph';

export const AgentStateAnnotation = Annotation.Root({
  sessionId: Annotation({ reducer: (_, b) => b, default: () => '' }),
  userGoal: Annotation({ reducer: (_, b) => b, default: () => '' }),
  plan: Annotation({ reducer: (_, b) => b, default: () => null }),
  currentStepIdx: Annotation({ reducer: (_, b) => b, default: () => 0 }),
  subtaskResults: Annotation({
    reducer: (a, b) => [...(a || []), ...(Array.isArray(b) ? b : [b])],
    default: () => [],
  }),
  reviewFeedback: Annotation({ reducer: (_, b) => b, default: () => null }),
  finalAnswer: Annotation({ reducer: (_, b) => b, default: () => null }),
  status: Annotation({ reducer: (_, b) => b, default: () => 'running' }),
  retryCount: Annotation({ reducer: (_, b) => b, default: () => 0 }),
  runId: Annotation({ reducer: (_, b) => b, default: () => '' }),
});
