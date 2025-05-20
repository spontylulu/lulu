/**
 * api-base-controller.js
 * Controller base per endpoint pubblici e autenticazione
 */

const express = require('express');
const logger = require('../../../utils/logger').getLogger('api:controller:base');
const auth = require('../api-auth.js');  // ✅ path corretto
const { errors, ApiError } = require('../api-error-handler.js');  // ✅
const os = require('os');

const baseController = {
  router: express.Router(),

  initialize() {
    this._setupRoutes();
    logger.info('Controller base inizializzato');
  },

  _setupRoutes() {
    const r = this.router;
    r.get('/', this.getApiInfo);
    r.get('/health', this.getHealth);
    r.get('/status', this.getStatus);
    r.post('/auth/login', this.login);
    r.post('/auth/logout', auth.authenticate, this.logout);
    r.post('/auth/refresh', this.refreshToken);
  },

  getApiInfo(req, res) {
    res.json({
      name: 'Lulu API',
      version: process.env.npm_package_version || '1.0.0',
      message: 'Benvenuto nell’API di Lulu'
    });
  },

  getHealth(req, res) {
    res.json({ status: 'ok', timestamp: Date.now() });
  },

  getStatus(req, res) {
    res.json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: os.platform(),
      arch: os.arch()
    });
  },

  login(req, res) {
    const { username = 'demo', id = 'user-demo' } = req.body || {};
    const tokenData = auth.generateTokens({ id, username });
    res.json(tokenData);
  },

  logout(req, res) {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) auth.invalidateToken(token);
    res.json({ message: 'Logout effettuato con successo' });
  },

  refreshToken(req, res) {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token mancante' });
    }
    try {
      const newTokens = auth.refreshToken(refreshToken);
      res.json(newTokens);
    } catch (error) {
      logger.error('Errore nel refresh token:', error);
      res.status(401).json({ error: 'Token non valido o scaduto' });
    }
  }
};

baseController.initialize();
module.exports = baseController;
