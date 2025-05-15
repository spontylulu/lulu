/**
 * modules/api/controllers/api-base-controller.js
 * Controller base per le API di Lulu
 * 
 * Gestisce le rotte di base dell'API, inclusi gli endpoint informativi
 * e le funzionalità di autenticazione.
 */

const logger = require('../../../utils/logger').getLogger('api:controller:base');
const express = require('express');
const authMiddleware = require('../api-auth');
const { errors, asyncHandler } = require('../api-error-handler');
const os = require('os');

// Versione dal package.json o default
const appVersion = process.env.npm_package_version || '1.0.0';

/**
 * Controller per le rotte base dell'API
 */
const baseController = {
  // Router per rotte specifiche di questo controller
  router: express.Router(),
  
  /**
   * Inizializza il controller
   */
  initialize() {
    logger.info('Inizializzazione controller base API');
    this._setupRoutes();
    logger.info('Controller base API inizializzato');
  },
  
  /**
   * Configura le rotte del controller
   * @private
   */
  _setupRoutes() {
    // Usiamo il router interno per eventuali rotte aggiuntive
    const router = this.router;
    
    // Esempi di rotte aggiuntive che possono essere gestite da questo controller
    router.get('/version', this.getVersion);
    router.post('/feedback', this.submitFeedback);
    
    logger.debug('Rotte controller base configurate');
  },
  
  /**
   * Ottiene informazioni generali sull'API
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   */
  getApiInfo(req, res) {
    res.json({
      name: 'Lulu API',
      version: appVersion,
      description: 'API per l\'assistente AI personale Lulu',
      documentation: '/docs',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  },
  
  /**
   * Endpoint di health check
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   */
  getHealth(req, res) {
    // Calcola uptime
    const uptime = process.uptime();
    
    // Statistiche base di sistema
    const memoryUsage = process.memoryUsage();
    
    res.json({
      status: 'ok',
      uptime: uptime,
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB', 
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB'
      }
    });
  },
  
  /**
   * Ottiene lo stato dettagliato del sistema
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   */
  getStatus(req, res) {
    // Calcola statistiche di sistema più dettagliate
    const systemInfo = {
      timestamp: new Date().toISOString(),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        loadAvg: os.loadavg(),
        memory: {
          total: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
          free: Math.round(os.freemem() / 1024 / 1024) + ' MB',
          usage: Math.round((1 - os.freemem() / os.totalmem()) * 100) + '%'
        }
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        title: process.title,
        version: process.version,
        memory: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          external: Math.round(process.memoryUsage().external / 1024 / 1024) + ' MB'
        }
      }
    };
    
    res.json(systemInfo);
  },
  
  /**
   * Ottiene la versione dell'API
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   */
  getVersion(req, res) {
    res.json({
      version: appVersion,
      timestamp: new Date().toISOString(),
      node: process.version
    });
  },
  
  /**
   * Gestisce il login utente
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  login: asyncHandler(async (req, res, next) => {
    try {
      // Verifica corpo richiesta
      const { username, password } = req.body;
      
      if (!username || !password) {
        return next(errors.validation('Username e password sono richiesti'));
      }
      
      // Esempio di validation (in produzione useremmo un DB)
      // Questo è solo un esempio, non usare in produzione!
      if (username === 'admin' && password === 'admin') {
        const user = {
          id: '1',
          username: 'admin',
          roles: ['admin']
        };
        
        // Genera token JWT
        const tokenData = authMiddleware.generateTokens(user);
        
        logger.info(`Login utente: ${username}`);
        
        return res.json({
          success: true,
          message: 'Login effettuato con successo',
          user: {
            id: user.id,
            username: user.username,
            roles: user.roles
          },
          token: tokenData.token,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          tokenType: tokenData.type
        });
      }
      
      // Login fallito
      logger.warn(`Tentativo di login fallito per l'utente: ${username}`);
      return next(errors.unauthorized('Credenziali non valide'));
      
    } catch (error) {
      logger.error('Errore durante il login:', error);
      return next(errors.internal('Errore durante il login'));
    }
  }),
  
  /**
   * Gestisce il logout utente
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  logout: asyncHandler(async (req, res, next) => {
    try {
      // Ottieni token dalla richiesta
      const token = authMiddleware._extractToken(req);
      
      if (!token) {
        return next(errors.unauthorized('Nessun token fornito'));
      }
      
      // Invalida il token
      const invalidated = authMiddleware.invalidateToken(token);
      
      if (!invalidated) {
        return next(errors.internal('Errore durante il logout'));
      }
      
      logger.info(`Logout utente: ${req.user.username || req.user.id}`);
      
      res.json({
        success: true,
        message: 'Logout effettuato con successo'
      });
      
    } catch (error) {
      logger.error('Errore durante il logout:', error);
      return next(errors.internal('Errore durante il logout'));
    }
  }),
  
  /**
   * Rinnova il token con refresh token
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  refreshToken: asyncHandler(async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return next(errors.validation('Refresh token mancante'));
      }
      
      // Rinnova il token
      const tokenData = authMiddleware.refreshToken(refreshToken);
      
      // Restituisci i nuovi token
      res.json({
        success: true,
        token: tokenData.token,
        refreshToken: tokenData.refreshToken,
        expiresAt: tokenData.expiresAt,
        tokenType: tokenData.type
      });
      
    } catch (error) {
      logger.error('Errore durante il refresh del token:', error);
      
      // Gestione errori specifici JWT
      if (error.name === 'TokenExpiredError') {
        return next(errors.unauthorized('Refresh token scaduto, effettua nuovamente il login'));
      }
      
      if (error.name === 'JsonWebTokenError') {
        return next(errors.unauthorized('Refresh token non valido'));
      }
      
      return next(errors.internal('Errore durante il refresh del token'));
    }
  }),
  
  /**
   * Gestisce l'invio di feedback
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  submitFeedback: asyncHandler(async (req, res, next) => {
    try {
      const { type, message, rating, metadata } = req.body;
      
      if (!type || !message) {
        return next(errors.validation('Tipo e messaggio sono richiesti'));
      }
      
      // Qui in una implementazione reale salveremmo il feedback
      logger.info(`Feedback ricevuto di tipo: ${type}`, {
        rating,
        message: message.substring(0, 100),
        userId: req.user ? req.user.id : 'anonymous'
      });
      
      // Simula elaborazione
      await new Promise(resolve => setTimeout(resolve, 500));
      
      res.json({
        success: true,
        message: 'Feedback inviato con successo, grazie!',
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
      });
      
    } catch (error) {
      logger.error('Errore durante invio feedback:', error);
      return next(errors.internal('Errore durante l\'invio del feedback'));
    }
  })
};

module.exports = baseController;