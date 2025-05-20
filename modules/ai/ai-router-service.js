/**
 * ai-router-service.js
 * Scelta dinamica del provider AI (Claude, OpenAI...)
 */

const logger = require('../../utils/logger').getLogger('ai:router');

const routerService = {
  _config: {
    enabled: true
  },

  async initialize(config = {}) {
    this._config = { ...this._config, ...config };
    logger.info('Router AI inizializzato');
    return this;
  },

  async shutdown() {
    logger.info('Router AI chiuso');
  },

  async determineProvider(message, options = {}) {
    // In futuro: analisi contenuto o costo
    return options.provider || 'claude';
  }
};

module.exports = routerService;
