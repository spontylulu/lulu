/**
 * ai-claude-service.js
 * Integrazione con l'API Claude (Anthropic)
 */

const axios = require('axios');
const logger = require('../../utils/logger').getLogger('ai:claude');

const claudeService = {
  _config: {
    enabled: true,
    apiKey: process.env.CLAUDE_API_KEY || '',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-7-sonnet-20250219'
  },

  async initialize(config = {}) {
    this._config = { ...this._config, ...config };
    logger.info('Servizio Claude inizializzato');
    return this;
  },

  async shutdown() {
    logger.info('Servizio Claude chiuso');
  },

  async chat(messages, options = {}) {
    const payload = {
      model: options.model || this._config.defaultModel,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 1024,
      system: options.systemPrompt || '',
      messages
    };

    try {
      const res = await axios.post(this._config.endpoint, payload, {
        headers: {
          'x-api-key': this._config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      });

      return {
        content: res.data?.content?.[0]?.text?.trim() || '',
        model: res.data?.model,
        usage: res.data?.usage
      };
    } catch (error) {
      logger.error('Errore Claude:', error.response?.data || error.message);
      throw new Error('Errore comunicazione con Claude');
    }
  },

  async complete(prompt, options = {}) {
    return this.chat([
      { role: 'user', content: prompt }
    ], options);
  },

  async getAvailableModels() {
    return [
      {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        provider: 'claude',
        capabilities: ['chat', 'completion'],
        description: 'Modello di linguaggio Anthropic Claude',
        maxTokens: 100000,
        isDefault: true
      }
    ];
  },

  async getStatus() {
    return {
      operational: !!this._config.apiKey,
      lastError: null
    };
  }
};

module.exports = claudeService;
