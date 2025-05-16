/**
 * modules/ai/ai-router-service.js
 * Servizio di routing per il modulo AI
 * 
 * Determina quale provider di AI è più adatto per una richiesta specifica
 * in base al contenuto, al costo, alle prestazioni e ad altre regole.
 */

const logger = require('../../utils/logger').getLogger('ai:router');
const fs = require('fs').promises;
const path = require('path');

/**
 * Servizio di routing per le richieste AI
 */
const routerService = {
  // Configurazione di default
  _config: {
    enabled: true,
    defaultProvider: 'claude',
    strategy: 'content',     // content, cost, performance, round-robin
    useCache: true,          // Usa cache per decisioni
    confidenceThreshold: 0.6, // Soglia per la decisione
    rulesPath: './config/ai-router-rules.json',
    batchSize: 100,           // Dimensione batch per statistiche
    services: {
      claude: true,
      openai: false
    },
    weights: {
      content: 0.6,           // Peso per rilevanza contenuto
      performance: 0.2,       // Peso per prestazioni
      cost: 0.2               // Peso per costo
    },
    rules: []                // Regole di routing personalizzate
  },
  
  // Statistiche sui provider
  _stats: {
    claude: {
      usageCount: 0,
      successRate: 1.0,
      avgResponseTime: 2500,
      lastUsed: null,
      costPerToken: 0.00003
    },
    openai: {
      usageCount: 0,
      successRate: 1.0,
      avgResponseTime: 1500,
      lastUsed: null,
      costPerToken: 0.00005
    }
  },
  
  // Cache delle decisioni
  _decisionCache: new Map(),
  
  // Pattern per regole specifiche
  _patterns: {
    programming: [
      'codice', 'programma', 'funzione', 'sviluppo', 'debug', 'javascript', 'python', 
      'typescript', 'java', 'c++', 'ruby', 'php', 'html', 'css', 'sql', 'database', 
      'algoritmo', 'framework', 'github', 'git', 'compiler', 'sviluppatore', 'sviluppo'
    ],
    math: [
      'matematica', 'calcolo', 'equazione', 'formula', 'algebra', 'geometria', 
      'trigonometria', 'statistica', 'probabilità', 'logaritmo', 'derivata', 
      'integrale', 'vettore', 'matrice', 'teorema'
    ],
    creative: [
      'storia', 'poesia', 'racconto', 'romanzo', 'creativo', 'disegno', 'arte', 
      'dipingi', 'immagina', 'inventor', 'creare', 'narrativa', 'fantasy', 'fiaba',
      'poema', 'scrittura', 'creazione', 'design', 'illustra', 'colore'
    ],
    business: [
      'business', 'azienda', 'marketing', 'vendite', 'strategia', 'cliente', 
      'mercato', 'prodotto', 'servizio', 'presentazione', 'report', 'analisi', 
      'finanza', 'budget', 'investimento', 'competitore', 'startup', 'piano'
    ],
    conversation: [
      'come stai', 'chi sei', 'parlami di', 'ciao', 'salve', 'buongiorno',
      'buonasera', 'grazie', 'cosa pensi', 'opinione', 'sentimento',
      'divertente', 'scherzare', 'ridere', 'empatia', 'comprensione'
    ]
  },
  
  /**
   * Inizializza il servizio router
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio router AI');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Reset cache
      this._decisionCache.clear();
      
      // Carica regole personalizzate
      await this._loadCustomRules();
      
      logger.info('Servizio router AI inizializzato con successo', {
        strategy: this._config.strategy,
        defaultProvider: this._config.defaultProvider,
        enabledServices: Object.entries(this._config.services)
          .filter(([_, enabled]) => enabled)
          .map(([name]) => name)
          .join(', ')
      });
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio router AI:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio router
   */
  async shutdown() {
    logger.info('Chiusura servizio router AI');
    
    try {
      // Salva le regole personalizzate se ci sono modifiche
      await this._saveCustomRules();
      
      // Pulisci la cache
      this._decisionCache.clear();
      
      logger.info('Servizio router AI chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio router AI:', error);
      throw error;
    }
  },
  
  /**
   * Carica regole personalizzate da file
   * @private
   * @returns {Promise<number>} Numero di regole caricate
   */
  async _loadCustomRules() {
    try {
      const rulesPath = path.resolve(this._config.rulesPath);
      
      // Verifica se il file esiste
      try {
        await fs.access(rulesPath);
      } catch (accessError) {
        // Il file non esiste, creiamo la directory se necessario
        const rulesDir = path.dirname(rulesPath);
        await fs.mkdir(rulesDir, { recursive: true }).catch(() => {});
        
        // Non ci sono regole, restituisci 0
        return 0;
      }
      
      // Leggi il file
      const content = await fs.readFile(rulesPath, 'utf8');
      const rules = JSON.parse(content);
      
      if (Array.isArray(rules)) {
        this._config.rules = rules;
        logger.info(`Caricate ${rules.length} regole personalizzate`);
        return rules.length;
      }
      
      return 0;
    } catch (error) {
      logger.error('Errore durante il caricamento delle regole personalizzate:', error);
      return 0;
    }
  },
  
  /**
   * Salva regole personalizzate su file
   * @private
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async _saveCustomRules() {
    // Salva solo se ci sono regole
    if (!this._config.rules || this._config.rules.length === 0) {
      return true;
    }
    
    try {
      const rulesPath = path.resolve(this._config.rulesPath);
      
      // Assicura che la directory esista
      const rulesDir = path.dirname(rulesPath);
      await fs.mkdir(rulesDir, { recursive: true }).catch(() => {});
      
      // Salva le regole su file
      await fs.writeFile(rulesPath, JSON.stringify(this._config.rules, null, 2), 'utf8');
      
      logger.debug(`Salvate ${this._config.rules.length} regole personalizzate`);
      return true;
    } catch (error) {
      logger.error('Errore durante il salvataggio delle regole personalizzate:', error);
      return false;
    }
  },
  
  /**
   * Determina il provider AI più adatto per una richiesta
   * @param {string} message - Messaggio o prompt
   * @param {Object} options - Opzioni aggiuntive
   * @returns {Promise<string>} Nome del provider
   */
  async determineProvider(message, options = {}) {
    if (!this._config.enabled) {
      return options.provider || this._config.defaultProvider;
    }
    
    try {
      // Se è specificato un provider nelle opzioni, usalo direttamente
      if (options.provider) {
        // Verifica che il provider sia abilitato
        if (this._config.services[options.provider]) {
          return options.provider;
        } else {
          logger.warn(`Provider richiesto ${options.provider} non disponibile, uso default`);
        }
      }
      
      // Verifica cache per decisioni simili
      if (this._config.useCache) {
        const cacheKey = this._generateCacheKey(message, options);
        if (this._decisionCache.has(cacheKey)) {
          const cachedDecision = this._decisionCache.get(cacheKey);
          logger.debug(`Decisione recuperata da cache: ${cachedDecision.provider}`);
          return cachedDecision.provider;
        }
      }
      
      // Applica la strategia configurata
      let selectedProvider;
      
      switch (this._config.strategy) {
        case 'content':
          selectedProvider = await this._applyContentStrategy(message, options);
          break;
        case 'cost':
          selectedProvider = this._applyCostStrategy(options);
          break;
        case 'performance':
          selectedProvider = this._applyPerformanceStrategy(options);
          break;
        case 'round-robin':
          selectedProvider = this._applyRoundRobinStrategy();
          break;
        default:
          selectedProvider = this._config.defaultProvider;
      }
      
      // Verifica regole specifiche che potrebbero sovrascrivere la decisione
      const ruleBasedProvider = this._checkSpecificRules(message, options);
      if (ruleBasedProvider) {
        selectedProvider = ruleBasedProvider;
      }
      
      // Verifico che il provider scelto sia abilitato
      if (!this._config.services[selectedProvider]) {
        // Fallback al provider predefinito
        logger.warn(`Provider ${selectedProvider} non abilitato, fallback al default`);
        selectedProvider = this._config.defaultProvider;
        
        // Se anche il default non è abilitato, usa il primo disponibile
        if (!this._config.services[selectedProvider]) {
          const availableProviders = Object.entries(this._config.services)
            .filter(([_, enabled]) => enabled)
            .map(([name]) => name);
          
          if (availableProviders.length > 0) {
            selectedProvider = availableProviders[0];
          } else {
            logger.error('Nessun provider disponibile');
            throw new Error('Nessun provider AI disponibile');
          }
        }
      }
      
      // Salva in cache
      if (this._config.useCache) {
        const cacheKey = this._generateCacheKey(message, options);
        this._decisionCache.set(cacheKey, {
          provider: selectedProvider,
          timestamp: Date.now(),
          confidence: 1.0
        });
      }
      
      // Aggiorna statistiche
      this._updateProviderStats(selectedProvider);
      
      logger.debug(`Provider selezionato: ${selectedProvider}`);
      return selectedProvider;
    } catch (error) {
      logger.error('Errore durante la determinazione del provider:', error);
      
      // Fallback al provider predefinito
      return this._config.defaultProvider;
    }
  },
  
  /**
   * Applica la strategia basata sul contenuto
   * @private
   * @param {string} message - Messaggio o prompt
   * @param {Object} options - Opzioni aggiuntive
   * @returns {Promise<string>} Provider selezionato
   */
  async _applyContentStrategy(message, options) {
    // Normalizza messaggio
    const normalizedMessage = message.toLowerCase();
    
    // Inizializza punteggi
    const scores = {
      claude: 0,
      openai: 0
    };
    
    // Valuta il messaggio per ciascuna categoria
    // Ciascuna categoria contribuisce al punteggio di uno o più provider
    
    // Programmazione (Claude è tendenzialmente meglio per codice)
    const programmingScore = this._calculateCategoryScore(normalizedMessage, this._patterns.programming);
    scores.claude += programmingScore * 1.3; // Peso maggiore per Claude
    scores.openai += programmingScore * 0.7;
    
    // Matematica (Claude è tendenzialmente meglio per matematica)
    const mathScore = this._calculateCategoryScore(normalizedMessage, this._patterns.math);
    scores.claude += mathScore * 1.2;
    scores.openai += mathScore * 0.8;
    
    // Creatività (OpenAI è tendenzialmente meglio per creatività)
    const creativeScore = this._calculateCategoryScore(normalizedMessage, this._patterns.creative);
    scores.claude += creativeScore * 0.7;
    scores.openai += creativeScore * 1.3;
    
    // Business (entrambi sono buoni)
    const businessScore = this._calculateCategoryScore(normalizedMessage, this._patterns.business);
    scores.claude += businessScore;
    scores.openai += businessScore;
    
    // Conversazione (OpenAI è leggermente migliore per conversazione)
    const conversationScore = this._calculateCategoryScore(normalizedMessage, this._patterns.conversation);
    scores.claude += conversationScore * 0.9;
    scores.openai += conversationScore * 1.1;
    
    // Fattori di peso basati su statistiche storiche
    if (this._stats.claude.usageCount > 0 && this._stats.openai.usageCount > 0) {
      // Considera il tasso di successo
      scores.claude *= this._stats.claude.successRate;
      scores.openai *= this._stats.openai.successRate;
      
      // Considera i tempi di risposta (inverso della risposta media)
      const claudeSpeedFactor = 1000 / this._stats.claude.avgResponseTime;
      const openaiSpeedFactor = 1000 / this._stats.openai.avgResponseTime;
      
      scores.claude *= claudeSpeedFactor;
      scores.openai *= openaiSpeedFactor;
    }
    
    // Determina il provider con il punteggio più alto
    let selectedProvider = this._config.defaultProvider;
    
    if (scores.claude > scores.openai * this._config.confidenceThreshold) {
      selectedProvider = 'claude';
    } else if (scores.openai > scores.claude * this._config.confidenceThreshold) {
      selectedProvider = 'openai';
    }
    
    logger.debug('Punteggi strategia contenuto:', scores);
    return selectedProvider;
  },
  
  /**
   * Calcola il punteggio per una categoria di pattern
   * @private
   * @param {string} message - Messaggio normalizzato
   * @param {Array<string>} patterns - Array di pattern da cercare
   * @returns {number} Punteggio (0-1)
   */
  _calculateCategoryScore(message, patterns) {
    if (!message || !patterns || patterns.length === 0) {
      return 0;
    }
    
    // Conta quanti pattern sono presenti nel messaggio
    let matchCount = 0;
    
    for (const pattern of patterns) {
      if (message.includes(pattern)) {
        matchCount++;
      }
    }
    
    // Calcola punteggio normalizzato (0-1)
    // Limita il punteggio a un massimo di 5 match per evitare distorsioni
    return Math.min(matchCount / 5, 1);
  },
  
  /**
   * Applica la strategia basata sul costo
   * @private
   * @param {Object} options - Opzioni aggiuntive
   * @returns {string} Provider selezionato
   */
  _applyCostStrategy(options) {
    // Trova il provider con il costo più basso
    let lowestCostProvider = this._config.defaultProvider;
    let lowestCost = Infinity;
    
    for (const [provider, enabled] of Object.entries(this._config.services)) {
      if (!enabled) continue;
      
      const providerStats = this._stats[provider];
      if (providerStats && providerStats.costPerToken < lowestCost) {
        lowestCost = providerStats.costPerToken;
        lowestCostProvider = provider;
      }
    }
    
    return lowestCostProvider;
  },
  
  /**
   * Applica la strategia basata sulle prestazioni
   * @private
   * @param {Object} options - Opzioni aggiuntive
   * @returns {string} Provider selezionato
   */
  _applyPerformanceStrategy(options) {
    // Trova il provider con il tempo di risposta più basso
    let fastestProvider = this._config.defaultProvider;
    let fastestTime = Infinity;
    
    for (const [provider, enabled] of Object.entries(this._config.services)) {
      if (!enabled) continue;
      
      const providerStats = this._stats[provider];
      if (providerStats && providerStats.avgResponseTime < fastestTime) {
        fastestTime = providerStats.avgResponseTime;
        fastestProvider = provider;
      }
    }
    
    return fastestProvider;
  },
  
  /**
   * Applica la strategia round-robin
   * @private
   * @returns {string} Provider selezionato
   */
  _applyRoundRobinStrategy() {
    // Ottieni i provider disponibili
    const availableProviders = Object.entries(this._config.services)
      .filter(([_, enabled]) => enabled)
      .map(([name]) => name);
    
    if (availableProviders.length === 0) {
      return this._config.defaultProvider;
    }
    
    // Determina quale provider utilizzare in base all'ultimo utilizzato
    let lastUsedProvider = null;
    let lastUsedTimestamp = 0;
    
    for (const provider of availableProviders) {
      const stats = this._stats[provider];
      if (stats && stats.lastUsed && stats.lastUsed > lastUsedTimestamp) {
        lastUsedTimestamp = stats.lastUsed;
        lastUsedProvider = provider;
      }
    }
    
    // Se non c'è stato un ultimo provider utilizzato, usa il primo disponibile
    if (!lastUsedProvider) {
      return availableProviders[0];
    }
    
    // Trova il prossimo provider nell'elenco (ciclo)
    const currentIndex = availableProviders.indexOf(lastUsedProvider);
    const nextIndex = (currentIndex + 1) % availableProviders.length;
    
    return availableProviders[nextIndex];
  },
  
  /**
   * Verifica regole specifiche per il routing
   * @private
   * @param {string} message - Messaggio o prompt
   * @param {Object} options - Opzioni aggiuntive
   * @returns {string|null} Provider basato su regole o null
   */
  _checkSpecificRules(message, options) {
    if (!this._config.rules || this._config.rules.length === 0) {
      return null;
    }
    
    // Normalizza messaggio
    const normalizedMessage = message.toLowerCase();
    
    // Controlla ogni regola
    for (const rule of this._config.rules) {
      if (!rule.pattern || !rule.provider) continue;
      
      // Verifica se il pattern è presente nel messaggio
      if (typeof rule.pattern === 'string' && normalizedMessage.includes(rule.pattern.toLowerCase())) {
        logger.debug(`Regola attivata: ${rule.pattern} -> ${rule.provider}`);
        return rule.provider;
      } 
      // Supporto per espressioni regolari
      else if (rule.pattern.startsWith('/') && rule.pattern.endsWith('/')) {
        try {
          const patternText = rule.pattern.substring(1, rule.pattern.length - 1);
          const regex = new RegExp(patternText, 'i');
          
          if (regex.test(normalizedMessage)) {
            logger.debug(`Regola regex attivata: ${rule.pattern} -> ${rule.provider}`);
            return rule.provider;
          }
        } catch (error) {
          logger.warn(`Errore nella valutazione della regex ${rule.pattern}:`, error);
        }
      }
    }
    
    return null;
  },
  
  /**
   * Aggiorna le statistiche di un provider
   * @private
   * @param {string} provider - Nome del provider
   * @param {Object} [data] - Dati aggiuntivi
   */
  _updateProviderStats(provider, data = {}) {
    if (!this._stats[provider]) {
      this._stats[provider] = {
        usageCount: 0,
        successRate: 1.0,
        avgResponseTime: 2000,
        lastUsed: null,
        costPerToken: 0.00003
      };
    }
    
    // Aggiorna contatore e timestamp
    this._stats[provider].usageCount++;
    this._stats[provider].lastUsed = Date.now();
    
    // Aggiorna altre statistiche se disponibili
    if (data.success !== undefined) {
      // Aggiorna il tasso di successo con una media mobile
      const currentSuccessRate = this._stats[provider].successRate;
      const newSuccessRate = data.success ? 1.0 : 0.0;
      const batchSize = Math.min(this._stats[provider].usageCount, this._config.batchSize);
      
      this._stats[provider].successRate = 
        (currentSuccessRate * (batchSize - 1) + newSuccessRate) / batchSize;
    }
    
    if (data.responseTime) {
      // Aggiorna il tempo di risposta medio con una media mobile
      const currentAvgTime = this._stats[provider].avgResponseTime;
      const batchSize = Math.min(this._stats[provider].usageCount, this._config.batchSize);
      
      this._stats[provider].avgResponseTime = 
        (currentAvgTime * (batchSize - 1) + data.responseTime) / batchSize;
    }
  },
  
  /**
   * Genera una chiave di cache per una richiesta
   * @private
   * @param {string} message - Messaggio o prompt
   * @param {Object} options - Opzioni aggiuntive
   * @returns {string} Chiave di cache
   */
  _generateCacheKey(message, options) {
    // Estrai le prime N parole per la chiave
    const words = message.toLowerCase().trim().split(/\s+/);
    const keyWords = words.slice(0, 10).join(' ');
    
    // Aggiungi opzioni significative
    let optionsStr = '';
    if (options.model) optionsStr += `-${options.model}`;
    if (options.temperature) optionsStr += `-t${options.temperature}`;
    
    return `router-${keyWords}${optionsStr}`;
  },
  
  /**
   * Registra il risultato di una richiesta per migliorare il routing
   * @param {string} provider - Provider utilizzato
   * @param {Object} result - Risultato della richiesta
   * @returns {Promise<void>}
   */
  async recordRequestResult(provider, result) {
    try {
      if (!provider || !result) return;
      
      // Estrai i dati rilevanti
      const data = {
        success: !result.error,
        responseTime: result.duration || null,
        tokensUsed: result.usage?.total_tokens || 0
      };
      
      // Aggiorna le statistiche
      this._updateProviderStats(provider, data);
      
      logger.debug(`Registrato risultato per ${provider}:`, data);
    } catch (error) {
      logger.error('Errore durante la registrazione del risultato:', error);
    }
  },
  
  /**
   * Aggiunge una regola di routing personalizzata
   * @param {Object} rule - Regola da aggiungere
   * @param {string} rule.pattern - Pattern da cercare (testo o regex)
   * @param {string} rule.provider - Provider da utilizzare
   * @param {string} [rule.description] - Descrizione della regola
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async addRule(rule) {
    try {
      if (!rule || !rule.pattern || !rule.provider) {
        throw new Error('Pattern e provider sono obbligatori per la regola');
      }
      
      // Verifica che il provider sia valido
      if (!this._stats[rule.provider]) {
        throw new Error(`Provider non valido: ${rule.provider}`);
      }
      
      // Inizializza array regole se non esiste
      if (!this._config.rules) {
        this._config.rules = [];
      }
      
      // Verifica se la regola esiste già
      const existingIndex = this._config.rules.findIndex(r => 
        r.pattern === rule.pattern && r.provider === rule.provider);
      
      if (existingIndex >= 0) {
        // Aggiorna regola esistente
        this._config.rules[existingIndex] = { ...rule };
        logger.info(`Regola aggiornata: ${rule.pattern} -> ${rule.provider}`);
      } else {
        // Aggiungi nuova regola
        this._config.rules.push({ ...rule });
        logger.info(`Regola aggiunta: ${rule.pattern} -> ${rule.provider}`);
      }
      
      // Salva le regole
      await this._saveCustomRules();
      
      return true;
    } catch (error) {
      logger.error('Errore durante l\'aggiunta della regola:', error);
      return false;
    }
  },
  
  /**
   * Rimuove una regola di routing
   * @param {string} pattern - Pattern della regola da rimuovere
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async removeRule(pattern) {
    try {
      if (!pattern) {
        throw new Error('Pattern è obbligatorio');
      }
      
      // Verifica se la regola esiste
      if (!this._config.rules) {
        return false;
      }
      
      const initialLength = this._config.rules.length;
      this._config.rules = this._config.rules.filter(r => r.pattern !== pattern);
      
      // Se nessuna regola è stata rimossa
      if (this._config.rules.length === initialLength) {
        return false;
      }
      
      // Salva le regole
      await this._saveCustomRules();
      
      logger.info(`Regola rimossa: ${pattern}`);
      return true;
    } catch (error) {
      logger.error('Errore durante la rimozione della regola:', error);
      return false;
    }
  },
  
  /**
   * Ottiene tutte le regole di routing
   * @returns {Array} Lista di regole
   */
  getRules() {
    return this._config.rules || [];
  },
  
  /**
   * Ottiene statistiche sul router
   * @returns {Object} Statistiche
   */
  getStats() {
    const stats = {
      strategy: this._config.strategy,
      enabledProviders: Object.entries(this._config.services)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name),
      cacheSize: this._decisionCache.size,
      providers: {}
    };
    
    // Aggiungi statistiche per ogni provider
    for (const [provider, providerStats] of Object.entries(this._stats)) {
      stats.providers[provider] = {
        usageCount: providerStats.usageCount,
        successRate: parseFloat((providerStats.successRate * 100).toFixed(1)) + '%',
        avgResponseTime: providerStats.avgResponseTime + 'ms',
        lastUsed: providerStats.lastUsed ? new Date(providerStats.lastUsed).toISOString() : null,
        enabled: !!this._config.services[provider]
      };
    }
    
    return stats;
  },
  
  /**
   * Imposta la strategia di routing
   * @param {string} strategy - Strategia ('content', 'cost', 'performance', 'round-robin')
   * @returns {boolean} True se l'operazione è riuscita
   */
  setStrategy(strategy) {
    const validStrategies = ['content', 'cost', 'performance', 'round-robin'];
    
    if (!validStrategies.includes(strategy)) {
      logger.warn(`Strategia non valida: ${strategy}`);
      return false;
    }
    
    this._config.strategy = strategy;
    logger.info(`Strategia impostata: ${strategy}`);
    return true;
  },
  
  /**
   * Pulisce la cache delle decisioni
   * @returns {number} Numero di elementi rimossi
   */
  clearCache() {
    const size = this._decisionCache.size;
    this._decisionCache.clear();
    logger.debug(`Cache decisioni pulita (${size} elementi)`);
    return size;
  }
};

module.exports = routerService;