/**
 * modules-config.js
 * Configurazione centrale dei moduli per Lulu
 * Definisce quali moduli sono attivi, le configurazioni specifiche, e le opzioni globali.
 */

module.exports = {
  // === MODULI CORE ===
  core: true,         // Gestione eventi, configurazioni e metriche
  api: true,          // API REST per comunicazione esterna

  // === MODULI FUNZIONALI ===
  cache: true,        // Cache intelligente per risposte AI
  voice: false,       // Sintesi vocale (attualmente disattivata)

  // === MODULO AI ===
  ai: {
    enabled: true,
    services: {
      claude: true,     // Claude by Anthropic attivo
      openai: false     // OpenAI disattivato per ora
    },
    defaultModel: 'claude-3-7-sonnet-20250219',
    temperature: 0.7,
    systemPrompt: "Sei Lulu, un assistente AI personale. Rispondi in modo conversazionale, conciso e utile."
  },

  // === INTEGRAZIONI ===
  inventory: true,    // Gestione inventario, schede tecniche, prodotti
  screen: false,      // OCR e lettura da schermo Android (PokeView-style)

  // === LOGGING ===
  logging: {
    enabled: true,
    level: 'info',     // Livelli: error, warn, info, debug
    detailed: true,
    fileName: 'lulu.log',
    maxSize: '10m',
    maxFiles: 5
  },

  // === CONFIGURAZIONE CACHE AVANZATA ===
  cacheConfig: {
    enabled: true,
    similarity: {
      enabled: true,
      threshold: 0.8
    },
    compression: {
      enabled: true,
      minLength: 500
    },
    ttl: 30 * 24 * 60 * 60 * 1000,           // 30 giorni in millisecondi
    cleanupInterval: 24 * 60 * 60 * 1000     // Pulizia giornaliera
  },

  // === INTERFACCIA UTENTE ===
  ui: {
    enabled: true,
    theme: 'default',
    features: {
      voiceInput: false,
      darkMode: true,
      cacheIndicator: true
    }
  }
};
