/**
 * api-ai-controller.js
 * Controller API per i servizi AI (Mixtral, Claude, ecc.) - FIXED VERSION
 */

const express = require('express');
const logger = require('../../../utils/logger').getLogger('api:controller:ai');

const aiController = {
  router: express.Router(),
  _ai: null,

  async initialize(aiModule = null) {
    console.log('=== AI CONTROLLER INITIALIZE ===');
    console.log('aiModule type:', typeof aiModule);
    console.log('aiModule keys:', aiModule ? Object.keys(aiModule) : 'null');
    console.log('aiModule.complete type:', typeof aiModule?.complete);
    
    // Riceve il modulo AI già inizializzato come parametro
    if (aiModule && typeof aiModule.complete === 'function') {
      this._ai = aiModule;
      console.log('✅ AI Controller - Modulo AI assegnato correttamente');
      logger.info('Controller AI inizializzato con modulo AI valido');
      
      // Setuppa le routes DOPO aver assegnato il modulo AI
      this._setupRoutes(aiModule);  // Passa il modulo come parametro
    } else {
      console.log('❌ AI Controller - Modulo AI NON valido');
      logger.warn('Controller AI inizializzato senza modulo AI valido');
      this._ai = null;
    }

    return this;
  },

  _setupRoutes(aiModuleRef) {
    const r = this.router;
    
    // Usa closure per catturare il riferimento al modulo AI
    console.log('=== SETUP ROUTES ===');
    console.log('aiModuleRef presente:', !!aiModuleRef);
    console.log('aiModuleRef.complete type:', typeof aiModuleRef?.complete);
    
    // CHAT endpoint con closure
    r.post('/chat', async (req, res) => {
      console.log('=== CHAT REQUEST ARRIVATA ===');
      console.log('aiModuleRef presente:', !!aiModuleRef);
      console.log('aiModuleRef type:', typeof aiModuleRef);
      console.log('aiModuleRef.complete type:', typeof aiModuleRef?.complete);
      
      try {
        const { message, messages, model } = req.body;
        console.log('Message ricevuto:', message);

        // Controllo validità modulo AI usando la closure
        if (!aiModuleRef || typeof aiModuleRef.complete !== 'function') {
          console.log('❌ ERRORE: Modulo AI non disponibile nella closure!');
          console.log('aiModuleRef:', aiModuleRef);
          console.log('aiModuleRef.complete:', typeof aiModuleRef?.complete);
          
          return res.status(503).json({
            error: 'Servizio AI non disponibile',
            message: 'Il modulo AI non è stato inizializzato correttamente'
          });
        }

        console.log('✅ Modulo AI trovato nella closure, procedo con la chiamata');

        // Gestisce sia "message" che "messages"
        let promptText;
        if (message) {
          promptText = message;
        } else if (messages && Array.isArray(messages)) {
          promptText = messages.map(m => m.content || m.message || m).join('\n');
        } else {
          promptText = 'Messaggio vuoto';
        }

        console.log('Prompt finale:', promptText);
        logger.debug(`Richiesta AI: ${promptText.substring(0, 100)}...`);

        console.log('Chiamando aiModuleRef.complete...');
        const result = await aiModuleRef.complete(promptText, { model });
        console.log('Risultato ricevuto:', result);
        
        logger.debug(`Risposta AI ricevuta: ${result.completion?.substring(0, 100)}...`);
        
        res.json({
          content: result.completion,  
          response: result.completion, 
          model: result.model,
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        console.log('❌ ERRORE in chat function:', err);
        logger.error('Errore AI.chat:', err.message || err);
        res.status(500).json({
          error: 'Errore AI',
          message: err.message || 'Errore generico',
          details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
      }
    });

    // COMPLETE endpoint con closure
    r.post('/complete', async (req, res) => {
      try {
        const { prompt, model } = req.body;

        if (!aiModuleRef || typeof aiModuleRef.complete !== 'function') {
          return res.status(503).json({
            error: 'Servizio AI non disponibile',
            message: 'Il modulo AI non è stato inizializzato correttamente'
          });
        }

        if (!prompt) {
          return res.status(400).json({
            error: 'Parametro mancante',
            message: 'Il campo prompt è obbligatorio'
          });
        }

        logger.debug(`Completion AI: ${prompt.substring(0, 100)}...`);

        const result = await aiModuleRef.complete(prompt, { model });
        
        res.json({
          completion: result.completion,
          model: result.model,
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        logger.error('Errore AI.complete:', err.message || err);
        res.status(500).json({
          error: 'Errore AI',
          message: err.message || 'Errore generico',
          details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
      }
    });

    // MODELS endpoint con closure
    r.get('/models', async (req, res) => {
      try {
        if (!aiModuleRef || typeof aiModuleRef.getAvailableModels !== 'function') {
          return res.status(503).json({
            error: 'Servizio AI non disponibile',
            message: 'Il modulo AI non è stato inizializzato correttamente'
          });
        }

        const models = await aiModuleRef.getAvailableModels();
        res.json({
          models: models || [],
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        logger.error('Errore AI.getModels:', err.message || err);
        res.status(500).json({
          error: 'Errore AI',
          message: err.message || 'Errore generico'
        });
      }
    });

    console.log('✅ Routes configurate con closure pattern');
  }
};

module.exports = aiController;