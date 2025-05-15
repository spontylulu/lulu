/**
 * modules/core/core-metrics.js
 * Servizio di metriche e monitoraggio per Lulu
 * 
 * Fornisce funzionalità per tracciare e analizzare metriche di performance
 * e di utilizzo dell'applicazione in modo centralizzato.
 */

const logger = require('../../utils/logger').getLogger('core:metrics');

/**
 * Servizio di metriche
 * Implementa un sistema di raccolta e analisi metriche per monitorare le performance
 */
const metricsService = {
  // Flag per tracciare lo stato del servizio
  _active: false,
  
  // Configurazione di default
  _config: {
    enabled: true,              // Se il servizio è attivo
    samplingRate: 1.0,          // Tasso di campionamento (1.0 = 100%)
    historySize: 100,           // Numero di punti storici per metrica
    cleanupInterval: 3600000,   // Pulizia metrica inattive (1h)
    reportingInterval: 60000,   // Intervallo di report (1m)
    alertThresholds: {}         // Soglie di allerta per metriche
  },
  
  // Store per le metriche
  _metrics: {
    counters: {},        // Contatori (incrementali)
    gauges: {},          // Valori puntuali
    timers: {},          // Misurazioni temporali
    histograms: {}       // Distribuzioni di valori
  },
  
  // Store per dati storici
  _history: {},
  
  // Timer per cleanup e reporting
  _timers: {
    cleanup: null,
    reporting: null
  },
  
  /**
   * Inizializza il servizio metriche
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio metriche');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Se disabilitato, termina qui
      if (!this._config.enabled) {
        logger.info('Servizio metriche disabilitato da configurazione');
        return this;
      }
      
      // Reset dello stato
      this._resetMetrics();
      
      // Inizializza metriche di sistema
      this._initSystemMetrics();
      
      // Avvia timer per cleanup e reporting
      this._startTimers();
      
      this._active = true;
      logger.info('Servizio metriche inizializzato con successo');
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio metriche:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio metriche
   */
  async shutdown() {
    logger.info('Chiusura servizio metriche');
    
    try {
      // Interrompi i timer
      this._stopTimers();
      
      // Report finale
      if (this._config.enabled) {
        this._generateReport();
      }
      
      this._active = false;
      logger.info('Servizio metriche chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio metriche:', error);
      throw error;
    }
  },
  
  /**
   * Verifica se il servizio è attivo
   * @returns {boolean} Stato di attività del servizio
   */
  isActive() {
    return this._active && this._config.enabled;
  },
  
  /**
   * Resetta lo stato delle metriche
   * @private
   */
  _resetMetrics() {
    this._metrics = {
      counters: {},        // Contatori (incrementali)
      gauges: {},          // Valori puntuali
      timers: {},          // Misurazioni temporali
      histograms: {}       // Distribuzioni di valori
    };
    
    this._history = {};
    
    // Interrompi i timer esistenti
    this._stopTimers();
  },
  
  /**
   * Inizializza le metriche di sistema
   * @private
   */
  _initSystemMetrics() {
    // Timestamp di avvio
    this.gauge('system.startTime', Date.now());
    this.gauge('system.version', process.env.npm_package_version || '1.0.0');
    
    // Versione Node.js
    this.gauge('system.nodejs.version', process.version);
    
    // Intervalli per metriche di sistema
    setInterval(() => {
      // Memoria
      const memoryUsage = process.memoryUsage();
      this.gauge('system.memory.rss', memoryUsage.rss);
      this.gauge('system.memory.heapTotal', memoryUsage.heapTotal);
      this.gauge('system.memory.heapUsed', memoryUsage.heapUsed);
      this.gauge('system.memory.external', memoryUsage.external);
      
      // Uptime
      this.gauge('system.uptime', process.uptime());
      
      // CPU (utilizzo relativo)
      const cpuUsage = process.cpuUsage();
      this.gauge('system.cpu.user', cpuUsage.user);
      this.gauge('system.cpu.system', cpuUsage.system);
    }, 10000); // Ogni 10 secondi
  },
  
  /**
   * Avvia i timer per cleanup e reporting
   * @private
   */
  _startTimers() {
    // Cleanup metriche inattive
    if (this._config.cleanupInterval > 0) {
      this._timers.cleanup = setInterval(() => {
        this._cleanupInactiveMetrics();
      }, this._config.cleanupInterval);
    }
    
    // Reporting periodico
    if (this._config.reportingInterval > 0) {
      this._timers.reporting = setInterval(() => {
        this._generateReport();
      }, this._config.reportingInterval);
    }
  },
  
  /**
   * Interrompe i timer attivi
   * @private
   */
  _stopTimers() {
    if (this._timers.cleanup) {
      clearInterval(this._timers.cleanup);
      this._timers.cleanup = null;
    }
    
    if (this._timers.reporting) {
      clearInterval(this._timers.reporting);
      this._timers.reporting = null;
    }
  },
  
  /**
   * Esegue pulizia delle metriche inattive
   * @private
   */
  _cleanupInactiveMetrics() {
    logger.debug('Esecuzione pulizia metriche inattive');
    
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 ore
    
    // Pulizia contatori inattivi
    for (const [key, counter] of Object.entries(this._metrics.counters)) {
      if (counter.lastUpdated && (now - counter.lastUpdated > maxAge)) {
        logger.debug(`Rimozione contatore inattivo: ${key}`);
        delete this._metrics.counters[key];
      }
    }
    
    // Pulizia gauge inattivi
    for (const [key, gauge] of Object.entries(this._metrics.gauges)) {
      if (key.startsWith('system.')) continue; // Mantieni metriche di sistema
      
      if (gauge.lastUpdated && (now - gauge.lastUpdated > maxAge)) {
        logger.debug(`Rimozione gauge inattivo: ${key}`);
        delete this._metrics.gauges[key];
      }
    }
    
    // Pulizia timer inattivi
    for (const [key, timer] of Object.entries(this._metrics.timers)) {
      if (timer.lastUpdated && (now - timer.lastUpdated > maxAge)) {
        logger.debug(`Rimozione timer inattivo: ${key}`);
        delete this._metrics.timers[key];
      }
    }
    
    // Pulizia istogrammi inattivi
    for (const [key, histogram] of Object.entries(this._metrics.histograms)) {
      if (histogram.lastUpdated && (now - histogram.lastUpdated > maxAge)) {
        logger.debug(`Rimozione istogramma inattivo: ${key}`);
        delete this._metrics.histograms[key];
      }
    }
  },
  
  /**
   * Genera un report delle metriche
   * @private
   */
  _generateReport() {
    if (!this._active || !this._config.enabled) return;
    
    try {
      const report = this.getMetrics();
      
      // Log delle metriche principali
      logger.info('Report metriche:', {
        counters: Object.keys(report.counters).length,
        gauges: Object.keys(report.gauges).length,
        timers: Object.keys(report.timers).length,
        histograms: Object.keys(report.histograms).length
      });
      
      // Verifica soglie di allarme
      this._checkAlertThresholds(report);
      
    } catch (error) {
      logger.error('Errore durante la generazione del report metriche:', error);
    }
  },
  
  /**
   * Verifica le soglie di allarme per le metriche
   * @private
   * @param {Object} report - Report metriche
   */
  _checkAlertThresholds(report) {
    for (const [metricPath, threshold] of Object.entries(this._config.alertThresholds)) {
      try {
        // Determina tipo di metrica e verifica esistenza
        const parts = metricPath.split('.');
        const type = parts[0];
        const name = parts.slice(1).join('.');
        
        if (!report[type] || !report[type][name]) continue;
        
        const metric = report[type][name];
        let value;
        
        // Estrai il valore appropriato in base al tipo
        switch (type) {
          case 'counters':
            value = metric.value;
            break;
          case 'gauges':
            value = metric.value;
            break;
          case 'timers':
            value = metric.avg || 0;
            break;
          case 'histograms':
            value = metric.avg || 0;
            break;
          default:
            continue;
        }
        
        // Verifica condizione
        if ((threshold.operator === '>' && value > threshold.value) ||
            (threshold.operator === '<' && value < threshold.value) ||
            (threshold.operator === '>=' && value >= threshold.value) ||
            (threshold.operator === '<=' && value <= threshold.value) ||
            (threshold.operator === '=' && value === threshold.value)) {
          
          logger.warn(`Soglia di allarme superata: ${metricPath} ${threshold.operator} ${threshold.value} (valore attuale: ${value})`, {
            metric: metricPath,
            thresholdValue: threshold.value,
            thresholdOperator: threshold.operator,
            currentValue: value,
            severity: threshold.severity || 'warning'
          });
        }
      } catch (error) {
        logger.error(`Errore durante la verifica della soglia per ${metricPath}:`, error);
      }
    }
  },
  
  /**
   * Determina se un'operazione deve essere campionata
   * @private
   * @returns {boolean} True se l'operazione deve essere campionata
   */
  _shouldSample() {
    return this._active && 
           this._config.enabled && 
           Math.random() < this._config.samplingRate;
  },
  
  /**
   * Aggiorna la storia di una metrica
   * @private
   * @param {string} type - Tipo di metrica (counters, gauges, ...)
   * @param {string} name - Nome della metrica
   * @param {*} value - Valore attuale
   */
  _updateHistory(type, name, value) {
    const key = `${type}.${name}`;
    
    if (!this._history[key]) {
      this._history[key] = [];
    }
    
    // Aggiungi punto storico
    this._history[key].push({
      timestamp: Date.now(),
      value
    });
    
    // Limita dimensione storia
    if (this._history[key].length > this._config.historySize) {
      this._history[key].shift();
    }
  },
  
  /**
   * Incrementa un contatore
   * @param {string} name - Nome del contatore
   * @param {number} [value=1] - Valore di incremento
   * @returns {number} Nuovo valore del contatore
   */
  increment(name, value = 1) {
    if (!this._shouldSample()) return 0;
    
    try {
      // Crea il contatore se non esiste
      if (!this._metrics.counters[name]) {
        this._metrics.counters[name] = {
          value: 0,
          lastUpdated: null
        };
      }
      
      // Incrementa il valore
      this._metrics.counters[name].value += value;
      this._metrics.counters[name].lastUpdated = Date.now();
      
      // Aggiorna storia
      this._updateHistory('counters', name, this._metrics.counters[name].value);
      
      return this._metrics.counters[name].value;
    } catch (error) {
      logger.error(`Errore durante l'incremento del contatore ${name}:`, error);
      return 0;
    }
  },
  
  /**
   * Decrementa un contatore
   * @param {string} name - Nome del contatore
   * @param {number} [value=1] - Valore di decremento
   * @returns {number} Nuovo valore del contatore
   */
  decrement(name, value = 1) {
    return this.increment(name, -value);
  },
  
  /**
   * Imposta un gauge (valore puntuale)
   * @param {string} name - Nome del gauge
   * @param {number} value - Valore da impostare
   * @returns {number} Valore impostato
   */
  gauge(name, value) {
    if (!this._shouldSample()) return 0;
    
    try {
      // Crea il gauge se non esiste
      if (!this._metrics.gauges[name]) {
        this._metrics.gauges[name] = {
          value: 0,
          lastUpdated: null
        };
      }
      
      // Imposta il valore
      this._metrics.gauges[name].value = value;
      this._metrics.gauges[name].lastUpdated = Date.now();
      
      // Aggiorna storia
      this._updateHistory('gauges', name, value);
      
      return value;
    } catch (error) {
      logger.error(`Errore durante l'impostazione del gauge ${name}:`, error);
      return 0;
    }
  },
  
  /**
   * Registra un valore temporale (timer)
   * @param {string} name - Nome del timer
   * @param {number} value - Durata in millisecondi
   * @returns {Object} Statistiche aggiornate del timer
   */
  timing(name, value) {
    if (!this._shouldSample()) return {};
    
    try {
      // Crea il timer se non esiste
      if (!this._metrics.timers[name]) {
        this._metrics.timers[name] = {
          count: 0,
          sum: 0,
          min: Infinity,
          max: -Infinity,
          avg: 0,
          lastValue: null,
          lastUpdated: null
        };
      }
      
      const timer = this._metrics.timers[name];
      
      // Aggiorna statistiche
      timer.count++;
      timer.sum += value;
      timer.min = Math.min(timer.min, value);
      timer.max = Math.max(timer.max, value);
      timer.avg = timer.sum / timer.count;
      timer.lastValue = value;
      timer.lastUpdated = Date.now();
      
      // Aggiorna storia
      this._updateHistory('timers', name, value);
      
      return {
        count: timer.count,
        avg: timer.avg,
        min: timer.min,
        max: timer.max,
        lastValue: timer.lastValue
      };
    } catch (error) {
      logger.error(`Errore durante la registrazione del timer ${name}:`, error);
      return {};
    }
  },
  
  /**
   * Misura il tempo di esecuzione di una funzione
   * @param {string} name - Nome del timer
   * @param {Function} fn - Funzione da misurare
   * @returns {*} Risultato della funzione
   */
  time(name, fn) {
    if (!this._shouldSample()) return fn();
    
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      this.timing(name, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.timing(`${name}.error`, duration);
      throw error;
    }
  },
  
  /**
   * Misura il tempo di esecuzione di una funzione asincrona
   * @param {string} name - Nome del timer
   * @param {Function} asyncFn - Funzione asincrona da misurare
   * @returns {Promise<*>} Risultato della funzione asincrona
   */
  async timeAsync(name, asyncFn) {
    if (!this._shouldSample()) return asyncFn();
    
    const start = Date.now();
    try {
      const result = await asyncFn();
      const duration = Date.now() - start;
      this.timing(name, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.timing(`${name}.error`, duration);
      throw error;
    }
  },
  
  /**
   * Registra un valore in un istogramma
   * @param {string} name - Nome dell'istogramma
   * @param {number} value - Valore da registrare
   * @returns {Object} Statistiche aggiornate dell'istogramma
   */
  record(name, value) {
    if (!this._shouldSample()) return {};
    
    try {
      // Crea l'istogramma se non esiste
      if (!this._metrics.histograms[name]) {
        this._metrics.histograms[name] = {
          count: 0,
          sum: 0,
          min: Infinity,
          max: -Infinity,
          avg: 0,
          values: [],
          lastUpdated: null
        };
      }
      
      const histogram = this._metrics.histograms[name];
      
      // Aggiorna statistiche
      histogram.count++;
      histogram.sum += value;
      histogram.min = Math.min(histogram.min, value);
      histogram.max = Math.max(histogram.max, value);
      histogram.avg = histogram.sum / histogram.count;
      histogram.lastUpdated = Date.now();
      
      // Aggiorna valori (mantieni ultimi 100)
      histogram.values.push(value);
      if (histogram.values.length > 100) {
        histogram.values.shift();
      }
      
      // Aggiorna storia
      this._updateHistory('histograms', name, value);
      
      return {
        count: histogram.count,
        avg: histogram.avg,
        min: histogram.min,
        max: histogram.max
      };
    } catch (error) {
      logger.error(`Errore durante la registrazione del valore nell'istogramma ${name}:`, error);
      return {};
    }
  },
  
  /**
   * Ottiene lo stato attuale di una metrica
   * @param {string} type - Tipo di metrica (counters, gauges, timers, histograms)
   * @param {string} name - Nome della metrica
   * @returns {Object|null} Stato della metrica o null se non trovata
   */
  getMetric(type, name) {
    if (!this._metrics[type] || !this._metrics[type][name]) {
      return null;
    }
    
    const metric = { ...this._metrics[type][name] };
    
    // Aggiungi storia se disponibile
    const historyKey = `${type}.${name}`;
    if (this._history[historyKey]) {
      metric.history = [...this._history[historyKey]];
    }
    
    return metric;
  },
  
  /**
   * Ottiene tutte le metriche
   * @param {boolean} [includeHistory=false] - Se includere la storia delle metriche
   * @returns {Object} Tutte le metriche
   */
  getMetrics(includeHistory = false) {
    const metrics = {
      counters: {},
      gauges: {},
      timers: {},
      histograms: {},
      _meta: {
        timestamp: Date.now(),
        samplingRate: this._config.samplingRate
      }
    };
    
    // Copia contatori
    for (const [name, counter] of Object.entries(this._metrics.counters)) {
      metrics.counters[name] = { ...counter };
      
      // Aggiungi storia se richiesta
      if (includeHistory && this._history[`counters.${name}`]) {
        metrics.counters[name].history = [...this._history[`counters.${name}`]];
      }
    }
    
    // Copia gauge
    for (const [name, gauge] of Object.entries(this._metrics.gauges)) {
      metrics.gauges[name] = { ...gauge };
      
      // Aggiungi storia se richiesta
      if (includeHistory && this._history[`gauges.${name}`]) {
        metrics.gauges[name].history = [...this._history[`gauges.${name}`]];
      }
    }
    
    // Copia timer
    for (const [name, timer] of Object.entries(this._metrics.timers)) {
      metrics.timers[name] = { ...timer };
      
      // Aggiungi storia se richiesta
      if (includeHistory && this._history[`timers.${name}`]) {
        metrics.timers[name].history = [...this._history[`timers.${name}`]];
      }
    }
    
    // Copia istogrammi
    for (const [name, histogram] of Object.entries(this._metrics.histograms)) {
      // Ometti array values a meno che non sia richiesta la storia
      metrics.histograms[name] = { ...histogram };
      
      if (!includeHistory) {
        delete metrics.histograms[name].values;
      }
      
      // Aggiungi storia se richiesta
      if (includeHistory && this._history[`histograms.${name}`]) {
        metrics.histograms[name].history = [...this._history[`histograms.${name}`]];
      }
    }
    
    return metrics;
  },
  
  /**
   * Imposta una soglia di allarme per una metrica
   * @param {string} metricPath - Percorso della metrica (tipo.nome)
   * @param {Object} threshold - Definizione della soglia
   * @param {number} threshold.value - Valore soglia
   * @param {string} threshold.operator - Operatore ('>', '<', '>=', '<=', '=')
   * @param {string} [threshold.severity='warning'] - Severità dell'allarme
   * @returns {boolean} True se l'operazione è riuscita
   */
  setAlertThreshold(metricPath, threshold) {
    try {
      if (!metricPath || !threshold || !threshold.value || !threshold.operator) {
        logger.warn('Parametri soglia incompleti');
        return false;
      }
      
      // Valida operatore
      const validOperators = ['>', '<', '>=', '<=', '='];
      if (!validOperators.includes(threshold.operator)) {
        logger.warn(`Operatore non valido: ${threshold.operator}`);
        return false;
      }
      
      // Imposta soglia
      this._config.alertThresholds[metricPath] = {
        value: threshold.value,
        operator: threshold.operator,
        severity: threshold.severity || 'warning'
      };
      
      logger.info(`Soglia impostata per ${metricPath}: ${threshold.operator} ${threshold.value}`);
      return true;
    } catch (error) {
      logger.error(`Errore durante l'impostazione della soglia per ${metricPath}:`, error);
      return false;
    }
  },
  
  /**
   * Rimuove una soglia di allarme
   * @param {string} metricPath - Percorso della metrica
   * @returns {boolean} True se l'operazione è riuscita
   */
  removeAlertThreshold(metricPath) {
    try {
      if (this._config.alertThresholds[metricPath]) {
        delete this._config.alertThresholds[metricPath];
        logger.info(`Soglia rimossa per ${metricPath}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Errore durante la rimozione della soglia per ${metricPath}:`, error);
      return false;
    }
  },
  
  /**
   * Imposta il tasso di campionamento
   * @param {number} rate - Tasso di campionamento (0.0-1.0)
   * @returns {number} Nuovo tasso di campionamento
   */
  setSamplingRate(rate) {
    try {
      const newRate = Math.max(0, Math.min(1, rate));
      this._config.samplingRate = newRate;
      
      logger.info(`Tasso di campionamento impostato a ${newRate}`);
      return newRate;
    } catch (error) {
      logger.error('Errore durante l\'impostazione del tasso di campionamento:', error);
      return this._config.samplingRate;
    }
  }
};

module.exports = metricsService;