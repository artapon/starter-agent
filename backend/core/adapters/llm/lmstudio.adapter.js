import { ChatOpenAI } from '@langchain/openai';
import { createLogger } from '../../logger/winston.logger.js';

const logger = createLogger('lmstudio-adapter');

export class LMStudioAdapter {
  constructor(settings) {
    this._settings = settings;
    this._chatModel = null;
  }

  _buildModel() {
    const s = this._settings;
    return new ChatOpenAI({
      modelName: s.model_name,
      openAIApiKey: s.api_key || 'lm-studio',
      temperature: s.temperature ?? 0.7,
      maxTokens: s.max_tokens ?? 4096,
      configuration: {
        baseURL: s.base_url || 'http://localhost:1234/v1',
      },
      streaming: true,
    });
  }

  getChatModel() {
    if (!this._chatModel) {
      this._chatModel = this._buildModel();
    }
    return this._chatModel;
  }

  invalidate() {
    this._chatModel = null;
  }

  updateSettings(settings) {
    this._settings = { ...this._settings, ...settings };
    this._chatModel = null;
    logger.info(`Adapter updated for agent ${this._settings.agent_id}`, {
      model: this._settings.model_name,
    });
  }

  getModelName() {
    return this._settings.model_name;
  }

  getBaseURL() {
    return this._settings.base_url;
  }

  async isAvailable() {
    try {
      const res = await fetch(`${this.getBaseURL().replace('/v1', '')}/v1/models`, {
        headers: { Authorization: `Bearer ${this._settings.api_key}` },
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
