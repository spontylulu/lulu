/**
 * api-rate-limiter.js
 * Limitatore di richieste API per Lulu
 */

const logger = require('../../utils/logger').getLogger('api:rate-limiter');
const { ApiError } = require('./api-error-handler');

const rateLimiter = {
  _requests: new Map(),
  _config: {
    defaultLimit: 60,
    defaultWindow: 60000,
    headerEnabled: true,
    ipWhitelist: ['127.0.0.1']
  },

  middleware() {
    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;
      const key = `${ip}:${req.path}`;

      if (this._config.ipWhitelist.includes(ip)) return next();

      const now = Date.now();
      const limit = req.rateLimit?.limit || this._config.defaultLimit;
      const window = req.rateLimit?.window || this._config.defaultWindow;

      if (!this._requests.has(key)) {
        this._requests.set(key, []);
      }

      const timestamps = this._requests.get(key).filter(ts => now - ts < window);
      timestamps.push(now);
      this._requests.set(key, timestamps);

      if (timestamps.length > limit) {
        logger.warn(`Rate limit superato da ${ip} su ${req.path}`);
        return next(new ApiError('Troppe richieste, riprova più tardi', 429));
      }

      if (this._config.headerEnabled) {
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - timestamps.length));
        res.setHeader('X-RateLimit-Reset', window);
      }

      next();
    };
  }
};

module.exports = rateLimiter;
