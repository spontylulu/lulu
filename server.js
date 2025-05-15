/**
 * server.js
 * Entry point principale per l'applicazione Lulu
 * Gestisce l'inizializzazione del server, il caricamento dei moduli
 * e il ciclo di vita dell'applicazione
 */

// Dipendenze esterne
const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const path = require('path');

// Configurazione ambiente
dotenv.config();

// Inizializzazione logger principale
const logger = require('./utils/logger').getLogger('core:server');

// Caricatore moduli
const { loadModules } = require('./loader');

// Costanti applicazione
const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';
const IS_PROD = ENV === 'production';

/**
 * Classe principale del server Lulu
 */
class LuluServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.modules = {};

    logger.info(`Inizializzazione server Lulu in ambiente: ${ENV}`);
  }

  /**
   * Configura middleware e impostazioni express
   */
  setupMiddleware() {
    // CORS e sicurezza base
    this.app.use(express.json());

    if (!IS_PROD) {
      logger.debug('Configurazione CORS per ambiente di sviluppo');
      const cors = require('cors');
      this.app.use(cors());
    }

    // Servire contenuto statico dalla cartella public
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Middleware per logging richieste
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.url}`);
      next();
    });

    // Middleware di gestione errori
    this.app.use((err, req, res, next) => {
      logger.error('Errore nel middleware:', err);
      res.status(500).json({ error: 'Errore interno del server' });
    });
  }

  /**
   * Carica e inizializza tutti i moduli configurati
   */
  async loadAllModules() {
    try {
      logger.info('Avvio caricamento moduli...');
      this.modules = await loadModules();
      logger.info(`Caricati ${Object.keys(this.modules).length} moduli`);

      // Verifica moduli core richiesti
      if (!this.modules.core) {
        throw new Error('Modulo core non caricato, impossibile continuare');
      }

      if (!this.modules.api) {
        throw new Error('Modulo API non caricato, impossibile continuare');
      }

      return true;
    } catch (error) {
      logger.error('Errore critico nel caricamento moduli:', error);
      return false;
    }
  }

  /**
   * Configura le rotte API principali
   */
  setupRoutes() {
    // Rotta principale per l'API
    this.app.use('/api', this.modules.api.router);

    // Rotta per lo stato del sistema
    this.app.get('/status', (req, res) => {
      const status = {
        uptime: process.uptime(),
        environment: ENV,
        modules: Object.keys(this.modules).map(name => ({
          name,
          status: this.modules[name].status ? this.modules[name].status() : { active: true }
        }))
      };

      res.json(status);
    });

    // Rotta di fallback per SPA
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }

  /**
   * Avvia il server HTTP
   */
  startServer() {
    return new Promise((resolve, reject) => {
      this.server.listen(PORT, () => {
        logger.info(`Server Lulu in ascolto sulla porta ${PORT}`);
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('Errore avvio server:', error);
        reject(error);
      });
    });
  }

  /**
   * Gestisce la chiusura pulita del server e dei moduli
   */
  async shutdown() {
    logger.info('Avvio procedura di spegnimento...');

    // Chiudi tutti i moduli in ordine inverso di importanza
    const moduleNames = Object.keys(this.modules);
    for (const name of moduleNames.reverse()) {
      try {
        if (this.modules[name].shutdown) {
          logger.debug(`Chiusura modulo: ${name}`);
          await this.modules[name].shutdown();
        }
      } catch (error) {
        logger.error(`Errore durante chiusura modulo ${name}:`, error);
      }
    }

    // Chiudi server HTTP
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('Server HTTP chiuso');
        resolve();
      });
    });
  }

  /**
   * Inizializza e avvia l'intera applicazione
   */
  async start() {
    try {
      // 1. Configura middleware
      this.setupMiddleware();

      // 2. Carica tutti i moduli
      const modulesLoaded = await this.loadAllModules();
      if (!modulesLoaded) {
        throw new Error('Inizializzazione moduli fallita');
      }

      // 3. Configura le rotte API
      this.setupRoutes();

      // 4. Avvia il server HTTP
      await this.startServer();

      logger.info('Lulu è stato avviato con successo!');

      return true;
    } catch (error) {
      logger.error('Errore fatale durante avvio di Lulu:', error);
      await this.shutdown();
      return false;
    }
  }
}

// Istanza principale del server
const luluServer = new LuluServer();

// Gestione segnali per chiusura pulita
process.on('SIGTERM', async () => {
  logger.info('Ricevuto segnale SIGTERM');
  await luluServer.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Ricevuto segnale SIGINT');
  await luluServer.shutdown();
  process.exit(0);
});

// Gestione errori non catturati
process.on('uncaughtException', (error) => {
  logger.error('Eccezione non catturata:', error);
  luluServer.shutdown()
    .then(() => process.exit(1))
    .catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Rejection non gestita:', reason);
});

// Avvio dell'applicazione
luluServer.start().catch(error => {
  logger.error('Errore critico durante l\'avvio: ', error);
  process.exit(1);
});

module.exports = luluServer; // Export per testing