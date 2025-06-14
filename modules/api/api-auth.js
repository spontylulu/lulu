/**
 * modules/api/api-auth.js
 * Middleware di autenticazione per le API di Lulu
 * 
 * Gestisce l'autenticazione e l'autorizzazione per le richieste API,
 * verificando token JWT e gestendo i permessi utente.
 */

const logger = require('../../utils/logger').getLogger('api:auth');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Middleware di autenticazione per le API
 */
const authMiddleware = {
  // Configurazione di default
  _config: {
    jwtSecret: process.env.JWT_SECRET || 'lulu-default-secret-key-change-in-production',
    tokenExpiration: '24h',    // Durata token standard
    refreshExpiration: '7d',   // Durata refresh token
    tokenHeader: 'Authorization',
    tokenType: 'Bearer',
    enableApiKeys: true
  },
  
  // Cache dei token invalidati (logout)
  _invalidatedTokens: new Set(),
  
  // Cache delle API key
  _apiKeys: new Map(),
  
  /**
   * Inizializza il middleware di autenticazione
   * @param {Object} config - Configurazione opzionale
   */
  initialize(config = {}) {
    logger.info('Inizializzazione middleware di autenticazione');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Se il secret è quello di default in produzione, genera un warning
      if (this._config.jwtSecret === 'lulu-default-secret-key-change-in-production' && 
          process.env.NODE_ENV === 'production') {
        logger.warn('⚠️ JWT_SECRET non impostato in ambiente di produzione! Generando chiave casuale...');
        
        // Genera un secret casuale
        this._config.jwtSecret = crypto.randomBytes(32).toString('hex');
        logger.info('Secret JWT generato casualmente. Si consiglia di impostare JWT_SECRET in modo permanente.');
      }
      
      // Imposta pulizia periodica token invalidati
      setInterval(() => this._cleanupInvalidatedTokens(), 3600000); // Ogni ora
      
      logger.info('Middleware di autenticazione inizializzato con successo');
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del middleware di autenticazione:', error);
      throw error;
    }
  },
  
  /**
   * Middleware per l'autenticazione delle richieste
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  authenticate(req, res, next) {
    try {
      // Estrae il token dall'header o dai query params
      const token = this._extractToken(req);
      
      if (!token) {
        return res.status(401).json({
          error: 'Accesso non autorizzato',
          message: 'Token di autenticazione mancante'
        });
      }
      
      // Verifica se il token è stato invalidato (logout)
      if (this._invalidatedTokens.has(token)) {
        return res.status(401).json({
          error: 'Accesso non autorizzato',
          message: 'Token non più valido, effettuare nuovamente il login'
        });
      }
      
      // Verifica se è un'API key
      if (this._config.enableApiKeys && this._isApiKey(token)) {
        return this._authenticateWithApiKey(token, req, res, next);
      }
      
      // Altrimenti procede con autenticazione JWT
      this._authenticateWithJwt(token, req, res, next);
      
    } catch (error) {
      logger.error('Errore durante l\'autenticazione:', error);
      return res.status(500).json({
        error: 'Errore di autenticazione',
        message: 'Si è verificato un errore durante l\'autenticazione'
      });
    }
  },
  
  /**
   * Estrae il token dalla richiesta (header o query)
   * @private
   * @param {Object} req - Richiesta Express
   * @returns {string|null} Token estratto o null
   */
  _extractToken(req) {
    // Cerca nel header Authorization
    const authHeader = req.headers[this._config.tokenHeader.toLowerCase()] || 
                      req.headers[this._config.tokenHeader];
                      
    if (authHeader && authHeader.startsWith(`${this._config.tokenType} `)) {
      return authHeader.substring(this._config.tokenType.length + 1);
    }
    
    // Cerca nei query params
    if (req.query && req.query.token) {
      return req.query.token;
    }
    
    // Cerca nei cookie
    if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }
    
    return null;
  },
  
  /**
   * Verifica se un token è un'API key
   * @private
   * @param {string} token - Token da verificare
   * @returns {boolean} True se è un'API key
   */
  _isApiKey(token) {
    // Le API key iniziano con 'lulu_api_'
    return token.startsWith('lulu_api_');
  },
  
  /**
   * Autentica una richiesta usando API key
   * @private
   * @param {string} apiKey - API key
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  _authenticateWithApiKey(apiKey, req, res, next) {
    // Verifica se l'API key è valida (dalla cache o dal database)
    if (this._apiKeys.has(apiKey)) {
      // API key trovata in cache
      const keyData = this._apiKeys.get(apiKey);
      
      // Verifica se l'API key è scaduta
      if (keyData.expiresAt && Date.now() > keyData.expiresAt) {
        this._apiKeys.delete(apiKey);
        return res.status(401).json({
          error: 'Accesso non autorizzato',
          message: 'API key scaduta'
        });
      }
      
      // Imposta informazioni utente nella richiesta
      req.user = {
        id: keyData.userId,
        roles: keyData.roles || ['api'],
        source: 'apikey',
        keyId: keyData.id
      };
      
      // Aggiorna last used
      keyData.lastUsed = Date.now();
      
      // Aggiunge rate limit specifico per API key
      req.rateLimit = {
        limit: keyData.rateLimit || 100,
        window: keyData.rateLimitWindow || 60000 // 1 minuto
      };
      
      logger.debug(`Richiesta autenticata con API key: ${keyData.id}`);
      return next();
    }
    
    // API key non trovata in cache, potrebbe essere nel DB
    // In una implementazione reale, qui andrebbe la verifica dal database
    // Per semplicità, consideriamo invalida l'API key se non è in cache
    logger.warn(`Tentativo di autenticazione con API key non valida: ${apiKey.substring(0, 10)}...`);
    
    return res.status(401).json({
      error: 'Accesso non autorizzato',
      message: 'API key non valida'
    });
  },
  
  /**
   * Autentica una richiesta usando JWT
   * @private
   * @param {string} token - Token JWT
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  _authenticateWithJwt(token, req, res, next) {
    try {
      // Verifica il token JWT
      const decoded = jwt.verify(token, this._config.jwtSecret);
      
      // Imposta informazioni utente nella richiesta
      req.user = {
        id: decoded.userId,
        username: decoded.username,
        roles: decoded.roles || ['user'],
        exp: decoded.exp,
        source: 'jwt'
      };
      
      logger.debug(`Richiesta autenticata per utente: ${decoded.username}`);
      return next();
      
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Accesso non autorizzato',
          message: 'Token scaduto, utilizzare il refresh token per ottenere un nuovo token'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Accesso non autorizzato',
          message: 'Token non valido'
        });
      }
      
      logger.error('Errore durante la verifica del token JWT:', error);
      return res.status(500).json({
        error: 'Errore di autenticazione',
        message: 'Si è verificato un errore durante la verifica del token'
      });
    }
  },
  
  /**
   * Middleware per verificare i ruoli utente
   * @param {string|string[]} roles - Ruoli richiesti (string o array)
   * @returns {Function} Middleware Express
   */
  requireRole(roles) {
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    return (req, res, next) => {
      // Verifica che l'utente sia autenticato
      if (!req.user) {
        return res.status(401).json({
          error: 'Accesso non autorizzato',
          message: 'Autenticazione richiesta'
        });
      }
      
      // Verifica che l'utente abbia almeno uno dei ruoli richiesti
      const userRoles = req.user.roles || [];
      
      // Ruolo 'admin' ha accesso a tutto
      if (userRoles.includes('admin')) {
        return next();
      }
      
      // Verifica ruoli specifici
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        logger.warn(`Accesso non autorizzato: utente ${req.user.id} (ruoli: ${userRoles.join(', ')}) ha tentato di accedere a risorsa che richiede ruoli: ${requiredRoles.join(', ')}`);
        
        return res.status(403).json({
          error: 'Accesso vietato',
          message: 'Non hai i permessi necessari per accedere a questa risorsa'
        });
      }
      
      next();
    };
  },
  
  /**
   * Genera un token JWT per un utente
   * @param {Object} user - Dati utente
   * @param {string} user.id - ID utente
   * @param {string} user.username - Nome utente
   * @param {string[]} [user.roles] - Ruoli utente
   * @param {Object} [options] - Opzioni aggiuntive
   * @param {string} [options.expiresIn] - Durata token (default da config)
   * @returns {Object} Oggetto con token, refresh token e informazioni
   */
  generateTokens(user, options = {}) {
    try {
      if (!user || !user.id) {
        throw new Error('Dati utente mancanti o invalidi');
      }
      
      // Payload base per il token
      const payload = {
        userId: user.id,
        username: user.username,
        roles: user.roles || ['user']
      };
      
      // Opzioni per il token principale
      const tokenOptions = {
        expiresIn: options.expiresIn || this._config.tokenExpiration
      };
      
      // Genera token principale
      const token = jwt.sign(payload, this._config.jwtSecret, tokenOptions);
      
      // Genera refresh token con scadenza più lunga
      const refreshPayload = {
        userId: user.id,
        tokenType: 'refresh',
        // Aggiungi random per rendere il refresh token unico
        random: crypto.randomBytes(8).toString('hex')
      };
      
      const refreshToken = jwt.sign(
        refreshPayload,
        this._config.jwtSecret,
        { expiresIn: this._config.refreshExpiration }
      );
      
      // Decodifica il token per estrarre data di scadenza
      const decoded = jwt.decode(token);
      
      return {
        token,
        refreshToken,
        expiresAt: decoded.exp * 1000, // Converti in millisecondi
        type: this._config.tokenType
      };
    } catch (error) {
      logger.error('Errore durante la generazione del token:', error);
      throw error;
    }
  },
  
  /**
   * Rinnova un token utilizzando un refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} Nuovi token
   */
  refreshToken(refreshToken) {
    try {
      // Verifica il refresh token
      const decoded = jwt.verify(refreshToken, this._config.jwtSecret);
      
      // Verifica che sia effettivamente un refresh token
      if (decoded.tokenType !== 'refresh') {
        throw new Error('Token non valido per il refresh');
      }
      
      // Carica dati utente (da cache o DB)
      // In una implementazione reale qui andrebbero caricati i dati utente aggiornati
      const user = {
        id: decoded.userId,
        username: decoded.username || `user_${decoded.userId}`,
        roles: decoded.roles || ['user']
      };
      
      // Genera nuovi token
      return this.generateTokens(user);
      
    } catch (error) {
      logger.error('Errore durante il refresh del token:', error);
      throw error;
    }
  },
  
  /**
   * Invalida un token (logout)
   * @param {string} token - Token da invalidare
   * @returns {boolean} True se l'operazione è riuscita
   */
  invalidateToken(token) {
    try {
      if (!token) return false;
      
      // Decodifica il token senza verificarlo per ottenere expiration
      const decoded = jwt.decode(token);
      
      if (!decoded || !decoded.exp) {
        return false;
      }
      
      // Calcola durata rimanente del token
      const expiresAt = decoded.exp * 1000; // Converti in millisecondi
      const now = Date.now();
      
      // Se il token è già scaduto, non serve invalidarlo
      if (expiresAt <= now) {
        return true;
      }
      
      // Aggiungi alla lista dei token invalidati
      this._invalidatedTokens.add(token);
      
      logger.debug(`Token invalidato per l'utente ${decoded.userId || 'sconosciuto'}`);
      return true;
      
    } catch (error) {
      logger.error('Errore durante l\'invalidazione del token:', error);
      return false;
    }
  },
  
  /**
   * Registra una nuova API key
   * @param {Object} keyData - Dati dell'API key
   * @param {string} keyData.userId - ID utente proprietario
   * @param {string} [keyData.name] - Nome descrittivo dell'API key
   * @param {string[]} [keyData.roles] - Ruoli associati all'API key
   * @param {number} [keyData.expiresIn] - Durata in millisecondi
   * @returns {Object} Dati della nuova API key
   */
  generateApiKey(keyData) {
    try {
      if (!keyData || !keyData.userId) {
        throw new Error('Dati API key mancanti o invalidi');
      }
      
      // Genera ID univoco per l'API key
      const keyId = crypto.randomBytes(16).toString('hex');
      
      // Genera l'API key vera e propria
      const apiKey = `lulu_api_${keyId}_${crypto.randomBytes(16).toString('hex')}`;
      
      // Calcola scadenza se specificata
      let expiresAt = null;
      if (keyData.expiresIn) {
        expiresAt = Date.now() + keyData.expiresIn;
      }
      
      // Salva l'API key nella cache
      const apiKeyData = {
        id: keyId,
        userId: keyData.userId,
        name: keyData.name || `API Key ${keyId.substring(0, 8)}`,
        roles: keyData.roles || ['api'],
        createdAt: Date.now(),
        expiresAt,
        lastUsed: null,
        rateLimit: keyData.rateLimit || 100,
        rateLimitWindow: keyData.rateLimitWindow || 60000
      };
      
      this._apiKeys.set(apiKey, apiKeyData);
      
      // In una implementazione reale, qui andrebbe salvata l'API key nel database
      
      logger.info(`Nuova API key generata per l'utente ${keyData.userId}: ${keyId}`);
      
      return {
        apiKey,
        id: keyId,
        name: apiKeyData.name,
        expiresAt
      };
      
    } catch (error) {
      logger.error('Errore durante la generazione dell\'API key:', error);
      throw error;
    }
  },
  
  /**
   * Revoca un'API key
   * @param {string} keyId - ID dell'API key
   * @param {string} userId - ID utente proprietario (per verifica)
   * @returns {boolean} True se l'operazione è riuscita
   */
  revokeApiKey(keyId, userId) {
    try {
      // Cerca l'API key nella cache
      for (const [apiKey, data] of this._apiKeys.entries()) {
        if (data.id === keyId) {
          // Verifica che l'utente sia il proprietario
          if (userId && data.userId !== userId) {
            logger.warn(`Tentativo di revocare API key ${keyId} da utente non autorizzato: ${userId}`);
            return false;
          }
          
          // Rimuovi l'API key dalla cache
          this._apiKeys.delete(apiKey);
          
          // In una implementazione reale, qui andrebbe rimossa l'API key dal database
          
          logger.info(`API key ${keyId} revocata`);
          return true;
        }
      }
      
      logger.warn(`API key ${keyId} non trovata`);
      return false;
      
    } catch (error) {
      logger.error(`Errore durante la revoca dell'API key ${keyId}:`, error);
      return false;
    }
  },
  
  /**
   * Pulisce i token invalidati scaduti
   * @private
   */
  _cleanupInvalidatedTokens() {
    try {
      const now = Date.now();
      let removedCount = 0;
      
      for (const token of this._invalidatedTokens) {
        const decoded = jwt.decode(token);
        
        // Se il token è scaduto, rimuovilo dalla lista
        if (decoded && decoded.exp && decoded.exp * 1000 <= now) {
          this._invalidatedTokens.delete(token);
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        logger.debug(`Rimossi ${removedCount} token invalidati scaduti`);
      }
      
    } catch (error) {
      logger.error('Errore durante la pulizia dei token invalidati:', error);
    }
  }
};

module.exports = authMiddleware;