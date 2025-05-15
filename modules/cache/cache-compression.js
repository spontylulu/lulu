/**
 * modules/cache/cache-compression.js
 * Servizio di compressione dati per il modulo cache
 * 
 * Implementa meccanismi per comprimere e decomprimere i dati nella cache,
 * ottimizzando lo spazio di archiviazione e migliorando le performance.
 */

const logger = require('../../utils/logger').getLogger('cache:compression');
const zlib = require('zlib');
const { promisify } = require('util');

// Promisify delle funzioni zlib
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

/**
 * Servizio di compressione per il modulo cache
 */
const compressionService = {
  // Configurazione di default
  _config: {
    enabled: true,
    algorithm: 'gzip',        // Algoritmo di compressione
    level: 6,                 // Livello compressione (1-9)
    minLength: 500,           // Lunghezza minima per compressione
    compressionRatioThreshold: 0.8, // Soglia minima ratio compressione
    metadataKeys: ['query']   // Chiavi metadata da non comprimere
  },
  
  // Metriche
  _metrics: {
    compressed: 0,            // Numero totale item compressi
    skipped: 0,               // Numero item saltati
    totalSizeSaved: 0,        // Byte risparmiati
    avgCompressionRatio: 0,   // Ratio media di compressione
    lastCompressionRatio: 0,  // Ultima ratio di compressione
    errors: 0                 // Errori di compressione/decompressione
  },
  
  /**
   * Inizializza il servizio di compressione
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio compressione');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Reset metriche
      this._resetMetrics();
      
      logger.info('Servizio compressione inizializzato con successo', {
        algorithm: this._config.algorithm,
        level: this._config.level,
        minLength: this._config.minLength
      });
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio compressione:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio di compressione
   */
  async shutdown() {
    logger.info('Chiusura servizio compressione');
    
    try {
      // Nulla da pulire in particolare
      logger.info('Servizio compressione chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio compressione:', error);
      throw error;
    }
  },
  
  /**
   * Resetta le metriche di compressione
   * @private
   */
  _resetMetrics() {
    this._metrics = {
      compressed: 0,
      skipped: 0,
      totalSizeSaved: 0,
      avgCompressionRatio: 0,
      lastCompressionRatio: 0,
      errors: 0
    };
  },
  
  /**
   * Aggiorna le metriche di compressione
   * @private
   * @param {number} originalSize - Dimensione prima della compressione
   * @param {number} compressedSize - Dimensione dopo la compressione
   * @param {boolean} skipped - Se la compressione è stata saltata
   * @param {boolean} isError - Se si è verificato un errore
   */
  _updateMetrics(originalSize, compressedSize, skipped = false, isError = false) {
    if (skipped) {
      this._metrics.skipped++;
      return;
    }
    
    if (isError) {
      this._metrics.errors++;
      return;
    }
    
    // Calcola ratio di compressione
    const compressionRatio = compressedSize / originalSize;
    
    // Aggiorna metriche
    this._metrics.compressed++;
    this._metrics.totalSizeSaved += (originalSize - compressedSize);
    this._metrics.lastCompressionRatio = compressionRatio;
    
    // Calcola media progressiva
    this._metrics.avgCompressionRatio = (
      (this._metrics.avgCompressionRatio * (this._metrics.compressed - 1)) + 
      compressionRatio
    ) / this._metrics.compressed;
  },
  
  /**
   * Comprime un payload cache
   * @param {Object} payload - Payload da comprimere
   * @returns {Promise<Object>} Payload compresso
   */
  async compress(payload) {
    if (!this._config.enabled || !payload) {
      return payload;
    }
    
    try {
      // Salta se il payload è già compresso
      if (payload.compressed === true) {
        logger.debug('Payload già compresso, skip');
        return payload;
      }
      
      // Clone per evitare modifiche all'originale
      const result = this._clonePayload(payload);
      
      // Estrai i metadati che non verranno compressi
      const preservedMetadata = {};
      if (result.metadata) {
        for (const key of this._config.metadataKeys) {
          if (result.metadata[key] !== undefined) {
            preservedMetadata[key] = result.metadata[key];
          }
        }
      }
      
      // Converti in string per compressione
      const originalData = JSON.stringify({
        response: result.response,
        query: result.query,
        metadata: result.metadata
      });
      
      // Verifica se il payload è abbastanza grande per la compressione
      if (originalData.length < this._config.minLength) {
        logger.debug(`Payload troppo piccolo per compressione (${originalData.length} bytes), skip`);
        this._updateMetrics(0, 0, true);
        return payload;
      }
      
      // Applica compressione in base all'algoritmo configurato
      let compressedData;
      
      switch (this._config.algorithm) {
        case 'gzip':
          compressedData = await gzipAsync(originalData, {
            level: this._config.level
          });
          break;
        default:
          // Fallback a gzip
          compressedData = await gzipAsync(originalData, {
            level: this._config.level
          });
      }
      
      // Converti buffer in Base64 per storage
      const base64Data = compressedData.toString('base64');
      
      // Verifica se la compressione è efficace
      const compressionRatio = base64Data.length / originalData.length;
      
      if (compressionRatio > this._config.compressionRatioThreshold) {
        logger.debug(`Rapporto di compressione insufficiente (${(compressionRatio * 100).toFixed(1)}%), skip`);
        this._updateMetrics(0, 0, true);
        return payload;
      }
      
      // Assembla il payload compresso
      const compressedPayload = {
        compressed: true,
        algorithm: this._config.algorithm,
        originalSize: originalData.length,
        compressedSize: base64Data.length,
        ratio: compressionRatio,
        data: base64Data,
        // Ripristina i metadati preservati
        metadata: {
          ...preservedMetadata,
          compressionTimestamp: Date.now()
        }
      };
      
      // Aggiorna metriche
      this._updateMetrics(originalData.length, base64Data.length);
      
      logger.debug(`Payload compresso con successo: ${originalData.length} → ${base64Data.length} bytes (${(compressionRatio * 100).toFixed(1)}%)`);
      
      return compressedPayload;
    } catch (error) {
      logger.error('Errore durante la compressione del payload:', error);
      this._updateMetrics(0, 0, false, true);
      // Fallback al payload originale
      return payload;
    }
  },
  
  /**
   * Decomprime un payload cache
   * @param {Object} payload - Payload da decomprimere
   * @returns {Promise<Object>} Payload decompresso
   */
  async decompress(payload) {
    if (!this._config.enabled || !payload) {
      return payload;
    }
    
    try {
      // Salta se il payload non è compresso
      if (payload.compressed !== true || !payload.data) {
        return payload;
      }
      
      // Converti da Base64 a Buffer
      const compressedBuffer = Buffer.from(payload.data, 'base64');
      
      // Applica decompressione in base all'algoritmo
      let decompressedString;
      
      switch (payload.algorithm || this._config.algorithm) {
        case 'gzip':
          const decompressedBuffer = await gunzipAsync(compressedBuffer);
          decompressedString = decompressedBuffer.toString('utf8');
          break;
        default:
          // Fallback a gzip
          const defaultDecompressed = await gunzipAsync(compressedBuffer);
          decompressedString = defaultDecompressed.toString('utf8');
      }
      
      // Converte da string a oggetto
      const decompressedData = JSON.parse(decompressedString);
      
      // Restaura i metadati preservati
      const result = {
        ...decompressedData,
        metadata: {
          ...decompressedData.metadata,
          ...payload.metadata
        }
      };
      
      logger.debug(`Payload decompresso con successo: ${payload.compressedSize} → ${payload.originalSize} bytes`);
      
      return result;
    } catch (error) {
      logger.error('Errore durante la decompressione del payload:', error);
      this._updateMetrics(0, 0, false, true);
      
      // In caso di errore, restituisci un payload minimale
      return {
        response: "Errore di decompressione della risposta in cache",
        query: payload.metadata?.query || "[Query non disponibile]",
        metadata: {
          ...payload.metadata,
          decompressionError: true,
          errorMessage: error.message
        }
      };
    }
  },
  
  /**
   * Clona un payload evitando riferimenti
   * @private
   * @param {Object} payload - Payload da clonare
   * @returns {Object} Clone del payload
   */
  _clonePayload(payload) {
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch (error) {
      logger.error('Errore durante la clonazione del payload:', error);
      return { ...payload };
    }
  },
  
  /**
   * Ottiene le statistiche di compressione
   * @returns {Object} Statistiche
   */
  getStats() {
    const ratio = this._metrics.avgCompressionRatio || 0;
    const savingPercentage = (1 - ratio) * 100;
    
    return {
      enabled: this._config.enabled,
      algorithm: this._config.algorithm,
      level: this._config.level,
      compressed: this._metrics.compressed,
      skipped: this._metrics.skipped,
      errors: this._metrics.errors,
      compressionRatio: parseFloat(ratio.toFixed(4)),
      savingPercentage: parseFloat(savingPercentage.toFixed(2)),
      totalSizeSaved: this._metrics.totalSizeSaved,
      totalSizeSavedFormatted: this._formatBytes(this._metrics.totalSizeSaved)
    };
  },
  
  /**
   * Formatta i bytes in unità leggibili
   * @private
   * @param {number} bytes - Numero di bytes
   * @returns {string} Formato leggibile
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

module.exports = compressionService;