/**
 * ai-index.js
 * Modulo AI centrale per Lulu: Mistral (locale), Claude (cloud), Cache, Routing
 */

const logger = require('../../utils/logger').getLogger('ai:index');
const claude = require('./ai-claude-service');
const prompt = require('./ai-prompt-service');
const conversation = require('./ai-conversation-service');
const router = require('./ai-router-service');
const axios = require('axios');

const aiModule = {
  _active: false,
  _cache: null,
  _config: {
    defaultProvider: 'mistral',
    defaultModel: 'phi3',
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: 'Sei Lulu, un assistente AI personale.',
    router: { enabled: true },
    services: {
      claude: { enabled: true },
      mistral: {
        enabled: true,
        host: 'http://localhost:11434',
        defaultModel: 'phi3'
      }
    },
    caching: {
      enabled: true,
      similarity: true,
      similarityThreshold: 0.8
    }
  },

  async initialize(config = {}, cacheModule = null) {
    this._config = { ...this._config, ...config };
    this._cache = cacheModule;

    await claude.initialize(this._config.services.claude);
    await prompt.initialize({ defaultSystemPrompt: this._config.systemPrompt });
    await conversation.initialize();
    await router.initialize(this._config.router);

    this._active = true;
    logger.info('Modulo AI inizializzato');
    return this;
  },

  async shutdown() {
    await Promise.all([
      claude.shutdown(),
      prompt.shutdown?.(),
      conversation.shutdown(),
      router.shutdown()
    ]);
    this._active = false;
    logger.info('Modulo AI chiuso');
  },

  async chat(message, options = {}) {
    if (!this._active) throw new Error('Modulo AI non attivo');

    const settings = this._buildSettings(message, options);

    const cacheKey = this._generateCacheKey(message, settings);
    if (settings.useCache && this._cache) {
      const cached = await this._cache.get(message, { key: cacheKey });
      if (cached) {
        return {
          content: cached.content || cached,
          conversationId: settings.conversationId,
          model: settings.model,
          fromCache: true,
          usage: cached.usage || { total_tokens: 0 }
        };
      }
    }

    const promptData = await prompt.preparePrompt(message, {
      systemPrompt: settings.systemPrompt,
      conversationId: settings.conversationId,
      userId: settings.userId,
      getConversation: conversation.getConversation
    });

    const conv = settings.conversationId
      ? await conversation.getConversation(settings.conversationId) || await conversation.createConversation(settings.userId)
      : await conversation.createConversation(settings.userId);

    await conversation.addMessage(conv.id, { role: 'user', content: message });

    const provider = await this._selectProvider(message, settings);
    let response;

    if (provider === 'claude') {
      response = await claude.chat(promptData.prompt, settings);
    } else if (provider === 'mistral') {
      response = await this._callMistralViaHttp(promptData.prompt, settings);
    } else {
      throw new Error(`Provider non supportato: ${provider}`);
    }

    await conversation.addMessage(conv.id, { role: 'assistant', content: response.content });

    if (settings.useCache && this._cache) {
      await this._cache.set(message, response, { key: cacheKey });
    }

    return {
      ...response,
      conversationId: conv.id
    };
  },

  async complete(promptText, options = {}) {
    if (!this._active) throw new Error('Modulo AI non attivo');

    const settings = this._buildSettings(promptText, options);

    const cacheKey = this._generateCacheKey(promptText, settings);
    if (settings.useCache && this._cache) {
      const cached = await this._cache.get(promptText, { key: cacheKey });
      if (cached) {
        return {
          completion: cached.content || cached,
          fromCache: true,
          model: settings.model
        };
      }
    }

    const provider = await this._selectProvider(promptText, settings);
    let response;

    if (provider === 'claude') {
      response = await claude.complete(promptText, settings);
    } else if (provider === 'mistral') {
      response = await this._callMistralViaHttp([{ role: 'user', content: promptText }], settings);
    } else {
      throw new Error(`Provider non supportato: ${provider}`);
    }

    if (settings.useCache && this._cache) {
      await this._cache.set(promptText, response, { key: cacheKey });
    }

    return {
      completion: response.content,
      model: response.model
    };
  },

  async _callMistralViaHttp(messages, options) {
    const host = this._config.services.mistral.host;
    const model = options.model || this._config.services.mistral.defaultModel;
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? 1024;

    try {
      const response = await axios.post(`${host}/api/chat`, {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      });

      const content = response.data.message?.content || response.data.response || '[no content]';

      return {
        content,
        model,
        usage: response.data.usage || { total_tokens: 0 }
      };
    } catch (err) {
      logger.error('Errore nella chiamata HTTP a Mistral:', err.message);
      throw err;
    }
  },

  _generateCacheKey(input, options = {}) {
    const base = `${input}|${options.userId || ''}|${options.model || ''}`;
    const hash = require('crypto').createHash('md5').update(base).digest('hex');
    return `ai:${hash}`;
  },

  _buildSettings(input, options = {}) {
    return {
      conversationId: options.conversationId,
      provider: options.provider || this._config.defaultProvider,
      model: options.model || this._config.defaultModel,
      temperature: options.temperature ?? this._config.temperature,
      maxTokens: options.maxTokens || this._config.maxTokens,
      systemPrompt: options.systemPrompt || this._config.systemPrompt,
      useCache: options.useCache ?? this._config.caching.enabled,
      userId: options.userId || 'anonymous'
    };
  },

  async _selectProvider(input, settings) {
    if (!this._config.router.enabled) return settings.provider;
    return await router.determineProvider(input, settings);
  },

  async getAvailableModels() {
    const models = [];
    if (this._config.services.claude.enabled) {
      models.push(...await claude.getAvailableModels());
    }
    return models;
  },

  async getStatus() {
    return {
      active: this._active,
      defaultModel: this._config.defaultModel,
      defaultProvider: this._config.defaultProvider,
      services: {
        claude: await claude.getStatus()
      }
    };
  }
};

module.exports = aiModule;
