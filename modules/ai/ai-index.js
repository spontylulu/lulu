/**
 * ai-index.js
 * Punto di ingresso del modulo AI di Lulu
 */

const logger = require('../../utils/logger').getLogger('ai:index');
const claude = require('./ai-claude-service');
const prompt = require('./ai-prompt-service');
const conversation = require('./ai-conversation-service');
const router = require('./ai-router-service');

const aiModule = {
  _active: false,
  _config: {
    enabled: true,
    defaultProvider: 'claude',
    defaultModel: 'claude-3-7-sonnet-20250219',
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: 'Sei Lulu, un assistente AI personale.',
    router: { enabled: true },
    services: {
      claude: { enabled: true },
      openai: { enabled: false }
    },
    caching: {
      enabled: true,
      similarity: true,
      similarityThreshold: 0.8
    }
  },
  _cache: null,

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

  // ────────────────────────────────────────────────
  // Chat
  // ────────────────────────────────────────────────

  async chat(message, options = {}) {
    if (!this._active) throw new Error('Modulo AI non attivo');

    const settings = {
      conversationId: options.conversationId,
      provider: options.provider || this._config.defaultProvider,
      model: options.model || this._config.defaultModel,
      temperature: options.temperature ?? this._config.temperature,
      maxTokens: options.maxTokens || this._config.maxTokens,
      systemPrompt: options.systemPrompt || this._config.systemPrompt,
      useCache: options.useCache ?? this._config.caching.enabled,
      userId: options.userId || 'anonymous'
    };

    // Cache?
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

    // Prompt + history
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

    // Routing
    let provider = settings.provider;
    if (this._config.router.enabled) {
      provider = await router.determineProvider(message, settings);
    }

    if (provider === 'claude') {
      const result = await claude.chat(promptData.prompt, {
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        systemPrompt: settings.systemPrompt
      });

      await conversation.addMessage(conv.id, { role: 'assistant', content: result.content });

      if (settings.useCache && this._cache) {
        await this._cache.set(message, result, { key: cacheKey });
      }

      return {
        ...result,
        conversationId: conv.id
      };
    }

    throw new Error(`Provider "${provider}" non supportato`);
  },

  // ────────────────────────────────────────────────
  // Completamento semplice
  // ────────────────────────────────────────────────

  async complete(promptText, options = {}) {
    if (!this._active) throw new Error('Modulo AI non attivo');

    const settings = {
      provider: options.provider || this._config.defaultProvider,
      model: options.model || this._config.defaultModel,
      temperature: options.temperature ?? this._config.temperature,
      maxTokens: options.maxTokens || this._config.maxTokens,
      useCache: options.useCache ?? this._config.caching.enabled,
      userId: options.userId || 'anonymous'
    };

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

    if (settings.provider === 'claude') {
      const result = await claude.complete(promptText, {
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens
      });

      if (settings.useCache && this._cache) {
        await this._cache.set(promptText, result, { key: cacheKey });
      }

      return {
        completion: result.content,
        model: result.model || settings.model
      };
    }

    throw new Error(`Provider "${settings.provider}" non supportato`);
  },

  // ────────────────────────────────────────────────
  // Altri metodi
  // ────────────────────────────────────────────────

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
      providers: {
        claude: await claude.getStatus()
      }
    };
  },

  _generateCacheKey(text, options = {}) {
    const base = `${text}|${options.userId || ''}|${options.model || ''}`;
    const hash = require('crypto').createHash('md5').update(base).digest('hex');
    return `ai:${hash}`;
  }
};

module.exports = aiModule;
