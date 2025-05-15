/**
 * modules/core/core-index.js
 * Modulo Core - Funzionalità di base dell'applicazione
 * 
 * Questo modulo fornisce:
 * - Gestione della configurazione globale
 * - Sistema di gestione eventi centralizzato
 * - Funzionalità di base condivise tra moduli
 * - Metriche e monitoraggio delle performance
 */

const logger = require('../../utils/logger').getLogger('core:index');
const configService = require('./core-config');
const eventsService = require('./core-events');
const metricsService = require('./core-metrics');
const utilsService = require('./core-utils');

/**
 * Modulo Core - Espone le funzionalità di base dell'applicazione Lulu
 */
const coreModule = {
  /**
   * Inizializza il modulo core
   * @param {Object} config - Configurazione del modulo
   * @returns {Object} - Istanza del modulo
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione modulo core');
    
    try {
      // Inizializza i servizi in ordine di dipendenza
      logger.debug('Inizializzazione servizio di configurazione');
      await configService.initialize();
      
      logger.debug('Inizializzazione servizio eventi');
      await eventsService.initialize();
      
      logger.debug('Inizializzazione servizio metriche');
      await metricsService.initialize({
        enabled: true,
        samplingRate: 0.1,
        ...config.metrics
      });
      
      logger.debug('Inizializzazione utility condivise');
      await utilsService.initialize();
      
      // Registra handler per eventi di sistema
      this._registerSystemEventHandlers();
      
      logger.info('Modulo core inizializzato con successo');
      
      // Emetti evento di inizializzazione completata
      eventsService.emit('core:initialized', { timestamp: Date.now() });
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del modulo core:', error);
      throw error;
    }
  },
  
  /**
   * Chiude in modo ordinato il modulo core
   */
  async shutdown() {
    logger.info('Chiusura modulo core');
    
    try {
      // Emetti evento di chiusura imminente
      eventsService.emit('core:shutdown:start', { timestamp: Date.now() });
      
      // Chiudi i servizi in ordine inverso
      logger.debug('Chiusura servizio utilità');
      await utilsService.shutdown();
      
      logger.debug('Chiusura servizio metriche');
      await metricsService.shutdown();
      
      logger.debug('Chiusura servizio eventi');
      await eventsService.shutdown();
      
      logger.debug('Chiusura servizio configurazione');
      await configService.shutdown();
      
      logger.info('Modulo core chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del modulo core:', error);
      throw error;
    }
  },
  
  /**
   * Restituisce lo stato attuale del modulo
   * @returns {Object} Stato del modulo
   */
  status() {
    return {
      active: true,
      services: {
        config: configService.isActive(),
        events: eventsService.isActive(),
        metrics: metricsService.isActive(),
        utils: utilsService.isActive()
      },
      metrics: metricsService.getMetrics(),
      uptime: process.uptime()
    };
  },
  
  /**
   * Registra gli handler per eventi di sistema
   * @private
   */
  _registerSystemEventHandlers() {
    // Gestione degli eventi di processo
    process.on('warning', (warning) => {
      logger.warn('Warning di sistema rilevato:', { 
        name: warning.name, 
        message: warning.message 
      });
      metricsService.increment('warnings');
    });
    
    // Gestione degli eventi di modulo
    eventsService.on('module:loaded', (data) => {
      logger.debug(`Modulo caricato: ${data.name}`);
      metricsService.increment('modules.loaded');
    });
    
    eventsService.on('module:error', (data) => {
      logger.warn(`Errore nel modulo ${data.name}:`, { error: data.error });
      metricsService.increment('modules.errors');
    });
  },
  
  // Proprietà pubbliche esposte dal modulo
  config: configService,
  events: eventsService,
  metrics: metricsService,
  utils: utilsService,
  
  /**
   * Ottiene una configurazione dal servizio configurazione
   * @param {string} key - Chiave di configurazione
   * @param {*} defaultValue - Valore di default se non trovata
   * @returns {*} Valore di configurazione
   */
  getConfig(key, defaultValue) {
    return configService.get(key, defaultValue);
  },
  
  /**
   * Imposta una configurazione nel servizio configurazione
   * @param {string} key - Chiave di configurazione
   * @param {*} value - Valore di configurazione
   */
  setConfig(key, value) {
    configService.set(key, value);
    eventsService.emit('config:changed', { key, value });
  },
  
  /**
   * Registra un listener per un evento
   * @param {string} event - Nome dell'evento
   * @param {Function} callback - Funzione di callback
   */
  on(event, callback) {
    eventsService.on(event, callback);
  },
  
  /**
   * Emette un evento
   * @param {string} event - Nome dell'evento
   * @param {*} data - Dati dell'evento
   */
  emit(event, data) {
    eventsService.emit(event, data);
  },
  
  /**
   * Incrementa un contatore metrica
   * @param {string} name - Nome della metrica
   * @param {number} value - Valore di incremento (default: 1)
   */
  incrementMetric(name, value = 1) {
    metricsService.increment(name, value);
  },
  
  /**
   * Registra un valore di metrica
   * @param {string} name - Nome della metrica
   * @param {number} value - Valore da registrare
   */
  recordMetric(name, value) {
    metricsService.record(name, value);
  }
};

module.exports = coreModule;