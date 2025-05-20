/**
 * core-config.js
 * Gestione centralizzata delle configurazioni in Lulu
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger').getLogger('core:config');
const modulesConfig = require('../../modules-config');

const CONFIG_PATH = path.join(__dirname, '../../config/user-config.json');

const configService = {
  _store: {
    app: {
      name: 'Lulu',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      isProduction: (process.env.NODE_ENV || 'development') === 'production'
    },
    runtime: {
      startTime: Date.now(),
      configLoaded: false,
      configSource: null
    },
    modules: {},
    user: {}
  },
  _active: false,

  async initialize() {
    logger.info('Inizializzazione configurazione...');
    this._store.modules = JSON.parse(JSON.stringify(modulesConfig));
    this._store.runtime.configSource = 'modules-config.js';
    await this._loadUserConfig();
    this._applyEnvVariables();
    this._store.runtime.configLoaded = true;
    this._active = true;
    logger.info('Configurazione inizializzata.');
    return this;
  },

  async shutdown() {
    logger.info('Chiusura configurazione...');
    await this._saveUserConfig();
    this._active = false;
    logger.info('Configurazione chiusa.');
  },

  isActive() {
    return this._active;
  },

  async _loadUserConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
      logger.debug('Nessun file config utente.');
      return;
    }
    try {
      const data = await fs.promises.readFile(CONFIG_PATH, 'utf8');
      this._store.user = JSON.parse(data);
      logger.debug('Configurazione utente caricata.');
    } catch (err) {
      logger.warn('Errore lettura config utente:', err);
    }
  },

  async _saveUserConfig() {
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await fs.promises.writeFile(CONFIG_PATH, JSON.stringify(this._store.user, null, 2));
      logger.debug('Configurazione utente salvata.');
    } catch (err) {
      logger.error('Errore salvataggio config utente:', err);
    }
  },

  _applyEnvVariables() {
    const envMap = {
      'LULU_PORT': 'app.port',
      'LULU_LOG_LEVEL': 'modules.logging.level',
      'CLAUDE_API_KEY': 'modules.ai.services.claude.apiKey',
      'OPENAI_API_KEY': 'modules.ai.services.openai.apiKey'
    };
    for (const [env, key] of Object.entries(envMap)) {
      if (process.env[env]) {
        let val = process.env[env];
        if (val.toLowerCase() === 'true') val = true;
        else if (val.toLowerCase() === 'false') val = false;
        else if (!isNaN(val)) val = Number(val);
        this.set(key, val);
      }
    }
  },

  get(key, def = null) {
    if (!key) return this._store;
    const parts = key.split('.');
    let curr = this._store;
    for (const part of parts) {
      if (!curr || typeof curr !== 'object') return def;
      curr = curr[part];
    }
    return curr === undefined ? def : curr;
  },

  set(key, value) {
    if (!key) return false;
    const parts = key.split('.');
    let curr = this._store;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]] || typeof curr[parts[i]] !== 'object') {
        curr[parts[i]] = {};
      }
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = value;
    return true;
  },

  delete(key) {
    if (!key) return false;
    const parts = key.split('.');
    let curr = this._store;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) return false;
      curr = curr[parts[i]];
    }
    return delete curr[parts[parts.length - 1]];
  },

  reset(scope = 'user') {
    if (scope === 'user') {
      this._store.user = {};
    } else if (scope === 'runtime') {
      this._store.runtime = {
        startTime: Date.now(),
        configLoaded: true,
        configSource: this._store.runtime.configSource
      };
    } else if (scope === 'all') {
      const startTime = this._store.runtime.startTime;
      this._store = {
        app: this._store.app,
        runtime: { startTime, configLoaded: false, configSource: null },
        modules: JSON.parse(JSON.stringify(modulesConfig)),
        user: {}
      };
      this._applyEnvVariables();
    }
    return true;
  },

  getAll(includeDefaults = true) {
    return includeDefaults ? { ...this._store } : { ...this._store.user };
  }
};

module.exports = configService;
