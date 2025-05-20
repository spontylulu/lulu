/**
 * server.js
 * Entry point principale per l'applicazione Lulu
 */

const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const path = require('path');
const { loadModules } = require('./loader');
const logger = require('./utils/logger').getLogger('core:server');

dotenv.config();

const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';
const IS_PROD = ENV === 'production';

class LuluServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.modules = {};
    logger.info(`Inizializzazione server Lulu in ambiente: ${ENV}`);
  }

  setupMiddleware() {
    this.app.use(express.json());
    if (!IS_PROD) {
      const cors = require('cors');
      this.app.use(cors());
      logger.debug('CORS abilitato per sviluppo');
    }
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.url}`);
      next();
    });
    this.app.use((err, req, res, next) => {
      logger.error('Errore nel middleware:', err);
      res.status(500).json({ error: 'Errore interno del server' });
    });
  }

  async loadAllModules() {
    try {
      logger.info('Caricamento moduli...');
      this.modules = await loadModules();
      if (!this.modules.core || !this.modules.api) {
        throw new Error('Moduli core o API mancanti');
      }
      logger.info(`Moduli caricati: ${Object.keys(this.modules).join(', ')}`);
      return true;
    } catch (err) {
      logger.error('Errore caricamento moduli:', err);
      return false;
    }
  }

  setupRoutes() {
    this.app.use('/api', this.modules.api.router);
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
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }

  startServer() {
    return new Promise((resolve, reject) => {
      this.server.listen(PORT, () => {
        logger.info(`Server in ascolto su porta ${PORT}`);
        resolve();
      });
      this.server.on('error', err => {
        logger.error('Errore server:', err);
        reject(err);
      });
    });
  }

  async shutdown() {
    logger.info('Spegnimento server in corso...');
    const moduleNames = Object.keys(this.modules);
    for (const name of moduleNames.reverse()) {
      try {
        if (this.modules[name].shutdown) {
          await this.modules[name].shutdown();
          logger.debug(`Modulo ${name} chiuso`);
        }
      } catch (err) {
        logger.error(`Errore chiusura modulo ${name}:`, err);
      }
    }
    return new Promise(resolve => {
      this.server.close(() => {
        logger.info('Server HTTP chiuso');
        resolve();
      });
    });
  }

  async start() {
    try {
      this.setupMiddleware();
      const ok = await this.loadAllModules();
      if (!ok) throw new Error('Modulo non caricato');
      this.setupRoutes();
      await this.startServer();
      logger.info('Lulu avviato con successo');
    } catch (err) {
      logger.error('Errore avvio Lulu:', err);
      await this.shutdown();
      process.exit(1);
    }
  }
}

const luluServer = new LuluServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM ricevuto');
  await luluServer.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT ricevuto');
  await luluServer.shutdown();
  process.exit(0);
});

process.on('uncaughtException', err => {
  logger.error('Eccezione non catturata:', err);
  luluServer.shutdown().then(() => process.exit(1));
});

process.on('unhandledRejection', reason => {
  logger.error('Promessa non gestita:', reason);
});

luluServer.start();

module.exports = luluServer;
