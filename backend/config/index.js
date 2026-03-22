// Agent defaults (model names, temperatures, token limits) are seeded once into
// the DB by core/database/migrator.js and then managed via the Settings UI.
// Do NOT add them here — config.js is the process-level env layer only.
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
};
