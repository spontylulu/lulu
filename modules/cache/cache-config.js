/**
 * cache-config.js
 * Configurazione centrale condivisa tra i componenti cache
 */

const config = {
  enabled: true,
  ttl: 30 * 24 * 60 * 60 * 1000, // 30 giorni
  cleanupInterval: 24 * 60 * 60 * 1000,
  compression: {
    enabled: true,
    minLength: 500
  },
  similarity: {
    enabled: true,
    threshold: 0.8
  },
  store: {
    storageType: 'memory',
    maxSize: 1000,
    persistPath: './cache',
    persistInterval: 300000,
    persistence: true
  }
};

module.exports = config;
