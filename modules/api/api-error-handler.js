/**
 * modules/api/api-error-handler.js
 * Gestore errori centralizzato per le API di Lulu
 * 
 * Fornisce un sistema unificato per la gestione e la formattazione
 * degli errori nelle API, garantendo risposte consistenti.
 */

const logger = require('../../utils/logger').getLogger('api:error-handler');

/**
 * Classe personalizzata per errori API
 * Permette di specificare codice, messaggio e dettagli aggiuntivi
 */
class ApiError extends Error {
  /**
   * Crea un nuovo errore API
   * @param {string} message - Messaggio di errore
   * @param {number} statusCode - Codice HTTP
   * @param {Object} [details] - Dettagli aggiuntivi
   */
  constructor(message, statusCode, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode || 500;
    this.details = details;
    this.timestamp = new Date();
    
    // Cattura stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Errori comuni predefiniti
 */
const errors = {
  /**
   * Errore di validazione (400 Bad Request)
   * @param {string} message - Messaggio personalizzato
   * @param {Object} [details] - Dettagli di validazione
   * @returns {ApiError} Istanza errore
   */
  validation: (message, details) => {
    return new ApiError(
      message || 'Errore di validazione',
      400,
      details
    );
  },
  
  /**
   * Errore di autenticazione (401 Unauthorized)
   * @param {string} message - Messaggio personalizzato
   * @param {Object} [details] - Dettagli aggiuntivi
   * @returns {ApiError} Istanza errore
   */
  unauthorized: (message, details) => {
    return new ApiError(
      message || 'Autenticazione richiesta',
      401,
      details
    );
  },
  
  /**
   * Errore di autorizzazione (403 Forbidden)
   * @param {string} message - Messaggio personalizzato
   * @param {Object} [details] - Dettagli aggiuntivi
   * @returns {ApiError} Istanza errore
   */
  forbidden: (message, details) => {
    return new ApiError(
      message || 'Accesso negato',
      403,
      details
    );
  },
  
  /**
   * Risorsa non trovata (404 Not Found)
   * @param {string} message - Messaggio personalizzato
   * @param {Object} [details] - Dettagli aggiuntivi
   * @returns {ApiError} Istanza errore
   */
  notFound: (message, details) => {
    return new ApiError(
      message || 'Risorsa non trovata',
      404,
      details
    );
  },
  
  /**
   * Conflitto (409 Conflict)
   * @param {string} message - Messaggio personalizzato
   * @param {Object} [details] - Dettagli aggiuntivi
   * @returns {ApiError} Istanza errore
   */
  conflict: (message, details) => {
    return new ApiError(
      message || 'Conflitto con lo stato attuale della risorsa',
      409,
      details
    );
  },
  
  /**
   * Errore interno del server (500 Internal Server Error)
   * @param {string} message - Messaggio personalizzato
   * @param {Object} [details] - Dettagli aggiuntivi
   * @returns {ApiError} Istanza errore
   */
  internal: (message, details) => {
    return new ApiError(
      message || 'Errore interno del server',
      500,
      details
    );
  },
  
  /**
   * Servizio non disponibile (503 Service Unavailable)
   * @param {string} message - Messaggio personalizzato
   * @param {Object} [details] - Dettagli aggiuntivi
   * @returns {ApiError} Istanza errore
   */
  unavailable: (message, details) => {
    return new ApiError(
      message || 'Servizio temporaneamente non disponibile',
      503,
      details
    );
  },
  
  /**
   * Rate limit superato (429 Too Many Requests)
   * @param {string} message - Messaggio personalizzato
   * @param {Object} [details] - Dettagli aggiuntivi
   * @returns {ApiError} Istanza errore
   */
  rateLimit: (message, details) => {
    return new ApiError(
      message || 'Troppe richieste, riprova più tardi',
      429,
      details
    );
  }
};

/**
 * Gestore errori per le API
 */
const errorHandler = {
  // Configurazione di default
  _config: {
    showStackTrace: process.env.NODE_ENV !== 'production',
    logAllErrors: true,
    includeErrorId: true
  },
  
  // Mappa codici di errore a livelli di log
  _logLevels: {
    400: 'warn',    // Bad Request
    401: 'warn',    // Unauthorized
    403: 'warn',    // Forbidden
    404: 'warn',    // Not Found
    409: 'warn',    // Conflict
    429: 'warn',    // Too Many Requests
    500: 'error',   // Internal Server Error
    503: 'error'    // Service Unavailable
  },
  
  /**
   * Inizializza il gestore errori
   * @param {Object} config - Configurazione opzionale
   */
  initialize(config = {}) {
    logger.info('Inizializzazione gestore errori API');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      logger.info('Gestore errori API inizializzato con successo');
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del gestore errori API:', error);
      throw error;
    }
  },
  
  /**
   * Middleware per la gestione centralizzata degli errori
   * @param {Error} err - Errore
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  middleware(err, req, res, next) {
    try {
      // Se la risposta è già stata inviata, passa al next middleware
      if (res.headersSent) {
        return next(err);
      }
      
      // Genera un ID univoco per l'errore
      const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      
      // Determina se l'errore è un'istanza di ApiError
      const isApiError = err instanceof ApiError;
      
      // Prepara la risposta di errore
      const statusCode = err.statusCode || 500;
      
      // Costruisci il corpo della risposta
      const errorResponse = {
        error: true,
        message: err.message || 'Si è verificato un errore',
        statusCode
      };
      
      // Aggiungi l'ID errore se configurato
      if (errorHandler._config.includeErrorId) {
        errorResponse.errorId = errorId;
      }
      
      // Aggiungi dettagli per ApiError
      if (isApiError && err.details) {
        errorResponse.details = err.details;
      }
      
      // Aggiungi stack trace in ambiente di sviluppo
      if (errorHandler._config.showStackTrace && err.stack) {
        errorResponse.stack = err.stack;
      }
      
      // Determina il livello di log appropriato
      const logLevel = errorHandler._logLevels[statusCode] || 'error';
      
      // Log dell'errore
      if (errorHandler._config.logAllErrors || statusCode >= 500) {
        const logData = {
          errorId,
          url: req.originalUrl,
          method: req.method,
          statusCode,
          ip: req.ip,
          userId: req.user ? req.user.id : 'anonymous',
          userAgent: req.headers['user-agent']
        };
        
        if (isApiError && err.details) {
          logData.details = err.details;
        }
        
        if (err.stack) {
          logData.stack = err.stack;
        }
        
        logger[logLevel](`API Error [${errorId}]: ${err.message}`, logData);
      }
      
      // Invia la risposta
      return res.status(statusCode).json(errorResponse);
      
    } catch (handlerError) {
      // Fallback in caso di errore nel gestore errori
      logger.error('Errore critico nel gestore errori:', handlerError);
      
      return res.status(500).json({
        error: true,
        message: 'Errore interno del server',
        statusCode: 500
      });
    }
  },
  
  /**
   * Middleware per gestire errori 404 (route non trovate)
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  notFoundHandler(req, res, next) {
    const err = errors.notFound(`Endpoint non trovato: ${req.originalUrl}`);
    next(err);
  },
  
  /**
   * Middleware per convertire errori di validazione express-validator
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  validationHandler(req, res, next) {
    // Supporto per express-validator
    const validationResult = req.validationErrors ? req.validationErrors() : null;
    
    if (validationResult && validationResult.length > 0) {
      const err = errors.validation('Errore di validazione dei dati', {
        validationErrors: validationResult
      });
      
      return next(err);
    }
    
    next();
  },
  
  /**
   * Handler per errori async/await
   * @param {Function} fn - Funzione async
   * @returns {Function} Middleware con gestione errori
   */
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  },
  
