// loader.js
const modulesConfig = require('./modules-config');
const logger = require('./utils/logger').getLogger('core:loader');
const path = require('path');
const fs = require('fs');

/**
 * Carica dinamicamente i moduli in base alla configurazione
 * @returns {Promise<Object>} Moduli caricati
 */
async function loadModules() {
  const loadedModules = {};
  
  // Itera sui moduli disponibili
  for (const [moduleName, moduleConfig] of Object.entries(modulesConfig)) {
    if (!moduleConfig) {
      logger.info(`Modulo ${moduleName} disattivato, skip.`);
      continue;
    }
    
    try {
      // Determina se il modulo è abilitato
      const isEnabled = moduleConfig === true || 
        (typeof moduleConfig === 'object' && moduleConfig.enabled !== false);
      
      if (!isEnabled) {
        logger.info(`Modulo ${moduleName} disattivato, skip.`);
        continue;
      }
      
      // Tenta di caricare il modulo
      logger.info(`Caricamento modulo: ${moduleName}`);
      const modulePath = path.join(__dirname, 'modules', moduleName, `${moduleName}-index.js`);
      
      // Verifica che il file esista
      if (!fs.existsSync(modulePath)) {
        logger.warn(`Modulo ${moduleName} non trovato in: ${modulePath}`);
        continue;
      }
      
      // Richiede il modulo e lo inizializza
      const moduleInstance = require(modulePath);
      
      // Passa la configurazione specifica al modulo se disponibile
      if (typeof moduleConfig === 'object') {
        logger.debug(`Inizializzazione ${moduleName} con configurazione personalizzata`);
        await moduleInstance.initialize(moduleConfig);
      } else {
        logger.debug(`Inizializzazione ${moduleName} con configurazione predefinita`);
        await moduleInstance.initialize();
      }
      
      // Salva il riferimento al modulo caricato
      loadedModules[moduleName] = moduleInstance;
      logger.info(`Modulo ${moduleName} caricato con successo`);
      
    } catch (error) {
      logger.error(`Errore nel caricamento del modulo ${moduleName}:`, error);
      
      // Se è un modulo fondamentale, propaga l'errore
      if (moduleName === 'core' || moduleName === 'api') {
        throw new Error(`Errore critico nel caricamento del modulo ${moduleName}: ${error.message}`);
      }
      // Altrimenti continua con gli altri moduli
    }
  }
  
  return loadedModules;
}

/**
 * Verifica se un modulo è attivo nella configurazione
 * @param {string} moduleName - Nome del modulo
 * @returns {boolean} True se il modulo è attivo
 */
function isModuleEnabled(moduleName) {
  const config = modulesConfig[moduleName];
  
  if (!config) {
    return false;
  }
  
  return config === true || (typeof config === 'object' && config.enabled !== false);
}

/**
 * Ottiene la configurazione di un modulo
 * @param {string} moduleName - Nome del modulo
 * @returns {Object|boolean} Configurazione del modulo
 */
function getModuleConfig(moduleName) {
  return modulesConfig[moduleName] || false;
}

module.exports = { 
  loadModules,
  isModuleEnabled,
  getModuleConfig
};