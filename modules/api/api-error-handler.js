/**
 * api-error-handler.js
 * Gestione centralizzata degli errori per Lulu API
 */

const logger = require('../../utils/logger').getLogger('api:error-handler');

class ApiError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date();
    Error.captureStackTrace(this, this.constructor);
  }
}

// Errori predefiniti utili
const errors = {
  unauthorized: new ApiError('Non autorizzato', 401),
  forbidden: new ApiError('Accesso vietato', 403),
  notFound: new ApiError('Risorsa non trovata', 404),
  server: new ApiError('Errore interno del server', 500)
};

// Middleware Express per intercettare errori
function middleware(err, req, res, next) {
  if (!err) return next();
  const status = err.statusCode || 500;

  logger.error(`[API ERROR] ${req.method} ${req.originalUrl} → ${status}`, {
    message: err.message,
    stack: err.stack,
    details: err.details || null
  });

  res.status(status).json({
    error: err.name || 'Errore',
    message: err.message,
    ...(err.details && { details: err.details }),
    status
  });
}

module.exports = {
  ApiError,
  errors,
  middleware
};
