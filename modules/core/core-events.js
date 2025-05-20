/**
 * core-events.js
 * Sistema di eventi centrale (publisher/subscriber) per Lulu
 */

const { EventEmitter } = require('events');
const logger = require('../../utils/logger').getLogger('core:events');

const eventsService = {
  _emitter: new EventEmitter(),
  _active: false,
  _history: [],
  _registered: new Map(),
  _config: {
    maxListeners: 20,
    warnThreshold: 10,
    historySize: 100,
    debug: false,
    history: true
  },

  async initialize(cfg = {}) {
    Object.assign(this._config, cfg);
    this._emitter.setMaxListeners(this._config.maxListeners);
    this._active = true;
    this._registered.clear();
    this._history = [];
    logger.info('Servizio eventi inizializzato');
    return this;
  },

  async shutdown() {
    this.emit('events:shutdown', { timestamp: Date.now() });
    this._emitter.removeAllListeners();
    this._active = false;
    logger.info('Servizio eventi chiuso');
  },

  emit(event, payload = {}) {
    if (!this._active) return false;
    const data = {
      ...payload,
      _meta: { timestamp: Date.now(), event }
    };
    if (this._config.history) this._record(event, data);
    if (this._config.debug) logger.debug(`[emit] ${event}`, data);
    return this._emitter.emit(event, data);
  },

  on(event, fn, opts = {}) {
    if (!this._registered.has(event)) this._registered.set(event, new Set());
    this._registered.get(event).add(fn);
    if (this._registered.get(event).size >= this._config.warnThreshold) {
      logger.warn(`Tanti listener su: ${event}`);
    }
    const listener = opts.once
      ? this._emitter.once.bind(this._emitter)
      : this._emitter.on.bind(this._emitter);
    listener(event, fn);
    return this;
  },

  once(event, fn, opts = {}) {
    return this.on(event, fn, { ...opts, once: true });
  },

  off(event, fn) {
    this._emitter.off(event, fn);
    if (this._registered.has(event)) this._registered.get(event).delete(fn);
    return this;
  },

  removeAllListeners(event) {
    this._emitter.removeAllListeners(event);
    if (event) this._registered.delete(event);
    else this._registered.clear();
    return this;
  },

  _record(event, data) {
    this._history.unshift({ event, timestamp: Date.now(), data });
    if (this._history.length > this._config.historySize) {
      this._history.pop();
    }
  },

  getHistory({ event, limit, since } = {}) {
    return this._history.filter(e =>
      (!event || e.event === event) &&
      (!since || e.timestamp >= since)
    ).slice(0, limit || 100);
  },

  getStats() {
    return {
      totalEvents: this._registered.size,
      totalListeners: [...this._registered.values()].reduce((acc, set) => acc + set.size, 0),
      historySize: this._history.length,
      debugMode: this._config.debug,
      historyEnabled: this._config.history
    };
  },

  setDebugMode(val) {
    this._config.debug = !!val;
    return this;
  },

  setHistoryEnabled(val) {
    this._config.history = !!val;
    if (!val) this._history = [];
    return this;
  },

  isActive() {
    return this._active;
  }
};

module.exports = eventsService;
