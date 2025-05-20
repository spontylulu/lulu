/**
 * api-system-controller.js
 * Controller API per stato, metriche e log di sistema
 */

const express = require('express');
const logger = require('../../../utils/logger').getLogger('api:controller:system');
const fs = require('fs').promises;
const path = require('path');

const systemController = {
  router: express.Router(),
  _core: null,

  initialize(coreModule) {
    this._core = coreModule;
    this._setupRoutes();
    logger.info('Controller di sistema inizializzato');
  },

  _setupRoutes() {
    const r = this.router;
    r.get('/info', this.getSystemInfo.bind(this));
    r.get('/metrics', this.getMetrics.bind(this));
    r.get('/logs', this.getLogs.bind(this));
  },

  getSystemInfo(req, res) {
    res.json({
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      memory: process.memoryUsage(),
      cpuCount: require('os').cpus().length
    });
  },

  getMetrics(req, res) {
    const metrics = this._core?.metrics?.getMetrics?.() || {};
    res.json({ metrics });
  },

  async getLogs(req, res) {
    try {
      const logs = await fs.readFile(path.join(__dirname, '../../../logs/lulu.log'), 'utf8');
      res.type('text/plain').send(logs);
    } catch (err) {
      logger.error('Errore lettura log:', err);
      res.status(500).json({ error: 'Errore nella lettura dei log' });
    }
  }
};

module.exports = systemController;
