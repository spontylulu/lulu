/**
 * core-index.js
 * Entry point del modulo core: gestione config, eventi, metriche e utilità
 */

const logger = require('../../utils/logger').getLogger('core:index');
const config = require('./core-config');
const events = require('./core-events');
const metrics = require('./core-metrics');
const utils = require('./core-utils');

const core = {
  async initialize(cfg = {}) {
    logger.info('Inizializzazione core...');
    await config.initialize();
    await events.initialize();
    await metrics.initialize({
      enabled: true,
      samplingRate: 0.1,
      ...cfg.metrics
    });
    await utils.initialize();
    this._setupSystemHandlers();
    events.emit('core:initialized');
    logger.info('Core inizializzato.');
    return this;
  },

  async shutdown() {
    events.emit('core:shutdown:start');
    await utils.shutdown();
    await metrics.shutdown();
    await events.shutdown();
    await config.shutdown();
    logger.info('Core chiuso.');
  },

  status() {
    return {
      active: true,
      services: {
        config: config.isActive(),
        events: events.isActive(),
        metrics: metrics.isActive(),
        utils: utils.isActive()
      },
      metrics: metrics.getMetrics(),
      uptime: process.uptime()
    };
  },

  _setupSystemHandlers() {
    process.on('warning', (w) => {
      logger.warn('Node warning:', w.message);
      metrics.increment('warnings');
    });
    events.on('module:loaded', ({ name }) => {
      logger.debug(`Modulo caricato: ${name}`);
      metrics.increment('modules.loaded');
    });
    events.on('module:error', ({ name, error }) => {
      logger.warn(`Errore modulo ${name}:`, error);
      metrics.increment('modules.errors');
    });
  },

  // Shortcut API
  config,
  events,
  metrics,
  utils,
  getConfig: (...args) => config.get(...args),
  setConfig: (...args) => {
    config.set(...args);
    events.emit('config:changed', { key: args[0], value: args[1] });
  },
  on: (...args) => events.on(...args),
  emit: (...args) => events.emit(...args),
  incrementMetric: (...args) => metrics.increment(...args),
  recordMetric: (...args) => metrics.record(...args)
};

module.exports = core;
