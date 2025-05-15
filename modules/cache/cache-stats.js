/**
 * modules/cache/cache-stats.js
 * Servizio statistiche per il modulo cache
 * 
 * Tiene traccia delle metriche di utilizzo della cache, come hit rate,
 * distribuzione delle query e performance, per ottimizzare il sistema.
 */

const logger = require('../../utils/logger').getLogger('cache:stats');

/**
 * Servizio statistiche per il modulo cache
 */
const statsService = {
  // Configurazione di default
  _config: {
    enabled: true,
    historySize: 100,        // Numero di eventi da conservare
    trackDistribution: true, // Traccia distribuzione operazioni
    persistStats: false,     // Salva statistiche tra i riavvii
    detailedEvents: false    // Includi dettagli completi negli eventi
  },
  
  // Contatori principali
  _counters: {
    get: {
      total: 0,
      hits: 0,
      misses: 0
    },
    set: {
      total: 0,
      success: 0,
      failed: 0
    },
    remove: {
      total: 0,
      success: 0,
      failed: 0
    },
    cleanup: {
      total: 0,
      itemsRemoved: 0
    },
    clear: {
      total: 0,
      success: 0,
      failed: 0
    },
    errors: {
      total: 0,
      get: 0,
      set: 0,
      remove: 0,
      cleanup: 0,
      clear: 0
    }
  },
  
  // Distribuzione delle operazioni per dimensione
  _distribution: {
    payloadSizes: {
      '< 100B': 0,
      '100B - 1KB': 0,
      '1KB - 10KB': 0,
      '10KB - 100KB': 0,
      '100KB - 1MB': 0,
      '> 1MB': 0
    },
    queryTypes: {},
    errorTypes: {}
  },
  
  // Misure di performance
  _performance: {
    getLatency: [],    // Array di tempi in ms
    setLatency: [],
    removeLatency: [],
    cleanupLatency: []
  },
  
  // Storia degli eventi recenti
  _history: [],
  
  // Ora di inizio tracking
  _startTime: null,
  
  /**
   * Inizializza il servizio statistiche
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio statistiche cache');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Reset contatori e metriche
      this._resetStats();
      
      // Carica statistiche se persistenza abilitata
      if (this._config.persistStats) {
        try {
          this._loadStats();
        } catch (error) {
          logger.warn('Impossibile caricare statistiche:', error);
        }
      }
      
      logger.info('Servizio statistiche cache inizializzato con successo');
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio statistiche cache:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio statistiche
   */
  async shutdown() {
    logger.info('Chiusura servizio statistiche cache');
    
    try {
      // Salva statistiche se persistenza abilitata
      if (this._config.persistStats) {
        try {
          this._saveStats();
        } catch (error) {
          logger.error('Errore durante il salvataggio delle statistiche:', error);
        }
      }
      
      logger.info('Servizio statistiche cache chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio statistiche cache:', error);
      throw error;
    }
  },
  
  /**
   * Reset delle statistiche
   * @private
   */
  _resetStats() {
    // Reset contatori
    this._counters = {
      get: { total: 0, hits: 0, misses: 0 },
      set: { total: 0, success: 0, failed: 0 },
      remove: { total: 0, success: 0, failed: 0 },
      cleanup: { total: 0, itemsRemoved: 0 },
      clear: { total: 0, success: 0, failed: 0 },
      errors: { total: 0, get: 0, set: 0, remove: 0, cleanup: 0, clear: 0 }
    };
    
    // Reset distribuzione
    this._distribution = {
      payloadSizes: {
        '< 100B': 0,
        '100B - 1KB': 0,
        '1KB - 10KB': 0,
        '10KB - 100KB': 0,
        '100KB - 1MB': 0,
        '> 1MB': 0
      },
      queryTypes: {},
      errorTypes: {}
    };
    
    // Reset performance
    this._performance = {
      getLatency: [],
      setLatency: [],
      removeLatency: [],
      cleanupLatency: []
    };
    
    // Reset storia eventi
    this._history = [];
    
    // Imposta ora di inizio
    this._startTime = Date.now();
  },
  
  /**
   * Salva le statistiche su storage persistente
   * @private
   */
  _saveStats() {
    if (!this._config.persistStats) return;
    
    // In una implementazione completa, qui salveremmo
    // le statistiche su file o database
    logger.debug('Salvataggio statistiche non implementato');
  },
  
  /**
   * Carica le statistiche da storage persistente
   * @private
   */
  _loadStats() {
    if (!this._config.persistStats) return;
    
    // In una implementazione completa, qui caricheremmo
    // le statistiche da file o database
    logger.debug('Caricamento statistiche non implementato');
  },
  
  /**
   * Aggiunge un evento alla storia
   * @private
   * @param {string} type - Tipo di evento
   * @param {Object} data - Dati dell'evento
   */
  _addToHistory(type, data) {
    if (!this._config.enabled) return;
    
    // Crea record evento
    const event = {
      type,
      timestamp: Date.now(),
      data: this._config.detailedEvents ? data : this._sanitizeEventData(data)
    };
    
    // Aggiungi alla storia
    this._history.unshift(event);
    
    // Limita dimensione storia
    if (this._history.length > this._config.historySize) {
      this._history.pop();
    }
  },
  
  /**
   * Rimuove dati sensibili o voluminosi dagli eventi
   * @private
   * @param {Object} data - Dati originali
   * @returns {Object} Dati sanitizzati
   */
  _sanitizeEventData(data) {
    if (!data) return {};
    
    // Clone per non modificare l'originale
    const sanitized = { ...data };
    
    // Rimuovi campi voluminosi
    if (sanitized.key && sanitized.key.length > 50) {
      sanitized.key = sanitized.key.substring(0, 47) + '...';
    }
    
    // Rimuovi dati payload
    delete sanitized.value;
    delete sanitized.payload;
    delete sanitized.response;
    
    return sanitized;
  },
  
  /**
   * Traccia la dimensione del payload
   * @private
   * @param {*} payload - Payload da misurare
   */
  _trackPayloadSize(payload) {
    if (!this._config.trackDistribution || !payload) return;
    
    try {
      // Calcola dimensione approssimativa
      let size = 0;
      
      if (typeof payload === 'string') {
        size = payload.length;
      } else if (Buffer.isBuffer(payload)) {
        size = payload.length;
      } else {
        // Approssimazione per oggetti
        size = JSON.stringify(payload).length;
      }
      
      // Incrementa il bucket appropriato
      if (size < 100) {
        this._distribution.payloadSizes['< 100B']++;
      } else if (size < 1024) {
        this._distribution.payloadSizes['100B - 1KB']++;
      } else if (size < 10 * 1024) {
        this._distribution.payloadSizes['1KB - 10KB']++;
      } else if (size < 100 * 1024) {
        this._distribution.payloadSizes['10KB - 100KB']++;
      } else if (size < 1024 * 1024) {
        this._distribution.payloadSizes['100KB - 1MB']++;
      } else {
        this._distribution.payloadSizes['> 1MB']++;
      }
    } catch (error) {
      logger.debug('Errore nel tracciamento dimensione payload:', error);
      // Non propagare errori di tracking
    }
  },
  
  /**
   * Traccia il tipo di query
   * @private
   * @param {string} query - Query da classificare
   */
  _trackQueryType(query) {
    if (!this._config.trackDistribution || !query) return;
    
    try {
      // Classificazione semplice basata su parole chiave
      let type = 'other';
      
      const normalizedQuery = query.toLowerCase().trim();
      
      if (normalizedQuery.startsWith('how') || normalizedQuery.startsWith('come')) {
        type = 'how-to';
      } else if (normalizedQuery.startsWith('what') || normalizedQuery.startsWith('che cosa') || normalizedQuery.startsWith('cosa')) {
        type = 'what-is';
      } else if (normalizedQuery.startsWith('why') || normalizedQuery.startsWith('perché')) {
        type = 'why';
      } else if (normalizedQuery.startsWith('when') || normalizedQuery.startsWith('quando')) {
        type = 'when';
      } else if (normalizedQuery.startsWith('where') || normalizedQuery.startsWith('dove')) {
        type = 'where';
      } else if (normalizedQuery.startsWith('who') || normalizedQuery.startsWith('chi')) {
        type = 'who';
      } else if (normalizedQuery.includes('example') || normalizedQuery.includes('esempio')) {
        type = 'example';
      } else if (normalizedQuery.includes('help') || normalizedQuery.includes('aiuto')) {
        type = 'help';
      }
      
      // Incrementa il contatore per questo tipo
      this._distribution.queryTypes[type] = (this._distribution.queryTypes[type] || 0) + 1;
    } catch (error) {
      logger.debug('Errore nel tracciamento tipo query:', error);
      // Non propagare errori di tracking
    }
  },
  
  /**
   * Aggiunge un campione di latenza
   * @private
   * @param {string} operation - Tipo di operazione
   * @param {number} duration - Durata in ms
   */
  _addLatencySample(operation, duration) {
    if (!this._config.enabled) return;
    
    try {
      // Aggiungi al bucket appropriato
      const key = `${operation}Latency`;
      
      if (this._performance[key]) {
        this._performance[key].push(duration);
        
        // Limita numero di campioni
        const maxSamples = 100;
        if (this._performance[key].length > maxSamples) {
          this._performance[key].shift();
        }
      }
    } catch (error) {
      logger.debug('Errore nell\'aggiunta campione latenza:', error);
      // Non propagare errori di tracking
    }
  },
  
  /**
   * Calcola statistiche di latenza
   * @private
   * @param {number[]} samples - Campioni di latenza
   * @returns {Object} Statistiche
   */
  _calculateLatencyStats(samples) {
    if (!samples || samples.length === 0) {
      return {
        avg: 0,
        min: 0,
        max: 0,
        p95: 0,
        p99: 0,
        count: 0
      };
    }
    
    // Ordina campioni per calcolo percentili
    const sortedSamples = [...samples].sort((a, b) => a - b);
    
    // Calcola statistiche
    const sum = sortedSamples.reduce((acc, val) => acc + val, 0);
    const avg = sum / sortedSamples.length;
    const min = sortedSamples[0];
    const max = sortedSamples[sortedSamples.length - 1];
    
    // Calcola percentili
    const p95Index = Math.floor(sortedSamples.length * 0.95);
    const p99Index = Math.floor(sortedSamples.length * 0.99);
    
    const p95 = sortedSamples[p95Index] || max;
    const p99 = sortedSamples[p99Index] || max;
    
    return {
      avg: parseFloat(avg.toFixed(2)),
      min,
      max,
      p95,
      p99,
      count: sortedSamples.length
    };
  },
  
  /**
   * Registra statistiche per operazione GET
   * @param {Object} data - Dati dell'operazione
   */
  recordGet(data) {
    if (!this._config.enabled || !data) return;
    
    try {
      // Incrementa contatori
      this._counters.get.total++;
      if (data.hit) {
        this._counters.get.hits++;
      } else {
        this._counters.get.misses++;
      }
      
      // Traccia latenza
      if (data.duration) {
        this._addLatencySample('get', data.duration);
      }
      
      // Traccia tipo query
      if (data.hit && data.query) {
        this._trackQueryType(data.query);
      }
      
      // Aggiungi alla storia
      this._addToHistory('get', {
        key: data.key,
        hit: data.hit,
        reason: data.reason,
        similarity: data.similarity,
        duration: data.duration
      });
    } catch (error) {
      logger.error('Errore durante il tracking statistiche GET:', error);
    }
  },
  
  /**
   * Registra statistiche per operazione SET
   * @param {Object} data - Dati dell'operazione
   */
  recordSet(data) {
    if (!this._config.enabled || !data) return;
    
    try {
      // Incrementa contatori
      this._counters.set.total++;
      if (data.success) {
        this._counters.set.success++;
      } else {
        this._counters.set.failed++;
      }
      
      // Traccia latenza
      if (data.duration) {
        this._addLatencySample('set', data.duration);
      }
      
      // Traccia dimensione
      if (data.size) {
        this._trackPayloadSize(data.size);
      }
      
      // Aggiungi alla storia
      this._addToHistory('set', {
        key: data.key,
        success: data.success,
        size: data.size,
        compressed: data.compressed,
        duration: data.duration
      });
    } catch (error) {
      logger.error('Errore durante il tracking statistiche SET:', error);
    }
  },
  
  /**
   * Registra statistiche per operazione REMOVE
   * @param {Object} data - Dati dell'operazione
   */
  recordRemove(data) {
    if (!this._config.enabled || !data) return;
    
    try {
      // Incrementa contatori
      this._counters.remove.total++;
      if (data.success) {
        this._counters.remove.success++;
      } else {
        this._counters.remove.failed++;
      }
      
      // Aggiungi alla storia
      this._addToHistory('remove', {
        key: data.key,
        success: data.success,
        reason: data.reason
      });
    } catch (error) {
      logger.error('Errore durante il tracking statistiche REMOVE:', error);
    }
  },
  
  /**
   * Registra statistiche per operazione CLEANUP
   * @param {Object} data - Dati dell'operazione
   */
  recordCleanup(data) {
    if (!this._config.enabled || !data) return;
    
    try {
      // Incrementa contatori
      this._counters.cleanup.total++;
      this._counters.cleanup.itemsRemoved += data.count || 0;
      
      // Traccia latenza
      if (data.duration) {
        this._addLatencySample('cleanup', data.duration);
      }
      
      // Aggiungi alla storia
      this._addToHistory('cleanup', {
        count: data.count,
        duration: data.duration
      });
    } catch (error) {
      logger.error('Errore durante il tracking statistiche CLEANUP:', error);
    }
  },
  
  /**
   * Registra statistiche per operazione CLEAR
   * @param {Object} data - Dati dell'operazione
   */
  recordClear(data) {
    if (!this._config.enabled || !data) return;
    
    try {
      // Incrementa contatori
      this._counters.clear.total++;
      if (data.success) {
        this._counters.clear.success++;
      } else {
        this._counters.clear.failed++;
      }
      
      // Aggiungi alla storia
      this._addToHistory('clear', {
        success: data.success,
        duration: data.duration
      });
    } catch (error) {
      logger.error('Errore durante il tracking statistiche CLEAR:', error);
    }
  },
  
  /**
   * Registra errori
   * @param {string} operation - Operazione che ha generato l'errore
   * @param {string} message - Messaggio di errore
   */
  recordError(operation, message) {
    if (!this._config.enabled) return;
    
    try {
      // Incrementa contatori
      this._counters.errors.total++;
      
      // Incrementa contatore specifico per operazione
      if (this._counters.errors[operation] !== undefined) {
        this._counters.errors[operation]++;
      }
      
      // Traccia tipo errore
      if (message) {
        const errorType = this._categorizeError(message);
        this._distribution.errorTypes[errorType] = 
          (this._distribution.errorTypes[errorType] || 0) + 1;
      }
      
      // Aggiungi alla storia
      this._addToHistory('error', {
        operation,
        message
      });
    } catch (error) {
      logger.error('Errore durante il tracking degli errori:', error);
    }
  },
  
  /**
   * Categorizza il messaggio di errore
   * @private
   * @param {string} message - Messaggio di errore
   * @returns {string} Categoria di errore
   */
  _categorizeError(message) {
    if (!message) return 'unknown';
    
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      return 'timeout';
    } else if (lowerMessage.includes('not found') || lowerMessage.includes('non trovato')) {
      return 'not_found';
    } else if (lowerMessage.includes('permission') || lowerMessage.includes('denied') || 
               lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
      return 'permission';
    } else if (lowerMessage.includes('disk') || lowerMessage.includes('storage') || 
               lowerMessage.includes('space') || lowerMessage.includes('quota')) {
      return 'storage';
    } else if (lowerMessage.includes('memory') || lowerMessage.includes('out of memory')) {
      return 'memory';
    } else if (lowerMessage.includes('parse') || lowerMessage.includes('json') ||
               lowerMessage.includes('syntax') || lowerMessage.includes('unexpected')) {
      return 'parsing';
    } else if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
      return 'network';
    }
    
    return 'other';
  },
  
  /**
   * Ottiene tutte le statistiche
   * @returns {Object} Statistiche complete
   */
  getStats() {
    if (!this._config.enabled) {
      return {
        enabled: false,
        message: 'Statistiche disabilitate'
      };
    }
    
    try {
      // Calcola hit rate
      const hitRate = this._counters.get.total > 0 ? 
        (this._counters.get.hits / this._counters.get.total) * 100 : 0;
      
      // Calcola statistiche latenza
      const latencyStats = {
        get: this._calculateLatencyStats(this._performance.getLatency),
        set: this._calculateLatencyStats(this._performance.setLatency),
        remove: this._calculateLatencyStats(this._performance.removeLatency),
        cleanup: this._calculateLatencyStats(this._performance.cleanupLatency)
      };
      
      return {
        enabled: this._config.enabled,
        startTime: this._startTime,
        uptime: Date.now() - this._startTime,
        counters: this._counters,
        rates: {
          hitRate: parseFloat(hitRate.toFixed(2)),
          missRate: parseFloat((100 - hitRate).toFixed(2)),
          setSuccessRate: this._counters.set.total > 0 ? 
            parseFloat(((this._counters.set.success / this._counters.set.total) * 100).toFixed(2)) : 0,
          errorRate: (this._counters.get.total + this._counters.set.total) > 0 ?
            parseFloat(((this._counters.errors.total / (this._counters.get.total + this._counters.set.total)) * 100).toFixed(4)) : 0
        },
        latency: latencyStats,
        distribution: this._distribution,
        history: this._history.slice(0, 10) // Limita per output
      };
    } catch (error) {
      logger.error('Errore durante il recupero delle statistiche:', error);
      return {
        enabled: this._config.enabled,
        error: 'Errore durante il recupero delle statistiche',
        errorMessage: error.message
      };
    }
  },
  
  /**
   * Ottiene la storia degli eventi
   * @param {number} [limit=10] - Numero massimo di eventi
   * @returns {Array} Eventi recenti
   */
  getHistory(limit = 10) {
    if (!this._config.enabled) return [];
    
    return this._history.slice(0, limit);
  },
  
  /**
   * Azzera le statistiche
   * @returns {boolean} True se l'operazione è riuscita
   */
  resetStats() {
    try {
      this._resetStats();
      logger.info('Statistiche resettate');
      return true;
    } catch (error) {
      logger.error('Errore durante il reset delle statistiche:', error);
      return false;
    }
  },
  
  /**
   * Modifica la configurazione a runtime
   * @param {Object} config - Nuove impostazioni di configurazione
   * @returns {boolean} True se l'operazione è riuscita
   */
  updateConfig(config) {
    try {
      if (!config) return false;
      
      // Applica solo le chiavi valide
      for (const key in config) {
        if (key in this._config) {
          const oldValue = this._config[key];
          this._config[key] = config[key];
          
          logger.debug(`Configurazione aggiornata: ${key} = ${config[key]} (era: ${oldValue})`);
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Errore durante l\'aggiornamento della configurazione:', error);
      return false;
    }
  }
};

module.exports = statsService;