  /**
   * Crea un gestore di errori per errori specifici di database
   * @param {Function} next - Funzione next di Express
   * @returns {Function} Handler per errori database
   */
  dbErrorHandler(next) {
    return (error) => {
      // Errori di duplicazione (es. unique constraint)
      if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
        return next(errors.conflict('Errore di duplicazione record', {
          originalError: error.message
        }));
      }
      
      // Errori di foreign key
      if (error.code === '23503' || error.code === 'ER_ROW_IS_REFERENCED') {
        return next(errors.conflict('Violazione di integrità referenziale', {
          originalError: error.message
        }));
      }
      
      // Errori di sintassi query
      if (error.code === '42703' || error.code === 'ER_BAD_FIELD_ERROR') {
        return next(errors.internal('Errore nella query database', {
          originalError: error.message
        }));
      }
      
      // Errore generico
      return next(errors.internal('Errore del database', {
        originalError: error.message
      }));
    };
  }
};

module.exports = {
  ApiError,
  errors,
  errorHandler,
  middleware: errorHandler.middleware,
  notFoundHandler: errorHandler.notFoundHandler,
  validationHandler: errorHandler.validationHandler,
  asyncHandler: errorHandler.asyncHandler,
  dbErrorHandler: errorHandler.dbErrorHandler
};