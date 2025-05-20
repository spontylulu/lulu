/**
 * modules/cache/cache-index.js
 * Modulo Cache - Gestione della cache per Lulu
 * 
 * Questo modulo fornisce un sistema di caching avanzato per risposte AI,
 * ottimizzando l'utilizzo di token API e migliorando i tempi di risposta.
 */

const logger = require('../../utils/logger').getLogger('cache:index');
const similarityService = require('./cache-similarity');
const storeService = require('./cache-store');
const compressionService = require('./cache-compression');
const statsService = require('./cache-stats');

/**
 * Modulo Cache - Gestisce il caching delle risposte AI
 */
const cacheModule = {
  // Servizi interni
  _similarity: similarityService,
  _store: storeService,
  _compression: compressionService,
  _stats: statsService,
  
  // Configurazione di default
  _config: {
    enabled: true,
    similarity: {
      enabled: true,
      threshold: 0.8  // Soglia di similarità per match (0-1)
    },
    compression: {
      enabled: true,
      minLength: 500  // Lunghezza minima per compressione
    },
    ttl: 30 * 24 * 60 * 60 * 1000, // Time-to-live (30 giorni)
    cleanupInterval: 24 * 60 * 60 * 1000 // Pulizia ogni 24 ore
  },
  
  /**
   * Inizializza il modulo cache
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del modulo
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione modulo cache');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };

      // Skip se disabilitato
      if (!this._config.enabled) {
        logger.info('Modulo cache disabilitato da configurazione');
        return this;
      }
      
      // Inizializza i servizi interni
      await this._similarity.initialize(this._config.similarity);
      await this._store.initialize(this._config);
      await this._compression.initialize(this._config.compression);
      await this._stats.initialize();
      
      // Imposta routine di pulizia
      if (this._config.cleanupInterval > 0) {
        this._startCleanupInterval();
      }
      
      logger.info('Modulo cache inizializzato con successo');
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del modulo cache:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il modulo cache
   */
  async shutdown() {
    logger.info('Chiusura modulo cache');
    
    try {
      // Stop alla routine di cleanup
      if (this._cleanupInterval) {
        clearInterval(this._cleanupInterval);
        this._cleanupInterval = null;
      }
      
      // Chiudi i servizi interni
      await this._store.shutdown();
      await this._similarity.shutdown();
      await this._compression.shutdown();
      await this._stats.shutdown();
      
      logger.info('Modulo cache chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del modulo cache:', error);
      throw error;
    }
  },
  
  /**
   * Restituisce lo stato attuale del modulo
   * @returns {Object} Stato del modulo
   */
  status() {
    return {
      active: this._config.enabled,
      similarity: {
        enabled: this._config.similarity.enabled,
        threshold: this._config.similarity.threshold
      },
      compression: {
        enabled: this._config.compression.enabled,
        minLength: this._config.compression.minLength
      },
      stats: this._stats.getStats()
    };
  },
  
  /**
   * Avvia l'intervallo di pulizia automatica
   * @private
   */
  _startCleanupInterval() {
    this._cleanupInterval = setInterval(() => {
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
    
    logger.debug(`Routine di pulizia cache impostata ogni ${this._config.cleanupInterval / (60 * 60 * 1000)} ore`);
  },
  
  /**
   * Salva una risposta in cache
   * @param {string} query - Query originale
   * @param {Object} response - Oggetto risposta
   * @param {Object} options - Opzioni aggiuntive
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async set(query, response, options = {}) {
    if (!this._config.enabled) return false;
    
    try {
      const startTime = Date.now();
      
      // Genera chiave per la cache
      const key = options.key || this._generateCacheKey(query, options);
      
      // Prepara il payload
      let payload = { 
        query, 
        response,
        metadata: {
          timestamp: Date.now(),
          options: { ...options },
          key
        }
      };
      
      // Comprimi se necessario
      if (this._config.compression.enabled && this._shouldCompress(payload)) {
        payload = await this._compression.compress(payload);
      }
      
      // Salva nella cache
      const success = await this._store.set(key, payload, this._config.ttl);
      
      // Aggiorna statistiche
      this._stats.recordSet({
        success,
        key,
        size: JSON.stringify(payload).length,
        compressed: payload.compressed === true,
        duration: Date.now() - startTime
      });
      
      logger.debug(`Cache set per chiave: ${key.substring(0, 16)}... (esito: ${success ? 'successo' : 'fallito'})`);
      
      return success;
    } catch (error) {
      logger.error('Errore durante il salvataggio in cache:', error);
      
      // Aggiorna statistiche errori
      this._stats.recordError('set', error.message);
      
      return false;
    }
  },
  
  /**
   * Recupera una risposta dalla cache
   * @param {string} query - Query da cercare
   * @param {Object} options - Opzioni di ricerca
   * @returns {Promise<Object|null>} Risposta o null se non trovata
   */
  async get(query, options = {}) {
    if (!this._config.enabled) return null;
    
    try {
      const startTime = Date.now();
      
      // Caso 1: Ricerca con chiave esatta (se specificata)
      if (options.key) {
        const result = await this._getByKey(options.key);
        
        // Aggiorna statistiche
        this._stats.recordGet({
          hit: result !== null,
          exact: true,
          similarity: result ? 1.0 : 0,
          key: options.key,
          duration: Date.now() - startTime
        });
        
        return result;
      }
      
      // Caso 2: Ricerca per similarità (se abilitata)
      if (this._config.similarity.enabled) {
        // Ottieni tutte le chiavi e calcola la similarità
        const keys = await this._store.getKeys();
        
        if (keys.length === 0) {
          logger.debug('Cache vuota, nessuna chiave trovata');
          
          // Aggiorna statistiche
          this._stats.recordGet({
            hit: false,
            exact: false,
            reason: 'empty',
            duration: Date.now() - startTime
          });
          
          return null;
        }
        
        // Ottieni le query associate a ogni chiave
        const cacheQueries = {};
        
        for (const key of keys) {
          try {
            const cachedItem = await this._store.get(key);
            
            if (cachedItem && cachedItem.query) {
              // Decomprimere se necessario
              if (cachedItem.compressed === true) {
                const decompressed = await this._compression.decompress(cachedItem);
                cacheQueries[key] = decompressed.query;
              } else {
                cacheQueries[key] = cachedItem.query;
              }
            }
          } catch (error) {
            logger.warn(`Errore nel recupero query per la chiave ${key}:`, error);
          }
        }
        
        // Calcola similarità e trova la migliore
        const bestMatch = await this._similarity.findBestMatch(
          query, 
          cacheQueries, 
          this._config.similarity.threshold
        );
        
        if (bestMatch) {
          logger.debug(`Trovata corrispondenza per similarità: ${bestMatch.key} (score: ${bestMatch.score.toFixed(4)})`);
          
          // Recupera l'elemento dalla cache
          const cachedItem = await this._store.get(bestMatch.key);
          
          // Decomprimere se necessario
          if (cachedItem.compressed === true) {
            const decompressed = await this._compression.decompress(cachedItem);
            
            // Aggiorna statistiche
            this._stats.recordGet({
              hit: true,
              exact: false,
              similarity: bestMatch.score,
              key: bestMatch.key,
              duration: Date.now() - startTime
            });
            
            return decompressed.response;
          }
          
          // Aggiorna statistiche
          this._stats.recordGet({
            hit: true,
            exact: false,
            similarity: bestMatch.score,
            key: bestMatch.key,
            duration: Date.now() - startTime
          });
          
          return cachedItem.response;
        }
      }
      
      // Nessuna corrispondenza trovata
      logger.debug(`Nessuna corrispondenza in cache per la query: ${query.substring(0, 50)}...`);
      
      // Aggiorna statistiche
      this._stats.recordGet({
        hit: false,
        exact: false,
        reason: 'no_match',
        duration: Date.now() - startTime
      });
      
      return null;
    } catch (error) {
      logger.error('Errore durante il recupero dalla cache:', error);
      
      // Aggiorna statistiche errori
      this._stats.recordError('get', error.message);
      
      return null;
    }
  },
  
  /**
   * Recupera un elemento dalla cache per chiave esatta
   * @private
   * @param {string} key - Chiave di cache
   * @returns {Promise<Object|null>} Risposta o null se non trovata
   */
  async _getByKey(key) {
    try {
      const cachedItem = await this._store.get(key);
      
      if (!cachedItem) {
        logger.debug(`Nessun elemento trovato per la chiave: ${key}`);
        return null;
      }
      
      // Decomprimere se necessario
      if (cachedItem.compressed === true) {
        logger.debug(`Decompressione elemento per la chiave: ${key}`);
        const decompressed = await this._compression.decompress(cachedItem);
        return decompressed.response;
      }
      
      logger.debug(`Recuperato elemento per la chiave: ${key}`);
      return cachedItem.response;
    } catch (error) {
      logger.error(`Errore nel recupero per chiave ${key}:`, error);
      return null;
    }
  },
  
  /**
   * Genera una chiave di cache
   * @private
   * @param {string} query - Query originale
   * @param {Object} options - Opzioni aggiuntive
   * @returns {string} Chiave generata
   */
  _generateCacheKey(query, options = {}) {
    try {
      // Estrai parametri rilevanti per la chiave
      const { userId, model, systemPrompt } = options;
      
      // Normalizza la query (trim, lowercase)
      const normalizedQuery = query.trim().toLowerCase();
      
      // Crea una stringa da hashare
      let keyString = normalizedQuery;
      
      // Aggiungi parametri opzionali se presenti
      if (model) keyString += `|model:${model}`;
      if (systemPrompt) keyString += `|prompt:${systemPrompt.substring(0, 100)}`; // limita lunghezza
      if (userId) keyString += `|user:${userId.substring(0, 10)}`;
      
      // Genera hash
      const crypto = require('crypto');
      const hash = crypto.createHash('md5').update(keyString).digest('hex');
      
      return `cache:${hash}`;
    } catch (error) {
      logger.error('Errore nella generazione della chiave di cache:', error);
      
      // Fallback a timestamp + random
      return `cache:${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    }
  },
  
  /**
   * Determina se un payload deve essere compresso
   * @private
   * @param {Object} payload - Payload da valutare
   * @returns {boolean} True se il payload deve essere compresso
   */
  _shouldCompress(payload) {
    try {
      const jsonString = JSON.stringify(payload);
      return jsonString.length > this._config.compression.minLength;
    } catch (error) {
      logger.error('Errore nella valutazione per compressione:', error);
      return false;
    }
  },
  
  /**
   * Rimuove un elemento dalla cache
   * @param {string} key - Chiave di cache
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async remove(key) {
    if (!this._config.enabled) return false;
    
    try {
      const result = await this._store.remove(key);
      
      if (result) {
        logger.debug(`Elemento rimosso dalla cache: ${key}`);
        this._stats.recordRemove({ success: true, key });
      } else {
        logger.debug(`Elemento non trovato per rimozione: ${key}`);
        this._stats.recordRemove({ success: false, key, reason: 'not_found' });
      }
      
      return result;
    } catch (error) {
      logger.error(`Errore nella rimozione dalla cache (chiave: ${key}):`, error);
      this._stats.recordError('remove', error.message);
      return false;
    }
  },
  
  /**
   * Pulisce gli elementi scaduti dalla cache
   * @returns {Promise<number>} Numero di elementi rimossi
   */
  async cleanup() {
    if (!this._config.enabled) return 0;
    
    try {
      logger.info('Avvio pulizia cache');
      const startTime = Date.now();
      
      // Esegui pulizia
      const count = await this._store.cleanup();
      
      const duration = Date.now() - startTime;
      logger.info(`Pulizia cache completata in ${duration}ms: ${count} elementi rimossi`);
      
      // Aggiorna statistiche
      this._stats.recordCleanup({ count, duration });
      
      return count;
    } catch (error) {
      logger.error('Errore durante la pulizia della cache:', error);
      this._stats.recordError('cleanup', error.message);
      return 0;
    }
  },
  
  /**
   * Cancella l'intera cache
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async clear() {
    if (!this._config.enabled) return false;
    
    try {
      logger.warn('Avvio cancellazione completa cache');
      const startTime = Date.now();
      
      // Esegui pulizia
      const result = await this._store.clear();
      
      const duration = Date.now() - startTime;
      logger.warn(`Cancellazione cache completata in ${duration}ms`);
      
      // Aggiorna statistiche
      this._stats.recordClear({ success: result, duration });
      
      return result;
    } catch (error) {
      logger.error('Errore durante la cancellazione della cache:', error);
      this._stats.recordError('clear', error.message);
      return false;
    }
  },
  
  /**
   * Ottiene le statistiche di utilizzo della cache
   * @returns {Object} Statistiche di utilizzo
   */
  getStats() {
    return this._stats.getStats();
  }
};

module.exports = cacheModule;