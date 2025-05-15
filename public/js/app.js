/**
 * app.js
 * Script principale per l'interfaccia web di Lulu
 * Gestisce l'interazione con l'API e l'interfaccia utente
 */

// Configurazione
const CONFIG = {
    apiBaseUrl: '/api/v1',  // URL base dell'API
    endpoints: {
        chat: '/ai/chat',
        status: '/system/info'
    },
    debugEnabled: true,     // Abilita/disabilita il debug
    autoReconnect: true,    // Riconnessione automatica
    reconnectInterval: 5000 // Intervallo di riconnessione in ms
};

// Stato dell'applicazione
const STATE = {
    connected: false,
    connecting: false,
    conversation_id: null,
    waitingResponse: false,
    messageHistory: []
};

// Cache degli elementi DOM
const DOM = {
    messagesContainer: document.getElementById('chat-messages'),
    messageInput: document.getElementById('message-input'),
    sendButton: document.getElementById('send-button'),
    debugConsole: document.getElementById('debug-console'),
    clearConsoleButton: document.getElementById('clear-console'),
    connectionStatus: document.getElementById('connection-status')
};

// =================================================================
// Gestione della console di debug
// =================================================================

/**
 * Sistema di logging per debug
 */
const Logger = {
    /**
     * Aggiunge un log alla console di debug
     * @param {string} message - Messaggio di log
     * @param {string} level - Livello di log (info, success, warning, error)
     * @param {Object} data - Dati aggiuntivi da visualizzare
     */
    log(message, level = 'info', data = null) {
        if (!CONFIG.debugEnabled) return;

        const timestamp = new Date().toTimeString().split(' ')[0];
        const logElement = document.createElement('div');
        logElement.className = `debug-log log-${level}`;

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = timestamp;
        
        logElement.appendChild(timestampSpan);
        logElement.append(message);

        // Se ci sono dati aggiuntivi, aggiungili come dettagli espandibili
        if (data) {
            const expandButton = document.createElement('span');
            expandButton.className = 'expandable';
            expandButton.innerHTML = ' [+]';
            logElement.appendChild(expandButton);

            const detailsElement = document.createElement('pre');
            detailsElement.className = 'hidden';
            
            try {
                // Formatta i dati JSON in modo leggibile
                if (typeof data === 'object') {
                    detailsElement.textContent = JSON.stringify(data, null, 2);
                } else {
                    detailsElement.textContent = data;
                }
            } catch (e) {
                detailsElement.textContent = String(data);
            }
            
            logElement.appendChild(detailsElement);

            // Gestione dell'espansione/compressione dei dettagli
            expandButton.addEventListener('click', () => {
                const isHidden = detailsElement.classList.contains('hidden');
                detailsElement.classList.toggle('hidden');
                expandButton.innerHTML = isHidden ? ' [-]' : ' [+]';
            });
        }

        DOM.debugConsole.appendChild(logElement);
        DOM.debugConsole.scrollTop = DOM.debugConsole.scrollHeight;
    },

    /**
     * Shortcuts per i vari livelli di log
     */
    info(message, data = null) {
        this.log(message, 'info', data);
    },

    success(message, data = null) {
        this.log(message, 'success', data);
    },

    warning(message, data = null) {
        this.log(message, 'warning', data);
    },

    error(message, data = null) {
        this.log(message, 'error', data);
    },

    /**
     * Pulisce la console di debug
     */
    clear() {
        DOM.debugConsole.innerHTML = '';
        this.info('Console pulita');
    }
};

// =================================================================
// Gestione della chat e interfaccia utente
// =================================================================

/**
 * Gestione dell'interfaccia della chat
 */
