/**
 * modules/ai/ai-conversation-service.js
 * Servizio di gestione conversazioni per il modulo AI
 * 
 * Gestisce la memorizzazione, il recupero e la manipolazione delle conversazioni
 * con i modelli di AI, mantenendo lo storico e il contesto.
 */

const logger = require('../../utils/logger').getLogger('ai:conversation');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

/**
 * Servizio di gestione conversazioni
 */
const conversationService = {
  // Configurazione di default
  _config: {
    storageType: 'memory',       // 'memory', 'file', 'database'
    storagePath: './data/conversations',
    persistInterval: 60000,      // Intervallo di salvataggio in ms (1 minuto)
    maxConversationsPerUser: 50, // Limite conversazioni per utente
    maxMessagesPerConversation: 100, // Limite messaggi per conversazione
    maxMessageLength: 32000,     // Lunghezza massima messaggi
    pruneOldConversations: true, // Rimuovi conversazioni vecchie automaticamente
    pruneThreshold: 30 * 24 * 60 * 60 * 1000, // 30 giorni
    enableSummary: true         // Generare automaticamente riassunti
  },
  
  // Cache in memoria delle conversazioni
  _conversations: new Map(),
  
  // Timer per salvataggio periodico
  _persistTimer: null,
  
  // Contatori statistiche
  _stats: {
    totalConversations: 0,
    totalMessages: 0,
    activeConversations: 0,
    lastPruneTime: null
  },
  
  /**
   * Inizializza il servizio conversazioni
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio conversazioni');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Resetta lo stato e i contatori
      this._conversations.clear();
      this._stats = {
        totalConversations: 0,
        totalMessages: 0,
        activeConversations: 0,
        lastPruneTime: null
      };
      
      // Crea directory di storage se necessario
      if (this._config.storageType === 'file') {
        await this._ensureStorageDirectory();
      }
      
      // Carica le conversazioni da storage persistente
      await this._loadConversations();
      
      // Avvia timer per salvataggio periodico
      if (this._config.storageType === 'file' && this._config.persistInterval > 0) {
        this._startPersistTimer();
      }
      
      logger.info('Servizio conversazioni inizializzato con successo', { 
        storageType: this._config.storageType,
        conversationsLoaded: this._stats.totalConversations
      });
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio conversazioni:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio conversazioni
   */
  async shutdown() {
    logger.info('Chiusura servizio conversazioni');
    
    try {
      // Ferma il timer di persistenza
      if (this._persistTimer) {
        clearInterval(this._persistTimer);
        this._persistTimer = null;
      }
      
      // Salva le conversazioni prima della chiusura
      if (this._config.storageType === 'file') {
        await this._persistConversations();
      }
      
      // Pulisci la memoria
      this._conversations.clear();
      
      logger.info('Servizio conversazioni chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio conversazioni:', error);
      throw error;
    }
  },
  
  /**
   * Assicura che la directory di storage esista
   * @private
   * @returns {Promise<string>} Percorso della directory
   */
  async _ensureStorageDirectory() {
    try {
      const storagePath = path.resolve(this._config.storagePath);
      await fs.mkdir(storagePath, { recursive: true });
      logger.debug(`Directory storage conversazioni: ${storagePath}`);
      return storagePath;
    } catch (error) {
      logger.error('Errore creazione directory storage conversazioni:', error);
      throw error;
    }
  },
  
  /**
   * Avvia il timer per il salvataggio periodico
   * @private
   */
  _startPersistTimer() {
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
    }
    
    this._persistTimer = setInterval(async () => {
      try {
        await this._persistConversations();
        logger.debug('Salvataggio periodico conversazioni completato');
      } catch (error) {
        logger.error('Errore durante salvataggio periodico conversazioni:', error);
      }
    }, this._config.persistInterval);
    
    logger.debug(`Timer persistenza conversazioni avviato (intervallo: ${this._config.persistInterval / 1000}s)`);
  },
  
  /**
   * Carica le conversazioni da storage persistente
   * @private
   * @returns {Promise<number>} Numero di conversazioni caricate
   */
  async _loadConversations() {
    // Se storage in memoria, non c'è nulla da caricare
    if (this._config.storageType === 'memory') {
      return 0;
    }
    
    try {
      // Per storage file
      if (this._config.storageType === 'file') {
        const storagePath = await this._ensureStorageDirectory();
        
        // Leggi tutti i file nella directory
        const files = await fs.readdir(storagePath);
        const conversationFiles = files.filter(file => file.endsWith('.json'));
        
        let loadedCount = 0;
        let errorCount = 0;
        
        // Carica ogni file
        for (const file of conversationFiles) {
          try {
            const filePath = path.join(storagePath, file);
            const data = await fs.readFile(filePath, 'utf8');
            const conversation = JSON.parse(data);
            
            // Verifica che i dati siano validi
            if (conversation && conversation.id) {
              this._conversations.set(conversation.id, conversation);
              loadedCount++;
              
              // Aggiorna statistiche
              this._stats.totalMessages += conversation.messages?.length || 0;
              
              // Verifica se la conversazione è attiva (modificata negli ultimi 7 giorni)
              const lastUpdateTime = conversation.updatedAt || conversation.createdAt;
              const isActive = lastUpdateTime && (Date.now() - lastUpdateTime < 7 * 24 * 60 * 60 * 1000);
              if (isActive) {
                this._stats.activeConversations++;
              }
            }
          } catch (fileError) {
            logger.warn(`Errore nel caricamento della conversazione ${file}:`, fileError);
            errorCount++;
          }
        }
        
        this._stats.totalConversations = this._conversations.size;
        
        logger.info(`Caricate ${loadedCount} conversazioni, ${errorCount} errori`);
        return loadedCount;
      }
      
      // Per storage database (futuro)
      if (this._config.storageType === 'database') {
        // Implementazione futura
        logger.warn('Storage database non ancora implementato');
        return 0;
      }
      
      return 0;
    } catch (error) {
      logger.error('Errore durante il caricamento delle conversazioni:', error);
      return 0;
    }
  },
  
  /**
   * Salva le conversazioni su storage persistente
   * @private
   * @returns {Promise<number>} Numero di conversazioni salvate
   */
  async _persistConversations() {
    // Se storage in memoria, non c'è nulla da salvare
    if (this._config.storageType === 'memory') {
      return 0;
    }
    
    try {
      // Per storage file
      if (this._config.storageType === 'file') {
        const storagePath = await this._ensureStorageDirectory();
        
        let savedCount = 0;
        let errorCount = 0;
        
        // Salva ogni conversazione in un file separato
        for (const [id, conversation] of this._conversations.entries()) {
          try {
            // Aggiorna timestamp modifica
            conversation.lastPersistedAt = Date.now();
            
            // Salva su file
            const filePath = path.join(storagePath, `${id}.json`);
            await fs.writeFile(filePath, JSON.stringify(conversation, null, 2), 'utf8');
            savedCount++;
          } catch (fileError) {
            logger.warn(`Errore nel salvataggio della conversazione ${id}:`, fileError);
            errorCount++;
          }
        }
        
        if (savedCount > 0 || errorCount > 0) {
          logger.debug(`Salvate ${savedCount} conversazioni, ${errorCount} errori`);
        }
        
        return savedCount;
      }
      
      // Per storage database (futuro)
      if (this._config.storageType === 'database') {
        // Implementazione futura
        logger.warn('Storage database non ancora implementato');
        return 0;
      }
      
      return 0;
    } catch (error) {
      logger.error('Errore durante il salvataggio delle conversazioni:', error);
      return 0;
    }
  },
  
  /**
   * Crea una nuova conversazione
   * @param {string} userId - ID dell'utente proprietario
   * @param {Object} options - Opzioni conversazione
   * @param {string} [options.title] - Titolo della conversazione
   * @param {string} [options.systemPrompt] - System prompt personalizzato
   * @returns {Promise<Object>} Conversazione creata
   */
  async createConversation(userId, options = {}) {
    try {
      // Verifica se l'utente ha già raggiunto il limite di conversazioni
      const userConversations = await this.getUserConversations(userId);
      if (userConversations.length >= this._config.maxConversationsPerUser) {
        logger.warn(`Utente ${userId} ha raggiunto il limite di conversazioni (${this._config.maxConversationsPerUser})`);
        
        // Se abilitato, rimuovi automaticamente la conversazione più vecchia
        if (this._config.pruneOldConversations && userConversations.length > 0) {
          // Ordina per data aggiornamento (più vecchie prima)
          userConversations.sort((a, b) => (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt));
          
          // Rimuovi la più vecchia
          await this.deleteConversation(userConversations[0].id);
          logger.info(`Rimossa automaticamente conversazione più vecchia dell'utente ${userId}`);
        } else {
          throw new Error(`Limite conversazioni per utente raggiunto (${this._config.maxConversationsPerUser})`);
        }
      }
      
      // Genera ID univoco per la conversazione
      const id = this._generateId();
      
      // Crea la conversazione
      const now = Date.now();
      const conversation = {
        id,
        userId,
        title: options.title || 'Nuova conversazione',
        systemPrompt: options.systemPrompt || null,
        messages: [],
        createdAt: now,
        updatedAt: now,
        model: options.model || null,
        metadata: {
          ...options.metadata
        },
        summary: null
      };
      
      // Salva in memoria
      this._conversations.set(id, conversation);
      
      // Aggiorna statistiche
      this._stats.totalConversations++;
      this._stats.activeConversations++;
      
      // Persisti subito se configurato come file
      if (this._config.storageType === 'file') {
        try {
          const storagePath = await this._ensureStorageDirectory();
          const filePath = path.join(storagePath, `${id}.json`);
          await fs.writeFile(filePath, JSON.stringify(conversation, null, 2), 'utf8');
        } catch (storageError) {
          logger.error(`Errore nel salvataggio iniziale della conversazione ${id}:`, storageError);
        }
      }
      
      logger.info(`Conversazione creata: ${id} per utente ${userId}`);
      return conversation;
    } catch (error) {
      logger.error('Errore nella creazione della conversazione:', error);
      throw error;
    }
  },
  
  /**
   * Ottiene una conversazione per ID
   * @param {string} id - ID della conversazione
   * @returns {Promise<Object|null>} Conversazione o null se non trovata
   */
  async getConversation(id) {
    try {
      // Cerca in memoria
      if (this._conversations.has(id)) {
        return this._conversations.get(id);
      }
      
      // Se non trovata in memoria e lo storage è file, prova a caricare dal file
      if (this._config.storageType === 'file') {
        try {
          const storagePath = await this._ensureStorageDirectory();
          const filePath = path.join(storagePath, `${id}.json`);
          
          // Verifica se il file esiste
          try {
            await fs.access(filePath);
          } catch (accessError) {
            return null; // File non esiste
          }
          
          // Leggi il file
          const data = await fs.readFile(filePath, 'utf8');
          const conversation = JSON.parse(data);
          
          // Salva in memoria
          this._conversations.set(id, conversation);
          
          // Aggiorna statistiche
          this._stats.totalConversations = this._conversations.size;
          this._stats.totalMessages += conversation.messages?.length || 0;
          this._stats.activeConversations++;
          
          return conversation;
        } catch (fileError) {
          logger.error(`Errore nel caricamento della conversazione ${id} da file:`, fileError);
          return null;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Errore nel recupero della conversazione ${id}:`, error);
      return null;
    }
  },
  
  /**
   * Aggiorna una conversazione esistente
   * @param {string} id - ID della conversazione
   * @param {Object} updates - Campi da aggiornare
   * @returns {Promise<Object|null>} Conversazione aggiornata o null
   */
  async updateConversation(id, updates) {
    try {
      // Ottieni la conversazione esistente
      const conversation = await this.getConversation(id);
      if (!conversation) {
        logger.warn(`Tentativo di aggiornare conversazione inesistente: ${id}`);
        return null;
      }
      
      // Applica gli aggiornamenti
      const updatedConversation = {
        ...conversation,
        ...updates,
        id, // Mantieni l'ID originale
        userId: conversation.userId, // Mantieni l'utente originale
        updatedAt: Date.now() // Aggiorna timestamp
      };
      
      // Salva in memoria
      this._conversations.set(id, updatedConversation);
      
      // Persisti se configurato come file
      if (this._config.storageType === 'file') {
        const storagePath = await this._ensureStorageDirectory();
        const filePath = path.join(storagePath, `${id}.json`);
        await fs.writeFile(filePath, JSON.stringify(updatedConversation, null, 2), 'utf8');
      }
      
      logger.debug(`Conversazione aggiornata: ${id}`);
      return updatedConversation;
    } catch (error) {
      logger.error(`Errore nell'aggiornamento della conversazione ${id}:`, error);
      throw error;
    }
  },
  
  /**
   * Elimina una conversazione
   * @param {string} id - ID della conversazione
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async deleteConversation(id) {
    try {
      // Verifica se la conversazione esiste
      if (!this._conversations.has(id)) {
        // Se non in memoria ma lo storage è file, verifica se esiste su file
        if (this._config.storageType === 'file') {
          try {
            const storagePath = await this._ensureStorageDirectory();
            const filePath = path.join(storagePath, `${id}.json`);
            
            // Elimina il file se esiste
            try {
              await fs.access(filePath);
              await fs.unlink(filePath);
              logger.debug(`File conversazione eliminato: ${id}`);
              return true;
            } catch (accessError) {
              // File non esiste
              return false;
            }
          } catch (fileError) {
            logger.error(`Errore nell'eliminazione del file conversazione ${id}:`, fileError);
            return false;
          }
        }
        
        return false;
      }
      
      // Ottieni la conversazione per aggiornare statistiche
      const conversation = this._conversations.get(id);
      
      // Rimuovi dalla memoria
      this._conversations.delete(id);
      
      // Aggiorna statistiche
      this._stats.totalConversations = this._conversations.size;
      this._stats.totalMessages -= conversation.messages?.length || 0;
      
      // Se era attiva, decrementa contatore
      const lastUpdateTime = conversation.updatedAt || conversation.createdAt;
      const isActive = lastUpdateTime && (Date.now() - lastUpdateTime < 7 * 24 * 60 * 60 * 1000);
      if (isActive) {
        this._stats.activeConversations = Math.max(0, this._stats.activeConversations - 1);
      }
      
      // Rimuovi file se lo storage è file
      if (this._config.storageType === 'file') {
        try {
          const storagePath = await this._ensureStorageDirectory();
          const filePath = path.join(storagePath, `${id}.json`);
          await fs.unlink(filePath);
        } catch (fileError) {
          logger.warn(`Errore nell'eliminazione del file conversazione ${id}:`, fileError);
          // Continua comunque, la conversazione è stata rimossa dalla memoria
        }
      }
      
      logger.info(`Conversazione eliminata: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Errore nell'eliminazione della conversazione ${id}:`, error);
      return false;
    }
  },
  
  /**
   * Aggiunge un messaggio a una conversazione
   * @param {string} conversationId - ID della conversazione
   * @param {Object} message - Messaggio da aggiungere
   * @param {string} message.role - Ruolo (user, assistant, system)
   * @param {string} message.content - Contenuto del messaggio
   * @returns {Promise<Object|null>} Conversazione aggiornata o null
   */
  async addMessage(conversationId, message) {
    try {
      // Verifica che il messaggio sia valido
      if (!message || !message.role || !message.content) {
        throw new Error('Messaggio non valido');
      }
      
      // Ottieni la conversazione
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        logger.warn(`Tentativo di aggiungere messaggio a conversazione inesistente: ${conversationId}`);
        return null;
      }
      
      // Verifica limite messaggi
      if (conversation.messages.length >= this._config.maxMessagesPerConversation) {
        logger.warn(`Limite messaggi raggiunto per conversazione ${conversationId}`);
        
        // Rimuovi il messaggio più vecchio (se non è un system prompt)
        if (conversation.messages.length > 0) {
          const oldestNonSystemIndex = conversation.messages.findIndex(m => m.role !== 'system');
          if (oldestNonSystemIndex >= 0) {
            conversation.messages.splice(oldestNonSystemIndex, 1);
            logger.debug(`Rimosso messaggio più vecchio dalla conversazione ${conversationId}`);
          } else {
            throw new Error(`Limite messaggi raggiunto (${this._config.maxMessagesPerConversation})`);
          }
        }
      }
      
      // Limita lunghezza messaggio se necessario
      let content = message.content;
      if (content.length > this._config.maxMessageLength) {
        content = content.substring(0, this._config.maxMessageLength);
        logger.warn(`Messaggio troncato per conversazione ${conversationId} (${content.length} -> ${this._config.maxMessageLength})`);
      }
      
      // Crea oggetto messaggio
      const newMessage = {
        id: this._generateId('msg'),
        role: message.role,
        content,
        timestamp: Date.now()
      };
      
      // Aggiungi alla conversazione
      conversation.messages.push(newMessage);
      conversation.updatedAt = Date.now();
      
      // Se è un messaggio assistant, aggiorna il modello usato
      if (message.role === 'assistant' && message.model) {
        conversation.model = message.model;
      }
      
      // Salva in memoria
      this._conversations.set(conversationId, conversation);
      
      // Aggiorna statistiche
      this._stats.totalMessages++;
      
      // Aggiorna la conversazione
      return this.updateConversation(conversationId, {
        messages: conversation.messages,
        updatedAt: conversation.updatedAt,
        model: conversation.model
      });
    } catch (error) {
      logger.error(`Errore nell'aggiunta di messaggio alla conversazione ${conversationId}:`, error);
      throw error;
    }
  },
  
  /**
   * Ottiene i messaggi di una conversazione
   * @param {string} conversationId - ID della conversazione
   * @param {Object} [options] - Opzioni di paginazione
   * @param {number} [options.limit] - Numero massimo di messaggi
   * @param {number} [options.offset] - Offset per paginazione
   * @returns {Promise<Array>} Lista di messaggi
   */
  async getMessages(conversationId, options = {}) {
    try {
      // Ottieni la conversazione
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        logger.warn(`Tentativo di recuperare messaggi da conversazione inesistente: ${conversationId}`);
        return [];
      }
      
      let messages = conversation.messages || [];
      
      // Applica paginazione se richiesta
      if (options.offset || options.limit) {
        const offset = options.offset || 0;
        const limit = options.limit || messages.length;
        messages = messages.slice(offset, offset + limit);
      }
      
      return messages;
    } catch (error) {
      logger.error(`Errore nel recupero dei messaggi della conversazione ${conversationId}:`, error);
      return [];
    }
  },
  
  /**
   * Ottiene le conversazioni di un utente
   * @param {string} userId - ID dell'utente
   * @param {Object} [options] - Opzioni di paginazione
   * @param {number} [options.limit] - Numero massimo di conversazioni
   * @param {number} [options.offset] - Offset per paginazione
   * @returns {Promise<Array>} Lista di conversazioni
   */
  async getUserConversations(userId, options = {}) {
    try {
      // Filtra le conversazioni dell'utente
      const userConversations = Array.from(this._conversations.values())
        .filter(conv => conv.userId === userId);
      
      // Ordina per data aggiornamento (più recenti prima)
      userConversations.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
      
      // Applica paginazione se richiesta
      if (options.offset || options.limit) {
        const offset = options.offset || 0;
        const limit = options.limit || userConversations.length;
        return userConversations.slice(offset, offset + limit);
      }
      
      return userConversations;
    } catch (error) {
      logger.error(`Errore nel recupero delle conversazioni dell'utente ${userId}:`, error);
      return [];
    }
  },
  
  /**
   * Esegue pulizia automatica delle conversazioni vecchie
   * @returns {Promise<number>} Numero di conversazioni rimosse
   */
  async pruneOldConversations() {
    try {
      if (!this._config.pruneOldConversations) {
        return 0;
      }
      
      const now = Date.now();
      const pruneThreshold = now - this._config.pruneThreshold;
      let removedCount = 0;
      
      // Trova le conversazioni da eliminare
      const conversationsToRemove = Array.from(this._conversations.entries())
        .filter(([_, conv]) => {
          const lastActivity = conv.updatedAt || conv.createdAt;
          return lastActivity < pruneThreshold;
        })
        .map(([id, _]) => id);
      
      // Elimina le conversazioni
      for (const id of conversationsToRemove) {
        const success = await this.deleteConversation(id);
        if (success) {
          removedCount++;
        }
      }
      
      // Aggiorna timestamp dell'ultima pulizia
      this._stats.lastPruneTime = now;
      
      if (removedCount > 0) {
        logger.info(`Pulizia conversazioni completata: rimosse ${removedCount} conversazioni vecchie`);
      }
      
      return removedCount;
    } catch (error) {
      logger.error('Errore durante la pulizia delle conversazioni vecchie:', error);
      return 0;
    }
  },
  
  /**
   * Ottiene il numero totale di conversazioni
   * @returns {number} Conteggio conversazioni
   */
  getCount() {
    return this._stats.totalConversations;
  },
  
  /**
   * Genera un ID univoco
   * @private
   * @param {string} [prefix='conv'] - Prefisso per l'ID
   * @returns {string} ID generato
   */
  _generateId(prefix = 'conv') {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  },
  
  /**
   * Ottiene statistiche sul servizio conversazioni
   * @returns {Object} Statistiche
   */
  getStats() {
    return {
      totalConversations: this._stats.totalConversations,
      activeConversations: this._stats.activeConversations,
      totalMessages: this._stats.totalMessages,
      messagesPerConversation: this._stats.totalConversations > 0 ? 
        Math.round(this._stats.totalMessages / this._stats.totalConversations * 10) / 10 : 0,
      lastPruneTime: this._stats.lastPruneTime,
      storageType: this._config.storageType
    };
  }
};

module.exports = conversationService;