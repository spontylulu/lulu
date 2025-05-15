/**
 * modules/cache/cache-store.js
 * Servizio di storage per il modulo cache
 * 
 * Gestisce il salvataggio e il recupero delle risposte cachate,
 * con supporto per TTL, pulizia automatica e persistenza.
 */

const logger = require('../../utils/logger').getLogger('cache:store');
const fs = require('fs').promises;
const path = require('path');

/**
 * Servizio di storage per il modulo cache
 * Fornisce funzionalità di memorizzazione e recupero dei dati cachati
 */
const storeService = {
  // Configurazione di default
  _config: {
    enabled: true,
    storageType: 'memory',    // 'memory', 'file', 'hybrid'
    persistence: true,        // Salva la cache su disco
    persistPath: './cache',   // Directory per la persistenza
    persistInterval: 300000,  // Intervallo salvataggio (5 min)
    ttl: 30 * 24 * 60 * 60 * 1000, // Time-to-live (30 giorni)
    maxSize: 1000,            // Numero massimo di elementi
    cleanupInterval: 3600000, // Pulizia ogni ora
    compactThreshold: 0.3     // Compattazione quando più del 30% è obsoleto
  },
  
  // Store in memoria
  _store: new Map(),
  
  // Metadati cache
  _meta: {
    hits: 0,
    misses: 0,
    size: 0,
    lastCleanup: null,
    lastPersist: null,
    createdAt: Date.now(),
    obsoleteCount: 0
  },
  
  // Timer interni
  _timers: {
    cleanup: null,
    persist: null
  },
  
  /**
   * Inizializza il servizio store
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio store cache');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Resetta lo store e i metadati
      this._store.clear();
      this._meta = {
        hits: 0,
        misses: 0,
        size: 0,
        lastCleanup: null,
        lastPersist: null,
        createdAt: Date.now(),
        obsoleteCount: 0
      };
      
      // Crea directory persistenza se necessario
      if (this._config.persistence) {
        await this._ensurePersistDirectory();
        
        // Carica cache persistente se esiste
        try {
          await this._loadFromDisk();
        } catch (loadError) {
          logger.warn('Impossibile caricare cache da disco:', loadError);
          // Continua comunque, inizia con cache vuota
        }
      }
      
      // Avvia timer per pulizia e persistenza
      this._startTimers();
      
      logger.info('Servizio store cache inizializzato con successo', {
        storageType: this._config.storageType,
        persistence: this._config.persistence,
        ttl: this._config.ttl
      });
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio store cache:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio store
   */
  async shutdown() {
    logger.info('Chiusura servizio store cache');
    
    try {
      // Ferma i timer
      this._stopTimers();
      
      // Persisti la cache se abilitato
      if (this._config.persistence) {
        try {
          await this._persistToDisk();
          logger.info('Cache salvata su disco durante la chiusura');
        } catch (persistError) {
          logger.error('Errore durante il salvataggio finale della cache:', persistError);
        }
      }
      
      // Pulisci lo store
      this._store.clear();
      
      logger.info('Servizio store cache chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio store cache:', error);
      throw error;
    }
  },
  
  /**
   * Avvia i timer per pulizia e persistenza
   * @private
   */
  _startTimers() {
    // Timer per pulizia cache
    if (this._config.cleanupInterval > 0) {
      this._timers.cleanup = setInterval(() => {
        this.cleanup()
          .then(count => {
            if (count > 0) {
              logger.info(`Pulizia cache automatica completata: ${count} elementi rimossi`);
            }
          })
          .catch(error => {
            logger.error('Errore durante la pulizia automatica della cache:', error);
          });
      }, this._config.cleanupInterval);
      
      logger.debug(`Timer pulizia cache configurato ogni ${this._config.cleanupInterval / 60000} minuti`);
    }
    
    // Timer per persistenza cache
    if (this._config.persistence && this._config.persistInterval > a0) {
      this._timers.persist = setInterval(() => {
        this._persistToDisk()
          .then(() => {
            logger.debug('Cache salvata su disco automaticamente');
          })
          .catch(error => {
            logger.error('Errore durante il salvataggio automatico della cache:', error);
          });
      }, this._config.persistInterval);
      
      logger.debug(`Timer persistenza cache configurato ogni ${this._config.persistInterval / 60000} minuti`);
    }
  },
  
  /**
   * Ferma i timer attivi
   * @private
   */
  _stopTimers() {
    // Ferma timer pulizia
    if (this._timers.cleanup) {
      clearInterval(this._timers.cleanup);
      this._timers.cleanup = null;
    }
    
    // Ferma timer persistenza
    if (this._timers.persist) {
      clearInterval(this._timers.persist);
      this._timers.persist = null;
    }
    
    logger.debug('Timer cache fermati');
  },
  
  /**
   * Assicura che la directory di persistenza esista
   * @private
   */
  async _ensurePersistDirectory() {
    try {
      const persistDir = path.resolve(this._config.persistPath);
      await fs.mkdir(persistDir, { recursive: true });
      logger.debug(`Directory persistenza cache: ${persistDir}`);
      return persistDir;
    } catch (error) {
      logger.error('Errore creazione directory persistenza cache:', error);
      throw error;
    }
  },
  
  /**
   * Salva la cache su disco
   * @private
   * @returns {Promise<void>}
   */
  async _persistToDisk() {
    if (!this._config.persistence) return;
    
    try {
      const persistDir = await this._ensurePersistDirectory();
      const persistPath = path.join(persistDir, 'cache-store.json');
      
      // Prepara i dati da salvare
      const data = {
        meta: { ...this._meta, lastPersist: Date.now() },
        items: []
      };
      
      // Converti la Map in array per il salvataggio
      for (const [key, item] of this._store.entries()) {
        data.items.push({
          key,
          ...item
        });
      }
      
      // Scrivi su file
      await fs.writeFile(
        persistPath,
        JSON.stringify(data, null, 2),
        'utf8'
      );
      
      // Aggiorna metadata
      this._meta.lastPersist = Date.now();
      
      logger.debug(`Cache salvata su disco: ${data.items.length} elementi`);
    } catch (error) {
      logger.error('Errore durante il salvataggio della cache su disco:', error);
      throw error;
    }
  },
  
  /**
   * Carica la cache da disco
   * @private
   * @returns {Promise<void>}
   */
  async _loadFromDisk() {
    if (!this._config.persistence) return;
    
    try {
      const persistDir = await this._ensurePersistDirectory();
      const persistPath = path.join(persistDir, 'cache-store.json');
      
      // Verifica se il file esiste
      try {
        await fs.access(persistPath);
      } catch (e) {
        logger.debug('File cache non trovato, inizializzazione con cache vuota');
        return;
      }
      
      // Leggi il file
      const fileContent = await fs.readFile(persistPath, 'utf8');
      const data = JSON.parse(fileContent);
      
      // Ripristina metadati
      if (data.meta) {
        this._meta = {
          ...data.meta,
          hits: 0, // Reset contatori per sessione corrente
          misses: 0
        };
      }
      
      // Ripristina elementi cache
      let loadedCount = 0;
      let expiredCount = 0;
      const now = Date.now();
      
      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          // Salta elementi già scaduti
          if (item.expiresAt && item.expiresAt < now) {
            expiredCount++;
            continue;
          }
          
          // Aggiungi elemento valido alla cache
          this._store.set(item.key, {
            value: item.value,
            expiresAt: item.expiresAt,
            createdAt: item.createdAt,
            metadata: item.metadata || {}
          });
          
          loadedCount++;
        }
      }
      
      // Aggiorna metadati
      this._meta.size = this._store.size;
      
      logger.info(`Cache caricata da disco: ${loadedCount} elementi validi, ${expiredCount} scaduti`);
    } catch (error) {
      logger.error('Errore durante il caricamento della cache da disco:', error);
      throw error;
    }
  },
  
  /**
   * Salva un elemento nella cache
   * @param {string} key - Chiave dell'elemento
   * @param {*} value - Valore da memorizzare
   * @param {number} [ttl] - Time-to-live in ms (override config)
   * @param {Object} [metadata] - Metadati aggiuntivi
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async set(key, value, ttl, metadata = {}) {
    if (!this._config.enabled || !key) return false;
    
    try {
      // Calcola TTL
      const now = Date.now();
      const expiresAt = ttl ? now + ttl : now + this._config.ttl;
      
      // Crea item cache
      const item = {
        value,
        expiresAt,
        createdAt: now,
        metadata: { ...metadata }
      };
      
      // Verifica se stiamo aggiornando un elemento esistente
      const isUpdate = this._store.has(key);
      
      // Salva nella cache
      this._store.set(key, item);
      
      // Aggiorna metadati
      if (!isUpdate) {
        this._meta.size = this._store.size;
      }
      
      // Verifica se dobbiamo compattare la cache
      if (this._meta.size > this._config.maxSize) {
        await this._evictOldest();
      }
      
      logger.debug(`Elemento ${isUpdate ? 'aggiornato' : 'aggiunto'} in cache: ${key}`);
      
      return true;
    } catch (error) {
      logger.error(`Errore durante il salvataggio in cache della chiave ${key}:`, error);
      return false;
    }
  },
  
  /**
   * Recupera un elemento dalla cache
   * @param {string} key - Chiave dell'elemento
   * @returns {Promise<*|null>} Valore o null se non trovato o scaduto
   */
  async get(key) {
    if (!this._config.enabled || !key) {
      this._meta.misses++;
      return null;
    }
    
    try {
      // Verifica se elemento esiste
      if (!this._store.has(key)) {
        this._meta.misses++;
        logger.debug(`Cache miss per chiave: ${key} (non trovato)`);
        return null;
      }
      
      const item = this._store.get(key);
      const now = Date.now();
      
      // Verifica se l'elemento è scaduto
      if (item.expiresAt && item.expiresAt < now) {
        // Rimuovi elemento scaduto
        this._store.delete(key);
        this._meta.size = this._store.size;
        this._meta.obsoleteCount++;
        this._meta.misses++;
        
        logger.debug(`Cache miss per chiave: ${key} (scaduto)`);
        return null;
      }
      
      // Cache hit
      this._meta.hits++;
      logger.debug(`Cache hit per chiave: ${key}`);
      
      // Se il tipo di storage è 'hybrid', aggiorna il timestamp di accesso
      if (this._config.storageType === 'hybrid') {
        item.lastAccessed = now;
        this._store.set(key, item);
      }
      
      return item.value;
    } catch (error) {
      logger.error(`Errore durante il recupero dalla cache della chiave ${key}:`, error);
      this._meta.misses++;
      return null;
    }
  },
  
  /**
   * Rimuove un elemento dalla cache
   * @param {string} key - Chiave dell'elemento
   * @returns {Promise<boolean>} True se l'elemento è stato rimosso
   */
  async remove(key) {
    if (!this._config.enabled || !key) return false;
    
    try {
      // Verifica se elemento esiste
      if (!this._store.has(key)) {
        logger.debug(`Tentativo di rimozione elemento non esistente: ${key}`);
        return false;
      }
      
      // Rimuovi elemento
      this._store.delete(key);
      
      // Aggiorna metadati
      this._meta.size = this._store.size;
      
      logger.debug(`Elemento rimosso dalla cache: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Errore durante la rimozione dalla cache della chiave ${key}:`, error);
      return false;
    }
  },
  
  /**
   * Elimina gli elementi scaduti dalla cache
   * @returns {Promise<number>} Numero elementi rimossi
   */
  async cleanup() {
    if (!this._config.enabled) return 0;
    
    try {
      const now = Date.now();
      let removedCount = 0;
      
      // Identifica e rimuovi elementi scaduti
      for (const [key, item] of this._store.entries()) {
        if (item.expiresAt && item.expiresAt < now) {
          this._store.delete(key);
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        // Aggiorna metadati
        this._meta.size = this._store.size;
        this._meta.obsoleteCount = Math.max(0, this._meta.obsoleteCount - removedCount);
        this._meta.lastCleanup = now;
        
        logger.debug(`Pulizia cache completata: ${removedCount} elementi rimossi`);
        
        // Salva su disco dopo pulizia se persistenza abilitata
        if (this._config.persistence) {
          await this._persistToDisk();
        }
      }
      
      return removedCount;
    } catch (error) {
      logger.error('Errore durante la pulizia della cache:', error);
      return 0;
    }
  },
  
  /**
   * Elimina gli elementi più vecchi quando la cache raggiunge la dimensione massima
   * @private
   * @returns {Promise<number>} Numero elementi rimossi
   */
  async _evictOldest() {
    try {
      // Calcola quanti elementi rimuovere
      const overflow = this._store.size - this._config.maxSize;
      if (overflow <= 0) return 0;
      
      // Aggiungi il 10% come margine per evitare compattazioni frequenti
      const removeCount = Math.ceil(overflow + (this._config.maxSize * 0.1));
      
      // Organizza gli elementi per data di creazione/accesso
      const items = [];
      for (const [key, value] of this._store.entries()) {
        items.push({
          key,
          // Usa lastAccessed o createdAt come criterio
          timestamp: value.lastAccessed || value.createdAt,
          expiresAt: value.expiresAt
        });
      }
      
      // Ordina per timestamp (più vecchi prima)
      items.sort((a, b) => a.timestamp - b.timestamp);
      
      // Rimuovi gli elementi più vecchi
      let removedCount = 0;
      for (let i = 0; i < removeCount && i < items.length; i++) {
        this._store.delete(items[i].key);
        removedCount++;
      }
      
      // Aggiorna metadati
      this._meta.size = this._store.size;
      
      logger.info(`Cache compattata: ${removedCount} elementi vecchi rimossi`);
      return removedCount;
    } catch (error) {
      logger.error('Errore durante la compattazione della cache:', error);
      return 0;
    }
  },
  
  /**
   * Cancella completamente la cache
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async clear() {
    if (!this._config.enabled) return false;
    
    try {
      // Memorizza la dimensione precedente per il log
      const prevSize = this._store.size;
      
      // Svuota lo store
      this._store.clear();
      
      // Resetta i metadati
      this._meta.size = 0;
      this._meta.obsoleteCount = 0;
      this._meta.lastCleanup = Date.now();
      
      // Se persistenza abilitata, rimuovi anche da disco
      if (this._config.persistence) {
        try {
          const persistDir = await this._ensurePersistDirectory();
          const persistPath = path.join(persistDir, 'cache-store.json');
          
          // Scrivi cache vuota
          await this._persistToDisk();
          
          logger.info('Cache su disco cancellata');
        } catch (diskError) {
          logger.error('Errore durante la cancellazione della cache su disco:', diskError);
          // Continua comunque, la cache in memoria è stata cancellata
        }
      }
      
      logger.info(`Cache cancellata: ${prevSize} elementi rimossi`);
      return true;
    } catch (error) {
      logger.error('Errore durante la cancellazione della cache:', error);
      return false;
    }
  },
  
  /**
   * Restituisce le chiavi presenti nella cache
   * @returns {Promise<string[]>} Array di chiavi
   */
  async getKeys() {
    if (!this._config.enabled) return [];
    
    try {
      return [...this._store.keys()];
    } catch (error) {
      logger.error('Errore durante il recupero delle chiavi cache:', error);
      return [];
    }
  },
  
  /**
   * Restituisce statistiche sulla cache
   * @returns {Object} Statistiche
   */
  getStats() {
    const hitRate = this._meta.hits + this._meta.misses > 0 
      ? (this._meta.hits / (this._meta.hits + this._meta.misses)) * 100 
      : 0;
    
    return {
      size: this._meta.size,
      maxSize: this._config.maxSize,
      utilization: this._meta.size / this._config.maxSize * 100,
      hits: this._meta.hits,
      misses: this._meta.misses,
      hitRate: Math.round(hitRate * 100) / 100, // Arrotonda a 2 decimali
      lastCleanup: this._meta.lastCleanup,
      lastPersist: this._meta.lastPersist,
      createdAt: this._meta.createdAt,
      uptime: Date.now() - this._meta.createdAt
    };
  }
};

module.exports = storeService;