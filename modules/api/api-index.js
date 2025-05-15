/**
 * modules/api/api-index.js
 * Modulo API - Interfaccia RESTful per Lulu
 * 
 * Questo modulo gestisce tutte le API esposte dall'applicazione,
 * fornendo endpoint per interagire con i diversi moduli e funzionalità.
 */

const express = require('express');
const logger = require('../../utils/logger').getLogger('api:index');
const authMiddleware = require('./api-auth');
const errorHandler = require('./api-error-handler');
const rateLimiter = require('./api-rate-limiter');
const baseController = require('./controllers/api-base-controller');
const aiController = require('./controllers/api-ai-controller');
const systemController = require('./controllers/api-system-controller');

/**
 * Modulo API - Gestisce l'interfaccia RESTful dell'applicazione
 */
const apiModule = {
  // Router Express per gli endpoint API
  router: express.Router(),
  
  // Flag per tracciare lo stato del modulo
  _active: false,
  
  // Configurazione di default
  _config: {
    basePath: '/api',
    version: 'v1',
    enableRateLimit: true,
    enableCors: true,
    enableCache: true,
    authRequired: true,
    swaggerEnabled: true
  },
  
  /**
   * Inizializza il modulo API
   * @param {Object} config - Configurazione del modulo
   * @returns {Object} - Istanza del modulo
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione modulo API');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Configura il router
      this._setupMiddleware();
      this._setupRoutes();
      
      this._active = true;
      logger.info('Modulo API inizializzato con successo');
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del modulo API:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il modulo API
   */
  async shutdown() {
    logger.info('Chiusura modulo API');
    
    try {
      // Pulizia delle risorse
      this._active = false;
      logger.info('Modulo API chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del modulo API:', error);
      throw error;
    }
  },
  
  /**
   * Restituisce lo stato attuale del modulo
   * @returns {Object} Stato del modulo
   */
  status() {
    return {
      active: this._active,
      config: {
        basePath: this._config.basePath,
        version: this._config.version,
        enableRateLimit: this._config.enableRateLimit,
        enableCache: this._config.enableCache,
        authRequired: this._config.authRequired
      }
    };
  },
  
  /**
   * Configura i middleware del router
   * @private
   */
  _setupMiddleware() {
    const router = this.router;
    
    // Middleware di base per tutte le richieste
    router.use((req, res, next) => {
      logger.debug(`${req.method} ${req.originalUrl}`);
      
      // Imposta versione API nelle intestazioni risposta
      res.setHeader('X-Lulu-Version', this._config.version);
      
      // Registra timestamp inizio richiesta per calcolo durata
      req.startTime = Date.now();
      
      // Middleware per calcolare e loggare la durata della richiesta
      const logRequestDuration = () => {
        const duration = Date.now() - req.startTime;
        logger.debug(`${req.method} ${req.originalUrl} completata in ${duration}ms`);
      };
      
      // Registra evento di completamento
      res.on('finish', logRequestDuration);
      
      next();
    });
    
    // Middleware CORS se abilitato
    if (this._config.enableCors) {
      router.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
        
        // Gestione delle richieste preflight OPTIONS
        if (req.method === 'OPTIONS') {
          return res.sendStatus(200);
        }
        
        next();
      });
    }
    
    // Middleware parsing JSON
    router.use(express.json());
    
    // Middleware rate limiter
    if (this._config.enableRateLimit) {
      router.use(rateLimiter.middleware());
    }
    
    // Autenticazione API - bypass solo per endpoint whitelist
    if (this._config.authRequired) {
      router.use((req, res, next) => {
        // Whitelist di endpoint che non richiedono autenticazione
        const publicEndpoints = [
          '/health',
          '/status',
          '/docs',
          '/auth/login',
          '/auth/register'
        ];
        
        // Verifica se l'endpoint è nella whitelist
        const isPublicEndpoint = publicEndpoints.some(endpoint => 
          req.path.startsWith(`/${this._config.version}${endpoint}`) || 
          req.path === endpoint
        );
        
        if (isPublicEndpoint) {
          return next();
        }
        
        // Applica autenticazione
        authMiddleware.authenticate(req, res, next);
      });
    }
  },
  
  /**
   * Configura le rotte API
   * @private
   */
  _setupRoutes() {
    const router = this.router;
    const versionPrefix = `/${this._config.version}`;
    
    // Endpoint base
    router.get('/', baseController.getApiInfo);
    router.get('/health', baseController.getHealth);
    router.get('/status', baseController.getStatus);
    
    // Endpoints versione corrente
    
    // Endpoints sistema
    router.get(`${versionPrefix}/system/info`, systemController.getSystemInfo);
    router.get(`${versionPrefix}/system/metrics`, systemController.getMetrics);
    router.get(`${versionPrefix}/system/logs`, systemController.getLogs);
    
    // Endpoints AI/Claude
    router.post(`${versionPrefix}/ai/chat`, aiController.chat);
    router.post(`${versionPrefix}/ai/complete`, aiController.complete);
    router.get(`${versionPrefix}/ai/models`, aiController.getModels);
    
    // Endpoint autenticazione
    router.post(`${versionPrefix}/auth/login`, baseController.login);
    router.post(`${versionPrefix}/auth/logout`, authMiddleware.authenticate, baseController.logout);
    router.post(`${versionPrefix}/auth/refresh`, baseController.refreshToken);
    
    // Gestione 404 per rotte non trovate
    router.use((req, res) => {
      logger.debug(`Rotta non trovata: ${req.originalUrl}`);
      res.status(404).json({
        error: 'Endpoint non trovato',
        path: req.originalUrl,
        method: req.method,
        version: this._config.version
      });
    });
    
    // Middleware di gestione errori globale
    router.use(errorHandler.middleware);
    
    logger.debug('Rotte API configurate con successo');
  },
  
  /**
   * Registra un nuovo controller per un modulo specifico
   * @param {string} moduleName - Nome del modulo
   * @param {Object} controller - Controller da registrare
   * @param {string} [basePath] - Percorso base per il controller
   * @returns {boolean} True se il controller è stato registrato con successo
   */
  registerController(moduleName, controller, basePath) {
    if (!this._active) {
      logger.warn(`Tentativo di registrare controller per ${moduleName} mentre il modulo API è inattivo`);
      return false;
    }
    
    try {
      const path = basePath || `/${this._config.version}/${moduleName}`;
      
      logger.info(`Registrazione controller per modulo ${moduleName} su ${path}`);
      
      // Registra le rotte del controller
      this.router.use(path, controller.router);
      
      return true;
    } catch (error) {
      logger.error(`Errore durante la registrazione del controller per ${moduleName}:`, error);
      return false;
    }
  },
  
  /**
   * Restituisce il prefisso della versione corrente
   * @returns {string} Prefisso versione (es: '/v1')
   */
  getVersionPrefix() {
    return `/${this._config.version}`;
  }
};

module.exports = apiModule;