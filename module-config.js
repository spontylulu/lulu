/**
 * modules-config.js
 * File di configurazione centrale per i moduli di Lulu
 * 
 * Definisce quali moduli sono attivi e le loro impostazioni specifiche.
 * Questo file viene utilizzato dal loader per caricare dinamicamente i moduli.
 */

/**
 * Configurazione dei moduli per Lulu
 * true = modulo attivato
 * false = modulo disattivato
 * object = modulo attivato con configurazioni specifiche
 */
module.exports = {
  // Moduli core (sempre attivi)
  core: true,         // Funzionalità di base e gestione applicazione
  api: true,          // Interfaccia API RESTful

  // Moduli funzionali
  cache: true,        // Sistema di cache
  voice: false,       // Sintesi vocale (disattivato di default)

  // Configurazione avanzata di moduli AI
  ai: {
    enabled: true,    // Modulo AI attivo
    services: {
      claude: true,   // Servizio Claude attivato
      openai: false,  // Servizio OpenAI disattivato
    },
    defaultModel: 'claude-3-7-sonnet-20250219', // Modello predefinito aggiornato
    temperature: 0.7, // Temperatura predefinita
    systemPrompt: "Sei Lulu, un assistente AI personale. Rispondi in modo conversazionale, conciso e utile."
  },

  // Moduli di integrazione
  inventory: true,    // Gestione inventario (per rappresentante)
  screen: false,      // Riconoscimento schermo (ispirato a PokeView)

  // Utility
  logging: {
    enabled: true,
    level: 'info',    // error, warn, info, debug
    detailed: true,
    fileName: 'lulu.log',
    maxSize: '10m',   // Dimensione massima dei file di log
    maxFiles: 5       // Numero massimo di file di log 
  },

  // Cache avanzata
  cacheConfig: {
    enabled: true,
    similarity: {
      enabled: true,
      threshold: 0.8  // Soglia di similarità per cache
    },
    compression: {
      enabled: true,
      minLength: 500  // Lunghezza minima per compressione
    },
    ttl: 30 * 24 * 60 * 60 * 1000, // Time-to-live (30 giorni)
    cleanupInterval: 24 * 60 * 60 * 1000 // Pulizia ogni 24 ore
  },

  // Configurazione interfaccia
  ui: {
    enabled: true,
    theme: 'default',
    features: {
      voiceInput: false,  // Input vocale disattivato di default
      darkMode: true,     // Tema scuro attivo
      cacheIndicator: true // Mostra indicatore stato cache
    }
  }
};