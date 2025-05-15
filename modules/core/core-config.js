/**
 * modules/core/core-config.js
 * Servizio di configurazione centralizzato per Lulu
 * 
 * Gestisce l'accesso e la modifica delle configurazioni dell'applicazione,
 * supportando sia configurazioni statiche da file che configurazioni dinamiche.
 */

const logger = require('../../utils/logger').getLogger('core:config');
const fs = require('fs');
const path = require('path');
const modulesConfig = require('../../modules-config');

/**
 * Servizio di configurazione
 * Fornisce un'interfaccia unificata per accedere alle configurazioni dell'applicazione
 */
const configService = {
  // Store interno per le configurazioni
  _configStore: {
    // Configurazione base
    app: {
      name: 'Lulu',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      isProduction: (process.env.NODE_ENV || 'development') === 'production'
    },
    
    // Parametri runtime
    runtime: {
      startTime: Date.now(),
      configLoaded: false,
      configSource: null
    },
    
    // Configurazioni specifiche (verranno popolate durante l'inizializzazione)
    modules: {},
    
    // Configurazione utente personalizzata
    user: {}
  },
  
  // Flag per tracciare lo stato del servizio
  _active: false,
  
  /**
   * Inizializza il servizio di configurazione
   * @returns {Object} Istanza del servizio
   */
  async initialize() {
    logger.info('Inizializzazione servizio di configurazione');
    
    try {
      // Carica la configurazione base dai moduli
      this._loadModulesConfig();
      
      // Carica configurazione personalizzata se esiste
      await this._loadUserConfig();
      
      // Carica variabili d'ambiente
      this._loadEnvironmentVariables();
      
      // Aggiorna stato runtime
      this._configStore.runtime.configLoaded = true;
      this._active = true;
      
      logger.info('Servizio di configurazione inizializzato con successo');
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio di configurazione:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio di configurazione
   */
  async shutdown() {
    logger.info('Chiusura servizio di configurazione');
    
    try {
      // Salva eventuali configurazioni utente modificate
      await this._saveUserConfig();
      
      this._active = false;
      logger.info('Servizio di configurazione chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio di configurazione:', error);
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
   * Carica la configurazione dai moduli
   * @private
   */
  _loadModulesConfig() {
    logger.debug('Caricamento configurazione moduli');
    
    // Copia la configurazione dei moduli nello store
    this._configStore.modules = JSON.parse(JSON.stringify(modulesConfig));
    
    // Imposta il source
    this._configStore.runtime.configSource = 'modules-config.js';
    
    logger.debug('Configurazione moduli caricata');
  },
  
  /**
   * Carica la configurazione utente personalizzata se presente
   * @private
   * @returns {Promise<void>}
   */
  async _loadUserConfig() {
    const userConfigPath = path.join(__dirname, '../../config/user-config.json');
    
    try {
      if (fs.existsSync(userConfigPath)) {
        logger.debug('Caricamento configurazione utente da file');
        
        const configContent = await fs.promises.readFile(userConfigPath, 'utf8');
        const userConfig = JSON.parse(configContent);
        
        // Merge delle configurazioni utente
        this._configStore.user = userConfig;
        
        logger.info('Configurazione utente caricata con successo');
      } else {
        logger.debug('Nessun file di configurazione utente trovato, utilizzo valori predefiniti');
        // Inizializza configurazione utente vuota
        this._configStore.user = {};
      }
    } catch (error) {
      logger.warn('Errore nel caricamento della configurazione utente:', error);
      logger.warn('Utilizzo valori predefiniti');
      // In caso di errore, inizializza configurazione utente vuota
      this._configStore.user = {};
    }
  },
  
  /**
   * Carica le variabili d'ambiente pertinenti
   * @private
   */
  _loadEnvironmentVariables() {
    logger.debug('Caricamento variabili d\'ambiente rilevanti');
    
    // Mappa le variabili d'ambiente rilevanti
    const envMappings = {
      'LULU_PORT': 'app.port',
      'LULU_LOG_LEVEL': 'modules.logging.level',
      'LULU_DEBUG': 'app.debug',
      'LULU_CACHE_ENABLED': 'modules.cache.enabled',
      'CLAUDE_API_KEY': 'modules.ai.services.claude.apiKey',
      'OPENAI_API_KEY': 'modules.ai.services.openai.apiKey'
    };
    
    // Applica le variabili d'ambiente all'oggetto di configurazione
    for (const [envVar, configPath] of Object.entries(envMappings)) {
      if (process.env[envVar] !== undefined) {
        logger.debug(`Applicazione variabile d'ambiente: ${envVar}`);
        
        // Converte il valore al tipo appropriato
        let value = process.env[envVar];
        
        // Conversione automatica dei tipi
        if (value.toLowerCase() === 'true') value = true;
        else if (value.toLowerCase() === 'false') value = false;
        else if (!isNaN(value) && value.trim() !== '') value = Number(value);
        
        // Applica il valore al percorso di configurazione
        this.set(configPath, value);
      }
    }
  },
  
  /**
   * Salva la configurazione utente su file
   * @private
   * @returns {Promise<void>}
   */
  async _saveUserConfig() {
    // Salva solo se ci sono configurazioni utente da salvare
    if (Object.keys(this._configStore.user).length === 0) {
      logger.debug('Nessuna configurazione utente da salvare');
      return;
    }
    
    const userConfigPath = path.join(__dirname, '../../config/user-config.json');
    const configDir = path.dirname(userConfigPath);
    
    try {
      // Assicura che la directory config esista
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      logger.debug('Salvataggio configurazione utente');
      
      // Serializza e salva la configurazione
      const configContent = JSON.stringify(this._configStore.user, null, 2);
      await fs.promises.writeFile(userConfigPath, configContent, 'utf8');
      
      logger.debug('Configurazione utente salvata con successo');
    } catch (error) {
      logger.error('Errore nel salvataggio della configurazione utente:', error);
      throw error;
    }
  },
  
  /**
   * Ottiene un valore di configurazione
   * @param {string} key - Chiave di configurazione (usando la notazione dot: "app.port")
   * @param {*} defaultValue - Valore di default se non trovato
   * @returns {*} Valore di configurazione
   */
  get(key, defaultValue = null) {
    // Gestisce il caso speciale di richiesta di tutte le configurazioni
    if (!key) {
      return { ...this._configStore };
    }
    
    try {
      // Naviga nell'oggetto di configurazione usando la notazione dot
      const parts = key.split('.');
      let current = this._configStore;
      
      for (const part of parts) {
        if (current === undefined || current === null || typeof current !== 'object') {
          return defaultValue;
        }
        
        // Verifica prioritariamente nella configurazione utente
        if (parts[0] === parts[parts.length - 1] && this._configStore.user[key] !== undefined) {
          return this._configStore.user[key];
        }
        
        current = current[part];
      }
      
      return current !== undefined ? current : defaultValue;
    } catch (error) {
      logger.warn(`Errore nell'accesso alla configurazione per la chiave ${key}:`, error);
      return defaultValue;
    }
  },
  
  /**
   * Imposta un valore di configurazione
   * @param {string} key - Chiave di configurazione (usando la notazione dot: "app.port")
   * @param {*} value - Valore da impostare
   * @returns {boolean} True se l'operazione è riuscita
   */
  set(key, value) {
    if (!key) {
      logger.warn('Tentativo di impostare configurazione con chiave vuota');
      return false;
    }
    
    try {
      // Impostazione configurazione utente (persistente)
      if (key.startsWith('user.')) {
        const userKey = key.substring(5); // Rimuove 'user.'
        this._configStore.user[userKey] = value;
        return true;
      }
      
      // Naviga nell'oggetto di configurazione usando la notazione dot
      const parts = key.split('.');
      let current = this._configStore;
      
      // Naviga fino al penultimo livello
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        
        // Crea l'oggetto se non esiste
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        
        current = current[part];
      }
      
      // Imposta il valore all'ultimo livello
      const lastPart = parts[parts.length - 1];
      current[lastPart] = value;
      
      return true;
    } catch (error) {
      logger.error(`Errore nell'impostazione della configurazione per la chiave ${key}:`, error);
      return false;
    }
  },
  
  /**
   * Elimina una chiave di configurazione
   * @param {string} key - Chiave di configurazione da eliminare
   * @returns {boolean} True se l'operazione è riuscita
   */
  delete(key) {
    if (!key) {
      logger.warn('Tentativo di eliminare configurazione con chiave vuota');
      return false;
    }
    
    try {
      // Gestione speciale per configurazione utente
      if (key.startsWith('user.')) {
        const userKey = key.substring(5); // Rimuove 'user.'
        delete this._configStore.user[userKey];
        return true;
      }
      
      // Naviga nell'oggetto di configurazione usando la notazione dot
      const parts = key.split('.');
      let current = this._configStore;
      
      // Naviga fino al penultimo livello
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        
        if (!current[part] || typeof current[part] !== 'object') {
          return false; // La chiave non esiste
        }
        
        current = current[part];
      }
      
      // Elimina la proprietà
      const lastPart = parts[parts.length - 1];
      if (current[lastPart] === undefined) {
        return false; // La chiave non esiste
      }
      
      delete current[lastPart];
      return true;
    } catch (error) {
      logger.error(`Errore nell'eliminazione della configurazione per la chiave ${key}:`, error);
      return false;
    }
  },
  
  /**
   * Resetta la configurazione ai valori predefiniti
   * @param {string} [scope='user'] - Ambito da resettare ('user', 'runtime', 'all')
   * @returns {boolean} True se l'operazione è riuscita
   */
  reset(scope = 'user') {
    try {
      logger.info(`Reset configurazione per ambito: ${scope}`);
      
      switch (scope) {
        case 'user':
          this._configStore.user = {};
          break;
        case 'runtime':
          this._configStore.runtime = {
            startTime: this._configStore.runtime.startTime,
            configLoaded: true,
            configSource: this._configStore.runtime.configSource
          };
          break;
        case 'all':
          // Mantieni solo la configurazione base e ricarica tutto
          const startTime = this._configStore.runtime.startTime;
          this._configStore = {
            app: {
              name: 'Lulu',
              version: process.env.npm_package_version || '1.0.0',
              environment: process.env.NODE_ENV || 'development',
              isProduction: (process.env.NODE_ENV || 'development') === 'production'
            },
            runtime: {
              startTime,
              configLoaded: false,
              configSource: null
            },
            modules: {},
            user: {}
          };
          
          // Ricarica la configurazione
          this._loadModulesConfig();
          this._loadEnvironmentVariables();
          break;
        default:
          logger.warn(`Ambito di reset non valido: ${scope}`);
          return false;
      }
      
      return true;
    } catch (error) {
      logger.error(`Errore durante il reset della configurazione (ambito: ${scope}):`, error);
      return false;
    }
  },
  
  /**
   * Restituisce un oggetto con tutte le configurazioni
   * @param {boolean} [includeDefaults=true] - Se includere le configurazioni predefinite
   * @returns {Object} Configurazione completa
   */
  getAll(includeDefaults = true) {
    if (includeDefaults) {
      return { ...this._configStore };
    }
    
    // Restituisci solo le configurazioni personalizzate dall'utente
    return { ...this._configStore.user };
  }
};

module.exports = configService;