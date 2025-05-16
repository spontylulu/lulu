/**
 * modules/ai/ai-claude-service.js
 * Servizio di integrazione con Claude AI di Anthropic
 * 
 * Gestisce le chiamate API verso Claude, il parsing delle risposte
 * e la gestione degli errori specifici di Anthropic.
 */

const logger = require('../../utils/logger').getLogger('ai:claude');
const axios = require('axios');

/**
 * Servizio di integrazione con l'API Claude di Anthropic
 */
const claudeService = {
  // Configurazione di default
  _config: {
    enabled: true,
    apiKey: process.env.CLAUDE_API_KEY || '',
    apiVersion: '2023-06-01',
    apiBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-7-sonnet-20250219',
    backupModel: 'claude-3-opus-20240229',
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 120000, // 2 minuti
    defaultMaxTokens: 1024
  },
  
  // Client HTTP
  _client: null,
  
  // Stato del servizio
  _status: {
    available: false,
    lastCheck: null,
    lastError: null,
    errorCount: 0,
    requestCount: 0,
    successCount: 0
  },
  
  // Modelli disponibili
  _models: [
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      provider: 'claude',
      capabilities: ['chat', 'completion'],
      description: 'Modello principale di Claude, eccellente per una vasta gamma di attività.',
      maxTokens: 180000,
      contextWindow: 200000
    },
    {
      id: 'claude-3-haiku-20230405',
      name: 'Claude 3 Haiku',
      provider: 'claude',
      capabilities: ['chat', 'completion'],
      description: 'Modello veloce ed economico, ideale per compiti semplici.',
      maxTokens: 5000,
      contextWindow: 200000
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      provider: 'claude',
      capabilities: ['chat', 'completion'],
      description: 'Modello più potente di Claude, per compiti complessi e ragionamento avanzato.',
      maxTokens: 8000,
      contextWindow: 200000
    }
  ],
  
  /**
   * Inizializza il servizio Claude
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio Claude');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Se il servizio è disabilitato, termina qui
      if (!this._config.enabled) {
        logger.info('Servizio Claude disabilitato da configurazione');
        return this;
      }
      
      // Verifica API key
      if (!this._config.apiKey) {
        logger.error('API key di Claude non configurata');
        this._status.available = false;
        this._status.lastError = {
          message: 'API key non configurata',
          timestamp: Date.now()
        };
        return this;
      }
      
      // Configura client HTTP
      this._client = axios.create({
        baseURL: this._config.apiBaseUrl,
        timeout: this._config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this._config.apiKey,
          'anthropic-version': this._config.apiVersion
        }
      });
      
      // Verifica connessione
      await this._checkConnection();
      
      logger.info('Servizio Claude inizializzato con successo', {
        available: this._status.available,
        defaultModel: this._config.defaultModel
      });
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio Claude:', error);
      
      this._status.available = false;
      this._status.lastError = {
        message: error.message,
        timestamp: Date.now()
      };
      
      throw error;
    }
  },
  
  /**
   * Chiude il servizio Claude
   */
  async shutdown() {
    logger.info('Chiusura servizio Claude');
    
    try {
      // Nulla di particolare da fare per la chiusura
      logger.info('Servizio Claude chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio Claude:', error);
      throw error;
    }
  },
  
  /**
   * Verifica se il servizio è disponibile
   * @returns {boolean} Stato di disponibilità
   */
  isAvailable() {
    return this._config.enabled && this._status.available;
  },
  
  /**
   * Verifica la connessione all'API Claude
   * @private
   * @returns {Promise<boolean>} Esito della verifica
   */
  async _checkConnection() {
    try {
      // Eseguiamo una semplice chiamata di test
      const response = await this._client.get('/models');
      
      // Verifica risposta
      if (response.status === 200) {
        this._status.available = true;
        this._status.lastCheck = Date.now();
        
        // Aggiorna lista modelli se presente nella risposta
        if (response.data && response.data.models) {
          this._updateModelsList(response.data.models);
        }
        
        logger.debug('Connessione a Claude verificata con successo');
        return true;
      } else {
        throw new Error(`Risposta non valida: ${response.status}`);
      }
    } catch (error) {
      // Gestisci caso in cui API key è invalida
      if (error.response && error.response.status === 401) {
        logger.error('API key Claude non valida');
      } else {
        logger.error('Errore durante la verifica della connessione a Claude:', error);
      }
      
      this._status.available = false;
      this._status.lastError = {
        message: error.message,
        timestamp: Date.now(),
        statusCode: error.response?.status
      };
      
      return false;
    }
  },
  
  /**
   * Aggiorna la lista dei modelli disponibili in base alla risposta API
   * @private
   * @param {Array} apiModels - Lista modelli dall'API
   */
  _updateModelsList(apiModels) {
    try {
      if (!Array.isArray(apiModels) || apiModels.length === 0) {
        return;
      }
      
      const updatedModels = [];
      
      // Processa ogni modello
      for (const apiModel of apiModels) {
        // Cerca se esiste già nella nostra lista
        const existingModel = this._models.find(m => m.id === apiModel.id);
        
        if (existingModel) {
          // Aggiorna il modello esistente
          updatedModels.push({
            ...existingModel,
            // Aggiorna proprietà dall'API
            maxTokens: apiModel.max_tokens || existingModel.maxTokens,
            contextWindow: apiModel.context_window || existingModel.contextWindow
          });
        } else {
          // Aggiungi nuovo modello
          updatedModels.push({
            id: apiModel.id,
            name: apiModel.name || apiModel.id,
            provider: 'claude',
            capabilities: ['chat', 'completion'],
            description: apiModel.description || `Modello Claude ${apiModel.id}`,
            maxTokens: apiModel.max_tokens || 4096,
            contextWindow: apiModel.context_window || 8192
          });
        }
      }
      
      // Aggiorna la lista completa
      if (updatedModels.length > 0) {
        this._models = updatedModels;
        logger.debug(`Lista modelli Claude aggiornata: ${updatedModels.length} modelli disponibili`);
      }
    } catch (error) {
      logger.warn('Errore durante l\'aggiornamento della lista modelli:', error);
      // Continua con la lista statica
    }
  },
  
  /**
   * Esegue una chiamata a Claude con retry automatico
   * @private
   * @param {Function} apiCall - Funzione di chiamata API
   * @returns {Promise<Object>} Risposta dell'API
   */
  async _callWithRetry(apiCall) {
    let retryCount = 0;
    let lastError;
    
    while (retryCount <= this._config.maxRetries) {
      try {
        // Aggiorna contatore richieste
        this._status.requestCount++;
        
        // Esegui chiamata API
        const result = await apiCall();
        
        // Se arriviamo qui, la chiamata è riuscita
        this._status.successCount++;
        
        return result;
      } catch (error) {
        lastError = error;
        retryCount++;
        
        // Determina se provare di nuovo
        const shouldRetry = this._shouldRetry(error, retryCount);
        
        if (shouldRetry) {
          // Calcola ritardo con backoff esponenziale
          const delay = this._config.retryDelay * Math.pow(2, retryCount - 1);
          logger.warn(`Riprovo chiamata API Claude (tentativo ${retryCount}/${this._config.maxRetries}) tra ${delay}ms`, {
            error: error.message,
            statusCode: error.response?.status
          });
          
          // Attendi prima di riprovare
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Non riproviamo più
          break;
        }
      }
    }
    
    // Se arriviamo qui, tutti i tentativi sono falliti
    this._status.errorCount++;
    this._status.lastError = {
      message: lastError.message,
      timestamp: Date.now(),
      statusCode: lastError.response?.status
    };
    
    logger.error(`Falliti tutti i ${retryCount} tentativi di chiamata a Claude`, {
      error: lastError.message,
      statusCode: lastError.response?.status
    });
    
    throw lastError;
  },
  
  /**
   * Determina se riprovare una chiamata API fallita
   * @private
   * @param {Error} error - Errore della chiamata
   * @param {number} retryCount - Numero attuale di tentativi
   * @returns {boolean} True se riprovare
   */
  _shouldRetry(error, retryCount) {
    // Non riprovare se abbiamo superato i tentativi massimi
    if (retryCount >= this._config.maxRetries) {
      return false;
    }
    
    // Riproviamo per errori di rete
    if (!error.response) {
      return true;
    }
    
    // Riproviamo per errori 5xx (lato server)
    if (error.response.status >= 500 && error.response.status < 600) {
      return true;
    }
    
    // Riproviamo per errori di rate limit (429)
    if (error.response.status === 429) {
      return true;
    }
    
    // Non riproviamo per altri errori (4xx)
    return false;
  },
  
  /**
   * Invia una richiesta di chat all'API Claude
   * @param {string} message - Messaggio da inviare
   * @param {Object} options - Opzioni di richiesta
   * @returns {Promise<Object>} Risposta di Claude
   */
  async chat(message, options = {}) {
    if (!this._config.enabled || !this._status.available) {
      throw new Error('Servizio Claude non disponibile');
    }
    
    logger.debug('Invio richiesta chat a Claude');
    
    try {
      // Seleziona il modello da utilizzare
      const model = options.model || this._config.defaultModel;
      
      // Prepara i messaggi
      let messages = [];
      
      // Se c'è una storia di conversazione, usala
      if (options.history && Array.isArray(options.history)) {
        messages = [...options.history];
      } 
      
      // Aggiungi il messaggio utente corrente
      messages.push({
        role: 'user',
        content: message
      });
      
      // Prepara i parametri della richiesta
      const requestData = {
        model,
        messages,
        system: options.systemPrompt || this._config.systemPrompt,
        temperature: options.temperature !== undefined ? options.temperature : 0.7,
        max_tokens: options.maxTokens || this._config.defaultMaxTokens
      };
      
      // Esegui la chiamata API con gestione retry
      const response = await this._callWithRetry(async () => {
        const apiResponse = await this._client.post('/messages', requestData);
        return apiResponse.data;
      });
      
      // Estrai e formatta la risposta
      if (!response.content || !Array.isArray(response.content) || response.content.length === 0) {
        throw new Error('Risposta Claude non valida: contenuto mancante');
      }
      
      // Estrai il testo dalla risposta (la struttura è specific a Claude)
      let responseText = '';
      for (const item of response.content) {
        if (item.type === 'text') {
          responseText += item.text;
        }
      }
      
      // Formatta la risposta
      const formattedResponse = {
        content: responseText,
        model: response.model || model,
        usage: {
          prompt_tokens: response.usage?.input_tokens || 0,
          completion_tokens: response.usage?.output_tokens || 0,
          total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        },
        id: response.id,
        created: response.created
      };
      
      logger.info('Risposta Claude ricevuta', {
        model: formattedResponse.model,
        promptTokens: formattedResponse.usage.prompt_tokens,
        completionTokens: formattedResponse.usage.completion_tokens,
        totalTokens: formattedResponse.usage.total_tokens
      });
      
      return formattedResponse;
    } catch (error) {
      // Gestione errori specifici di Claude
      let enhancedError;
      
      if (error.response) {
        const statusCode = error.response.status;
        const errorBody = error.response.data;
        
        if (statusCode === 401) {
          enhancedError = new Error('API key Claude non valida');
          enhancedError.code = 'invalid_api_key';
        } else if (statusCode === 429) {
          enhancedError = new Error('Limite di rate API Claude superato');
          enhancedError.code = 'rate_limit_exceeded';
        } else if (statusCode === 400) {
          const errorType = errorBody.error?.type;
          if (errorType === 'invalid_request_error') {
            if (errorBody.error?.message.includes('token')) {
              enhancedError = new Error('Limite di token Claude superato');
              enhancedError.code = 'token_limit_exceeded';
            } else {
              enhancedError = new Error(`Richiesta non valida: ${errorBody.error?.message}`);
              enhancedError.code = 'invalid_request';
            }
          }
        }
      }
      
      if (!enhancedError) {
        enhancedError = new Error(`Errore durante la chiamata a Claude: ${error.message}`);
        enhancedError.code = 'api_error';
      }
      
      enhancedError.originalError = error;
      
      logger.error('Errore nella richiesta Claude:', {
        message: enhancedError.message,
        code: enhancedError.code,
        statusCode: error.response?.status
      });
      
      throw enhancedError;
    }
  },
  
  /**
   * Invia una richiesta di completamento all'API Claude
   * @param {string} prompt - Prompt per il completamento
   * @param {Object} options - Opzioni di richiesta
   * @returns {Promise<Object>} Risposta di Claude
   */
  async complete(prompt, options = {}) {
    // Per Claude, usiamo l'API dei messaggi anche per i completamenti
    // ma senza includere conversazioni precedenti
    return this.chat(prompt, { 
      ...options, 
      history: [] // Nessuna storia di conversazione
    });
  },
  
  /**
   * Ottiene la lista dei modelli disponibili
   * @returns {Promise<Array>} Lista dei modelli
   */
  async getAvailableModels() {
    return this._models;
  },
  
  /**
   * Ottiene lo stato del servizio
   * @returns {Object} Stato del servizio
   */
  getStatus() {
    return {
      operational: this._status.available,
      lastCheck: this._status.lastCheck,
      lastError: this._status.lastError,
      stats: {
        requests: this._status.requestCount,
        successes: this._status.successCount,
        errors: this._status.errorCount,
        successRate: this._status.requestCount > 0 ? 
          (this._status.successCount / this._status.requestCount * 100).toFixed(1) + '%' : 'N/A'
      },
      config: {
        model: this._config.defaultModel,
        maxRetries: this._config.maxRetries
      }
    };
  }
};

module.exports = claudeService;