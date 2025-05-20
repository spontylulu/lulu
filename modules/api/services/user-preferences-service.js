/**
 * modules/api/services/user-preferences-service.js
 * Servizio per la gestione delle preferenze degli utenti
 * 
 * Gestisce il salvataggio e il recupero delle preferenze utente,
 * come il modello AI predefinito, le impostazioni dell'interfaccia, ecc.
 */

const logger = require('../../../utils/logger').getLogger('api:preferences');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

/**
 * Servizio per la gestione delle preferenze utente
 */
const userPreferencesService = {
  // Configurazione di default
  _config: {
    storageType: 'file',          // 'memory', 'file', 'database'
    storagePath: './data/user-preferences',
    cacheTimeout: 3600000,        // 1 ora
    persistInterval: 300000,      // 5 minuti
    enableCompression: false,     // Compressione dati
    defaultPreferences: {
      // Preferenze AI
      defaultAiModel: 'claude-3-7-sonnet-20250219',
      defaultAiTemperature: 0.7,
      defaultAiProvider: 'claude',
      
      // Preferenze UI
      theme: 'light',
      fontSize: 'medium',
      messageLayout: 'bubbles',
      enableSounds: true,
      
      // Preferenze notifiche
      enableNotifications: true,
      
      // Preferenze voice
      enableVoice: false,
      voiceType: 'default',
      voiceSpeed: 1.0,
      voiceVolume: 0.8
    }
  },
  
  // Cache in memoria delle preferenze
  _preferences: new Map(),
  
  // Timer per salvataggio periodico
  _persistTimer: null,
  
  // Timestamp ultimo caricamento per ogni utente
  _lastLoaded: new Map(),
  
  /**
   * Inizializza il servizio preferenze
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio preferenze utente');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Resetta lo stato
      this._preferences.clear();
      this._lastLoaded.clear();
      
      // Crea directory di storage se necessario
      if (this._config.storageType === 'file') {
        await this._ensureStorageDirectory();
      }
      
      // Avvia timer per salvataggio periodico
      if (this._config.storageType === 'file' && this._config.persistInterval > 0) {
        this._startPersistTimer();
      }
      
      logger.info('Servizio preferenze utente inizializzato con successo', { 
        storageType: this._config.storageType
      });
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio preferenze utente:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio preferenze
   */
  async shutdown() {
    logger.info('Chiusura servizio preferenze utente');
    
    try {
      // Ferma il timer di persistenza
      if (this._persistTimer) {
        clearInterval(this._persistTimer);
        this._persistTimer = null;
      }
      
      // Salva tutte le preferenze prima della chiusura
      if (this._config.storageType === 'file') {
        for (const userId of this._preferences.keys()) {
          await this._savePreferences(userId);
        }
      }
      
      // Pulisci la memoria
      this._preferences.clear();
      this._lastLoaded.clear();
      
      logger.info('Servizio preferenze utente chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio preferenze utente:', error);
      throw error;
    }
  },
  
  /**
   * Assicura che la directory di storage esista
   * @private
   * @returns {Promise<string>} Percorso della directory
   */
  async _ensureStorageDirectory() {
    try {
      const storagePath = path.resolve(this._config.storagePath);
      await fs.mkdir(storagePath, { recursive: true });
      logger.debug(`Directory storage preferenze: ${storagePath}`);
      return storagePath;
    } catch (error) {
      logger.error('Errore creazione directory storage preferenze:', error);
      throw error;
    }
  },
  
  /**
   * Avvia il timer per il salvataggio periodico
   * @private
   */
  _startPersistTimer() {
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
    }
    
    this._persistTimer = setInterval(async () => {
      try {
        // Salva le preferenze modificate di tutti gli utenti
        for (const userId of this._preferences.keys()) {
          await this._savePreferences(userId);
        }
        logger.debug('Salvataggio periodico preferenze completato');
      } catch (error) {
        logger.error('Errore durante salvataggio periodico preferenze:', error);
      }
    }, this._config.persistInterval);
    
    logger.debug(`Timer persistenza preferenze avviato (intervallo: ${this._config.persistInterval / 1000}s)`);
  },
  
  /**
   * Carica le preferenze di un utente
   * @private
   * @param {string} userId - ID dell'utente
   * @returns {Promise<Object>} Preferenze dell'utente
   */
  async _loadPreferences(userId) {
    if (!userId) {
      throw new Error('userId è obbligatorio');
    }
    
    // Se è già in memoria e non è scaduta la cache, usa quella
    if (this._preferences.has(userId)) {
      const lastLoaded = this._lastLoaded.get(userId) || 0;
      const now = Date.now();
      
      if (now - lastLoaded < this._config.cacheTimeout) {
        return this._preferences.get(userId);
      }
    }
    
    // Altrimenti carica da storage
    try {
      let userPrefs = { ...this._config.defaultPreferences };
      
      // Per storage file
      if (this._config.storageType === 'file') {
        try {
          const storagePath = await this._ensureStorageDirectory();
          const filePath = path.join(storagePath, `${userId}.json`);
          
          // Verifica se il file esiste
          try {
            await fs.access(filePath);
          } catch (accessError) {
            // File non esiste, usa preferenze default
            this._preferences.set(userId, userPrefs);
            this._lastLoaded.set(userId, Date.now());
            return userPrefs;
          }
          
          // Leggi il file
          const data = await fs.readFile(filePath, 'utf8');
          const loadedPrefs = JSON.parse(data);
          
          // Combina con default per assicurarsi che nuove preferenze siano incluse
          userPrefs = {
            ...this._config.defaultPreferences,
            ...loadedPrefs
          };
        } catch (fileError) {
          logger.warn(`Errore nel caricamento delle preferenze utente ${userId}:`, fileError);
          // Continua con le preferenze default
        }
      }
      // Per database (futuro)
      else if (this._config.storageType === 'database') {
        // Implementazione futura
        logger.warn('Storage database per preferenze non ancora implementato');
      }
      
      // Salva in memoria
      this._preferences.set(userId, userPrefs);
      this._lastLoaded.set(userId, Date.now());
      
      return userPrefs;
    } catch (error) {
      logger.error(`Errore nel caricamento delle preferenze utente ${userId}:`, error);
      
      // Fallback a preferenze default
      const defaultPrefs = { ...this._config.defaultPreferences };
      this._preferences.set(userId, defaultPrefs);
      this._lastLoaded.set(userId, Date.now());
      
      return defaultPrefs;
    }
  },
  
  /**
   * Salva le preferenze di un utente
   * @private
   * @param {string} userId - ID dell'utente
   * @returns {Promise<boolean>} Esito dell'operazione
   */
  async _savePreferences(userId) {
    if (!userId || !this._preferences.has(userId)) {
      return false;
    }
    
    try {
      const userPrefs = this._preferences.get(userId);
      
      // Per storage file
      if (this._config.storageType === 'file') {
        const storagePath = await this._ensureStorageDirectory();
        const filePath = path.join(storagePath, `${userId}.json`);
        
        // Dati da salvare
        let dataToSave = JSON.stringify(userPrefs, null, 2);
        
        // Salva il file
        await fs.writeFile(filePath, dataToSave, 'utf8');
        
        logger.debug(`Preferenze utente ${userId} salvate su file`);
        return true;
      }
      // Per database (futuro)
      else if (this._config.storageType === 'database') {
        // Implementazione futura
        logger.warn('Storage database per preferenze non ancora implementato');
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error(`Errore nel salvataggio delle preferenze utente ${userId}:`, error);
      return false;
    }
  },
  
  /**
   * Imposta una preferenza per un utente
   * @param {string} userId - ID dell'utente
   * @param {string} key - Chiave della preferenza
   * @param {any} value - Valore della preferenza
   * @returns {Promise<boolean>} Esito dell'operazione
   */
  async setPreference(userId, key, value) {
    try {
      if (!userId || !key) {
        throw new Error('userId e key sono obbligatori');
      }
      
      // Carica o inizializza le preferenze dell'utente
      let userPrefs = this._preferences.get(userId);
      if (!userPrefs) {
        userPrefs = await this._loadPreferences(userId);
      }
      
      // Aggiorna la preferenza
      userPrefs[key] = value;
      
      // Aggiorna timestamp
      this._lastLoaded.set(userId, Date.now());
      
      // Salva immediatamente se richiesto
      if (key.startsWith('_save_now_')) {
        await this._savePreferences(userId);
      }
      
      logger.debug(`Preferenza ${key} impostata per utente ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Errore nell'impostazione della preferenza ${key} per utente ${userId}:`, error);
      return false;
    }
  },
  
  /**
   * Ottiene una preferenza di un utente
   * @param {string} userId - ID dell'utente
   * @param {string} key - Chiave della preferenza
   * @param {any} defaultValue - Valore predefinito se la preferenza non esiste
   * @returns {Promise<any>} Valore della preferenza
   */
  async getPreference(userId, key, defaultValue = null) {
    try {
      if (!userId || !key) {
        throw new Error('userId e key sono obbligatori');
      }
      
      // Carica o inizializza le preferenze dell'utente
      let userPrefs = this._preferences.get(userId);
      if (!userPrefs) {
        userPrefs = await this._loadPreferences(userId);
      }
      
      // Verifica se la preferenza esiste
      if (userPrefs[key] !== undefined) {
        return userPrefs[key];
      }
      
      // Altrimenti restituisci il valore predefinito
      return defaultValue;
    } catch (error) {
      logger.error(`Errore nel recupero della preferenza ${key} per utente ${userId}:`, error);
      return defaultValue;
    }
  },
  
  /**
   * Ottiene tutte le preferenze di un utente
   * @param {string} userId - ID dell'utente
   * @returns {Promise<Object>} Preferenze dell'utente
   */
  async getAllPreferences(userId) {
    try {
      if (!userId) {
        throw new Error('userId è obbligatorio');
      }
      
      // Carica o inizializza le preferenze dell'utente
      let userPrefs = this._preferences.get(userId);
      if (!userPrefs) {
        userPrefs = await this._loadPreferences(userId);
      }
      
      // Restituisci una copia per evitare modifiche indesiderate
      return { ...userPrefs };
    } catch (error) {
      logger.error(`Errore nel recupero delle preferenze dell'utente ${userId}:`, error);
      return { ...this._config.defaultPreferences };
    }
  },
  
  /**
   * Resetta le preferenze di un utente ai valori predefiniti
   * @param {string} userId - ID dell'utente
   * @returns {Promise<boolean>} Esito dell'operazione
   */
  async resetPreferences(userId) {
    try {
      if (!userId) {
        throw new Error('userId è obbligatorio');
      }
      
      // Imposta le preferenze predefinite
      this._preferences.set(userId, { ...this._config.defaultPreferences });
      this._lastLoaded.set(userId, Date.now());
      
      // Salva su storage
      await this._savePreferences(userId);
      
      logger.info(`Preferenze utente ${userId} resettate ai valori predefiniti`);
      return true;
    } catch (error) {
      logger.error(`Errore nel reset delle preferenze dell'utente ${userId}:`, error);
      return false;
    }
  },
  
  /**
   * Elimina tutte le preferenze di un utente
   * @param {string} userId - ID dell'utente
   * @returns {Promise<boolean>} Esito dell'operazione
   */
  async deletePreferences(userId) {
    try {
      if (!userId) {
        throw new Error('userId è obbligatorio');
      }
      
      // Rimuovi dalla memoria
      this._preferences.delete(userId);
      this._lastLoaded.delete(userId);
      
      // Rimuovi da storage
      if (this._config.storageType === 'file') {
        try {
          const storagePath = await this._ensureStorageDirectory();
          const filePath = path.join(storagePath, `${userId}.json`);
          
          // Verifica se il file esiste
          try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            logger.debug(`File preferenze utente ${userId} eliminato`);
          } catch (accessError) {
            // File non esiste, ignora
          }
        } catch (fileError) {
          logger.warn(`Errore nell'eliminazione del file preferenze utente ${userId}:`, fileError);
          // Continua comunque
        }
      }
      
      logger.info(`Preferenze utente ${userId} eliminate`);
      return true;
    } catch (error) {
      logger.error(`Errore nell'eliminazione delle preferenze dell'utente ${userId}:`, error);
      return false;
    }
  },
  
  /**
   * Ottiene statistiche sul servizio preferenze
   * @returns {Object} Statistiche
   */
  getStats() {
    return {
      userCount: this._preferences.size,
      storageType: this._config.storageType,
      cacheTimeout: this._config.cacheTimeout,
      defaultPreferences: { ...this._config.defaultPreferences }
    };
  }
};

module.exports = userPreferencesService;