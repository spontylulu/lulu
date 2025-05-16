/**
 * modules/ai/ai-prompt-service.js
 * Servizio di gestione prompt per il modulo AI
 * 
 * Gestisce la formattazione e la preparazione dei prompt per i modelli di AI,
 * la gestione dei template e l'ottimizzazione del contesto.
 */

const logger = require('../../utils/logger').getLogger('ai:prompt');
const path = require('path');
const fs = require('fs').promises;

/**
 * Servizio di gestione prompt
 */
const promptService = {
  // Configurazione di default
  _config: {
    templatesPath: './templates',
    systemPrompt: "Sei Lulu, un assistente AI personale. Rispondi in modo conversazionale, conciso e utile.",
    maxHistoryLength: 10,      // Numero massimo di messaggi nella storia
    maxPromptLength: 4000,     // Lunghezza massima del prompt utente
    maxContextLength: 16000,   // Lunghezza massima del contesto totale
    maxSystemPromptLength: 1500, // Lunghezza massima del system prompt
    compressLongHistory: true, // Comprimere storia lunga
    includeTimestamps: false,  // Includere timestamp nei messaggi
    personalityProfile: 'standard' // Profilo di personalità
  },
  
  // Template dei prompt
  _templates: {
    standard: "Sei Lulu, un assistente AI personale. Rispondi in modo conversazionale, conciso e utile.",
    expert: "Sei Lulu, un assistente AI personale con esperienza in {domain}. Utilizza la tua conoscenza avanzata per fornire risposte dettagliate e tecniche. Sii preciso, informativo e autorevole.",
    friendly: "Sei Lulu, un assistente AI personale amichevole e conversazionale. Usa un tono cordiale e informale. Sii positivo, empatico e disponibile. Parla come se fossi un amico che vuole aiutare.",
    minimal: "Sei Lulu. Rispondi in modo conciso, usando frasi brevi e dirette. Evita dettagli non necessari. Sii chiaro ed efficiente.",
    business: "Sei Lulu, un assistente AI professionale per contesti aziendali. Mantieni un tono formale e professionale. Sii preciso, organizzato e orientato ai risultati nelle tue risposte."
  },
  
  // Template di prompt per domini specifici
  _domainTemplates: {},
  
  // Cache dei prompt compilati
  _compiledPrompts: new Map(),
  
  /**
   * Inizializza il servizio prompt
   * @param {Object} config - Configurazione opzionale
   * @returns {Object} - Istanza del servizio
   */
  async initialize(config = {}) {
    logger.info('Inizializzazione servizio prompt');
    
    try {
      // Applica la configurazione
      this._config = {
        ...this._config,
        ...config
      };
      
      // Reset della cache
      this._compiledPrompts.clear();
      
      // Carica template personalizzati se presenti
      await this._loadCustomTemplates();
      
      // Precompila i template di base
      this._precompileTemplates();
      
      logger.info('Servizio prompt inizializzato con successo', {
        personalityProfile: this._config.personalityProfile,
        templatesLoaded: Object.keys(this._templates).length
      });
      
      return this;
    } catch (error) {
      logger.error('Errore durante l\'inizializzazione del servizio prompt:', error);
      throw error;
    }
  },
  
  /**
   * Chiude il servizio prompt
   */
  async shutdown() {
    logger.info('Chiusura servizio prompt');
    
    try {
      // Pulisci le risorse
      this._compiledPrompts.clear();
      
      logger.info('Servizio prompt chiuso con successo');
    } catch (error) {
      logger.error('Errore durante la chiusura del servizio prompt:', error);
      throw error;
    }
  },
  
  /**
   * Carica template personalizzati da file
   * @private
   * @returns {Promise<number>} Numero di template caricati
   */
  async _loadCustomTemplates() {
    try {
      const templatesPath = path.resolve(this._config.templatesPath);
      
      // Verifica se la directory esiste
      try {
        await fs.access(templatesPath);
      } catch (accessError) {
        // La directory non esiste, la creiamo
        try {
          await fs.mkdir(templatesPath, { recursive: true });
          logger.debug(`Directory template creata: ${templatesPath}`);
        } catch (mkdirError) {
          logger.warn(`Impossibile creare directory template: ${mkdirError.message}`);
        }
        return 0;
      }
      
      // Leggi i file nella directory
      const files = await fs.readdir(templatesPath);
      const templateFiles = files.filter(file => file.endsWith('.json') || file.endsWith('.txt'));
      
      let loadedCount = 0;
      
      // Carica ogni file
      for (const file of templateFiles) {
        try {
          const filePath = path.join(templatesPath, file);
          const content = await fs.readFile(filePath, 'utf8');
          
          // Gestisci file JSON (.json)
          if (file.endsWith('.json')) {
            const templates = JSON.parse(content);
            
            // Merge dei template
            for (const [name, template] of Object.entries(templates)) {
              if (typeof template === 'string') {
                this._templates[name] = template;
                loadedCount++;
              } else if (typeof template === 'object' && template.domain) {
                // Categoria speciale per template di dominio
                this._domainTemplates[template.domain] = template.prompt || '';
                loadedCount++;
              }
            }
          } 
          // Gestisci file di testo (.txt)
          else {
            // Il nome del template è il nome del file senza estensione
            const name = path.basename(file, path.extname(file));
            this._templates[name] = content.trim();
            loadedCount++;
          }
        } catch (fileError) {
          logger.warn(`Errore nel caricamento del template ${file}:`, fileError);
        }
      }
      
      if (loadedCount > 0) {
        logger.info(`Caricati ${loadedCount} template personalizzati`);
      }
      
      return loadedCount;
    } catch (error) {
      logger.error('Errore durante il caricamento dei template personalizzati:', error);
      return 0;
    }
  },
  
  /**
   * Precompila i template di base
   * @private
   */
  _precompileTemplates() {
    // Precompila i template standard
    for (const [name, template] of Object.entries(this._templates)) {
      this._compiledPrompts.set(name, template);
    }
    
    logger.debug(`Precompilati ${this._compiledPrompts.size} template`);
  },
  
  /**
   * Prepara un prompt con il contesto della conversazione
   * @param {string} message - Messaggio utente corrente
   * @param {Object} options - Opzioni di prompt
   * @param {string} [options.systemPrompt] - System prompt personalizzato
   * @param {string} [options.conversationId] - ID conversazione per il contesto
   * @param {string} [options.userId] - ID utente per personalizzazione
   * @param {Array} [options.history] - Storia manuale della conversazione
   * @param {Object} [options.variables] - Variabili da sostituire nel template
   * @param {string} [options.template] - Nome del template da utilizzare
   * @param {string} [options.domain] - Dominio per template di dominio
   * @returns {Promise<Object>} Dati del prompt preparato
   */
  async preparePrompt(message, options = {}) {
    try {
      // Assicura che il messaggio non sia vuoto
      if (!message || typeof message !== 'string') {
        throw new Error('Messaggio non valido');
      }
      
      // Limita la lunghezza del messaggio
      let userMessage = message;
      if (userMessage.length > this._config.maxPromptLength) {
        userMessage = userMessage.substring(0, this._config.maxPromptLength);
        logger.warn(`Messaggio utente troncato (${message.length} -> ${this._config.maxPromptLength})`);
      }
      
      // Determina il template da utilizzare
      let systemPrompt = '';
      
      if (options.systemPrompt) {
        // Usa system prompt personalizzato
        systemPrompt = options.systemPrompt;
      } else if (options.template && this._templates[options.template]) {
        // Usa template specificato
        systemPrompt = this._templates[options.template];
      } else if (options.domain && this._domainTemplates[options.domain]) {
        // Usa template di dominio
        systemPrompt = this._templates.expert.replace('{domain}', options.domain);
      } else {
        // Usa il template di default in base al profilo di personalità
        const profile = options.personalityProfile || this._config.personalityProfile;
        systemPrompt = this._templates[profile] || this._templates.standard;
      }
      
      // Applica le variabili al system prompt
      if (options.variables && typeof options.variables === 'object') {
        systemPrompt = this._applyVariables(systemPrompt, options.variables);
      }
      
      // Limita la lunghezza del system prompt
      if (systemPrompt.length > this._config.maxSystemPromptLength) {
        systemPrompt = systemPrompt.substring(0, this._config.maxSystemPromptLength);
        logger.warn(`System prompt troncato (${systemPrompt.length} -> ${this._config.maxSystemPromptLength})`);
      }
      
      // Prepara la storia della conversazione
      let conversationHistory = [];
      
      // Se è fornita una storia manuale, la utilizziamo
      if (options.history && Array.isArray(options.history)) {
        conversationHistory = options.history;
      }
      // Altrimenti, se abbiamo un ID conversazione, la recuperiamo
      else if (options.conversationId) {
        // Qui dovremmo chiamare il servizio conversazioni
        // Ma per evitare dipendenze circolari, assumiamo che la storia sia vuota
        // Il modulo AI si occuperà di recuperare la storia
        logger.debug(`ID conversazione fornito (${options.conversationId}) ma la storia dovrà essere recuperata dal modulo AI`);
      }
      
      // Ottimizza la storia per stare nei limiti di contesto
      const optimizedHistory = this._optimizeConversationHistory(conversationHistory);
      
      // Prepara il prompt finale
      const prompt = userMessage;
      
      return {
        prompt,
        systemPrompt,
        conversationHistory: optimizedHistory,
        variables: options.variables || {},
        tokenEstimate: this._estimateTokenCount(systemPrompt + prompt + JSON.stringify(optimizedHistory))
      };
    } catch (error) {
      logger.error('Errore durante la preparazione del prompt:', error);
      
      // Restituisci un prompt base di fallback
      return {
        prompt: message.substring(0, this._config.maxPromptLength),
        systemPrompt: this._templates.standard,
        conversationHistory: [],
        tokenEstimate: this._estimateTokenCount(message)
      };
    }
  },
  
  /**
   * Ottimizza la storia della conversazione per rispettare i limiti di contesto
   * @private
   * @param {Array} history - Storia della conversazione
   * @returns {Array} Storia ottimizzata
   */
  _optimizeConversationHistory(history) {
    if (!history || !Array.isArray(history) || history.length === 0) {
      return [];
    }
    
    // Limita il numero massimo di messaggi
    let optimizedHistory = [...history];
    
    if (optimizedHistory.length > this._config.maxHistoryLength) {
      // Se abbiamo troppe interazioni, riduciamo
      if (this._config.compressLongHistory) {
        // Strategia 1: Mantieni le prime interazioni e le ultime
        // es. con maxHistoryLength=10, mantieni le prime 2 e le ultime 8
        const keepAtStart = Math.min(2, Math.floor(this._config.maxHistoryLength * 0.2));
        const keepAtEnd = this._config.maxHistoryLength - keepAtStart;
        
        // Prendi le prime N interazioni
        const startMessages = optimizedHistory.slice(0, keepAtStart);
        // Prendi le ultime M interazioni
        const endMessages = optimizedHistory.slice(-keepAtEnd);
        
        // Combina
        optimizedHistory = [...startMessages, ...endMessages];
        
        logger.debug(`Storia compressa: ${history.length} -> ${optimizedHistory.length} messaggi`);
      } else {
        // Strategia 2: Semplicemente tronca la storia alle ultime N interazioni
        optimizedHistory = optimizedHistory.slice(-this._config.maxHistoryLength);
        logger.debug(`Storia troncata: ${history.length} -> ${optimizedHistory.length} messaggi`);
      }
    }
    
    // Formatta i messaggi in base ai requisiti
    return optimizedHistory.map(message => {
      // Crea una copia per non modificare l'originale
      const formattedMessage = { ...message };
      
      // Aggiungi timestamp se configurato
      if (this._config.includeTimestamps && !formattedMessage.timestamp) {
        formattedMessage.timestamp = new Date().toISOString();
      }
      
      return formattedMessage;
    });
  },
  
  /**
   * Applica le variabili a un template
   * @private
   * @param {string} template - Template con placeholder
   * @param {Object} variables - Variabili da sostituire
   * @returns {string} Template compilato
   */
  _applyVariables(template, variables) {
    if (!template || !variables) return template;
    
    let result = template;
    
    // Sostituisce placeholder nel formato {variableName}
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(placeholder, value);
    }
    
    return result;
  },
  
  /**
   * Stima (approssimativamente) il numero di token in un testo
   * @private
   * @param {string} text - Testo da valutare
   * @returns {number} Stima del numero di token
   */
  _estimateTokenCount(text) {
    if (!text) return 0;
    
    // Stima approssimativa basata su spazi e lunghezza
    // Un token è circa 4 caratteri in media per l'inglese
    // Per altre lingue potrebbe essere diverso
    return Math.ceil(text.length / 4);
  },
  
  /**
   * Ottiene un template di prompt
   * @param {string} name - Nome del template
   * @param {Object} [variables] - Variabili da sostituire
   * @returns {string} Template compilato
   */
  getTemplate(name, variables = {}) {
    try {
      // Ottieni template dalla cache o dai template predefiniti
      let template = this._compiledPrompts.get(name) || this._templates[name];
      
      // Se non trovato, usa il template standard
      if (!template) {
        logger.warn(`Template "${name}" non trovato, uso template standard`);
        template = this._templates.standard;
      }
      
      // Applica le variabili
      return this._applyVariables(template, variables);
    } catch (error) {
      logger.error(`Errore nel recupero del template "${name}":`, error);
      return this._templates.standard;
    }
  },
  
  /**
   * Salva un nuovo template personalizzato
   * @param {string} name - Nome del template
   * @param {string} content - Contenuto del template
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async saveTemplate(name, content) {
    try {
      if (!name || !content) {
        throw new Error('Nome e contenuto del template sono obbligatori');
      }
      
      // Salva in memoria
      this._templates[name] = content;
      this._compiledPrompts.set(name, content);
      
      // Salva su file se possibile
      try {
        const templatesPath = path.resolve(this._config.templatesPath);
        
        // Assicura che la directory esista
        await fs.mkdir(templatesPath, { recursive: true });
        
        // Salva il template come file JSON
        const filePath = path.join(templatesPath, `${name}.json`);
        const templateData = { [name]: content };
        await fs.writeFile(filePath, JSON.stringify(templateData, null, 2), 'utf8');
        
        logger.info(`Template "${name}" salvato su file`);
      } catch (fileError) {
        logger.warn(`Impossibile salvare il template "${name}" su file:`, fileError);
        // Continua comunque, il template è stato salvato in memoria
      }
      
      logger.info(`Template "${name}" creato/aggiornato`);
      return true;
    } catch (error) {
      logger.error(`Errore nel salvataggio del template "${name}":`, error);
      return false;
    }
  },
  
  /**
   * Elimina un template personalizzato
   * @param {string} name - Nome del template
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  async deleteTemplate(name) {
    try {
      // Verifica che non sia un template predefinito
      const predefinedTemplates = ['standard', 'expert', 'friendly', 'minimal', 'business'];
      if (predefinedTemplates.includes(name)) {
        logger.warn(`Impossibile eliminare il template predefinito "${name}"`);
        return false;
      }
      
      // Rimuovi da memoria
      delete this._templates[name];
      this._compiledPrompts.delete(name);
      
      // Rimuovi da file se possibile
      try {
        const templatesPath = path.resolve(this._config.templatesPath);
        const filePath = path.join(templatesPath, `${name}.json`);
        
        // Verifica se il file esiste
        try {
          await fs.access(filePath);
          await fs.unlink(filePath);
          logger.debug(`File template "${name}" eliminato`);
        } catch (accessError) {
          // File non esiste, ignora
        }
      } catch (fileError) {
        logger.warn(`Impossibile eliminare il file del template "${name}":`, fileError);
        // Continua comunque, il template è stato rimosso dalla memoria
      }
      
      logger.info(`Template "${name}" eliminato`);
      return true;
    } catch (error) {
      logger.error(`Errore nell'eliminazione del template "${name}":`, error);
      return false;
    }
  },
  
  /**
   * Elenca tutti i template disponibili
   * @returns {Object} Mappa dei template
   */
  listTemplates() {
    // Crea una copia dei template per non esporre l'oggetto interno
    return { ...this._templates };
  },
  
  /**
   * Imposta il profilo di personalità predefinito
   * @param {string} profile - Nome del profilo
   * @returns {boolean} True se l'operazione è riuscita
   */
  setPersonalityProfile(profile) {
    try {
      if (!profile || !this._templates[profile]) {
        logger.warn(`Profilo di personalità "${profile}" non trovato`);
        return false;
      }
      
      this._config.personalityProfile = profile;
      logger.info(`Profilo di personalità impostato: ${profile}`);
      return true;
    } catch (error) {
      logger.error(`Errore nell'impostazione del profilo di personalità "${profile}":`, error);
      return false;
    }
  }
};

module.exports = promptService;