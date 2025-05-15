/**
 * modules/api/controllers/api-system-controller.js
 * Controller per le funzionalità di sistema di Lulu
 * 
 * Gestisce gli endpoint per il monitoraggio, la configurazione
 * e la gestione del sistema Lulu.
 */

const logger = require('../../../utils/logger').getLogger('api:controller:system');
const express = require('express');
const { errors, asyncHandler } = require('../api-error-handler');
const authMiddleware = require('../api-auth');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

/**
 * Controller per le funzionalità di sistema
 */
const systemController = {
  // Router Express per rotte specifiche di questo controller
  router: express.Router(),
  
  // Riferimenti ai moduli di sistema
  _coreModule: null,
  _configService: null,
  _metricsService: null,
  
  /**
   * Inizializza il controller di sistema
   * @param {Object} coreModule - Riferimento al modulo core
   */
  initialize(coreModule) {
    logger.info('Inizializzazione controller di sistema');
    
    if (!coreModule) {
      logger.warn('Modulo core non fornito, alcune funzionalità potrebbero non essere disponibili');
    } else {
      this._coreModule = coreModule;
      this._configService = coreModule.config;
      this._metricsService = coreModule.metrics;
    }
    
    this._setupRoutes();
    logger.info('Controller di sistema inizializzato');
    
    return this;
  },
  
  /**
   * Configura le rotte del controller
   * @private
   */
  _setupRoutes() {
    const router = this.router;
    
    // Rotte informative (accessibili a tutti)
    router.get('/info', this.getSystemInfo);
    
    // Rotte per metriche e logs (accessibili a admin)
    router.get('/metrics', authMiddleware.requireRole('admin'), this.getMetrics);
    router.get('/logs', authMiddleware.requireRole('admin'), this.getLogs);
    
    // Rotte per la configurazione (accessibili a admin)
    router.get('/config', authMiddleware.requireRole('admin'), this.getConfig);
    router.patch('/config', authMiddleware.requireRole('admin'), this.updateConfig);
    router.post('/config/reset', authMiddleware.requireRole('admin'), this.resetConfig);
    
    // Rotte per la gestione dei moduli
    router.get('/modules', authMiddleware.requireRole('admin'), this.getModules);
    router.post('/modules/:name/restart', authMiddleware.requireRole('admin'), this.restartModule);
    
    logger.debug('Rotte controller di sistema configurate');
  },
  
  /**
   * Verifica disponibilità del modulo core
   * @private
   * @param {Function} next - Callback next per errori
   * @returns {boolean} True se il modulo core è disponibile
   */
  _checkCoreModule(next) {
    if (!this._coreModule) {
      if (next) {
        next(errors.unavailable('Modulo core non disponibile'));
      }
      return false;
    }
    return true;
  },
  
  /**
   * Ottiene informazioni sul sistema
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  getSystemInfo: asyncHandler(async (req, res, next) => {
    try {
      // Informazioni base sul sistema anche se il modulo core non è disponibile
      const systemInfo = {
        name: 'Lulu',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        platform: {
          os: os.platform(),
          type: os.type(),
          release: os.release(),
          arch: os.arch(),
          cpus: os.cpus().length,
          memory: {
            total: Math.round(os.totalmem() / 1024 / 1024),
            free: Math.round(os.freemem() / 1024 / 1024)
          }
        },
        process: {
          uptime: process.uptime(),
          pid: process.pid,
          memoryUsage: process.memoryUsage(),
          nodejsVersion: process.version
        },
        timestamp: new Date().toISOString()
      };
      
      // Aggiungi informazioni dal modulo core se disponibile
      if (systemController._coreModule) {
        systemInfo.modules = {
          active: true,
          count: Object.keys(systemController._coreModule.getConfig('modules') || {}).length
        };
        
        // Aggiungi metriche di base se disponibili
        if (systemController._metricsService) {
          const metrics = systemController._metricsService.getMetrics();
          systemInfo.metrics = {
            counters: Object.keys(metrics.counters).length,
            gauges: Object.keys(metrics.gauges).length
          };
        }
      }
      
      res.json(systemInfo);
      
    } catch (error) {
      logger.error('Errore durante il recupero delle informazioni di sistema:', error);
      return next(errors.internal('Errore durante il recupero delle informazioni di sistema'));
    }
  }),
  
  /**
   * Ottiene le metriche del sistema
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  getMetrics: asyncHandler(async (req, res, next) => {
    try {
      if (!systemController._checkCoreModule(next)) return;
      
      if (!systemController._metricsService) {
        return next(errors.unavailable('Servizio metriche non disponibile'));
      }
      
      // Parametri opzionali
      const includeHistory = req.query.history === 'true';
      const filterType = req.query.type; // counters, gauges, timers, histograms
      
      // Ottieni tutte le metriche
      const metrics = systemController._metricsService.getMetrics(includeHistory);
      
      // Filtra per tipo se richiesto
      if (filterType && metrics[filterType]) {
        res.json({
          success: true,
          type: filterType,
          metrics: metrics[filterType],
          timestamp: new Date().toISOString()
        });
      } else {
        res.json({
          success: true,
          metrics,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      logger.error('Errore durante il recupero delle metriche:', error);
      return next(errors.internal('Errore durante il recupero delle metriche'));
    }
  }),
  
  /**
   * Ottiene i log del sistema
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  getLogs: asyncHandler(async (req, res, next) => {
    try {
      // Parametri opzionali
      const lines = parseInt(req.query.lines) || 100;
      const level = req.query.level || 'info'; // error, warn, info, debug
      const file = req.query.file || 'lulu.log';
      
      // Valida il file per prevenire directory traversal
      const validFiles = ['lulu.log', 'error.log'];
      if (!validFiles.includes(file)) {
        return next(errors.validation('File di log non valido'));
      }
      
      // Percorso del file di log
      const logDir = path.join(__dirname, '../../../logs');
      const logPath = path.join(logDir, file);
      
      // Verifica esistenza file
      try {
        await fs.access(logPath, fs.constants.R_OK);
      } catch (err) {
        return next(errors.notFound('File di log non trovato'));
      }
      
      // Leggi gli ultimi N bytes del file per ottenere approssimativamente le ultime linee
      // (1 linea ~= 200 bytes come stima)
      const bytesToRead = lines * 200;
      const stats = await fs.stat(logPath);
      const fileSize = stats.size;
      
      // Calcola posizione di inizio lettura
      const startPosition = Math.max(0, fileSize - bytesToRead);
      
      // Leggi parte del file
      const handle = await fs.open(logPath, 'r');
      const buffer = Buffer.alloc(fileSize - startPosition);
      await handle.read(buffer, 0, fileSize - startPosition, startPosition);
      await handle.close();
      
      // Converti buffer in string e dividi per righe
      let content = buffer.toString('utf8');
      let logLines = content.split('\n');
      
      // Se non abbiamo iniziato dall'inizio del file, la prima linea potrebbe essere parziale
      if (startPosition > 0 && logLines.length > 0) {
        logLines = logLines.slice(1);
      }
      
      // Limita al numero di linee richiesto
      logLines = logLines.slice(-lines);
      
      // Filtra per livello di log
      const logLevels = ['error', 'warn', 'info', 'debug'];
      const levelIndex = logLevels.indexOf(level);
      if (levelIndex >= 0) {
        const allowedLevels = logLevels.slice(0, levelIndex + 1);
        logLines = logLines.filter(line => {
          // Controlla se la linea contiene uno dei livelli consentiti
          return allowedLevels.some(lvl => line.includes(`[${lvl.toUpperCase()}]`));
        });
      }
      
      res.json({
        success: true,
        logs: logLines,
        file,
        level,
        total_lines: logLines.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante il recupero dei log:', error);
      return next(errors.internal('Errore durante il recupero dei log'));
    }
  }),
  
  /**
   * Ottiene la configurazione del sistema
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  getConfig: asyncHandler(async (req, res, next) => {
    try {
      if (!systemController._checkCoreModule(next)) return;
      
      if (!systemController._configService) {
        return next(errors.unavailable('Servizio configurazione non disponibile'));
      }
      
      // Parametri opzionali
      const section = req.query.section; // Sezione specifica (es. 'app', 'modules', ecc.)
      const includeDefaults = req.query.defaults !== 'false'; // Default: true
      
      let config;
      
      // Ottieni configurazione richiesta
      if (section) {
        config = systemController._configService.get(section);
      } else {
        config = systemController._configService.getAll(includeDefaults);
      }
      
      // Nascondi informazioni sensibili
      const sanitizedConfig = systemController._sanitizeConfig(config);
      
      res.json({
        success: true,
        config: sanitizedConfig,
        section: section || 'all',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante il recupero della configurazione:', error);
      return next(errors.internal('Errore durante il recupero della configurazione'));
    }
  }),
  
  /**
   * Rimuove informazioni sensibili dalla configurazione
   * @private
   * @param {Object} config - Configurazione da sanitizzare
   * @returns {Object} Configurazione sanitizzata
   */
  _sanitizeConfig(config) {
    // Funzione ricorsiva per sanitizzare oggetti
    const sanitize = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      // Se è un array, sanitizza ogni elemento
      if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item));
      }
      
      // Altrimenti è un oggetto normale
      const result = {};
      
      for (const [key, value] of Object.entries(obj)) {
        // Nascondi valori sensibili
        if (key.toLowerCase().includes('key') || 
            key.toLowerCase().includes('secret') || 
            key.toLowerCase().includes('password') || 
            key.toLowerCase().includes('token')) {
          result[key] = '[REDACTED]';
        } 
        // Sanitizza oggetti annidati
        else if (value && typeof value === 'object') {
          result[key] = sanitize(value);
        } 
        // Copia valori normali
        else {
          result[key] = value;
        }
      }
      
      return result;
    };
    
    return sanitize(config);
  },
  
  /**
   * Aggiorna la configurazione del sistema
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  updateConfig: asyncHandler(async (req, res, next) => {
    try {
      if (!systemController._checkCoreModule(next)) return;
      
      if (!systemController._configService) {
        return next(errors.unavailable('Servizio configurazione non disponibile'));
      }
      
      const { path, value } = req.body;
      
      if (!path) {
        return next(errors.validation('Percorso configurazione obbligatorio'));
      }
      
      // Verifica path configurazione per sicurezza
      const safePath = path.replace(/[^a-zA-Z0-9._]/g, '');
      if (safePath !== path) {
        return next(errors.validation('Percorso configurazione non valido'));
      }
      
      // Verifica se il percorso è consentito per la modifica
      const restrictedPaths = ['core', 'api', 'runtime'];
      if (restrictedPaths.some(prefix => safePath.startsWith(prefix))) {
        return next(errors.forbidden('Modifica di questa configurazione non consentita'));
      }
      
      // Aggiorna configurazione
      const result = systemController._configService.set(safePath, value);
      
      if (!result) {
        return next(errors.internal('Errore durante l\'aggiornamento della configurazione'));
      }
      
      // Ottieni il valore aggiornato
      const updatedValue = systemController._configService.get(safePath);
      
      // Log della modifica
      logger.info(`Configurazione aggiornata da ${req.user.username || req.user.id}`, {
        path: safePath,
        newValue: updatedValue
      });
      
      res.json({
        success: true,
        message: 'Configurazione aggiornata con successo',
        path: safePath,
        value: updatedValue,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante l\'aggiornamento della configurazione:', error);
      return next(errors.internal('Errore durante l\'aggiornamento della configurazione'));
    }
  }),
  
  /**
   * Resetta la configurazione del sistema
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  resetConfig: asyncHandler(async (req, res, next) => {
    try {
      if (!systemController._checkCoreModule(next)) return;
      
      if (!systemController._configService) {
        return next(errors.unavailable('Servizio configurazione non disponibile'));
      }
      
      const { scope } = req.body;
      
      // Verifica scope valido
      const validScopes = ['user', 'runtime', 'all'];
      if (!scope || !validScopes.includes(scope)) {
        return next(errors.validation(`Scope non valido. Valori consentiti: ${validScopes.join(', ')}`));
      }
      
      // Richiedi conferma per reset 'all'
      if (scope === 'all' && req.body.confirm !== 'yes') {
        return next(errors.validation('Per resettare tutte le configurazioni, conferma con { "confirm": "yes" }'));
      }
      
      // Esegui reset
      const result = systemController._configService.reset(scope);
      
      if (!result) {
        return next(errors.internal(`Errore durante il reset della configurazione (scope: ${scope})`));
      }
      
      // Log del reset
      logger.info(`Configurazione resettata (scope: ${scope}) da ${req.user.username || req.user.id}`);
      
      res.json({
        success: true,
        message: `Configurazione resettata con successo (scope: ${scope})`,
        scope,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante il reset della configurazione:', error);
      return next(errors.internal('Errore durante il reset della configurazione'));
    }
  }),
  
  /**
   * Ottiene la lista dei moduli del sistema
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  getModules: asyncHandler(async (req, res, next) => {
    try {
      if (!systemController._checkCoreModule(next)) return;
      
      // Ottieni configurazione moduli
      const modulesConfig = systemController._configService.get('modules');
      
      if (!modulesConfig) {
        return next(errors.internal('Errore durante il recupero dei moduli'));
      }
      
      // Prepara risposta
      const modules = [];
      
      for (const [name, config] of Object.entries(modulesConfig)) {
        // Determina se il modulo è abilitato
        const enabled = config === true || 
          (typeof config === 'object' && config.enabled !== false);
        
        // Ottieni stato del modulo se disponibile
        let status = null;
        if (systemController._coreModule.events) {
          try {
            // Emette evento per richiedere stato modulo
            const moduleStatusEvent = await new Promise(resolve => {
              const timeout = setTimeout(() => resolve(null), 1000);
              
              systemController._coreModule.events.once(`module:${name}:status`, data => {
                clearTimeout(timeout);
                resolve(data);
              });
              
              systemController._coreModule.events.emit('core:requestModuleStatus', { 
                moduleName: name 
              });
            });
            
            if (moduleStatusEvent) {
              status = moduleStatusEvent.status;
            }
          } catch (error) {
            logger.error(`Errore durante il recupero dello stato del modulo ${name}:`, error);
          }
        }
        
        // Aggiungi alla lista
        modules.push({
          name,
          enabled,
          active: status ? status.active : enabled,
          config: typeof config === 'object' ? systemController._sanitizeConfig(config) : null,
          status: status || { active: enabled }
        });
      }
      
      res.json({
        success: true,
        modules,
        total: modules.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante il recupero dei moduli:', error);
      return next(errors.internal('Errore durante il recupero dei moduli'));
    }
  }),
  
  /**
   * Riavvia un modulo specifico
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  restartModule: asyncHandler(async (req, res, next) => {
    try {
      if (!systemController._checkCoreModule(next)) return;
      
      const moduleName = req.params.name;
      
      // Verifica esistenza modulo
      const modulesConfig = systemController._configService.get('modules');
      if (!modulesConfig || !modulesConfig[moduleName]) {
        return next(errors.notFound(`Modulo ${moduleName} non trovato`));
      }
      
      // Verifica se il modulo può essere riavviato
      if (moduleName === 'core' || moduleName === 'api') {
        return next(errors.forbidden(`Impossibile riavviare il modulo ${moduleName} tramite API`));
      }
      
      // Verifica sistema eventi
      if (!systemController._coreModule.events) {
        return next(errors.unavailable('Sistema eventi non disponibile'));
      }
      
      // Emetti evento riavvio modulo
      systemController._coreModule.events.emit('core:restartModule', { 
        moduleName,
        requestedBy: req.user.id
      });
      
      // Log del riavvio
      logger.info(`Riavvio modulo ${moduleName} richiesto da ${req.user.username || req.user.id}`);
      
      res.json({
        success: true,
        message: `Riavvio del modulo ${moduleName} richiesto`,
        module: moduleName,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante il riavvio del modulo:', error);
      return next(errors.internal('Errore durante il riavvio del modulo'));
    }
  })
};

module.exports = systemController;