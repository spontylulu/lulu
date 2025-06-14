/**
 * cache-store.js
 * Gestione memoria + persistenza su disco per la cache AI
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger').getLogger('cache:store');

const storeService = {
  _store: new Map(),
  _config: {
    enabled: true,
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 giorni
    persistPath: './cache',
    persistence: true,
    persistInterval: 5 * 60 * 1000
  },
  _timer: null,

  async initialize(config = {}) {
    this._config = { ...this._config, ...config };
    this._store.clear();

    if (this._config.persistence) {
      await fs.mkdir(this._config.persistPath, { recursive: true });
      await this._loadFromDisk();
      this._timer = setInterval(() => this._persistToDisk(), this._config.persistInterval);
    }

    logger.info('Cache store inizializzato');
    return this;
  },

  async shutdown() {
    if (this._timer) clearInterval(this._timer);
    if (this._config.persistence) await this._persistToDisk();
    this._store.clear();
    logger.info('Cache store chiuso');
  },

  async set(key, value, ttl = this._config.ttl) {
    const now = Date.now();
    const expiresAt = now + ttl;
    this._store.set(key, { value, createdAt: now, expiresAt });
    return true;
  },

  async get(key) {
    const now = Date.now();
    const item = this._store.get(key);
    if (!item) return null;

    if (item.expiresAt < now) {
      this._store.delete(key);
      return null;
    }

    return item;
  },

  async remove(key) {
    return this._store.delete(key);
  },

  async clear() {
    this._store.clear();
    return true;
  },

  async cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, item] of this._store.entries()) {
      if (item.expiresAt < now) {
        this._store.delete(key);
        removed++;
      }
    }
    return removed;
  },

  async getKeys() {
    return Array.from(this._store.keys());
  },

  async _persistToDisk() {
    if (!this._config.persistence) return;
    const filePath = path.join(this._config.persistPath, 'store.json');

    const entries = Array.from(this._store.entries());
    const data = entries.map(([key, val]) => ({ key, ...val }));

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    logger.debug(`Cache salvata su disco: ${data.length} voci`);
  },

  async _loadFromDisk() {
    try {
      const filePath = path.join(this._config.persistPath, 'store.json');
      const content = await fs.readFile(filePath, 'utf8');
      const entries = JSON.parse(content);

      const now = Date.now();
      for (const item of entries) {
        if (item.expiresAt > now) {
          this._store.set(item.key, {
            value: item.value,
            createdAt: item.createdAt,
            expiresAt: item.expiresAt
          });
        }
      }

      logger.info(`Cache caricata da disco (${this._store.size} elementi validi)`);
    } catch {
      logger.warn('Nessuna cache persistente trovata, partenza pulita');
    }
  },

  getStats() {
    return {
      size: this._store.size,
      keys: [...this._store.keys()]
    };
  }
};

module.exports = storeService;
