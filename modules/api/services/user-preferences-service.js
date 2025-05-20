/**
 * user-preferences-service.js
 * Gestione preferenze utente (modello AI, UI, audio, ecc.)
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../../../utils/logger').getLogger('api:preferences');

const userPreferencesService = {
  _config: {
    storagePath: './data/user-preferences',
    persistInterval: 300_000, // 5 minuti
    defaultPreferences: {
      defaultAiModel: 'claude-3-7-sonnet-20250219',
      temperature: 0.7,
      provider: 'claude',
      theme: 'light',
      fontSize: 'medium',
      messageLayout: 'bubbles',
      enableSounds: true,
      enableNotifications: true,
      enableVoice: false,
      voiceType: 'default',
      voiceSpeed: 1.0,
      voiceVolume: 0.8
    }
  },

  _store: new Map(),
  _timer: null,

  async initialize() {
    await this._loadFromDisk();
    this._timer = setInterval(() => this._saveToDisk(), this._config.persistInterval);
    logger.info('Servizio preferenze utente inizializzato');
    return this;
  },

  async shutdown() {
    clearInterval(this._timer);
    await this._saveToDisk();
    logger.info('Servizio preferenze utente chiuso');
  },

  _getUserPath(userId) {
    return path.join(this._config.storagePath, `${userId}.json`);
  },

  async _loadFromDisk() {
    try {
      const dir = this._config.storagePath;
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const userId = path.basename(file, '.json');
          const raw = await fs.readFile(path.join(dir, file), 'utf8');
          this._store.set(userId, JSON.parse(raw));
        }
      }

      logger.info(`Caricate preferenze per ${this._store.size} utenti`);
    } catch (err) {
      logger.warn('Errore nel caricamento preferenze:', err);
    }
  },

  async _saveToDisk() {
    try {
      const dir = this._config.storagePath;
      await fs.mkdir(dir, { recursive: true });

      for (const [userId, prefs] of this._store.entries()) {
        const filePath = this._getUserPath(userId);
        await fs.writeFile(filePath, JSON.stringify(prefs, null, 2), 'utf8');
      }

      logger.debug('Preferenze utente salvate su disco');
    } catch (err) {
      logger.error('Errore nel salvataggio preferenze:', err);
    }
  },

  get(userId) {
    return this._store.get(userId) || { ...this._config.defaultPreferences };
  },

  set(userId, prefs = {}) {
    const current = this._store.get(userId) || { ...this._config.defaultPreferences };
    const updated = { ...current, ...prefs };
    this._store.set(userId, updated);
    return updated;
  },

  delete(userId) {
    this._store.delete(userId);
    return true;
  },

  all() {
    return Object.fromEntries(this._store.entries());
  },

  reset(userId) {
    this._store.set(userId, { ...this._config.defaultPreferences });
    return this.get(userId);
  },

  exists(userId) {
    return this._store.has(userId);
  }
};

module.exports = userPreferencesService;
