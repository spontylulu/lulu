/**
 * modules/ai/ai-index.js
 * Modulo AI - Intelligenza artificiale e gestione conversazioni
 * 
 * Questo modulo gestisce le integrazioni con i modelli di AI,
 * il routing intelligente tra diverse API e la gestione delle conversazioni.
 */

const logger = require('../../utils/logger').getLogger('ai:index');
const claudeService = require('./ai-claude-service');
const conversationService = require('./ai-conversation-service');
const promptService = require('./ai-prompt-service');
const routerService = require('./ai-router-service');

/**
 * Modulo AI - Gestisce le interazioni con i modelli di intelligenza artificiale
 */
const aiModule = {
  // Servizi interni
  _claude: claudeService,
  _conversation: conversationService,
  _prompt: promptService,
  _router: routerService,
  
  // Riferimento al modulo cache (se disponibile)
  _cacheModule: null,
  
  // Configurazione di default
  _config: {
    enabled: true,
    defaultProvider: 'claude',  // Provider predefinito (claude, openai)
    defaultModel: 'claude-3-7-sonnet-20250219', // Modello predefinito
    temperature: 0.7,          // Temperatura predefinita
    maxTokens: null,           // Token massimi (null = default del modello)
    systemPrompt: "Sei Lulu, un assistente AI personale. Rispondi in modo conversazionale, conciso e utile.",
    services: {
      claude: {
        enabled: true,
        apiKey: process.env.CLAUDE_API_KEY || '',
        defaultModel: 'claude-3-7-sonnet-20250219',
        backupModel: 'claude-3-opus-20240229',
        maxRetries: 3,
        retryDelay: 1000
      },
      openai: {
        enabled: false,
        apiKey: process.env.OPENAI_API_KEY || '',
        defaultModel: 'gpt-4o',
        backupModel: 'gpt-3.5-turbo',
        maxRetries: 3,
        retryDelay: 1000
      }
    },
    caching: {
      enabled: true,           // Abilita caching delle risposte
      similarity: true,        // Usa matching per similarità
      similarityThreshold: 0.85 // Soglia similarità (0-1)
    },
    router: {
      enabled: true,           // Abilita router intelligente
      strategy: 'content',     // Strategia (content, cost, performance)
      rules: []                // Regole personalizzate di routing
    }
  },
  
  // Flag per tracciare lo stato del modulo
  _active: false,
  
  /**
   * Inizializza il modulo AI
   * @param {Object} config - Configurazione opzionale
   * @param {Object} [deps] - Dipendenze opzionali
   * @param {Object} [deps.cacheModule] - Riferimento al modulo cache
   * @returns {Object} - Istanza del modulo
   */
  async initialize(config = {}, deps = {}) {
    logger.info('Inizializzazione modulo AI');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Salva riferimenti a moduli dipendenti
      if (deps.cacheModule) {
        this._cacheModule = deps.cacheModule;
        logger.debug('Modulo cache collegato');
      }

      // Verifica le API keys
      this._validateApiKeys();
      
      // Inizializza i servizi interni
      await Promise.all([
        this._claude.initialize(this._config.services.claude),
        this._conversation.initialize(),
        this._prompt.initialize({
          systemPrompt: this._config.systemPrompt
        }),
        this._router.initialize({
          ...this._config.router,
          services: {
            claude: this._config.services.claude.enabled,
            openai: this._config.services.openai.enabled
          },
          defaultProvider: this._config.defaultProvider
        })
      ]);
      
      this._active = true;
      logger.info('Modulo AI inizializzato con successo', {
        defaultProvider: this._config.defaultProvider,
        defaultModel: this._config.defaultModel,
        temperature: this._config.temperature
      });
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del modulo AI:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il modulo AI
   */
  async shutdown() {
    logger.info('Chiusura modulo AI');
    
    try {
      // Chiudi i servizi interni
      await Promise.all([
        this._claude.shutdown(),
        this._conversation.shutdown(), 
        this._prompt.shutdown(),
        this._router.shutdown()
      ]);
      
      this._active = false;
      logger.info('Modulo AI chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del modulo AI:', error);
      throw error;
    }
  },
  
  /**
   * Restituisce lo stato attuale del modulo
   * @returns {Object} Stato del modulo
   */
  status() {
    return {
      active: this._active,
      defaultProvider: this._config.defaultProvider,
      defaultModel: this._config.defaultModel,
      services: {
        claude: this._claude.isAvailable(),
        openai: this._config.services.openai.enabled
      },
      caching: this._config.caching.enabled,
      router: this._config.router.enabled,
      conversationCount: this._conversation.getCount()
    };
  },
  
  /**
   * Verifica la disponibilità delle API keys e le imposta come variabili d'ambiente se necessario
   * @private
   */
  _validateApiKeys() {
    // Verifica API key di Claude
    if (this._config.services.claude.enabled) {
      if (!this._config.services.claude.apiKey) {
        logger.warn('API Key di Claude non configurata. Il servizio Claude verrà disabilitato.');
        this._config.services.claude.enabled = false;
        
        // Se era il provider predefinito, cambia a OpenAI se disponibile
        if (this._config.defaultProvider === 'claude') {
          if (this._config.services.openai.enabled && this._config.services.openai.apiKey) {
            logger.info('Cambio provider predefinito a OpenAI');
            this._config.defaultProvider = 'openai';
          } else {
            logger.error('Nessun provider AI disponibile. Il modulo non funzionerà correttamente.');
          }
        }
      } else {
        // Imposta API key di Claude come variabile d'ambiente se non già impostata
        if (!process.env.CLAUDE_API_KEY) {
          process.env.CLAUDE_API_KEY = this._config.services.claude.apiKey;
        }
      }
    }
    
    // Verifica API key di OpenAI
    if (this._config.services.openai.enabled) {
      if (!this._config.services.openai.apiKey) {
        logger.warn('API Key di OpenAI non configurata. Il servizio OpenAI verrà disabilitato.');
        this._config.services.openai.enabled = false;
        
        // Se era il provider predefinito, cambia a Claude se disponibile
        if (this._config.defaultProvider === 'openai') {
          if (this._config.services.claude.enabled && this._config.services.claude.apiKey) {
            logger.info('Cambio provider predefinito a Claude');
            this._config.defaultProvider = 'claude';
          } else {
            logger.error('Nessun provider AI disponibile. Il modulo non funzionerà correttamente.');
          }
        }
      } else {
        // Imposta API key di OpenAI come variabile d'ambiente se non già impostata
        if (!process.env.OPENAI_API_KEY) {
          process.env.OPENAI_API_KEY = this._config.services.openai.apiKey;
        }
      }
    }
    
    // Verifica che almeno un provider sia disponibile
    if (!this._config.services.claude.enabled && !this._config.services.openai.enabled) {
      throw new Error('Nessun provider AI disponibile. Configurare almeno un provider con una API key valida.');
    }
  },

  /**
   * Invia un messaggio all'AI e ottiene una risposta
   * @param {string} message - Messaggio da inviare
   * @param {Object} options - Opzioni di richiesta
   * @param {string} [options.conversationId] - ID conversazione per continuità
   * @param {string} [options.provider] - Provider AI da utilizzare (override)
   * @param {string} [options.model] - Modello da utilizzare (override)
   * @param {number} [options.temperature] - Temperatura (override)
   * @param {number} [options.maxTokens] - Token massimi (override)
   * @param {string} [options.systemPrompt] - System prompt (override)
   * @param {boolean} [options.useCache] - Se utilizzare la cache (override)
   * @param {string} [options.userId] - ID utente per tracking
   * @returns {Promise<Object>} Risposta dell'AI
   */
  async chat(message, options = {}) {
    if (!this._active) {
      throw new Error('Modulo AI non attivo');
    }
    
    logger.debug('Richiesta chat ricevuta', {
      messageLength: message.length,
      hasConversationId: !!options.conversationId,
      provider: options.provider || this._config.defaultProvider
    });
    
    try {
      const startTime = Date.now();
      
      // Combina opzioni con default
      const requestOptions = {
        conversationId: options.conversationId,
        provider: options.provider || this._config.defaultProvider,
        model: options.model || this._config.defaultModel,
        temperature: options.temperature !== undefined ? options.temperature : this._config.temperature,
        maxTokens: options.maxTokens || this._config.maxTokens,
        systemPrompt: options.systemPrompt || this._config.systemPrompt,
        useCache: options.useCache !== undefined ? options.useCache : this._config.caching.enabled,
        userId: options.userId || 'anonymous'
      };
      
      // Verifica se usare la cache
      let cachedResponse = null;
      if (requestOptions.useCache && this._cacheModule) {
        const cacheKey = this._generateCacheKey(message, requestOptions);
        cachedResponse = await this._cacheModule.get(message, {
          key: cacheKey,
          similarity: this._config.caching.similarity,
          similarityThreshold: this._config.caching.similarityThreshold
        });
        
        if (cachedResponse) {
          logger.info('Risposta recuperata dalla cache');
          
          // Aggiungi metadati cache alla risposta
          return {
            content: cachedResponse.content || cachedResponse,
            conversationId: requestOptions.conversationId,
            model: requestOptions.model,
            fromCache: true,
            usage: cachedResponse.usage || { total_tokens: 0 }
          };
        }
      }
      
      // Determina il provider da utilizzare tramite router
      let actualProvider = requestOptions.provider;
      if (this._config.router.enabled) {
        actualProvider = await this._router.determineProvider(message, requestOptions);
        logger.debug(`Router ha selezionato provider: ${actualProvider}`);
      }
      
      // Verifica se il provider è disponibile
      if ((actualProvider === 'claude' && !this._config.services.claude.enabled) ||
          (actualProvider === 'openai' && !this._config.services.openai.enabled)) {
        logger.warn(`Provider ${actualProvider} non disponibile, cambio a provider alternativo`);
        actualProvider = actualProvider === 'claude' ? 'openai' : 'claude';
        
        // Se anche l'alternativa non è disponibile, solleva errore
        if ((actualProvider === 'claude' && !this._config.services.claude.enabled) ||
            (actualProvider === 'openai' && !this._config.services.openai.enabled)) {
          throw new Error('Nessun provider AI disponibile');
        }
      }
      
      // Prepara il messaggio con il prompt service
      const promptOptions = {
        systemPrompt: requestOptions.systemPrompt,
        conversationId: requestOptions.conversationId,
        userId: requestOptions.userId
      };
      
      const promptData = await this._prompt.preparePrompt(message, promptOptions);
      
      // Ottieni la conversazione o creane una nuova
      let conversation;
      if (requestOptions.conversationId) {
        conversation = await this._conversation.getConversation(requestOptions.conversationId);
        if (!conversation) {
          logger.info(`Conversazione ${requestOptions.conversationId} non trovata, ne creo una nuova`);
          conversation = await this._conversation.createConversation(requestOptions.userId);
        }
      } else {
        conversation = await this._conversation.createConversation(requestOptions.userId);
      }
      
      // Aggiungi il messaggio utente alla conversazione
      await this._conversation.addMessage(conversation.id, {
        role: 'user',
        content: message
      });
      
      // Esegui la chiamata al provider appropriato
      let response;
      if (actualProvider === 'claude') {
        response = await this._claude.chat(promptData.prompt, {
          model: requestOptions.model,
          temperature: requestOptions.temperature,
          maxTokens: requestOptions.maxTokens,
          systemPrompt: promptData.systemPrompt,
          history: promptData.conversationHistory
        });
      } else {
        // In futuro, qui andrà il codice per OpenAI
        throw new Error('Provider OpenAI non ancora implementato');
      }
      
      // Aggiungi la risposta alla conversazione
      await this._conversation.addMessage(conversation.id, {
        role: 'assistant',
        content: response.content
      });
      
      // Salva nella cache se abilitata
      if (requestOptions.useCache && this._cacheModule) {
        const cacheKey = this._generateCacheKey(message, requestOptions);
        await this._cacheModule.set(message, response, {
          key: cacheKey,
          provider: actualProvider,
          model: response.model || requestOptions.model,
          conversationId: conversation.id,
          userId: requestOptions.userId
        });
      }
      
      // Calcola durata
      const duration = Date.now() - startTime;
      
      logger.info(`Chat completata in ${duration}ms`, {
        provider: actualProvider,
        model: response.model || requestOptions.model,
        conversationId: conversation.id,
        tokens: response.usage?.total_tokens || 0
      });
      
      // Restituisci la risposta con metadati aggiuntivi
      return {
        ...response,
        conversationId: conversation.id
      };
    } catch (error) {
      logger.error('Errore durante la richiesta chat:', error);
      throw error;
    }
  },
  
  /**
   * Esegue il completamento di un testo con l'AI (senza formato conversazione)
   * @param {string} prompt - Prompt per il completamento
   * @param {Object} options - Opzioni di richiesta
   * @returns {Promise<Object>} Risposta di completamento
   */
  async complete(prompt, options = {}) {
    if (!this._active) {
      throw new Error('Modulo AI non attivo');
    }
    
    logger.debug('Richiesta completamento ricevuta', {
      promptLength: prompt.length,
      provider: options.provider || this._config.defaultProvider
    });
    
    try {
      const startTime = Date.now();
      
      // Combina opzioni con default
      const requestOptions = {
        provider: options.provider || this._config.defaultProvider,
        model: options.model || this._config.defaultModel,
        temperature: options.temperature !== undefined ? options.temperature : this._config.temperature,
        maxTokens: options.maxTokens || this._config.maxTokens,
        useCache: options.useCache !== undefined ? options.useCache : this._config.caching.enabled,
        userId: options.userId || 'anonymous'
      };
      
      // Verifica se usare la cache
      let cachedResponse = null;
      if (requestOptions.useCache && this._cacheModule) {
        const cacheKey = this._generateCacheKey(prompt, requestOptions);
        cachedResponse = await this._cacheModule.get(prompt, {
          key: cacheKey,
          similarity: this._config.caching.similarity,
          similarityThreshold: this._config.caching.similarityThreshold
        });
        
        if (cachedResponse) {
          logger.info('Completamento recuperato dalla cache');
          
          // Aggiungi metadati cache alla risposta
          return {
            completion: cachedResponse.completion || cachedResponse.content || cachedResponse,
            model: requestOptions.model,
            fromCache: true,
            usage: cachedResponse.usage || { total_tokens: 0 }
          };
        }
      }
      
      // Determina il provider da utilizzare tramite router
      let actualProvider = requestOptions.provider;
      if (this._config.router.enabled) {
        actualProvider = await this._router.determineProvider(prompt, requestOptions);
        logger.debug(`Router ha selezionato provider: ${actualProvider}`);
      }
      
      // Verifica se il provider è disponibile
      if ((actualProvider === 'claude' && !this._config.services.claude.enabled) ||
          (actualProvider === 'openai' && !this._config.services.openai.enabled)) {
        logger.warn(`Provider ${actualProvider} non disponibile, cambio a provider alternativo`);
        actualProvider = actualProvider === 'claude' ? 'openai' : 'claude';
        
        // Se anche l'alternativa non è disponibile, solleva errore
        if ((actualProvider === 'claude' && !this._config.services.claude.enabled) ||
            (actualProvider === 'openai' && !this._config.services.openai.enabled)) {
          throw new Error('Nessun provider AI disponibile');
        }
      }
      
      // Esegui la chiamata al provider appropriato
      let response;
      if (actualProvider === 'claude') {
        response = await this._claude.complete(prompt, {
          model: requestOptions.model,
          temperature: requestOptions.temperature,
          maxTokens: requestOptions.maxTokens
        });
      } else {
        // In futuro, qui andrà il codice per OpenAI
        throw new Error('Provider OpenAI non ancora implementato');
      }
      
      // Salva nella cache se abilitata
      if (requestOptions.useCache && this._cacheModule) {
        const cacheKey = this._generateCacheKey(prompt, requestOptions);
        await this._cacheModule.set(prompt, {
          ...response,
          completion: response.content // Per uniformità nei formati cache
        }, {
          key: cacheKey,
          provider: actualProvider,
          model: response.model || requestOptions.model,
          userId: requestOptions.userId
        });
      }
      
      // Calcola durata
      const duration = Date.now() - startTime;
      
      logger.info(`Completamento eseguito in ${duration}ms`, {
        provider: actualProvider,
        model: response.model || requestOptions.model,
        tokens: response.usage?.total_tokens || 0
      });
      
      // Formatta la risposta
      return {
        completion: response.content,
        model: response.model || requestOptions.model,
        usage: response.usage || { total_tokens: 0 }
      };
    } catch (error) {
      logger.error('Errore durante la richiesta di completamento:', error);
      throw error;
    }
  },
  
  /**
   * Genera un titolo per una conversazione basandosi sui messaggi
   * @param {string} conversationId - ID della conversazione
   * @returns {Promise<string>} Titolo generato
   */
  async generateConversationTitle(conversationId) {
    if (!this._active) {
      throw new Error('Modulo AI non attivo');
    }
    
    try {
      // Ottieni la conversazione
      const conversation = await this._conversation.getConversation(conversationId);
      if (!conversation) {
        throw new Error(`Conversazione non trovata: ${conversationId}`);
      }
      
      // Verifica che ci siano abbastanza messaggi
      if (!conversation.messages || conversation.messages.length < 2) {
        return 'Nuova conversazione';
      }
      
      // Estrai i primi N messaggi (max 4) per generare il titolo
      const maxMessages = 4;
      const relevantMessages = conversation.messages.slice(0, Math.min(maxMessages, conversation.messages.length));
      
      // Crea prompt per generare il titolo
      const prompt = `
Genera un titolo breve e descrittivo (massimo 6 parole) per questa conversazione.
Il titolo deve essere conciso e catturare l'argomento principale.

Conversazione:
${relevantMessages.map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`).join('\n')}

Titolo:`;

      // Usa il servizio Claude per generare il titolo
      const response = await this._claude.complete(prompt, {
        model: 'claude-3-7-sonnet-20250219', // Usa un modello veloce
        temperature: 0.7,
        maxTokens: 20
      });
      
      // Pulisci il titolo
      let title = response.content.trim();
      
      // Rimuovi virgolette se presenti
      if ((title.startsWith('"') && title.endsWith('"')) || 
          (title.startsWith("'") && title.endsWith("'"))) {
        title = title.substring(1, title.length - 1);
      }
      
      // Limita la lunghezza
      if (title.length > 60) {
        title = title.substring(0, 57) + '...';
      }
      
      // Aggiorna il titolo della conversazione
      await this._conversation.updateConversation(conversationId, { title });
      
      return title;
    } catch (error) {
      logger.error(`Errore nella generazione del titolo per conversazione ${conversationId}:`, error);
      return 'Nuova conversazione';
    }
  },
  
  /**
   * Ottiene la lista delle conversazioni di un utente
   * @param {string} userId - ID dell'utente
   * @param {Object} options - Opzioni di paginazione
   * @returns {Promise<Array>} Lista di conversazioni
   */
  async getConversations(userId, options = {}) {
    if (!this._active) {
      throw new Error('Modulo AI non attivo');
    }
    
    return this._conversation.getUserConversations(userId, options);
  },
  
  /**
   * Ottiene i dettagli di una conversazione
   * @param {string} conversationId - ID della conversazione
   * @param {string} userId - ID dell'utente (per verifica autorizzazione)
   * @returns {Promise<Object>} Dettagli conversazione
   */
  async getConversation(conversationId, userId) {
    if (!this._active) {
      throw new Error('Modulo AI non attivo');
    }
    
    const conversation = await this._conversation.getConversation(conversationId);
    
    // Verifica autorizzazione
    if (conversation && conversation.userId !== userId) {
      logger.warn(`Tentativo di accesso non autorizzato alla conversazione ${conversationId} da parte dell'utente ${userId}`);
      return null;
    }
    
    return conversation;
  },
  
  /**
   * Elimina una conversazione
   * @param {string} conversationId - ID della conversazione
   * @param {string} userId - ID dell'utente (per verifica autorizzazione)
   * @returns {Promise<boolean>} Esito dell'operazione
   */
  async deleteConversation(conversationId, userId) {
    if (!this._active) {
      throw new Error('Modulo AI non attivo');
    }
    
    // Verifica autorizzazione
    const conversation = await this._conversation.getConversation(conversationId);
    if (conversation && conversation.userId !== userId) {
      logger.warn(`Tentativo di eliminazione non autorizzata della conversazione ${conversationId} da parte dell'utente ${userId}`);
      return false;
    }
    
    return this._conversation.deleteConversation(conversationId);
  },
  
  /**
   * Genera una chiave di cache per una query
   * @private
   * @param {string} query - Query o messaggio
   * @param {Object} options - Opzioni di richiesta
   * @returns {string} Chiave di cache
   */
  _generateCacheKey(query, options) {
    try {
      // Estrai parametri rilevanti per la chiave
      const { userId, model, provider, temperature } = options;
      
      // Normalizza la query (trim, lowercase)
      const normalizedQuery = query.trim().toLowerCase();
      
      // Crea una stringa da hashare
      let keyString = normalizedQuery;
      
      // Aggiungi parametri opzionali se presenti
      if (provider) keyString += `|provider:${provider}`;
      if (model) keyString += `|model:${model}`;
      if (temperature) keyString += `|temp:${temperature}`;
      if (userId) keyString += `|user:${userId.substring(0, 10)}`; // limita lunghezza
      
      // Genera hash
      const crypto = require('crypto');
      const hash = crypto.createHash('md5').update(keyString).digest('hex');
      
      return `ai:${hash}`;
    } catch (error) {
      logger.error('Errore nella generazione della chiave di cache:', error);
      
      // Fallback a timestamp + random
      return `ai:${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    }
  },
  
  /**
   * Ottiene i modelli AI disponibili
   * @returns {Promise<Array>} Lista di modelli disponibili
   */
  async getAvailableModels() {
    if (!this._active) {
      throw new Error('Modulo AI non attivo');
    }
    
    const models = [];
    
    // Aggiungi modelli Claude se abilitato
    if (this._config.services.claude.enabled) {
      const claudeModels = await this._claude.getAvailableModels();
      models.push(...claudeModels);
    }
    
    // Aggiungi modelli OpenAI se abilitato
    if (this._config.services.openai.enabled) {
      // In futuro, qui andrà il codice per i modelli OpenAI
      models.push({
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        capabilities: ['chat', 'completion', 'function-calling'],
        description: 'Modello più potente di OpenAI con capacità multimodali.',
        maxTokens: 128000,
        isDefault: this._config.defaultProvider === 'openai'
      });
    }
    
    // Segna il modello predefinito
    const defaultModelId = this._config.defaultModel;
    models.forEach(model => {
      model.isDefault = model.id === defaultModelId;
    });
    
    return models;
  },
  
  /**
   * Ottiene lo stato dettagliato del servizio AI
   * @returns {Promise<Object>} Stato dettagliato
   */
  async getStatus() {
    if (!this._active) {
      return {
        operational: false,
        message: 'Modulo AI non attivo'
      };
    }
    
    try {
      const claudeStatus = this._config.services.claude.enabled ? 
        await this._claude.getStatus() : { operational: false };
      
      // In futuro, qui andrà il codice per lo stato di OpenAI
      const openaiStatus = this._config.services.openai.enabled ? 
        { operational: true } : { operational: false };
      
      const cacheStats = this._cacheModule ? 
        await this._cacheModule.getStats() : null;
      
      return {
        operational: claudeStatus.operational || openaiStatus.operational,
        activeServices: {
          claude: claudeStatus.operational,
          openai: openaiStatus.operational
        },
        defaultModel: this._config.defaultModel,
        defaultProvider: this._config.defaultProvider,
        caching: this._config.caching.enabled,
        router: this._config.router.enabled,
        conversationCount: this._conversation.getCount(),
        cacheStats,
        lastError: claudeStatus.lastError || null,
        uptime: process.uptime()
      };
    } catch (error) {
      logger.error('Errore durante il recupero dello stato AI:', error);
      
      return {
        operational: false,
        error: error.message,
        uptime: process.uptime()
      };
    }
  }
};

module.exports = aiModule;
