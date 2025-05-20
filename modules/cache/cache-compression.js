/**
 * cache-compression.js
 * Compressione/decompressione semplice delle risposte lunghe
 */

const zlib = require('zlib');
const util = require('util');
const compress = util.promisify(zlib.gzip);
const decompress = util.promisify(zlib.gunzip);
const logger = require('../../utils/logger').getLogger('cache:compression');

const compressionService = {
  _config: {
    enabled: true,
    minLength: 500
  },

  async initialize(config = {}) {
    this._config = { ...this._config, ...config };
    logger.info('Servizio compressione inizializzato');
    return this;
  },

  async shutdown() {
    logger.info('Servizio compressione chiuso');
  },

  async compress(payload) {
    if (!this._config.enabled) return payload;
    const str = JSON.stringify(payload);
    if (str.length < this._config.minLength) return payload;

    const buffer = await compress(str);
    return {
      compressed: true,
      encoding: 'gzip',
      data: buffer.toString('base64'),
      originalLength: str.length
    };
  },

  async decompress(entry) {
    if (!entry.compressed) return entry;
    const buffer = Buffer.from(entry.data, 'base64');
    const json = await decompress(buffer);
    return JSON.parse(json.toString('utf8'));
  }
};

module.exports = compressionService;
