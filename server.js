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

// Configurazione ambiente
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
    this.app.use(express.static(path.join(__dirname, 'ui'))); // Serve l'interfaccia Flutter Web
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
    // =============================
    // API: inoltro richieste AI
    // =============================
    this.app.post('/ask', async (req, res) => {
      const prompt = req.body.prompt;

      if (!prompt || typeof prompt !== 'string') {
        logger.warn('Prompt mancante o invalido:', prompt);
        return res.status(400).json({ error: 'Prompt mancante o non valido' });
      }

      logger.info(`Prompt ricevuto: "${prompt}"`);

      try {
        const aiService = require('./modules/ai/ai-conversation-service');
        const risposta = await aiService.rispondi(prompt);

        if (!risposta || typeof risposta !== 'string' || risposta.trim() === '') {
          logger.warn('Risposta AI vuota o nulla.');
          return res.json({ risposta: '[vuoto]' });
        }

        logger.debug(`Risposta AI: ${risposta}`);
        res.json({ risposta });

      } catch (err) {
        logger.error('Errore nel modulo AI:', err);
        res.status(500).json({ error: 'Errore durante la risposta AI' });
      }
    });

    // =============================
    // API: router moduli generici
    // =============================
    this.app.use('/api', this.modules.api.router);

    // =============================
    // API: status sistema
    // =============================
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

    // =============================
    // UI: fallback su Flutter Web
    // =============================
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui', 'index.html'));
    });
  }

  startServer() {
    return new Promise((resolve, reject) => {
      this.server.listen(PORT, '0.0.0.0', () => {
        logger.info(`Server in ascolto su http://0.0.0.0:${PORT}`);
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
        logger.info('Server chiuso');
        resolve();
      });
    });
  }
}

(async () => {
  const lulu = new LuluServer();
  lulu.setupMiddleware();
  const success = await lulu.loadAllModules();
  if (success) {
    lulu.setupRoutes();
    await lulu.startServer();
  } else {
    logger.error('Avvio server interrotto per errore caricamento moduli');
  }
})();

// =======================
// AUTO-PING PER RENDER (evita sleep)
// =======================

const https = require('https');

function autoPing() {
  const renderURL = 'https://lulu-server.onrender.com/';

  setInterval(() => {
    console.log(`[KEEPALIVE] Ping automatico a ${renderURL} – ${new Date().toISOString()}`);

    https.get(renderURL, (res) => {
      console.log(`[KEEPALIVE] Risposta ping: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error(`[KEEPALIVE] Errore ping: ${err.message}`);
    });

  }, 840000); // ogni 14 minuti (Render timeout = 15m)
}

autoPing();
