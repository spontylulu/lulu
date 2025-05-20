/**
 * cache-similarity.js
 * Calcolo della similarità tra stringhe per la cache AI
 */

const logger = require('../../utils/logger').getLogger('cache:similarity');

const similarityService = {
  _config: {
    enabled: true,
    threshold: 0.8,
    algorithm: 'levenshtein',
    ignoreCase: true,
    normalizeText: true,
    useCache: true,
    cacheSize: 500
  },
  _cache: new Map(),

  async initialize(config = {}) {
    this._config = { ...this._config, ...config };
    this._cache.clear();
    logger.info('Servizio similarità inizializzato');
    return this;
  },

  async shutdown() {
    this._cache.clear();
    logger.info('Servizio similarità chiuso');
  },

  async findBestMatch(query, pool, threshold = this._config.threshold) {
    if (!this._config.enabled || !query) return null;
    const normalized = this._normalize(query);
    let best = null;

    for (const [key, value] of Object.entries(pool)) {
      const candidate = this._normalize(value);
      const score = await this._calculate(normalized, candidate);
      if (score > threshold && (!best || score > best.score)) {
        best = { key, query: value, score };
      }
    }

    return best;
  },

  async _calculate(a, b) {
    if (a === b) return 1.0;
    if (!a || !b) return 0.0;

    const cacheKey = [a, b].sort().join('||');
    if (this._config.useCache && this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    const score = this._levenshteinSim(a, b);

    if (this._config.useCache) {
      if (this._cache.size > this._config.cacheSize) {
        this._cache.delete(this._cache.keys().next().value);
      }
      this._cache.set(cacheKey, score);
    }

    return score;
  },

  _levenshteinSim(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => []);
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[a.length][b.length];
    return 1 - distance / Math.max(a.length, b.length);
  },

  _normalize(text) {
    if (!text) return '';
    let out = this._config.ignoreCase ? text.toLowerCase() : text;
    if (this._config.normalizeText) {
      out = out.replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
    }
    return out;
  },

  getStatus() {
    return {
      enabled: this._config.enabled,
      algorithm: this._config.algorithm,
      cacheSize: this._cache.size
    };
  }
};

module.exports = similarityService;
