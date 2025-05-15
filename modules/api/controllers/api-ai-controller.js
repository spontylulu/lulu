/**
 * modules/api/controllers/api-ai-controller.js
 * Controller per le funzionalità di intelligenza artificiale di Lulu
 * 
 * Gestisce gli endpoint per interagire con i modelli di AI,
 * incluse le conversazioni con Claude e altre funzionalità IA.
 */

const logger = require('../../../utils/logger').getLogger('api:controller:ai');
const express = require('express');
const { errors, asyncHandler } = require('../api-error-handler');
const authMiddleware = require('../api-auth');

/**
 * Controller per le funzionalità AI
 */
const aiController = {
  // Router Express per rotte specifiche di questo controller
  router: express.Router(),
  
  // Riferimento al modulo AI (verrà impostato durante l'inizializzazione)
  _aiModule: null,
  
  /**
   * Inizializza il controller AI
   * @param {Object} aiModule - Riferimento al modulo AI
   */
  initialize(aiModule) {
    logger.info('Inizializzazione controller AI');
    
    if (!aiModule) {
      logger.warn('Modulo AI non fornito, alcune funzionalità potrebbero non essere disponibili');
    } else {
      this._aiModule = aiModule;
    }
    
    this._setupRoutes();
    logger.info('Controller AI inizializzato');
    
    return this;
  },
  
  /**
   * Configura le rotte del controller
   * @private
   */
  _setupRoutes() {
    const router = this.router;
    
    // Rotte per interazioni con il modello
    router.post('/chat', authMiddleware.requireRole(['user', 'admin', 'api']), this.chat);
    router.post('/complete', authMiddleware.requireRole(['user', 'admin', 'api']), this.complete);
    router.post('/stream', authMiddleware.requireRole(['user', 'admin', 'api']), this.streamChat);
    
    // Rotte informative
    router.get('/models', this.getModels);
    router.get('/status', this.getAiStatus);
    
    // Rotte per gestione conversazioni
    router.get('/conversations', authMiddleware.requireRole(['user', 'admin']), this.getConversations);
    router.get('/conversations/:id', authMiddleware.requireRole(['user', 'admin']), this.getConversation);
    router.delete('/conversations/:id', authMiddleware.requireRole(['user', 'admin']), this.deleteConversation);
    
    logger.debug('Rotte controller AI configurate');
  },
  
  /**
   * Verifica disponibilità del modulo AI
   * @private
   * @param {Function} next - Callback next per errori
   * @returns {boolean} True se il modulo AI è disponibile
   */
  _checkAiModule(next) {
    if (!this._aiModule) {
      if (next) {
        next(errors.unavailable('Servizio AI non disponibile'));
      }
      return false;
    }
    return true;
  },
  
  /**
   * Endpoint per chat con il modello
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  chat: asyncHandler(async (req, res, next) => {
    try {
      if (!aiController._checkAiModule(next)) return;
      
      const { message, conversation_id, system_prompt, options } = req.body;
      
      // Validazione input
      if (!message) {
        return next(errors.validation('Il messaggio è obbligatorio'));
      }
      
      // Prepara la richiesta per il modulo AI
      const requestOptions = {
        ...options,
        userId: req.user.id,
        conversationId: conversation_id,
        systemPrompt: system_prompt
      };
      
      // Log della richiesta
      logger.info(`Richiesta chat da utente ${req.user.id}`, {
        messageLength: message.length,
        hasConversationId: !!conversation_id,
        hasCustomPrompt: !!system_prompt
      });
      
      // Chiama il modulo AI
      const startTime = Date.now();
      const response = await aiController._aiModule.chat(message, requestOptions);
      const duration = Date.now() - startTime;
      
      // Log della risposta
      logger.info(`Risposta generata in ${duration}ms`, {
        responseLength: response.content.length,
        modelUsed: response.model,
        fromCache: response.fromCache || false,
        tokens: response.usage
      });
      
      // Restituisci la risposta
      res.json({
        success: true,
        response: response.content,
        conversation_id: response.conversationId,
        model: response.model,
        cached: response.fromCache || false,
        usage: response.usage,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante la richiesta chat:', error);
      
      // Gestione errori specifici
      if (error.type === 'api_error' || error.name === 'ApiError') {
        return next(errors.internal('Errore del servizio AI', {
          aiError: error.message,
          code: error.code || 'unknown'
        }));
      }
      
      if (error.type === 'context_length') {
        return next(errors.validation('Messaggio troppo lungo per il modello', {
          maxLength: error.max_tokens,
          currentLength: error.current_tokens
        }));
      }
      
      return next(errors.internal('Errore durante l\'elaborazione della richiesta'));
    }
  }),
  
  /**
   * Endpoint per completamento testo con il modello
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  complete: asyncHandler(async (req, res, next) => {
    try {
      if (!aiController._checkAiModule(next)) return;
      
      const { prompt, options } = req.body;
      
      // Validazione input
      if (!prompt) {
        return next(errors.validation('Il prompt è obbligatorio'));
      }
      
      // Prepara la richiesta per il modulo AI
      const requestOptions = {
        ...options,
        userId: req.user.id
      };
      
      // Log della richiesta
      logger.info(`Richiesta completamento da utente ${req.user.id}`, {
        promptLength: prompt.length,
        model: options?.model || 'default'
      });
      
      // Chiama il modulo AI
      const startTime = Date.now();
      const response = await aiController._aiModule.complete(prompt, requestOptions);
      const duration = Date.now() - startTime;
      
      // Log della risposta
      logger.info(`Completamento generato in ${duration}ms`, {
        responseLength: response.completion.length,
        modelUsed: response.model,
        fromCache: response.fromCache || false,
        tokens: response.usage
      });
      
      // Restituisci la risposta
      res.json({
        success: true,
        completion: response.completion,
        model: response.model,
        cached: response.fromCache || false,
        usage: response.usage,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante la richiesta di completamento:', error);
      return next(errors.internal('Errore durante il completamento del testo'));
    }
  }),
  
  /**
   * Endpoint per chat in streaming con il modello
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  streamChat: asyncHandler(async (req, res, next) => {
    try {
      if (!aiController._checkAiModule(next)) return;
      
      const { message, conversation_id, system_prompt, options } = req.body;
      
      // Validazione input
      if (!message) {
        return next(errors.validation('Il messaggio è obbligatorio'));
      }
      
      // Verifica supporto streaming
      if (!aiController._aiModule.streamChat) {
        return next(errors.unavailable('Streaming non supportato'));
      }
      
      // Prepara la richiesta per il modulo AI
      const requestOptions = {
        ...options,
        userId: req.user.id,
        conversationId: conversation_id,
        systemPrompt: system_prompt
      };
      
      // Configura risposta streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Handler per chunk di testo
      const onChunk = (chunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        // Flush per evitare buffering
        if (res.flush) {
          res.flush();
        }
      };
      
      // Handler per completamento
      const onComplete = (finalResponse) => {
        // Invia evento di completamento
        res.write(`data: ${JSON.stringify({ done: true, ...finalResponse })}\n\n`);
        res.end();
        
        logger.info(`Streaming completato per utente ${req.user.id}`, {
          modelUsed: finalResponse.model,
          tokens: finalResponse.usage
        });
      };
      
      // Handler per errori
      const onError = (error) => {
        logger.error('Errore durante lo streaming:', error);
        
        // Invia evento di errore al client
        res.write(`data: ${JSON.stringify({ 
          error: true, 
          message: 'Errore durante lo streaming' 
        })}\n\n`);
        
        res.end();
      };
      
      // Log dell'inizio streaming
      logger.info(`Avvio streaming per utente ${req.user.id}`, {
        messageLength: message.length,
        hasConversationId: !!conversation_id
      });
      
      // Avvia streaming
      aiController._aiModule.streamChat(
        message, 
        requestOptions, 
        onChunk, 
        onComplete, 
        onError
      );
      
      // Gestione chiusura connessione
      req.on('close', () => {
        logger.debug(`Connessione streaming chiusa da utente ${req.user.id}`);
        // Annulla streaming se il modulo lo supporta
        if (aiController._aiModule.cancelStream) {
          aiController._aiModule.cancelStream(req.user.id);
        }
      });
      
    } catch (error) {
      logger.error('Errore durante configurazione streaming:', error);
      return next(errors.internal('Errore durante l\'avvio dello streaming'));
    }
  }),
  
  /**
   * Ottiene la lista dei modelli disponibili
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  getModels: asyncHandler(async (req, res, next) => {
    try {
      if (!aiController._checkAiModule(next)) return;
      
      // Ottieni modelli dal modulo AI
      const models = await aiController._aiModule.getAvailableModels();
      
      res.json({
        success: true,
        models: models.map(model => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
          capabilities: model.capabilities,
          description: model.description,
          maxTokens: model.maxTokens,
          isDefault: model.isDefault || false
        })),
        defaultModel: models.find(m => m.isDefault)?.id || models[0]?.id,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante il recupero dei modelli:', error);
      return next(errors.internal('Errore durante il recupero dei modelli disponibili'));
    }
  }),
  
  /**
   * Ottiene lo stato del servizio AI
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  getAiStatus: asyncHandler(async (req, res, next) => {
    try {
      if (!aiController._checkAiModule(next)) return;
      
      // Ottieni stato dal modulo AI
      const status = await aiController._aiModule.getStatus();
      
      res.json({
        success: true,
        status: {
          operational: status.operational,
          activeServices: status.activeServices,
          defaultModel: status.defaultModel,
          lastError: status.lastError ? {
            message: status.lastError.message,
            timestamp: status.lastError.timestamp
          } : null,
          cacheStats: status.cacheStats || null,
          uptime: status.uptime
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante il recupero dello stato AI:', error);
      return next(errors.internal('Errore durante il recupero dello stato del servizio AI'));
    }
  }),
  
  /**
   * Ottiene la lista delle conversazioni dell'utente
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  getConversations: asyncHandler(async (req, res, next) => {
    try {
      if (!aiController._checkAiModule(next)) return;
      
      // Ottieni conversazioni dal modulo AI
      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;
      
      // Verifica se il modulo supporta la gestione conversazioni
      if (!aiController._aiModule.getConversations) {
        return next(errors.unavailable('Gestione conversazioni non supportata'));
      }
      
      const conversations = await aiController._aiModule.getConversations(userId, { limit, offset });
      
      res.json({
        success: true,
        conversations: conversations.map(conv => ({
          id: conv.id,
          title: conv.title,
          created_at: conv.createdAt,
          updated_at: conv.updatedAt,
          message_count: conv.messageCount,
          summary: conv.summary
        })),
        total: conversations.total || conversations.length,
        limit,
        offset,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante il recupero delle conversazioni:', error);
      return next(errors.internal('Errore durante il recupero delle conversazioni'));
    }
  }),
  
  /**
   * Ottiene i dettagli di una conversazione
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  getConversation: asyncHandler(async (req, res, next) => {
    try {
      if (!aiController._checkAiModule(next)) return;
      
      const userId = req.user.id;
      const conversationId = req.params.id;
      
      // Verifica se il modulo supporta la gestione conversazioni
      if (!aiController._aiModule.getConversation) {
        return next(errors.unavailable('Gestione conversazioni non supportata'));
      }
      
      // Ottieni conversazione dal modulo AI
      const conversation = await aiController._aiModule.getConversation(conversationId, userId);
      
      if (!conversation) {
        return next(errors.notFound('Conversazione non trovata'));
      }
      
      res.json({
        success: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          created_at: conversation.createdAt,
          updated_at: conversation.updatedAt,
          messages: conversation.messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
          })),
          system_prompt: conversation.systemPrompt
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante il recupero della conversazione:', error);
      return next(errors.internal('Errore durante il recupero della conversazione'));
    }
  }),
  
  /**
   * Elimina una conversazione
   * @param {Object} req - Richiesta Express
   * @param {Object} res - Risposta Express
   * @param {Function} next - Callback next
   */
  deleteConversation: asyncHandler(async (req, res, next) => {
    try {
      if (!aiController._checkAiModule(next)) return;
      
      const userId = req.user.id;
      const conversationId = req.params.id;
      
      // Verifica se il modulo supporta la gestione conversazioni
      if (!aiController._aiModule.deleteConversation) {
        return next(errors.unavailable('Gestione conversazioni non supportata'));
      }
      
      // Elimina conversazione
      const deleted = await aiController._aiModule.deleteConversation(conversationId, userId);
      
      if (!deleted) {
        return next(errors.notFound('Conversazione non trovata o non autorizzato'));
      }
      
      res.json({
        success: true,
        message: 'Conversazione eliminata con successo',
        id: conversationId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Errore durante l\'eliminazione della conversazione:', error);
      return next(errors.internal('Errore durante l\'eliminazione della conversazione'));
    }
  })
};

module.exports = aiController;