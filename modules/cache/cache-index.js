/**
 * cache-index.js
 * Gestione avanzata della cache per risposte AI in Lulu
 */

const logger = require('../../utils/logger').getLogger('cache:index');
const similarity = require('./cache-similarity');
const store = require('./cache-store');
const compression = require('./cache-compression');
const stats = require('./cache-stats');

const cacheModule = {
  _config: {
    enabled: true,
    similarity: { enabled: true, threshold: 0.8 },
    compression: { enabled: true, minLength: 500 },
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 giorni
    cleanupInterval: 24 * 60 * 60 * 1000 // 24 ore
  },
  _interval: null,

  async initialize(config = {}) {
    this._config = { ...this._config, ...config };
    if (!this._config.enabled) {
      logger.info('Cache disabilitata');
      return this;
    }

    await similarity.initialize(this._config.similarity);
    await store.initialize(this._config);
    await compression.initialize(this._config.compression);
    await stats.initialize();

    if (this._config.cleanupInterval > 0) {
      this._interval = setInterval(() => this.cleanup(), this._config.cleanupInterval);
      logger.debug(`Pulizia cache programmata ogni ${this._config.cleanupInterval / 1000}s`);
    }

    logger.info('Modulo cache inizializzato');
    return this;
  },

  async shutdown() {
    if (this._interval) clearInterval(this._interval);
    await Promise.all([
      store.shutdown(),
      similarity.shutdown(),
      compression.shutdown(),
      stats.shutdown()
    ]);
    logger.info('Modulo cache chiuso');
  },

  status() {
    return {
      active: this._config.enabled,
      similarity: this._config.similarity,
      compression: this._config.compression,
      stats: stats.getStats()
    };
  },

  // ────────────────────────────────────────────────
  // Funzioni principali
  // ────────────────────────────────────────────────

  async set(query, response, options = {}) {
    if (!this._config.enabled) return false;
    const key = options.key || this._generateKey(query, options);
    let payload = { query, response, meta: { ts: Date.now(), key } };

    if (this._config.compression.enabled && JSON.stringify(payload).length > this._config.compression.minLength) {
      payload = await compression.compress(payload);
    }

    const success = await store.set(key, payload, this._config.ttl);
    stats.recordSet({ key, success });
    return success;
  },

  async get(query, options = {}) {
    if (!this._config.enabled) return null;

    if (options.key) {
      const item = await this._getByKey(options.key);
      stats.recordGet({ hit: !!item, exact: true });
      return item;
    }

    if (this._config.similarity.enabled) {
      const best = await this._findSimilar(query);
      if (best) {
        stats.recordGet({ hit: true, exact: false, similarity: best.score });
        return best.response;
      }
    }

    stats.recordGet({ hit: false });
    return null;
  },

  async remove(key) {
    const result = await store.remove(key);
    stats.recordRemove({ key, success: result });
    return result;
  },

  async cleanup() {
    const removed = await store.cleanup();
    stats.recordCleanup({ count: removed });
    return removed;
  },

  async clear() {
    const result = await store.clear();
    stats.recordClear({ success: result });
    return result;
  },

  getStats() {
    return stats.getStats();
  },

  // ────────────────────────────────────────────────
  // Funzioni di supporto private
  // ────────────────────────────────────────────────

  async _getByKey(key) {
    let cached = await store.get(key);
    if (!cached) return null;
    if (cached.compressed) cached = await compression.decompress(cached);
    return cached.response;
  },

  async _findSimilar(query) {
    const keys = await store.getKeys();
    const queries = {};

    for (const key of keys) {
      const item = await store.get(key);
      const q = item.compressed ? (await compression.decompress(item)).query : item.query;
      queries[key] = q;
    }

    const best = await similarity.findBestMatch(query, queries, this._config.similarity.threshold);
    if (!best) return null;

    const item = await store.get(best.key);
    return item.compressed ? await compression.decompress(item) : item;
  },

  _generateKey(query, options = {}) {
    const base = `${query.toLowerCase().trim()}|${options.userId || ''}|${options.model || ''}`;
    const hash = require('crypto').createHash('md5').update(base).digest('hex');
    return `cache:${hash}`;
  }
};

module.exports = cacheModule;
