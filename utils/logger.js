/**
 * utils/logger.js
 * Sistema di logging centralizzato per Lulu
 * 
 * Implementa un sistema di logging granulare con supporto per
 * namespace, livelli di log configurabili e formattazione consistente.
 * Questo modulo è una dipendenza fondamentale per tutti gli altri componenti.
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const modulesConfig = require('../modules-config');

// Configurazione di default
const DEFAULT_CONFIG = {
  level: 'info',
  detailed: true,
  fileName: 'lulu.log',
  maxSize: '10m',
  maxFiles: 5
};

// Ottieni la configurazione di logging
const getLogConfig = () => {
  // Se il modulo di logging non è configurato, usa i default
  if (!modulesConfig.logging || modulesConfig.logging.enabled === false) {
    return DEFAULT_CONFIG;
  }

  // Altrimenti, usa la configurazione specificata con fallback sui default
  return {
    level: modulesConfig.logging.level || DEFAULT_CONFIG.level,
    detailed: modulesConfig.logging.detailed !== undefined ?
      modulesConfig.logging.detailed : DEFAULT_CONFIG.detailed,
    fileName: modulesConfig.logging.fileName || DEFAULT_CONFIG.fileName,
    maxSize: modulesConfig.logging.maxSize || DEFAULT_CONFIG.maxSize,
    maxFiles: modulesConfig.logging.maxFiles || DEFAULT_CONFIG.maxFiles
  };
};

// Assicura che esista la directory dei log
const ensureLogDirectory = () => {
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
};

// Formattazione personalizzata per i log
const customFormat = winston.format.printf(({ level, message, timestamp, namespace, ...metadata }) => {
  const config = getLogConfig();
  let logMessage = `${timestamp} [${level.toUpperCase()}]`;

  // Aggiungi namespace se presente
  if (namespace) {
    logMessage += ` [${namespace}]`;
  }

  logMessage += `: ${message}`;

  // Aggiungi metadata se detailed è true e ci sono metadati
  if (config.detailed && Object.keys(metadata).length > 0 && metadata.stack === undefined) {
    logMessage += ` ${JSON.stringify(metadata)}`;
  }

  // Gestione speciale per gli errori con stack trace
  if (metadata.stack) {
    logMessage += `\n${metadata.stack}`;
  }

  return logMessage;
});

// Crea l'istanza del logger winston
const createLogger = () => {
  const logDir = ensureLogDirectory();
  const config = getLogConfig();

  // Configurazione transports
  const transports = [
    // Console transport sempre attivo
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
      )
    }),

    // File transport per il log principale
    new winston.transports.File({
      filename: path.join(logDir, config.fileName),
      maxsize: config.maxSize.replace('m', '') * 1024 * 1024, // Converti in bytes
      maxFiles: config.maxFiles,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
      )
    }),

    // File transport separato per gli errori
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: config.maxSize.replace('m', '') * 1024 * 1024,
      maxFiles: config.maxFiles,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
      )
    })
  ];

  // Creazione dell'istanza winston
  return winston.createLogger({
    level: config.level,
    levels: winston.config.npm.levels,
    transports
  });
};

// Istanza principale del logger
let loggerInstance = null;

// Mappa dei logger per namespace
const loggers = new Map();

/**
 * Ottiene un logger specifico per il namespace indicato
 * @param {string} namespace - Namespace per il logger (es. 'cache:service')
 * @returns {Object} - Istanza logger configurata
 */
const getLogger = (namespace) => {
  // Inizializza l'istanza principale se non esiste
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }

  // Se abbiamo già un logger per questo namespace, restituiscilo
  if (loggers.has(namespace)) {
    return loggers.get(namespace);
  }

  // Altrimenti crea un logger specifico per il namespace
  const namespaceLogger = {
    error: (message, metadata = {}) => {
      loggerInstance.error(message, { namespace, ...metadata });
    },
    warn: (message, metadata = {}) => {
      loggerInstance.warn(message, { namespace, ...metadata });
    },
    info: (message, metadata = {}) => {
      loggerInstance.info(message, { namespace, ...metadata });
    },
    debug: (message, metadata = {}) => {
      loggerInstance.debug(message, { namespace, ...metadata });
    },

    // Utility aggiuntiva per log con livelli dinamici
    log: (level, message, metadata = {}) => {
      if (!loggerInstance[level]) {
        // Fallback a info se il livello non esiste
        loggerInstance.info(message, {
          namespace,
          invalidLevel: level,
          ...metadata
        });
        return;
      }
      loggerInstance[level](message, { namespace, ...metadata });
    }
  };

  // Salva nel cache e restituisci
  loggers.set(namespace, namespaceLogger);
  return namespaceLogger;
};

/**
 * Cambia il livello di log a runtime
 * @param {string} level - Nuovo livello di log (error, warn, info, debug)
 */
const setLogLevel = (level) => {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }

  loggerInstance.transports.forEach(transport => {
    transport.level = level;
  });

  const logger = getLogger('logger:internal');
  logger.info(`Livello di log cambiato a: ${level}`);
};

/**
 * Forza il flush di tutti i log in attesa
 * @returns {Promise<void>} Promise che si risolve quando il flush è completato
 */
const flushLogs = async () => {
  if (!loggerInstance) return Promise.resolve();

  return new Promise((resolve) => {
    loggerInstance.on('finish', resolve);
    loggerInstance.end();
    // Ricrea l'istanza dopo il flush
    loggerInstance = createLogger();
  });
};

module.exports = {
  getLogger,
  setLogLevel,
  flushLogs
};