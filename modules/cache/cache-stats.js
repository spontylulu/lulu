/**
 * cache-stats.js
 * Statistiche e diagnostica del modulo cache
 */

const logger = require('../../utils/logger').getLogger('cache:stats');

const statsService = {
  _data: {
    sets: 0,
    gets: 0,
    hits: 0,
    misses: 0,
    errors: {},
    clears: 0,
    removed: 0,
    cleaned: 0
  },

  async initialize() {
    this._data = {
      sets: 0,
      gets: 0,
      hits: 0,
      misses: 0,
      errors: {},
      clears: 0,
      removed: 0,
      cleaned: 0
    };
    logger.info('Servizio statistiche cache inizializzato');
    return this;
  },

  async shutdown() {
    logger.info('Servizio statistiche cache chiuso');
  },

  recordSet() {
    this._data.sets++;
  },

  recordGet({ hit = false } = {}) {
    this._data.gets++;
    hit ? this._data.hits++ : this._data.misses++;
  },

  recordError(scope, message) {
    this._data.errors[scope] = this._data.errors[scope] || [];
    this._data.errors[scope].push(message);
  },

  recordRemove() {
    this._data.removed++;
  },

  recordCleanup({ count = 0 } = {}) {
    this._data.cleaned += count;
  },

  recordClear() {
    this._data.clears++;
  },

  getStats() {
    return { ...this._data };
  }
};

module.exports = statsService;
