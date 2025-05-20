/**
 * api-ai-controller.js
 * Controller API per i servizi AI (Claude, OpenAI...)
 */

const express = require('express');
const logger = require('../../../utils/logger').getLogger('api:controller:ai');

const aiController = {
  router: express.Router(),
  _ai: null,

  initialize(aiModule) {
    if (!aiModule) {
      logger.warn('Modulo AI non fornito');
      return;
    }
    this._ai = aiModule;
    this._setupRoutes();
    logger.info('Controller AI inizializzato');
  },

  _setupRoutes() {
    const r = this.router;
    r.post('/chat', this.chat.bind(this));
    r.post('/complete', this.complete.bind(this));
    r.get('/models', this.getModels.bind(this));
  },

  async chat(req, res) {
    try {
      const { messages, model } = req.body;
      const result = await this._ai.chat(messages, model);
      res.json(result);
    } catch (err) {
      logger.error('Errore AI.chat:', err);
      res.status(500).json({ error: 'Errore AI' });
    }
  },

  async complete(req, res) {
    try {
      const { prompt, model } = req.body;
      const result = await this._ai.complete(prompt, model);
      res.json(result);
    } catch (err) {
      logger.error('Errore AI.complete:', err);
      res.status(500).json({ error: 'Errore AI' });
    }
  },

  async getModels(req, res) {
    try {
      const models = await this._ai.getAvailableModels?.();
      res.json(models || []);
    } catch (err) {
      logger.error('Errore AI.getModels:', err);
      res.status(500).json({ error: 'Errore AI' });
    }
  }
};

module.exports = aiController;
