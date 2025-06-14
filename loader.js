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

      // Richiede il modulo
      const moduleInstance = require(modulePath);
      
      // Inizializza il modulo UNA SOLA VOLTA con la configurazione appropriata
      if (typeof moduleInstance.initialize === 'function') {
        logger.debug(`Inizializzazione ${moduleName} con configurazione`);
        
        // Passa la configurazione specifica se è un oggetto, altrimenti configurazione vuota
        const configToPass = typeof moduleConfig === 'object' ? moduleConfig : {};
        
        // Gestione speciale per moduli che hanno dipendenze
        logger.info(`Inizializzando modulo ${moduleName}, loadedModules keys:`, Object.keys(loadedModules));
        
        if (moduleName === 'ai' && loadedModules.cache) {
          // Modulo AI: passa il modulo cache
          logger.info('Inizializzando AI con cache module');
          const result = await moduleInstance.initialize(configToPass, loadedModules.cache);
          loadedModules[moduleName] = result || moduleInstance;
        } else if (moduleName === 'api') {
          // Modulo API: passa tutti i moduli caricati
          logger.info('Inizializzando API con tutti i moduli:', Object.keys(loadedModules));
          console.log('=== LOADER DEBUG API ===');
          console.log('Tentativo di inizializzazione API...');
          try {
            const result = await moduleInstance.initialize(configToPass, loadedModules);
            console.log('✅ API inizializzato con successo');
            loadedModules[moduleName] = result || moduleInstance;
          } catch (apiError) {
            console.log('❌ ERRORE SPECIFICO API:', apiError);
            console.log('Stack trace completo:', apiError.stack);
            throw apiError; // Ripropaga l'errore
          }
        } else {
          logger.info(`Inizializzando ${moduleName} con configurazione standard`);
          const result = await moduleInstance.initialize(configToPass);
          loadedModules[moduleName] = result || moduleInstance;
        }
      } else {
        // Se non ha il metodo initialize, salva direttamente l'istanza
        loadedModules[moduleName] = moduleInstance;
      }

      logger.info(`Modulo ${moduleName} caricato con successo`);

    } catch (error) {
      console.log('=== ERRORE DETTAGLIATO LOADER ===');
      console.log('Modulo fallito:', moduleName);
      console.log('Tipo errore:', typeof error);
      console.log('Messaggio errore:', error.message);
      console.log('Stack completo:', error.stack);
      console.log('Error object:', error);
      
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