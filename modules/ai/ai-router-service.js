/**
 * ai-router-service.js
 * Routing dinamico delle richieste AI
 */

const logger = require('../../utils/logger').getLogger('ai:router');
const axios = require('axios');

const routerService = {
  _config: { enabled: true },
  _available: {},

  async initialize(config = {}) {
    this._config = { ...this._config, ...config };
    await this._refreshAvailability();
    logger.info('Router AI inizializzato');
    return this;
  },

  async shutdown() {
    logger.info('Router AI chiuso');
  },

  async determineProvider(input, options = {}) {
    const providers = ['mixtral', 'claude'];

    for (const provider of providers) {
      if (this._available[provider]) {
        return provider;
      }
    }

    logger.warn('Nessun provider AI disponibile. Fallback fallito.');
    throw new Error('Nessuna AI disponibile');
  },

  async _refreshAvailability() {
    // Test mixtral
    try {
      const res = await axios.get('http://192.168.0.174:11434/api/tags');
      this._available.mixtral = Array.isArray(res.data.models || res.data) && res.status === 200;
    } catch {
      this._available.mixtral = false;
    }

    // Test Claude (valido se esiste API Key)
    this._available.claude = !!process.env.CLAUDE_API_KEY;
  }
};

module.exports = routerService;
