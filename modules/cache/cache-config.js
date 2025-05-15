/**
 * modules/cache/cache-config.js
 * Configurazione centralizzata per il modulo cache
 * 
 * Gestisce e fornisce l'accesso alle impostazioni di configurazione
 * per tutti i componenti del modulo cache.
 */

const logger = require('../../utils/logger').getLogger('cache:config');
const fs = require('fs').promises;
const path = require('path');

/**
 * Servizio di configurazione per il modulo cache
 */
const configService = {
  // Configurazione di default
  _defaults: {
    // Impostazioni generali
    enabled: true,
    logLevel: 'info',
    baseDir: './cache',
    
    // Impostazioni similarità
    similarity: {
      enabled: true,
      threshold: 0.8,
      algorithm: 'levenshtein',
      maxQueryLength: 1000,
      ignoreCase: true,
      normalizeText: true,
      useCache: true,
      cacheSize: 1000
    },
    
    // Impostazioni storage
    store: {
      enabled: true,
      storageType: 'memory',
      persistence: true,
      persistPath: './cache',
      persistInterval: 300000,
      ttl: 30 * 24 * 60 * 60 * 1000,
      maxSize: 1000,
      cleanupInterval: 3600000,
      compactThreshold: 0.3
    },
    
    // Impostazioni compressione
    compression: {
      enabled: true,
      algorithm: 'gzip',
      level: 6,
      minLength: 500,
      compressionRatioThreshold: 0.8,
      metadataKeys: ['query']
    },
    
    // Impostazioni statistiche
    stats: {
      enabled: true,
      historySize: 100,
      trackDistribution: true,
      persistStats: false,
      detailedEvents: false
    }
  },
  
  // Configurazione corrente
  _config: {},
  
  // Percorso al file di configurazione
  _configPath: null,
  
  // Flag per tracciare lo stato del servizio
  _initialized: false,
  
  /**
   * Inizializza il servizio di configurazione
   * @param {Object} config - Configurazione opzionale
   * @param {string} [configPath] - Percorso al file di configurazione
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}, configPath = null) {
    logger.info('Inizializzazione servizio configurazione cache');
    
    try {
      // Imposta percorso file configurazione
      this._configPath = configPath || path.join(__dirname, '../../config/cache-config.json');
      
      // Carica configurazione da file se esiste
      let fileConfig = {};
      try {
        fileConfig = await this._loadFromFile();
        logger.info('Configurazione caricata da file:', { path: this._configPath });
      } catch (error) {
        // Se il file non esiste, è normale - usiamo i default
        if (error.code !== 'ENOENT') {
          logger.warn('Errore nel caricamento della configurazione da file:', error);
        }
      }
      
      // Applica configurazione: default -> file -> parametri
      this._config = this._mergeConfigs(this._defaults, fileConfig, config);
      
      // Crea directory base se necessario
      if (this._config.baseDir) {
        await this._ensureBaseDir();
      }
      
      this._initialized = true;
      logger.info('Servizio configurazione cache inizializzato con successo');
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio configurazione cache:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio di configurazione
   */
  async shutdown() {
    logger.info('Chiusura servizio configurazione cache');
    
    try {
      // Salva configurazione se modificata
      if (this._initialized) {
        try {
          await this._saveToFile();
        } catch (error) {
          logger.warn('Errore nel salvataggio della configurazione:', error);
        }
      }
      
      this._initialized = false;
      logger.info('Servizio configurazione cache chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio configurazione cache:', error);
      throw error;
    }
  },
  
  /**
   * Assicura che la directory base esista
   * @private
   * @returns {Promise<string>} Percorso alla directory
   */
  async _ensureBaseDir() {
    try {
      const baseDir = path.resolve(this._config.baseDir);
      await fs.mkdir(baseDir, { recursive: true });
      logger.debug(`Directory base cache: ${baseDir}`);
      return baseDir;
    } catch (error) {
      logger.error('Errore creazione directory base cache:', error);
      throw error;
    }
  },
  
  /**
   * Carica la configurazione da file
   * @private
   * @returns {Promise<Object>} Configurazione caricata
   */
  async _loadFromFile() {
    // Verifica se il file esiste
    try {
      await fs.access(this._configPath);
    } catch (error) {
      // File non esiste, restituisci oggetto vuoto
      return {};
    }
    
    // Leggi e parsa il file
    const fileContent = await fs.readFile(this._configPath, 'utf8');
    return JSON.parse(fileContent);
  },
  
  /**
   * Salva la configurazione su file
   * @private
   * @returns {Promise<void>}
   */
  async _saveToFile() {
    try {
      // Assicura che la directory esista
      const configDir = path.dirname(this._configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      // Salva configurazione
      const configToSave = { ...this._config };
      
      // Rimuovi proprietà non serializzabili o transitorie
      delete configToSave._internal;
      
      await fs.writeFile(
        this._configPath,
        JSON.stringify(configToSave, null, 2),
        'utf8'
      );
      
      logger.debug(`Configurazione salvata su: ${this._configPath}`);
    } catch (error) {
      logger.error('Errore nel salvataggio della configurazione su file:', error);
      throw error;
    }
  },
  
  /**
   * Unisce più oggetti di configurazione
   * @private
   * @param {...Object} configs - Oggetti configurazione da unire
   * @returns {Object} Configurazione unita
   */
  _mergeConfigs(...configs) {
    const result = {};
    
    // Funzione ricorsiva per deep merge
    const merge = (target, source) => {
      for (const key in source) {
        // Salta proprietà undefined
        if (source[key] === undefined) continue;
        
        // Deep merge per oggetti annidati
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          target[key] = target[key] || {};
          merge(target[key], source[key]);
        } 
        // Copia Arrays e valori primitivi
        else {
          target[key] = source[key];
        }
      }
    };
    
    // Applica ogni configurazione in ordine
    for (const config of configs) {
      if (config && typeof config === 'object') {
        merge(result, config);
      }
    }
    
    return result;
  },
  
  /**
   * Ottiene il valore di una chiave di configurazione
   * @param {string} key - Chiave di configurazione (dot notation)
   * @param {*} defaultValue - Valore predefinito se la chiave non esiste
   * @returns {*} Valore di configurazione
   */
  get(key, defaultValue = undefined) {
    if (!key) return this._config;
    
    try {
      // Naviga nell'oggetto usando dot notation
      const parts = key.split('.');
      let current = this._config;
      
      for (const part of parts) {
        if (current === undefined || current === null) {
          return defaultValue;
        }
        current = current[part];
      }
      
      return current !== undefined ? current : defaultValue;
    } catch (error) {
      logger.error(`Errore nell'accesso alla configurazione per la chiave ${key}:`, error);
      return defaultValue;
    }
  },
  
  /**
   * Imposta il valore di una chiave di configurazione
   * @param {string} key - Chiave di configurazione (dot notation)
   * @param {*} value - Valore da impostare
   * @returns {boolean} True se l'operazione è riuscita
   */
  set(key, value) {
    if (!key) return false;
    
    try {
      // Naviga nell'oggetto usando dot notation
      const parts = key.split('.');
      let current = this._config;
      
      // Naviga fino al penultimo livello
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        
        // Crea oggetto annidato se non esiste
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        
        current = current[part];
      }
      
      // Imposta il valore
      const lastPart = parts[parts.length - 1];
      const oldValue = current[lastPart];
      current[lastPart] = value;
      
      logger.debug(`Configurazione aggiornata: ${key} = ${value} (era: ${oldValue})`);
      
      return true;
    } catch (error) {
      logger.error(`Errore nell'impostazione della configurazione per la chiave ${key}:`, error);
      return false;
    }
  },
  
  /**
   * Ripristina i valori predefiniti per una sezione di configurazione
   * @param {string} [section] - Sezione da ripristinare (opzionale)
   * @returns {boolean} True se l'operazione è riuscita
   */
  resetToDefaults(section = null) {
    try {
      if (!section) {
        // Ripristina tutta la configurazione
        this._config = { ...this._defaults };
        logger.info('Configurazione cache completamente resettata ai valori predefiniti');
      } else {
        // Ripristina solo una sezione
        if (section in this._defaults) {
          this._config[section] = { ...this._defaults[section] };
          logger.info(`Sezione '${section}' resettata ai valori predefiniti`);
        } else {
          logger.warn(`Sezione '${section}' non trovata nella configurazione predefinita`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      logger.error(`Errore nel reset della configurazione ${section ? `per la sezione ${section}` : ''}:`, error);
      return false;
    }
  },
  
  /**
   * Sostituisce l'intera configurazione
   * @param {Object} config - Nuova configurazione completa
   * @returns {boolean} True se l'operazione è riuscita
   */
  replaceConfig(config) {
    try {
      if (!config || typeof config !== 'object') {
        logger.warn('Tentativo di sostituzione configurazione con valore non valido');
        return false;
      }
      
      // Mantieni solo le proprietà valide
      const newConfig = {};
      
      // Copia le sezioni esistenti nella configurazione default
      for (const section in this._defaults) {
        if (config[section] !== undefined) {
          newConfig[section] = 
            typeof config[section] === 'object' && !Array.isArray(config[section]) ? 
            { ...config[section] } : config[section];
        } else {
          // Mantieni i valori default per sezioni mancanti
          newConfig[section] = { ...this._defaults[section] };
        }
      }
      
      // Aggiorna configurazione
      this._config = newConfig;
      
      logger.info('Configurazione completa sostituita');
      return true;
    } catch (error) {
      logger.error('Errore nella sostituzione della configurazione:', error);
      return false;
    }
  },
  
  /**
   * Esporta la configurazione corrente
   * @returns {Object} Copia della configurazione
   */
  exportConfig() {
    // Crea deep copy per evitare modifiche involontarie
    return JSON.parse(JSON.stringify(this._config));
  },
  
  /**
   * Ottiene la configurazione per un servizio specifico
   * @param {string} service - Nome del servizio
   * @returns {Object} Configurazione del servizio
   */
  getServiceConfig(service) {
    if (!service) return null;
    
    // Mappa da nome servizio a chiave config
    const serviceMap = {
      'similarity': 'similarity',
      'store': 'store',
      'compression': 'compression',
      'stats': 'stats'
    };
    
    const configKey = serviceMap[service] || service;
    
    // Ottieni configurazione servizio
    const config = this.get(configKey);
    
    // Aggiungi flag globale 'enabled'
    if (config && typeof config === 'object') {
      // Se il servizio è disabilitato globalmente, imposta enabled a false
      // (ma preserva la configurazione originale)
      if (!this.get('enabled')) {
        return { ...config, enabled: false };
      }
    }
    
    return config;
  },
  
  /**
   * Verifica se un servizio è abilitato
   * @param {string} service - Nome del servizio
   * @returns {boolean} True se il servizio è abilitato
   */
  isServiceEnabled(service) {
    // Il modulo deve essere abilitato globalmente
    if (!this.get('enabled')) return false;
    
    // E il servizio specifico deve essere abilitato
    const serviceConfig = this.getServiceConfig(service);
    return serviceConfig && serviceConfig.enabled === true;
  },
  
  /**
   * Abilita o disabilita un servizio
   * @param {string} service - Nome del servizio
   * @param {boolean} enabled - Stato abilitazione
   * @returns {boolean} True se l'operazione è riuscita
   */
  setServiceEnabled(service, enabled) {
    if (!service) return false;
    
    // Gestione caso speciale per enableAllServices()
    if (service === '*') {
      // Abilita/disabilita tutti i servizi
      const services = ['similarity', 'store', 'compression', 'stats'];
      let result = true;
      
      for (const svc of services) {
        result = result && this.setServiceEnabled(svc, enabled);
      }
      
      return result;
    }
    
    // Mappa da nome servizio a chiave config
    const serviceMap = {
      'similarity': 'similarity',
      'store': 'store',
      'compression': 'compression',
      'stats': 'stats'
    };
    
    const configKey = serviceMap[service] || service;
    const configPath = `${configKey}.enabled`;
    
    return this.set(configPath, !!enabled);
  },
  
  /**
   * Abilita o disabilita tutti i servizi
   * @param {boolean} enabled - Stato abilitazione
   * @returns {boolean} True se l'operazione è riuscita
   */
  setAllServicesEnabled(enabled) {
    return this.setServiceEnabled('*', enabled);
  },
  
  /**
   * Restituisce lo stato di tutti i servizi
   * @returns {Object} Stato dei servizi
   */
  getServicesStatus() {
    const globalEnabled = this.get('enabled');
    
    return {
      global: globalEnabled,
      similarity: globalEnabled && this.isServiceEnabled('similarity'),
      store: globalEnabled && this.isServiceEnabled('store'),
      compression: globalEnabled && this.isServiceEnabled('compression'),
      stats: globalEnabled && this.isServiceEnabled('stats')
    };
  },
  
  /**
   * Genera una stringa di definizione della configurazione
   * @returns {string} Stringa JavaScript per il codice di configurazione
   */
  generateConfigCode() {
    try {
      const config = this.exportConfig();
      return `// Configurazione generata automaticamente
const cacheConfig = ${JSON.stringify(config, null, 2)};

module.exports = cacheConfig;`;
    } catch (error) {
      logger.error('Errore nella generazione del codice di configurazione:', error);
      return '// Errore nella generazione della configurazione';
    }
  }
};

module.exports = configService;