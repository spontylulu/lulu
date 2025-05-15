/**
 * modules/api/api-rate-limiter.js
 * Limitatore di frequenza per le API di Lulu
 * 
 * Protegge le API da abusi implementando limiti di frequenza
 * configurabili per utente, IP o altri criteri.
 */

const logger = require('../../utils/logger').getLogger('api:rate-limiter');
const { errors } = require('./api-error-handler');

/**
 * Rate limiter per le API
 * Implementa un sistema di rate limiting basato su memoria (in-memory)
 */
const rateLimiter = {
  // Configurazione di default
  _config: {
    enabled: true,
    defaultLimit: 60,             // Richieste massime nel periodo
    defaultWindow: 60 * 1000,     // Periodo in millisecondi (60 secondi)
    windowType: 'sliding',        // 'sliding' o 'fixed'
    headerEnabled: true,          // Se includere header informativi
    trustProxy: true,             // Se considerare X-Forwarded-For
    skipSuccessfulOptionsRequest: true, // Se ignorare OPTIONS con 2xx
    ipWhitelist: ['127.0.0.1'],   // IP sempre consentiti
    routeWhitelist: ['/status', '/health', '/docs'], // Rotte sempre consentite
    userRateLimits: {             // Limiti specifici per ruolo utente
      'admin': { limit: 3000, window: 60 * 1000 },
      'api': { limit: 300, window: 60 * 1000 },
      'user': { limit: 60, window: 60 * 1000 }
    }
  },
  
  // Store per i contatori rate limit
  _store: {
    ip: new Map(),       // Limiti per IP
    user: new Map(),     // Limiti per utente
    key: new Map(),      // Limiti per API key
    custom: new Map()    // Limiti personalizzati
  },
  
  // Counter pulizia automatica
  _cleanupCounter: 0,
  
  /**
   * Inizializza il rate limiter
   * @param {Object} config - Configurazione opzionale
   */
  initialize(config = {}) {
    logger.info('Inizializzazione rate limiter API');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Se disabilitato, termina qui
      if (!this._config.enabled) {
        logger.info('Rate limiter disabilitato da configurazione');
        return;
      }
      
      // Reset dello store
      this._resetStore();
      
      logger.info('Rate limiter API inizializzato con successo');
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del rate limiter API:', error);
      throw error;
    }
  },
  
  /**
   * Resetta lo store dei contatori
   * @private
   */
  _resetStore() {
    this._store = {
      ip: new Map(),
      user: new Map(),
      key: new Map(),
      custom: new Map()
    };
    this._cleanupCounter = 0;
  },
  
  /**
   * Ottiene l'IP del client dalla richiesta
   * @private
   * @param {Object} req - Richiesta Express
   * @returns {string} Indirizzo IP
   */
  _getClientIp(req) {
    if (this._config.trustProxy) {
      // X-Forwarded-For può contenere lista di IP, prendi il primo (client originale)
      const xForwardedFor = req.headers['x-forwarded-for'];
      if (xForwardedFor) {
        const ips = xForwardedFor.split(',').map(ip => ip.trim());
        return ips[0];
      }
    }
    
    return req.ip || req.connection.remoteAddress || '0.0.0.0';
  },
  
  /**
   * Verifica se una richiesta è nella whitelist
   * @private
   * @param {Object} req - Richiesta Express
   * @returns {boolean} True se la richiesta è nella whitelist
   */
  _isWhitelisted(req) {
    // Verifica IP
    const clientIp = this._getClientIp(req);
    if (this._config.ipWhitelist.includes(clientIp)) {
      return true;
    }
    
    // Verifica path
    const path = req.originalUrl || req.url;
    if (this._config.routeWhitelist.some(route => path.startsWith(route))) {
      return true;
    }
    
    // Verifica OPTIONS e risposta di successo
    if (this._config.skipSuccessfulOptionsRequest && req.method === 'OPTIONS') {
      return true;
    }
    
    return false;
  },
  
  /**
   * Ottiene il limite di frequenza per una richiesta
   * @private
   * @param {Object} req - Richiesta Express
   * @returns {Object} Configurazione limite
   */
  _getLimitConfig(req) {
    // Supporto per limiti personalizzati definiti in middleware precedenti
    if (req.rateLimit) {
      return {
        limit: req.rateLimit.limit,
        window: req.rateLimit.window || this._config.defaultWindow
      };
    }
    
    // Limite specifico per ruolo utente
    if (req.user && req.user.roles && req.user.roles.length > 0) {
      // Trova il ruolo con il limite più alto
      let maxLimit = this._config.defaultLimit;
      let maxWindow = this._config.defaultWindow;
      
      for (const role of req.user.roles) {
        const roleConfig = this._config.userRateLimits[role];
        if (roleConfig && roleConfig.limit > maxLimit) {
          maxLimit = roleConfig.limit;
          maxWindow = roleConfig.window;
        }
      }
      
      return { limit: maxLimit, window: maxWindow };
    }
    
    // Limite default
    return {
      limit: this._config.defaultLimit,
      window: this._config.defaultWindow
    };
  },
  
  /**
   * Ottiene la chiave per identificare il client
   * @private
   * @param {Object} req - Richiesta Express
   * @returns {Object} Chiave e tipo
   */
  _getClientKey(req) {
    // Priorità alle API key
    if (req.user && req.user.source === 'apikey') {
      return {
        type: 'key',
        key: req.user.keyId,
        identifier: `key:${req.user.keyId}`
      };
    }
    
    // Utente autenticato
    if (req.user && req.user.id) {
      return {
        type: 'user',
        key: req.user.id,
        identifier: `user:${req.user.id}`
      };
    }
    
    // Fallback su IP
    const ip = this._getClientIp(req);
    return {
      type: 'ip',
      key: ip,
      identifier: `ip:${ip}`
    };
  },
  
  /**
   * Incrementa e verifica il contatore per un client
   * @private
   * @param {string} type - Tipo di client (ip, user, key)
   * @param {string} clientKey - Chiave del client
   * @param {Object} limitConfig - Configurazione limite
   * @returns {Object} Stato del limite
   */
  _incrementCounter(type, clientKey, limitConfig) {
    const now = Date.now();
    const store = this._store[type];
    
    // Ottieni o crea record
    if (!store.has(clientKey)) {
      store.set(clientKey, {
        count: 0,
        resetAt: now + limitConfig.window,
        firstRequest: now,
        lastRequest: now,
        history: []
      });
    }
    
    const record = store.get(clientKey);
    
    // Se usando finestra fissa, verifica reset
    if (this._config.windowType === 'fixed' && now >= record.resetAt) {
      record.count = 0;
      record.resetAt = now + limitConfig.window;
      record.history = [];
    }
    
    // Se usando finestra scorrevole, rimuovi richieste vecchie
    if (this._config.windowType === 'sliding') {
      const windowStart = now - limitConfig.window;
      
      // Filtra storia rimuovendo richieste fuori dalla finestra
      record.history = record.history.filter(time => time > windowStart);
      
      // Aggiorna conteggio
      record.count = record.history.length;
      
      // Se il contatore è stato resettato, aggiorna orario reset
      if (record.count === 0) {
        record.resetAt = now + limitConfig.window;
      }
    }
    
    // Incrementa contatore
    record.count++;
    record.lastRequest = now;
    
    // Aggiungi timestamp alla storia per finestra scorrevole
    if (this._config.windowType === 'sliding') {
      record.history.push(now);
    }
    
    // Calcola tempo rimanente
    const remainingTime = Math.max(0, record.resetAt - now);
    
    // Calcola richieste rimanenti
    const remainingRequests = Math.max(0, limitConfig.limit - record.count);
    
    // Determina se ha superato il limite
    const isLimited = record.count > limitConfig.limit;
    
    return {
      isLimited,
      limit: limitConfig.limit,
      current: record.count,
      remaining: remainingRequests,
      resetAt: record.resetAt,
      resetIn: remainingTime
    };
  },
  
  /**
   * Esegue pulizia periodica dello store
   * @private
   */
  _cleanup() {
    try {
      const now = Date.now();
      let totalRemoved = 0;
      
      // Pulisci ogni store
      for (const [storeType, store] of Object.entries(this._store)) {
        let removed = 0;
        
        for (const [key, record] of store.entries()) {
          // Rimuovi record scaduti (per finestra fissa)
          if (now > record.resetAt) {
            store.delete(key);
            removed++;
            continue;
          }
          
          // Per finestra scorrevole, verifica se tutte le richieste sono scadute
          if (this._config.windowType === 'sliding') {
            const windowStart = now - this._config.defaultWindow;
            
            // Se l'ultima richiesta è fuori dalla finestra, rimuovi record
            if (record.lastRequest < windowStart) {
              store.delete(key);
              removed++;
            }
          }
        }
        
        totalRemoved += removed;
        
        if (removed > 0) {
          logger.debug(`Cleanup rate limiter: rimossi ${removed} record dal tipo ${storeType}`);
        }
      }
      
      if (totalRemoved > 0) {
        logger.info(`Cleanup rate limiter completato: rimossi ${totalRemoved} record`);
      }
      
    } catch (error) {
      logger.error('Errore durante la pulizia del rate limiter:', error);
    }
  },
  
  /**
   * Middleware per il rate limiting
   * @returns {Function} Middleware Express
   */
  middleware() {
    // Se disabilitato, restituisci un middleware passthrough
    if (!this._config.enabled) {
      return (req, res, next) => next();
    }
    
    return (req, res, next) => {
      try {
        // Incrementa contatore pulizia e pulisci occasionalmente
        this._cleanupCounter++;
        if (this._cleanupCounter > 1000) {
          this._cleanupCounter = 0;
          this._cleanup();
        }
        
        // Verifica se richiesta è nella whitelist
        if (this._isWhitelisted(req)) {
          return next();
        }
        
        // Ottieni configurazione limiti
        const limitConfig = this._getLimitConfig(req);
        
        // Identifica il client
        const { type, key, identifier } = this._getClientKey(req);
        
        // Incrementa e verifica limite
        const result = this._incrementCounter(type, key, limitConfig);
        
        // Imposta header informativi
        if (this._config.headerEnabled) {
          res.setHeader('X-RateLimit-Limit', result.limit);
          res.setHeader('X-RateLimit-Remaining', result.remaining);
          res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000)); // In secondi
        }
        
        // Se ha superato il limite, invia errore
        if (result.isLimited) {
          logger.warn(`Rate limit superato per ${identifier}: ${result.current}/${result.limit}`, {
            path: req.originalUrl,
            method: req.method,
            ip: this._getClientIp(req),
            userId: req.user ? req.user.id : null,
            identifier
          });
          
          const error = errors.rateLimit('Limite di frequenza superato, riprova più tardi', {
            limit: result.limit,
            current: result.current,
            resetAt: result.resetAt,
            resetIn: Math.ceil(result.resetIn / 1000) // In secondi
          });
          
          return next(error);
        }
        
        // Altrimenti, continua
        next();
        
      } catch (error) {
        logger.error('Errore nel middleware rate limiter:', error);
        
        // In caso di errore, consenti la richiesta per evitare blocchi
        next();
      }
    };
  },
  
  /**
   * Imposta un limite specifico per una rotta
   * @param {Object} options - Opzioni limite
   * @param {number} options.limit - Limite richieste
   * @param {number} [options.window] - Finestra temporale in ms
   * @returns {Function} Middleware Express
   */
  limit(options) {
    return (req, res, next) => {
      if (!this._config.enabled) {
        return next();
      }
      
      // Imposta limite personalizzato per questa richiesta
      req.rateLimit = {
        limit: options.limit,
        window: options.window || this._config.defaultWindow
      };
      
      next();
    };
  },
  
  /**
   * Disabilita il rate limiting per una rotta specifica
   * @returns {Function} Middleware Express
   */
  skip() {
    return (req, res, next) => {
      // Flag per indicare che la rotta è whitelistata
      req.skipRateLimit = true;
      next();
    };
  },
  
  /**
   * Ottiene statistiche sullo stato attuale
   * @returns {Object} Statistiche
   */
  getStats() {
    const stats = {
      enabled: this._config.enabled,
      defaultLimit: this._config.defaultLimit,
      defaultWindow: this._config.defaultWindow,
      windowType: this._config.windowType,
      limiterStats: {}
    };
    
    // Raccoglie statistiche per ogni store
    for (const [type, store] of Object.entries(this._store)) {
      stats.limiterStats[type] = {
        size: store.size,
        limited: 0,
        active: 0
      };
      
      // Conta client limitati e attivi
      for (const record of store.values()) {
        if (record.count >= this._config.defaultLimit) {
          stats.limiterStats[type].limited++;
        }
        
        // Conta client con attività recente (ultimi 5 minuti)
        const recentTime = Date.now() - (5 * 60 * 1000);
        if (record.lastRequest >= recentTime) {
          stats.limiterStats[type].active++;
        }
      }
    }
    
    return stats;
  },
  
  /**
   * Cancella manualmente i limiti per un client specifico
   * @param {string} type - Tipo di client (ip, user, key)
   * @param {string} clientKey - Chiave del client
   * @returns {boolean} True se l'operazione è riuscita
   */
  resetClientLimit(type, clientKey) {
    if (!this._store[type]) {
      return false;
    }
    
    if (this._store[type].has(clientKey)) {
      this._store[type].delete(clientKey);
      logger.info(`Limit resettato per ${type}:${clientKey}`);
      return true;
    }
    
    return false;
  }
};

module.exports = rateLimiter;