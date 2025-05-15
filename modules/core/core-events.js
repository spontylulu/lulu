/**
 * modules/core/core-events.js
 * Sistema di gestione eventi centralizzato per Lulu
 * 
 * Implementa un bus di eventi che permette la comunicazione tra diversi moduli
 * dell'applicazione in modo disaccoppiato, seguendo il pattern publisher-subscriber.
 */

const logger = require('../../utils/logger').getLogger('core:events');
const EventEmitter = require('events');

/**
 * Servizio di gestione eventi
 * Fornisce un sistema di eventi centralizzato per la comunicazione tra moduli
 */
const eventsService = {
  // EventEmitter interno
  _eventEmitter: new EventEmitter(),
  
  // Flag per tracciare lo stato del servizio
  _active: false,
  
  // Tracciamento degli eventi registrati
  _registeredEvents: new Map(),
  
  // Configurazione
  _config: {
    maxListeners: 20,          // Numero massimo di listener per evento
    warnThreshold: 10,         // Soglia per avvisi di listener
    historySize: 100,          // Dimensione storia eventi
    historyEnabled: true,      // Storia degli eventi attivata
    debugModeEnabled: false    // Modalità debug
  },
  
  // Storia degli eventi emessi
  _eventHistory: [],
  
  /**
   * Inizializza il servizio eventi
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio eventi');
    
    try {
      // Applica la configurazione personalizzata
      this._config = {
        ...this._config,
        ...config
      };
      
      // Configura l'EventEmitter
      this._eventEmitter.setMaxListeners(this._config.maxListeners);
      
      // Reset dello stato
      this._registeredEvents.clear();
      this._eventHistory = [];
      
      // Registra handler per gestire listener dinamici
      this._setupListenerMonitoring();
      
      this._active = true;
      logger.info('Servizio eventi inizializzato con successo');
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio eventi:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio eventi
   */
  async shutdown() {
    logger.info('Chiusura servizio eventi');
    
    try {
      // Emetti evento di chiusura
      this.emit('events:shutdown', { timestamp: Date.now() });
      
      // Rimuovi tutti i listener
      this.removeAllListeners();
      
      this._active = false;
      logger.info('Servizio eventi chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio eventi:', error);
      throw error;
    }
  },
  
  /**
   * Verifica se il servizio è attivo
   * @returns {boolean} Stato di attività del servizio
   */
  isActive() {
    return this._active;
  },
  
  /**
   * Configura il monitoraggio dei listener per rilevare potenziali memory leak
   * @private
   */
  _setupListenerMonitoring() {
    // Sovrascrive i metodi di EventEmitter per tracciare i listener
    const originalAddListener = this._eventEmitter.addListener;
    const originalRemoveListener = this._eventEmitter.removeListener;
    const self = this;
    
    // Sovrascrive addListener/on
    this._eventEmitter.addListener = this._eventEmitter.on = function(event, listener) {
      // Registra l'evento se è nuovo
      if (!self._registeredEvents.has(event)) {
        self._registeredEvents.set(event, new Set());
      }
      
      // Aggiungi il listener all'insieme
      self._registeredEvents.get(event).add(listener);
      
      // Controlla se abbiamo troppi listener
      const listenerCount = self._registeredEvents.get(event).size;
      if (listenerCount >= self._config.warnThreshold) {
        logger.warn(`Possibile memory leak: ${listenerCount} listener per l'evento "${event}"`);
      }
      
      // Chiama il metodo originale
      return originalAddListener.call(this, event, listener);
    };
    
    // Sovrascrive removeListener
    this._eventEmitter.removeListener = this._eventEmitter.off = function(event, listener) {
      // Rimuovi il listener dal set
      if (self._registeredEvents.has(event)) {
        self._registeredEvents.get(event).delete(listener);
        
        // Se non ci sono più listener, rimuovi l'evento
        if (self._registeredEvents.get(event).size === 0) {
          self._registeredEvents.delete(event);
        }
      }
      
      // Chiama il metodo originale
      return originalRemoveListener.call(this, event, listener);
    };
  },
  
  /**
   * Registra un listener per un evento
   * @param {string} event - Nome dell'evento
   * @param {Function} listener - Funzione di callback
   * @param {Object} options - Opzioni del listener
   * @param {boolean} options.once - Se il listener deve essere eseguito una sola volta
   * @param {string} options.description - Descrizione del listener per debug
   * @returns {Object} Servizio eventi per chaining
   */
  on(event, listener, options = {}) {
    if (!this._active) {
      logger.warn('Tentativo di registrare listener mentre il servizio è inattivo');
      return this;
    }
    
    try {
      // Wrap del listener per il logging in modalità debug
      const wrappedListener = (data) => {
        if (this._config.debugModeEnabled) {
          const start = Date.now();
          listener(data);
          const duration = Date.now() - start;
          
          if (duration > 50) { // Logging solo per operazioni lente
            logger.debug(`Listener per "${event}" eseguito in ${duration}ms`, {
              description: options.description || 'N/A',
              dataKeys: data ? Object.keys(data) : []
            });
          }
        } else {
          listener(data);
        }
      };
      
      // Aggiungi metadati al listener per il debugging
      wrappedListener._description = options.description;
      wrappedListener._originalListener = listener;
      
      // Registra in base alle opzioni
      if (options.once) {
        this._eventEmitter.once(event, wrappedListener);
      } else {
        this._eventEmitter.on(event, wrappedListener);
      }
      
      return this;
    } catch (error) {
      logger.error(`Errore durante la registrazione del listener per "${event}":`, error);
      return this;
    }
  },
  
  /**
   * Registra un listener che viene eseguito una sola volta
   * @param {string} event - Nome dell'evento
   * @param {Function} listener - Funzione di callback
   * @param {Object} options - Opzioni del listener
   * @returns {Object} Servizio eventi per chaining
   */
  once(event, listener, options = {}) {
    return this.on(event, listener, { ...options, once: true });
  },
  
  /**
   * Rimuove un listener per un evento
   * @param {string} event - Nome dell'evento
   * @param {Function} listener - Funzione di callback da rimuovere
   * @returns {Object} Servizio eventi per chaining
   */
  off(event, listener) {
    if (!this._active) {
      logger.warn('Tentativo di rimuovere listener mentre il servizio è inattivo');
      return this;
    }
    
    try {
      this._eventEmitter.off(event, listener);
      return this;
    } catch (error) {
      logger.error(`Errore durante la rimozione del listener per "${event}":`, error);
      return this;
    }
  },
  
  /**
   * Rimuove tutti i listener per un evento o tutti gli eventi
   * @param {string} [event] - Nome dell'evento (opzionale)
   * @returns {Object} Servizio eventi per chaining
   */
  removeAllListeners(event) {
    if (!this._active) {
      logger.warn('Tentativo di rimuovere tutti i listener mentre il servizio è inattivo');
      return this;
    }
    
    try {
      if (event) {
        logger.debug(`Rimozione di tutti i listener per l'evento "${event}"`);
        this._eventEmitter.removeAllListeners(event);
        this._registeredEvents.delete(event);
      } else {
        logger.debug('Rimozione di tutti i listener per tutti gli eventi');
        this._eventEmitter.removeAllListeners();
        this._registeredEvents.clear();
      }
      
      return this;
    } catch (error) {
      logger.error(`Errore durante la rimozione di tutti i listener ${event ? `per "${event}"` : ''}:`, error);
      return this;
    }
  },
  
  /**
   * Emette un evento
   * @param {string} event - Nome dell'evento
   * @param {*} data - Dati da passare ai listener
   * @returns {boolean} True se ci sono listener per l'evento
   */
  emit(event, data = {}) {
    if (!this._active) {
      logger.warn(`Tentativo di emettere evento "${event}" mentre il servizio è inattivo`);
      return false;
    }
    
    try {
      // Aggiungi timestamp e metadati all'evento
      const eventData = {
        ...data,
        _meta: {
          timestamp: Date.now(),
          event
        }
      };
      
      // Registra evento nella history se abilitata
      if (this._config.historyEnabled) {
        this._recordEventHistory(event, eventData);
      }
      
      // Log in modalità debug
      if (this._config.debugModeEnabled) {
        logger.debug(`Emissione evento "${event}"`, {
          hasListeners: this._eventEmitter.listenerCount(event) > 0,
          dataKeys: Object.keys(data)
        });
      }
      
      // Emetti l'evento
      return this._eventEmitter.emit(event, eventData);
    } catch (error) {
      logger.error(`Errore durante l'emissione dell'evento "${event}":`, error);
      return false;
    }
  },
  
  /**
   * Registra un evento nella storia
   * @private
   * @param {string} event - Nome dell'evento
   * @param {*} data - Dati dell'evento
   */
  _recordEventHistory(event, data) {
    // Crea record per la storia
    const historyRecord = {
      event,
      timestamp: data._meta.timestamp,
      data: { ...data }
    };
    
    // Aggiungi alla storia
    this._eventHistory.unshift(historyRecord);
    
    // Limita la dimensione della storia
    if (this._eventHistory.length > this._config.historySize) {
      this._eventHistory.pop();
    }
  },
  
  /**
   * Ottiene la storia degli eventi
   * @param {Object} options - Opzioni di filtraggio
   * @param {string} options.event - Filtra per nome evento
   * @param {number} options.limit - Numero massimo di eventi da restituire
   * @param {number} options.since - Timestamp minimo
   * @returns {Array} Storia degli eventi filtrata
   */
  getHistory(options = {}) {
    if (!this._config.historyEnabled) {
      logger.warn('Richiesta storia eventi ma la funzionalità è disabilitata');
      return [];
    }
    
    try {
      let filteredHistory = this._eventHistory;
      
      // Filtra per nome evento
      if (options.event) {
        filteredHistory = filteredHistory.filter(record => record.event === options.event);
      }
      
      // Filtra per timestamp
      if (options.since) {
        filteredHistory = filteredHistory.filter(record => record.timestamp >= options.since);
      }
      
      // Limita il numero di risultati
      if (options.limit) {
        filteredHistory = filteredHistory.slice(0, options.limit);
      }
      
      return filteredHistory;
    } catch (error) {
      logger.error('Errore durante il recupero della storia eventi:', error);
      return [];
    }
  },
  
  /**
   * Imposta la modalità debug
   * @param {boolean} enabled - Se abilitare la modalità debug
   * @returns {Object} Servizio eventi per chaining
   */
  setDebugMode(enabled) {
    this._config.debugModeEnabled = !!enabled;
    logger.info(`Modalità debug ${enabled ? 'abilitata' : 'disabilitata'}`);
    return this;
  },
  
  /**
   * Attiva o disattiva la storia degli eventi
   * @param {boolean} enabled - Se abilitare la storia
   * @returns {Object} Servizio eventi per chaining
   */
  setHistoryEnabled(enabled) {
    this._config.historyEnabled = !!enabled;
    logger.info(`Storia eventi ${enabled ? 'abilitata' : 'disabilitata'}`);
    
    // Reset della storia se disabilitata
    if (!enabled) {
      this._eventHistory = [];
    }
    
    return this;
  },
  
  /**
   * Ottiene statistiche sugli eventi registrati
   * @returns {Object} Statistiche eventi
   */
  getStats() {
    const eventsStats = {};
    
    for (const [event, listeners] of this._registeredEvents.entries()) {
      eventsStats[event] = {
        listenerCount: listeners.size,
        isWarning: listeners.size >= this._config.warnThreshold
      };
    }
    
    return {
      totalEvents: this._registeredEvents.size,
      totalListeners: Array.from(this._registeredEvents.values())
        .reduce((sum, listeners) => sum + listeners.size, 0),
      eventsWithMostListeners: Object.entries(eventsStats)
        .sort((a, b) => b[1].listenerCount - a[1].listenerCount)
        .slice(0, 5)
        .map(([event, stats]) => ({
          event,
          listenerCount: stats.listenerCount
        })),
      historySize: this._eventHistory.length,
      historyEnabled: this._config.historyEnabled,
      debugModeEnabled: this._config.debugModeEnabled
    };
  }
};

// Alias per compatibilità con Node.js EventEmitter
eventsService.addListener = eventsService.on;
eventsService.removeListener = eventsService.off;

module.exports = eventsService;