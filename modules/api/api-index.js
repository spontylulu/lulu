/**
 * api-index.js
 * Punto di ingresso per le API RESTful di Lulu
 */

const express = require('express');
const logger = require('../../utils/logger').getLogger('api:index');
const auth = require('./api-auth');
const errorHandler = require('./api-error-handler');
const rateLimiter = require('./api-rate-limiter');
const base = require('./controllers/api-base-controller');
const ai = require('./controllers/api-ai-controller');
const system = require('./controllers/api-system-controller');

const apiModule = {
  router: express.Router(),
  _active: false,
  _aiModule: null,  // Riferimento al modulo AI
  _config: {
    basePath: '/api',
    version: 'v1',
    enableRateLimit: true,
    enableCors: true,
    enableCache: true,
    authRequired: true,
    swaggerEnabled: true
  },

  async initialize(config = {}, loadedModules = {}) {
    this._config = { ...this._config, ...config };
    this._setupMiddleware();

    // Usa il modulo AI già caricato dal loader invece di crearne uno nuovo
    if (loadedModules && loadedModules.ai) {
      this._aiModule = loadedModules.ai;
      console.log('[API DEBUG] Modulo AI collegato:', typeof loadedModules.ai);
      console.log('[API DEBUG] AI complete function exists:', typeof loadedModules.ai.complete === 'function');
    } else {
      console.log('[API DEBUG] LoadedModules:', loadedModules);
      console.log('[API DEBUG] AI not found in loadedModules');
    }

    // Inizializza il controller AI con il modulo corretto
    console.log('[API DEBUG] Passando AI al controller, presente:', !!this._aiModule);
    await ai.initialize(this._aiModule);

    this._setupRoutes();
    this._active = true;
    logger.info('Modulo API inizializzato');
    return this;
  },

  async shutdown() {
    this._active = false;
    logger.info('Modulo API chiuso');
  },

  status() {
    return {
      active: this._active,
      config: this._config,
      aiConnected: !!this._aiModule
    };
  },

  _setupMiddleware() {
    const router = this.router;

    router.use((req, res, next) => {
      logger.debug(`${req.method} ${req.originalUrl}`);
      res.setHeader('X-Lulu-Version', this._config.version);
      req.startTime = Date.now();
      res.on('finish', () => {
        logger.debug(`${req.method} ${req.originalUrl} completata in ${Date.now() - req.startTime}ms`);
      });
      next();
    });

    if (this._config.enableCors) {
      router.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
      });
    }

    router.use(express.json());

    if (this._config.enableRateLimit) {
      router.use(rateLimiter.middleware());
    }

    if (this._config.authRequired) {
      const whitelist = ['/health', '/status', '/docs', '/auth/login', '/auth/register'];
      router.use((req, res, next) => {
        const isPublic = whitelist.some(ep => req.path.startsWith(`/${this._config.version}${ep}`) || req.path === ep);
        if (isPublic) return next();
        auth.authenticate(req, res, next);
      });
    }
  },

  _setupRoutes() {
    const r = this.router;
    const v = `/${this._config.version}`;

    r.get('/', base.getApiInfo);
    r.get('/health', base.getHealth);
    r.get('/status', base.getStatus);

    r.get(`${v}/system/info`, system.getSystemInfo);
    r.get(`${v}/system/metrics`, system.getMetrics);
    r.get(`${v}/system/logs`, system.getLogs);

    // *** RIMOSSE LE ROUTE AI DA QUI ***
    // Le route AI sono ora configurate direttamente nel controller AI
    // usando il closure pattern per mantenere il riferimento al modulo AI
    
    // Monta il router del controller AI
    r.use(`${v}/ai`, ai.router);

    r.post(`${v}/auth/login`, base.login);
    r.post(`${v}/auth/logout`, auth.authenticate, base.logout);
    r.post(`${v}/auth/refresh`, base.refreshToken);

    r.use((req, res) => {
      logger.debug(`404: ${req.originalUrl}`);
      res.status(404).json({ error: 'Endpoint non trovato', path: req.originalUrl });
    });

    r.use(errorHandler.middleware);
  },

  registerController(name, controller, basePath) {
    if (!this._active) return false;
    const path = basePath || `/${this._config.version}/${name}`;
    logger.info(`Controller registrato: ${name} su ${path}`);
    this.router.use(path, controller.router);
    return true;
  },

  getVersionPrefix() {
    return `/${this._config.version}`;
  }
};

module.exports = apiModule;