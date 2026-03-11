export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/agent.db',
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || './logs',
  lmStudio: {
    baseUrl: process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1',
    apiKey: process.env.LM_STUDIO_API_KEY || 'lm-studio',
  },
  agents: {
    planner: {
      model: process.env.PLANNER_MODEL || 'qwen2.5-7b-instruct',
      temperature: 0.3,
      maxTokens: 4096,
    },
    developer: {
      model: process.env.DEVELOPER_MODEL || 'qwen2.5-coder-7b-instruct',
      temperature: 0.2,
      maxTokens: 8192,
    },
    reviewer: {
      model: process.env.REVIEWER_MODEL || 'qwen2.5-7b-instruct',
      temperature: 0.1,
      maxTokens: 4096,
    },
  },
};