const ChatUI = {
    /**
     * Aggiunge un messaggio alla chat
     * @param {string} content - Contenuto del messaggio
     * @param {string} sender - Mittente (user o assistant)
     * @param {Object} metadata - Metadati aggiuntivi
     */
    addMessage(content, sender = 'user', metadata = {}) {
        const messageElement = document.createElement('div');
        messageElement.className = `message message-${sender}`;
        
        // Converti markdown semplice (codice, bold, italic)
        const formattedContent = this._formatMessage(content);
        messageElement.innerHTML = formattedContent;
        
        DOM.messagesContainer.appendChild(messageElement);
        this._scrollToBottom();

        // Aggiungi alla cronologia
        STATE.messageHistory.push({
            content,
            sender,
            timestamp: new Date(),
            metadata
        });
    },

    /**
     * Mostra l'indicatore di digitazione
     */
    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message-typing';
        indicator.id = 'typing-indicator';
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.className = 'typing-dot';
            indicator.appendChild(dot);
        }
        
        DOM.messagesContainer.appendChild(indicator);
        this._scrollToBottom();
    },

    /**
     * Nasconde l'indicatore di digitazione
     */
    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    },

    /**
     * Formatta il messaggio con markdown semplice
     * @private
     * @param {string} text - Testo da formattare
     * @returns {string} Testo formattato con HTML
     */
    _formatMessage(text) {
        // Implementazione semplice di markdown
        // Code blocks (```)
        text = text.replace(/```(\w*)([\s\S]*?)```/g, 
            (match, language, code) => `<pre><code class="language-${language}">${this._escapeHtml(code.trim())}</code></pre>`);
        
        // Inline code (`)
        text = text.replace(/`([^`]+)`/g, 
            (match, code) => `<code>${this._escapeHtml(code)}</code>`);
        
        // Bold (**)
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic (*)
        text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Links
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Newlines
        text = text.replace(/\n/g, '<br>');
        
        return text;
    },

    /**
     * Escape HTML per evitare XSS
     * @private
     * @param {string} text - Testo da escape
     * @returns {string} Testo con HTML escaped
     */
    _escapeHtml(text) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return text.replace(/[&<>"']/g, char => escapeMap[char]);
    },

    /**
     * Scorre la chat verso il basso
     * @private
     */
    _scrollToBottom() {
        DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
    },

    /**
     * Pulisce l'input del messaggio
     */
    clearInput() {
        DOM.messageInput.value = '';
        DOM.messageInput.style.height = 'auto';
    },

    /**
     * Imposta lo stato della connessione
     * @param {string} status - Stato della connessione (connected, connecting, disconnected, error)
     */
    setConnectionStatus(status) {
        DOM.connectionStatus.style.color = 
            status === 'connected' ? '#2ecc71' :
            status === 'connecting' ? '#f39c12' :
            status === 'error' ? '#e74c3c' : '#ccc';
        
        DOM.connectionStatus.title = 
            status === 'connected' ? 'Connesso' :
            status === 'connecting' ? 'Connessione in corso...' :
            status === 'error' ? 'Errore di connessione' : 'Disconnesso';
    }
};

// =================================================================
// API e comunicazione con il server
// =================================================================

/**
 * Gestione delle chiamate API
 */
const ApiService = {
    /**
     * Verifica lo stato del server
     * @returns {Promise<Object>} Risposta del server
     */
    async checkStatus() {
        try {
            STATE.connecting = true;
            ChatUI.setConnectionStatus('connecting');
            
            const response = await fetch(`${CONFIG.apiBaseUrl}/status`);
            const data = await response.json();
            
            STATE.connected = response.ok;
            ChatUI.setConnectionStatus(response.ok ? 'connected' : 'error');
            
            if (response.ok) {
                Logger.success('Connessione al server stabilita', data);
            } else {
                Logger.error('Errore di connessione al server', data);
                this._scheduleReconnect();
            }
            
            return data;
        } catch (error) {
            STATE.connected = false;
            ChatUI.setConnectionStatus('error');
            Logger.error('Errore di connessione al server', error);
            this._scheduleReconnect();
            return null;
        } finally {
            STATE.connecting = false;
        }
    },

    /**
     * Invia un messaggio alla chat AI
     * @param {string} message - Messaggio da inviare
     * @returns {Promise<Object>} Risposta dell'AI
     */
    async sendChatMessage(message) {
        if (!STATE.connected) {
            await this.checkStatus();
            if (!STATE.connected) {
                Logger.error('Impossibile inviare il messaggio: non connesso al server');
                return null;
            }
        }

        try {
            STATE.waitingResponse = true;
            
            // Prepara il payload
            const payload = {
                message: message,
                conversation_id: STATE.conversation_id
            };
            
            Logger.info('Invio messaggio al server', payload);
            
            const response = await fetch(`${CONFIG.apiBaseUrl}${CONFIG.endpoints.chat}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Errore durante l\'invio del messaggio');
            }
            
            // Salva l'ID della conversazione per la continuità
            if (data.conversation_id) {
                STATE.conversation_id = data.conversation_id;
            }
            
            Logger.success('Risposta ricevuta dal server', data);
            return data;
        } catch (error) {
            Logger.error('Errore durante l\'invio del messaggio', error);
            return null;
        } finally {
            STATE.waitingResponse = false;
        }
    },

    /**
     * Pianifica una riconnessione automatica
     * @private
     */
    _scheduleReconnect() {
        if (CONFIG.autoReconnect && !STATE.reconnectScheduled) {
            STATE.reconnectScheduled = true;
            
            Logger.info(`Riconnessione pianificata tra ${CONFIG.reconnectInterval / 1000} secondi...`);
            
            setTimeout(async () => {
                STATE.reconnectScheduled = false;
                await this.checkStatus();
            }, CONFIG.reconnectInterval);
        }
    }
};

// =================================================================
// Event Listeners e inizializzazione
// =================================================================

/**
 * Inizializza l'applicazione
 */
function init() {
    // Adatta l'altezza dell'input in base al contenuto
    DOM.messageInput.addEventListener('input', () => {
        DOM.messageInput.style.height = 'auto';
        DOM.messageInput.style.height = (DOM.messageInput.scrollHeight) + 'px';
    });

    // Invia messaggio al click del pulsante
    DOM.sendButton.addEventListener('click', handleSendMessage);

    // Invia messaggio alla pressione di Enter (senza Shift)
    DOM.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Pulisci console di debug
    DOM.clearConsoleButton.addEventListener('click', () => {
        Logger.clear();
    });

    // Verifica lo stato del server all'avvio
    ApiService.checkStatus();

    Logger.info('Applicazione inizializzata');
}

/**
 * Gestisce l'invio di un messaggio
 */
async function handleSendMessage() {
    const message = DOM.messageInput.value.trim();
    
    if (!message || STATE.waitingResponse) return;
    
    // Aggiungi il messaggio utente alla chat
    ChatUI.addMessage(message, 'user');
    ChatUI.clearInput();
    
    // Mostra l'indicatore di digitazione
    ChatUI.showTypingIndicator();
    
    // Invia il messaggio all'API
    const response = await ApiService.sendChatMessage(message);
    
    // Nascondi l'indicatore di digitazione
    ChatUI.hideTypingIndicator();
    
    if (response && response.response) {
        // Aggiungi la risposta dell'assistente alla chat
        ChatUI.addMessage(response.response, 'assistant', {
            model: response.model,
            cached: response.cached,
            usage: response.usage
        });
    } else {
        // Gestione dell'errore
        ChatUI.addMessage(
            "Mi dispiace, si è verificato un errore durante l'elaborazione della tua richiesta. Riprova più tardi.", 
            'assistant'
        );
    }
}

// Avvio dell'applicazione quando il DOM è caricato
document.addEventListener('DOMContentLoaded', init);