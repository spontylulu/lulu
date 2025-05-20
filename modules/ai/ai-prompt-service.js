/**
 * ai-prompt-service.js
 * Costruzione del prompt finale con sistema e messaggi precedenti
 */

const logger = require('../../utils/logger').getLogger('ai:prompt');

const promptService = {
  _config: {
    defaultSystemPrompt: 'Sei Lulu, un assistente AI personale.'
  },

  async initialize(config = {}) {
    this._config = { ...this._config, ...config };
    return this;
  },

  async preparePrompt(userMessage, options = {}) {
    const systemPrompt = options.systemPrompt || this._config.defaultSystemPrompt;
    const conversationHistory = [];

    if (options.conversationId && options.getConversation) {
      const convo = await options.getConversation(options.conversationId);
      if (convo?.messages) {
        conversationHistory.push(...convo.messages);
      }
    }

    conversationHistory.push({ role: 'user', content: userMessage });

    return {
      prompt: conversationHistory,
      systemPrompt,
      conversationHistory
    };
  }
};

module.exports = promptService;
