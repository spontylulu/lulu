/**
 * modules/cache/cache-similarity.js
 * Servizio di calcolo similarità per il modulo cache
 * 
 * Implementa algoritmi per determinare la similarità semantica tra query,
 * permettendo il riutilizzo di risposte cachate per domande simili.
 */

const logger = require('../../utils/logger').getLogger('cache:similarity');

/**
 * Servizio di calcolo similarità per il modulo cache
 */
const similarityService = {
  // Configurazione di default
  _config: {
    enabled: true,
    threshold: 0.8,             // Soglia minima di similarità (0-1)
    algorithm: 'levenshtein',   // Algoritmo predefinito
    maxQueryLength: 1000,       // Lunghezza massima query per calcolo
    ignoreCase: true,           // Ignora differenze maiuscole/minuscole
    normalizeText: true,        // Rimuovi punteggiatura e spazi extra
    useCache: true,             // Cache risultati di similarità
    cacheSize: 1000             // Dimensione massima cache
  },
  
  // Cache interna per calcoli di similarità già effettuati
  _similarityCache: new Map(),
  
  /**
   * Inizializza il servizio di similarità
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio similarità');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Reset della cache interna
      this._similarityCache.clear();
      
      logger.info('Servizio similarità inizializzato con successo');
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio similarità:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio di similarità
   */
  async shutdown() {
    logger.info('Chiusura servizio similarità');
    
    try {
      // Pulisci le risorse
      this._similarityCache.clear();
      
      logger.info('Servizio similarità chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio similarità:', error);
      throw error;
    }
  },
  
  /**
   * Trova la migliore corrispondenza per una query tra quelle esistenti
   * @param {string} query - Query di ricerca
   * @param {Object} existingQueries - Oggetto con chiavi di cache e relative query
   * @param {number} [threshold] - Soglia minima di similarità (override config)
   * @returns {Object|null} Miglior corrispondenza {key, score, query} o null se nessuna
   */
  async findBestMatch(query, existingQueries, threshold = null) {
    if (!this._config.enabled || !query || !existingQueries) {
      return null;
    }
    
    try {
      const actualThreshold = threshold || this._config.threshold;
      
      // Normalizza la query di ricerca
      const normalizedQuery = this._normalizeText(query);
      
      // Limita la lunghezza per performance
      const trimmedQuery = normalizedQuery.substring(0, this._config.maxQueryLength);
      
      logger.debug(`Ricerca corrispondenza per query: "${this._truncateForLog(normalizedQuery)}"`);
      
      let bestMatch = null;
      let bestScore = actualThreshold; // Inizia dalla soglia minima
      
      // Itera tutte le query esistenti
      for (const [key, existingQuery] of Object.entries(existingQueries)) {
        if (!existingQuery) continue;
        
        // Normalizza la query esistente
        const normalizedExisting = this._normalizeText(existingQuery);
        
        // Verifica la similarità
        const score = await this._calculateSimilarity(
          trimmedQuery,
          normalizedExisting.substring(0, this._config.maxQueryLength)
        );
        
        // Aggiorna il best match se il punteggio è migliore
        if (score > bestScore) {
          bestMatch = {
            key,
            score,
            query: existingQuery
          };
          bestScore = score;
          
          logger.debug(`Nuova migliore corrispondenza: ${key} (score: ${score.toFixed(4)})`);
        }
      }
      
      if (bestMatch) {
        logger.info(`Trovata corrispondenza per similarità: ${bestMatch.key} (score: ${bestMatch.score.toFixed(4)})`);
        return bestMatch;
      }
      
      logger.debug(`Nessuna corrispondenza trovata con soglia ${actualThreshold}`);
      return null;
    } catch (error) {
      logger.error('Errore durante la ricerca di corrispondenze per similarità:', error);
      return null;
    }
  },
  
  /**
   * Calcola il punteggio di similarità tra due stringhe
   * @private
   * @param {string} str1 - Prima stringa
   * @param {string} str2 - Seconda stringa
   * @returns {Promise<number>} Punteggio di similarità (0-1)
   */
  async _calculateSimilarity(str1, str2) {
    try {
      // Ottimizzazione: controllo veloce per stringhe identiche
      if (str1 === str2) return 1.0;
      
      // Ottimizzazione: controllo veloce per stringhe vuote
      if (!str1 || !str2) return 0.0;
      
      // Ottimizzazione: lunghezza eccessivamente diversa
      if (Math.abs(str1.length - str2.length) > (Math.max(str1.length, str2.length) * 0.5)) {
        return 0.1; // Valore basso ma non zero
      }
      
      // Costruisci la chiave di cache
      if (this._config.useCache) {
        // La chiave è simmetrica (similarità(A,B) = similarità(B,A))
        const cacheKey = [str1, str2].sort().join('||');
        
        // Controlla se abbiamo già calcolato questa similarità
        if (this._similarityCache.has(cacheKey)) {
          return this._similarityCache.get(cacheKey);
        }
      }
      
      // Calcola la similarità in base all'algoritmo configurato
      let similarity;
      
      switch (this._config.algorithm) {
        case 'levenshtein':
          similarity = this._levenshteinSimilarity(str1, str2);
          break;
        case 'jaccard':
          similarity = this._jaccardSimilarity(str1, str2);
          break;
        case 'cosine':
          similarity = this._cosineSimilarity(str1, str2);
          break;
        default:
          similarity = this._levenshteinSimilarity(str1, str2);
      }
      
      // Salva il risultato in cache se abilitato
      if (this._config.useCache) {
        const cacheKey = [str1, str2].sort().join('||');
        
        // Gestisci limite dimensione cache
        if (this._similarityCache.size >= this._config.cacheSize) {
          // Rimuovi entry più vecchia
          const oldestKey = this._similarityCache.keys().next().value;
          this._similarityCache.delete(oldestKey);
        }
        
        this._similarityCache.set(cacheKey, similarity);
      }
      
      return similarity;
    } catch (error) {
      logger.error('Errore nel calcolo della similarità:', error);
      // Fallback a un valore basso in caso di errore
      return 0.1;
    }
  },
  
  /**
   * Calcola la similarità basata sulla distanza di Levenshtein
   * @private
   * @param {string} str1 - Prima stringa
   * @param {string} str2 - Seconda stringa
   * @returns {number} Punteggio di similarità (0-1)
   */
  _levenshteinSimilarity(str1, str2) {
    // Matrice di distanza
    const matrix = [];
    
    // Inizializza la prima riga
    for (let i = 0; i <= str2.length; i++) {
      matrix[0] = [i];
    }
    
    // Inizializza la prima colonna
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    
    // Riempi la matrice
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,       // Cancellazione
          matrix[i][j - 1] + 1,       // Inserimento
          matrix[i - 1][j - 1] + cost // Sostituzione
        );
      }
    }
    
    // Calcola la similarità normalizzata (1 - distanza/max)
    const distance = matrix[str1.length][str2.length];
    const maxLength = Math.max(str1.length, str2.length);
    
    if (maxLength === 0) return 1.0; // Entrambe le stringhe sono vuote
    
    return 1.0 - (distance / maxLength);
  },
  
  /**
   * Calcola la similarità Jaccard tra due stringhe
   * @private
   * @param {string} str1 - Prima stringa
   * @param {string} str2 - Seconda stringa
   * @returns {number} Similarità Jaccard (0-1)
   */
  _jaccardSimilarity(str1, str2) {
    // Estrai i token (parole)
    const tokens1 = new Set(str1.split(/\s+/).filter(Boolean));
    const tokens2 = new Set(str2.split(/\s+/).filter(Boolean));
    
    // Set vuoti
    if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
    if (tokens1.size === 0 || tokens2.size === 0) return 0.0;
    
    // Calcola intersezione
    const intersection = new Set();
    for (const token of tokens1) {
      if (tokens2.has(token)) {
        intersection.add(token);
      }
    }
    
    // Calcola unione
    const union = new Set([...tokens1, ...tokens2]);
    
    // Indice Jaccard = |intersezione| / |unione|
    return intersection.size / union.size;
  },
  
  /**
   * Calcola la similarità coseno tra due stringhe
   * @private
   * @param {string} str1 - Prima stringa
   * @param {string} str2 - Seconda stringa
   * @returns {number} Similarità coseno (0-1)
   */
  _cosineSimilarity(str1, str2) {
    // Estrai i token (parole)
    const tokens1 = str1.split(/\s+/).filter(Boolean);
    const tokens2 = str2.split(/\s+/).filter(Boolean);
    
    // Creazione dei vettori di frequenza
    const vector1 = {};
    const vector2 = {};
    
    // Popola il primo vettore
    for (const token of tokens1) {
      vector1[token] = (vector1[token] || 0) + 1;
    }
    
    // Popola il secondo vettore
    for (const token of tokens2) {
      vector2[token] = (vector2[token] || 0) + 1;
    }
    
    // Calcola prodotto scalare
    let dotProduct = 0;
    for (const token in vector1) {
      if (vector2[token]) {
        dotProduct += vector1[token] * vector2[token];
      }
    }
    
    // Calcola le norme
    let norm1 = 0;
    for (const token in vector1) {
      norm1 += vector1[token] * vector1[token];
    }
    norm1 = Math.sqrt(norm1);
    
    let norm2 = 0;
    for (const token in vector2) {
      norm2 += vector2[token] * vector2[token];
    }
    norm2 = Math.sqrt(norm2);
    
    // Evita divisione per zero
    if (norm1 === 0 || norm2 === 0) return 0.0;
    
    // Calcola similarità coseno
    return dotProduct / (norm1 * norm2);
  },
  
  /**
   * Normalizza il testo per il confronto di similarità
   * @private
   * @param {string} text - Testo da normalizzare
   * @returns {string} Testo normalizzato
   */
  _normalizeText(text) {
    if (!text) return '';
    
    let normalized = text;
    
    // Applica trasformazioni se configurato
    if (this._config.normalizeText) {
      // Rimuovi punteggiatura
      normalized = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ');
      
      // Rimuovi spazi multipli
      normalized = normalized.replace(/\s+/g, ' ').trim();
    }
    
    // Converti case se configurato
    if (this._config.ignoreCase) {
      normalized = normalized.toLowerCase();
    }
    
    return normalized;
  },
  
  /**
   * Tronca testo per il logging
   * @private
   * @param {string} text - Testo da troncare
   * @param {number} [maxLength=50] - Lunghezza massima
   * @returns {string} Testo troncato
   */
  _truncateForLog(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },
  
  /**
   * Pulisce la cache interna
   * @returns {number} Numero di elementi rimossi
   */
  clearCache() {
    const size = this._similarityCache.size;
    this._similarityCache.clear();
    logger.debug(`Cache similarità pulita (${size} elementi rimossi)`);
    return size;
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
  },
  
  /**
   * Ottiene lo stato del servizio
   * @returns {Object} Stato del servizio
   */
  getStatus() {
    return {
      enabled: this._config.enabled,
      algorithm: this._config.algorithm,
      threshold: this._config.threshold,
      cacheSize: this._similarityCache.size,
      maxCacheSize: this._config.cacheSize
    };
  }
};

module.exports = similarityService;