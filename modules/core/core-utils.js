/**
 * modules/core/core-utils.js
 * Utilità condivise per Lulu
 * 
 * Fornisce funzioni di utilità generale utilizzabili da tutti i moduli dell'applicazione,
 * implementando funzionalità comuni per evitare duplicazione del codice.
 */

const logger = require('../../utils/logger').getLogger('core:utils');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const zlib = require('zlib');

// Promisify delle funzioni zlib
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

/**
 * Servizio utility condivise
 * Fornisce funzioni di utilità comune per tutti i moduli
 */
const utilsService = {
  // Flag per tracciare lo stato del servizio
  _active: false,
  
  // Configurazione di default
  _config: {
    tempDir: './temp',
    hashAlgorithm: 'sha256',
    retryAttempts: 3,
    retryDelay: 1000,
    idLength: 10
  },
  
  /**
   * Inizializza il servizio utility
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio utility');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Assicura che esista la directory temporanea
      await this._ensureTempDir();
      
      this._active = true;
      logger.info('Servizio utility inizializzato con successo');
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio utility:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio utility
   */
  async shutdown() {
    logger.info('Chiusura servizio utility');
    
    try {
      // Pulisci eventuali risorse
      this._active = false;
      logger.info('Servizio utility chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio utility:', error);
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
   * Assicura che esista la directory temporanea
   * @private
   */
  async _ensureTempDir() {
    try {
      const tempDir = path.resolve(this._config.tempDir);
      await fs.mkdir(tempDir, { recursive: true });
      logger.debug(`Directory temporanea creata: ${tempDir}`);
    } catch (error) {
      logger.error('Errore nella creazione della directory temporanea:', error);
      throw error;
    }
  },
  
  // ========== STRING UTILITIES ==========
  
  /**
   * Genera un ID univoco
   * @param {number} [length] - Lunghezza dell'ID (default da config)
   * @param {string} [prefix=''] - Prefisso dell'ID
   * @returns {string} ID generato
   */
  generateId(length, prefix = '') {
    const idLength = length || this._config.idLength;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    
    // Genera stringa casuale
    for (let i = 0; i < idLength; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return `${prefix}${prefix ? '-' : ''}${id}`;
  },
  
  /**
   * Calcola l'hash di una stringa o buffer
   * @param {string|Buffer} data - Dati da cui calcolare l'hash
   * @param {string} [algorithm] - Algoritmo di hash (default da config)
   * @returns {string} Hash calcolato
   */
  calculateHash(data, algorithm) {
    const hashAlgo = algorithm || this._config.hashAlgorithm;
    
    try {
      const hash = crypto.createHash(hashAlgo);
      hash.update(data);
      return hash.digest('hex');
    } catch (error) {
      logger.error(`Errore nel calcolo dell'hash (${hashAlgo}):`, error);
      throw error;
    }
  },
  
  /**
   * Tronca una stringa alla lunghezza specificata aggiungendo ellipsis
   * @param {string} str - Stringa da troncare
   * @param {number} maxLength - Lunghezza massima
   * @param {string} [ellipsis='...'] - Stringa da aggiungere per indicare troncamento
   * @returns {string} Stringa troncata
   */
  truncate(str, maxLength, ellipsis = '...') {
    if (!str || str.length <= maxLength) {
      return str;
    }
    
    return str.substring(0, maxLength - ellipsis.length) + ellipsis;
  },
  
  /**
   * Sanitizza una stringa per utilizzo sicuro in contesti sensibili
   * @param {string} str - Stringa da sanitizzare
   * @param {boolean} [allowHtml=false] - Se permettere HTML sicuro
   * @returns {string} Stringa sanitizzata
   */
  sanitize(str, allowHtml = false) {
    if (!str) return '';
    
    // Rimuovi caratteri potenzialmente pericolosi
    let sanitized = str.toString()
      .replace(/[^\w\s.,;:!?()\[\]{}<>@#$%^&*+=_-]/g, '');
    
    // Se l'HTML non è permesso, esegui escape dei tag
    if (!allowHtml) {
      sanitized = sanitized
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    
    return sanitized;
  },
  
  /**
   * Calcola la similarità tra due stringhe (distanza di Levenshtein)
   * @param {string} str1 - Prima stringa
   * @param {string} str2 - Seconda stringa
   * @returns {number} Punteggio di similarità (0-1, dove 1 è identico)
   */
  calculateSimilarity(str1, str2) {
    if (!str1 && !str2) return 1.0;
    if (!str1 || !str2) return 0.0;
    
    // Normalizza input
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Usa un algoritmo veloce per stringhe molto diverse in lunghezza
    if (Math.abs(s1.length - s2.length) > 0.5 * Math.max(s1.length, s2.length)) {
      return 0.0;
    }
    
    // Calcola distanza di Levenshtein
    const distMatrix = [];
    
    // Inizializza prima riga e colonna
    for (let i = 0; i <= s1.length; i++) {
      distMatrix[i] = [i];
    }
    
    for (let j = 0; j <= s2.length; j++) {
      distMatrix[0][j] = j;
    }
    
    // Riempi la matrice
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1.charAt(i - 1) === s2.charAt(j - 1) ? 0 : 1;
        distMatrix[i][j] = Math.min(
          distMatrix[i - 1][j] + 1,      // Eliminazione
          distMatrix[i][j - 1] + 1,      // Inserimento
          distMatrix[i - 1][j - 1] + cost // Sostituzione
        );
      }
    }
    
    // Calcola similarità basata sulla distanza
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0; // Entrambe le stringhe sono vuote
    
    const distance = distMatrix[s1.length][s2.length];
    return 1.0 - (distance / maxLen);
  },
  
  // ========== OBJECT UTILITIES ==========
  
  /**
   * Esegue deep clone di un oggetto
   * @param {Object} obj - Oggetto da clonare
   * @returns {Object} Clone dell'oggetto
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    // Gestione di Date
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    // Gestione di Array
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }
    
    // Gestione di oggetti standard
    const clone = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clone[key] = this.deepClone(obj[key]);
      }
    }
    
    return clone;
  },
  
  /**
   * Unisce profondamente due oggetti
   * @param {Object} target - Oggetto target
   * @param {Object} source - Oggetto sorgente
   * @returns {Object} Oggetto risultante
   */
  deepMerge(target, source) {
    // Crea copie per non modificare gli originali
    const output = this.deepClone(target);
    
    if (!source) {
      return output;
    }
    
    // Gestisci casi in cui source non è un oggetto
    if (typeof source !== 'object' || source === null) {
      return source;
    }
    
    Object.keys(source).forEach(key => {
      if (source[key] instanceof Object && key in output && output[key] instanceof Object) {
        output[key] = this.deepMerge(output[key], source[key]);
      } else {
        output[key] = this.deepClone(source[key]);
      }
    });
    
    return output;
  },
  
  /**
   * Applica una trasformazione ricorsiva a un oggetto
   * @param {Object} obj - Oggetto da trasformare
   * @param {Function} transformer - Funzione di trasformazione (key, value) => [newKey, newValue]
   * @returns {Object} Oggetto trasformato
   */
  transformObject(obj, transformer) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    // Gestione di Array
    if (Array.isArray(obj)) {
      return obj.map(item => this.transformObject(item, transformer));
    }
    
    // Trasforma oggetto
    const result = {};
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const transformed = transformer(key, value);
        
        if (transformed === null) {
          // Salta questa proprietà
          continue;
        }
        
        const [newKey, newValue] = transformed;
        
        // Applica ricorsivamente ai sotto-oggetti
        if (newValue !== null && typeof newValue === 'object') {
          result[newKey] = this.transformObject(newValue, transformer);
        } else {
          result[newKey] = newValue;
        }
      }
    }
    
    return result;
  },
  
  // ========== FILE UTILITIES ==========
  
  /**
   * Scrive dati su file temporaneo
   * @param {string|Buffer} data - Dati da scrivere
   * @param {string} [extension='txt'] - Estensione del file
   * @returns {Promise<string>} Percorso del file temporaneo
   */
  async writeTempFile(data, extension = 'txt') {
    try {
      const filename = `${this.generateId()}.${extension}`;
      const filePath = path.join(this._config.tempDir, filename);
      
      await fs.writeFile(filePath, data);
      logger.debug(`File temporaneo creato: ${filePath}`);
      
      return filePath;
    } catch (error) {
      logger.error('Errore nella scrittura del file temporaneo:', error);
      throw error;
    }
  },
  
  /**
   * Legge un file temporaneo
   * @param {string} filename - Nome del file temporaneo
   * @returns {Promise<Buffer>} Contenuto del file
   */
  async readTempFile(filename) {
    try {
      const filePath = path.join(this._config.tempDir, filename);
      return await fs.readFile(filePath);
    } catch (error) {
      logger.error(`Errore nella lettura del file temporaneo ${filename}:`, error);
      throw error;
    }
  },
  
  /**
   * Elimina un file temporaneo
   * @param {string} filename - Nome del file temporaneo
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async deleteTempFile(filename) {
    try {
      const filePath = path.join(this._config.tempDir, filename);
      await fs.unlink(filePath);
      logger.debug(`File temporaneo eliminato: ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Errore nell'eliminazione del file temporaneo ${filename}:`, error);
      return false;
    }
  },
  
  /**
   * Pulisce tutti i file temporanei più vecchi di una certa età
   * @param {number} maxAgeMs - Età massima in millisecondi
   * @returns {Promise<number>} Numero di file eliminati
   */
  async cleanupTempFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
    try {
      const tempDir = path.resolve(this._config.tempDir);
      const now = Date.now();
      const files = await fs.readdir(tempDir);
      
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        // Calcola età del file
        const fileAge = now - stats.mtime.getTime();
        
        if (fileAge > maxAgeMs) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      logger.info(`Pulizia file temporanei completata: ${deletedCount} file eliminati`);
      return deletedCount;
    } catch (error) {
      logger.error('Errore durante la pulizia dei file temporanei:', error);
      throw error;
    }
  },
  
  // ========== COMPRESSION UTILITIES ==========
  
  /**
   * Comprime una stringa o buffer con gzip
   * @param {string|Buffer} data - Dati da comprimere
   * @returns {Promise<Buffer>} Dati compressi
   */
  async compress(data) {
    try {
      return await gzipAsync(data);
    } catch (error) {
      logger.error('Errore durante la compressione dei dati:', error);
      throw error;
    }
  },
  
  /**
   * Decomprime dati compressi con gzip
   * @param {Buffer} compressedData - Dati compressi
   * @param {boolean} [asString=true] - Se restituire come stringa
   * @returns {Promise<string|Buffer>} Dati decompressi
   */
  async decompress(compressedData, asString = true) {
    try {
      const buffer = await gunzipAsync(compressedData);
      return asString ? buffer.toString() : buffer;
    } catch (error) {
      logger.error('Errore durante la decompressione dei dati:', error);
      throw error;
    }
  },
  
  // ========== RETRY UTILITIES ==========
  
  /**
   * Esegue una funzione con retry automatico in caso di errore
   * @param {Function} fn - Funzione da eseguire
   * @param {Object} [options] - Opzioni di retry
   * @param {number} [options.attempts] - Numero di tentativi (default da config)
   * @param {number} [options.delay] - Ritardo tra tentativi in ms (default da config)
   * @param {number} [options.backoffFactor=2] - Fattore di incremento del ritardo
   * @param {Function} [options.shouldRetry] - Funzione che decide se ritentare (error) => boolean
   * @returns {Promise<*>} Risultato della funzione
   */
  async withRetry(fn, options = {}) {
    const attempts = options.attempts || this._config.retryAttempts;
    const initialDelay = options.delay || this._config.retryDelay;
    const backoffFactor = options.backoffFactor || 2;
    const shouldRetry = options.shouldRetry || (() => true);
    
    let lastError;
    let delay = initialDelay;
    
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Verifica se dovremmo riprovare
        if (!shouldRetry(error) || attempt >= attempts) {
          break;
        }
        
        logger.debug(`Tentativo ${attempt} fallito, riprovo in ${delay}ms:`, {
          error: error.message,
          attempt,
          attempts,
          delay
        });
        
        // Attendi prima del prossimo tentativo
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Incrementa il delay per il prossimo tentativo
        delay = Math.min(delay * backoffFactor, 30000); // Max 30 secondi
      }
    }
    
    // Se arriviamo qui, tutti i tentativi sono falliti
    logger.error(`Tutti i tentativi falliti (${attempts}):`, lastError);
    throw lastError;
  },
  
  // ========== DATE UTILITIES ==========
  
  /**
   * Formatta una data secondo il formato specificato
   * @param {Date|number|string} date - Data da formattare
   * @param {string} [format='yyyy-mm-dd HH:MM:ss'] - Formato desiderato
   * @returns {string} Data formattata
   */
  formatDate(date, format = 'yyyy-mm-dd HH:MM:ss') {
    const d = new Date(date);
    
    if (isNaN(d.getTime())) {
      logger.warn(`Data non valida: ${date}`);
      return 'Invalid Date';
    }
    
    const replacements = {
      'yyyy': d.getFullYear(),
      'yy': d.getFullYear().toString().slice(-2),
      'mm': (d.getMonth() + 1).toString().padStart(2, '0'),
      'm': (d.getMonth() + 1),
      'dd': d.getDate().toString().padStart(2, '0'),
      'd': d.getDate(),
      'HH': d.getHours().toString().padStart(2, '0'),
      'H': d.getHours(),
      'MM': d.getMinutes().toString().padStart(2, '0'),
      'M': d.getMinutes(),
      'ss': d.getSeconds().toString().padStart(2, '0'),
      's': d.getSeconds(),
      'fff': d.getMilliseconds().toString().padStart(3, '0')
    };
    
    let result = format;
    for (const [pattern, value] of Object.entries(replacements)) {
      result = result.replace(pattern, value.toString());
    }
    
    return result;
  },
  
  /**
   * Calcola la differenza tra due date in varie unità
   * @param {Date|number|string} date1 - Prima data
   * @param {Date|number|string} date2 - Seconda data
   * @param {string} [unit='ms'] - Unità di misura (ms, s, m, h, d)
   * @returns {number} Differenza tra le date nell'unità specificata
   */
  dateDiff(date1, date2, unit = 'ms') {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
      logger.warn(`Date non valide per calcolo differenza: ${date1}, ${date2}`);
      return NaN;
    }
    
    const diffMs = Math.abs(d2.getTime() - d1.getTime());
    
    switch (unit.toLowerCase()) {
      case 's':
      case 'sec':
      case 'second':
      case 'seconds':
        return diffMs / 1000;
      case 'm':
      case 'min':
      case 'minute':
      case 'minutes':
        return diffMs / (1000 * 60);
      case 'h':
      case 'hr':
      case 'hour':
      case 'hours':
        return diffMs / (1000 * 60 * 60);
      case 'd':
      case 'day':
      case 'days':
        return diffMs / (1000 * 60 * 60 * 24);
      default:
        return diffMs; // Default: millisecondi
    }
  },
  
  // ========== VALIDATION UTILITIES ==========
  
  /**
   * Verifica se una stringa è un indirizzo email valido
   * @param {string} email - Email da verificare
   * @returns {boolean} True se è un'email valida
   */
  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    
    // Pattern RFC 5322 semplificato
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return pattern.test(email);
  },
  
  /**
   * Verifica se una stringa è un URL valido
   * @param {string} url - URL da verificare
   * @param {boolean} [requireProtocol=true] - Se richiedere il protocollo
   * @returns {boolean} True se è un URL valido
   */
  isValidUrl(url, requireProtocol = true) {
    if (!url || typeof url !== 'string') return false;
    
    try {
      const urlObj = new URL(url);
      return requireProtocol ? 
        urlObj.protocol === 'http:' || urlObj.protocol === 'https:' : 
        true;
    } catch (error) {
      return false;
    }
  },
  
  /**
   * Esegue validazione semplice di un oggetto contro uno schema
   * @param {Object} obj - Oggetto da validare
   * @param {Object} schema - Schema di validazione
   * @returns {Object} Risultato di validazione {valid, errors}
   */
  validateSchema(obj, schema) {
    if (!obj || !schema) {
      return { valid: false, errors: ['Oggetto o schema mancante'] };
    }
    
    const errors = [];
    
    // Verifica campi richiesti
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (obj[field] === undefined) {
          errors.push(`Campo obbligatorio mancante: ${field}`);
        }
      }
    }
    
    // Verifica tipo e formato dei campi
    if (schema.properties) {
      for (const [field, propSchema] of Object.entries(schema.properties)) {
        const value = obj[field];
        
        // Salta campi non presenti e non richiesti
        if (value === undefined) continue;
        
        // Verifica tipo
        if (propSchema.type) {
          let typeValid = false;
          
          switch (propSchema.type) {
            case 'string':
              typeValid = typeof value === 'string';
              break;
            case 'number':
              typeValid = typeof value === 'number' && !isNaN(value);
              break;
            case 'boolean':
              typeValid = typeof value === 'boolean';
              break;
            case 'object':
              typeValid = typeof value === 'object' && value !== null && !Array.isArray(value);
              break;
            case 'array':
              typeValid = Array.isArray(value);
              break;
            case 'null':
              typeValid = value === null;
              break;
            default:
              // Tipo non supportato
              typeValid = true;
          }
          
          if (!typeValid) {
            errors.push(`Tipo non valido per ${field}: atteso ${propSchema.type}, ricevuto ${Array.isArray(value) ? 'array' : typeof value}`);
            continue;
          }
        }
        
        // Verifica vincoli aggiuntivi
        if (propSchema.type === 'string') {
          // Verifica pattern
          if (propSchema.pattern && value) {
            const regex = new RegExp(propSchema.pattern);
            if (!regex.test(value)) {
              errors.push(`Valore di ${field} non corrisponde al pattern richiesto`);
            }
          }
          
          // Verifica lunghezza min/max
          if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
            errors.push(`Lunghezza minima per ${field}: ${propSchema.minLength}`);
          }
          if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
            errors.push(`Lunghezza massima per ${field}: ${propSchema.maxLength}`);
          }
        }
        
        if (propSchema.type === 'number') {
          // Verifica range
          if (propSchema.minimum !== undefined && value < propSchema.minimum) {
            errors.push(`Valore minimo per ${field}: ${propSchema.minimum}`);
          }
          if (propSchema.maximum !== undefined && value > propSchema.maximum) {
            errors.push(`Valore massimo per ${field}: ${propSchema.maximum}`);
          }
        }
        
        if (propSchema.type === 'array') {
          // Verifica dimensione array
          if (propSchema.minItems !== undefined && value.length < propSchema.minItems) {
            errors.push(`Numero minimo di elementi per ${field}: ${propSchema.minItems}`);
          }
          if (propSchema.maxItems !== undefined && value.length > propSchema.maxItems) {
            errors.push(`Numero massimo di elementi per ${field}: ${propSchema.maxItems}`);
          }
          
          // Verifica elementi
          if (propSchema.items && Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
              const itemResult = this.validateSchema(value[i], propSchema.items);
              if (!itemResult.valid) {
                errors.push(`Elemento ${i} di ${field} non valido: ${itemResult.errors.join(', ')}`);
              }
            }
          }
        }
        
        // Verifica enum
        if (propSchema.enum && Array.isArray(propSchema.enum)) {
          if (!propSchema.enum.includes(value)) {
            errors.push(`Valore di ${field} deve essere uno tra: ${propSchema.enum.join(', ')}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};

module.exports = utilsService;