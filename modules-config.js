/**
 * modules-config.js
 * Configurazione completa dei moduli Lulu + AI Ollama (Llama3.1:8B) + Claude fallback
 * IMPORTANTE: L'ordine dei moduli determina l'ordine di caricamento!
 */

module.exports = {
  // ─────────────────────────────
  // Moduli principali (in ordine di dipendenza)
  core: true,
  cache: true,

  // ─────────────────────────────
  // AI: Ollama (Llama3.1:8B) primario + Claude (cloud) fallback
  // DEVE essere caricato PRIMA del modulo API!
  ai: {
    enabled: true,
    defaultProvider: "ollama",
    defaultModel: "llama3.1:8b",
    services: {
      ollama: {
        enabled: true,
        host: "http://192.168.0.174:11434", // Ollama sul Rog - porta standard
        defaultModel: "llama3.1:8b"
      },
      claude: {
        enabled: false, // Rimane disabilitato come fallback (si abilita solo se serve)
        apiKey: process.env.CLAUDE_API_KEY,
        defaultModel: "claude-3-opus-20240229"
      }
    },
    router: {
      enabled: true
    },
    caching: {
      enabled: true,
      similarity: true,
      similarityThreshold: 0.8
    }
  },

  // ─────────────────────────────
  // API: Deve essere caricato DOPO il modulo AI
  api: {
    enabled: true,
    basePath: '/api',
    version: 'v1',
    enableRateLimit: false,
    enableCors: true,
    enableCache: true,
    authRequired: false,
    swaggerEnabled: false
  },

  // ─────────────────────────────
  // Moduli futuri
  vocale: false,
  screen: false,
  inventory: false
};