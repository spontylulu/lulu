/**
 * core-metrics.js
 * Servizio per metriche e monitoraggio prestazioni di Lulu
 */

const logger = require('../../utils/logger').getLogger('core:metrics');

const metricsService = {
  _active: false,
  _metrics: {},
  _config: {
    enabled: true,
    samplingRate: 0.1
  },

  async initialize(config = {}) {
    this._config = { ...this._config, ...config };
    this._metrics = {};
    this._active = true;
    logger.info('Servizio metriche inizializzato');
    return this;
  },

  async shutdown() {
    this._active = false;
    logger.info('Servizio metriche chiuso');
  },

  isActive() {
    return this._active;
  },

  increment(name, value = 1) {
    if (!this._active || !this._config.enabled) return;
    this._metrics[name] = (this._metrics[name] || 0) + value;
  },

  record(name, value) {
    if (!this._active || !this._config.enabled) return;
    this._metrics[name] = value;
  },

  getMetrics() {
    return { ...this._metrics };
  },

  reset() {
    this._metrics = {};
  }
};

module.exports = metricsService;
