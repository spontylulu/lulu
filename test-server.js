/**
 * test-server.js
 * Server di test per Lulu che simula le risposte dell'API
 * per permettere lo sviluppo e il testing dell'interfaccia web
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger').getLogger('test:server');

// Crea un'istanza express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware per il parsing JSON
app.use(express.json());

// Middleware per servire i file statici dalla cartella public
app.use(express.static(path.join(__dirname, 'public')));

// Simulazione delle conversazioni
const conversations = new Map();

// API endpoint per lo stato del sistema
app.get('/api/v1/status', (req, res) => {
    logger.info('Richiesta di stato ricevuta');
    
    res.json({
        name: 'Lulu Test Server',
        version: '1.0.0',
        environment: 'development',
        timestamp: new Date().toISOString(),
        status: 'operational'
    });
});

// API endpoint per la chat
app.post('/api/v1/ai/chat', (req, res) => {
    const { message, conversation_id } = req.body;
    
    if (!message) {
        logger.warn('Richiesta di chat senza messaggio');
        return res.status(400).json({ 
            error: true, 
            message: 'Il messaggio è obbligatorio' 
        });
    }
    
    logger.info(`Messaggio ricevuto: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`, { conversation_id });
    
    // Genera un ID di conversazione se non fornito
    let conversationId = conversation_id;
    if (!conversationId) {
        conversationId = generateId();
        conversations.set(conversationId, []);
        logger.info(`Nuova conversazione creata: ${conversationId}`);
    }
    
    // Aggiungi il messaggio alla conversazione
    if (conversations.has(conversationId)) {
        conversations.get(conversationId).push({
            role: 'user',
            content: message,
            timestamp: new Date()
        });
    }
    
    // Simula un breve ritardo per rendere l'esperienza più realistica
    setTimeout(() => {
        // Genera una risposta
        const response = generateResponse(message, conversationId);
        
        // Aggiungi la risposta alla conversazione
        if (conversations.has(conversationId)) {
            conversations.get(conversationId).push({
                role: 'assistant',
                content: response,
                timestamp: new Date()
            });
        }
        
        // Calcola statistiche di utilizzo simulate
        const tokens = {
            prompt_tokens: Math.ceil(message.length / 4),
            completion_tokens: Math.ceil(response.length / 4),
            total_tokens: Math.ceil((message.length + response.length) / 4)
        };
        
        // Invia la risposta
        res.json({
            success: true,
            response: response,
            conversation_id: conversationId,
            model: 'lulu-test-model',
            cached: Math.random() > 0.8, // 20% di probabilità che sia in cache
            usage: tokens,
            timestamp: new Date().toISOString()
        });
        
        logger.info(`Risposta inviata per conversazione ${conversationId}`, { tokens });
    }, 1000 + Math.random() * 2000); // Ritardo tra 1-3 secondi
});

// Rotta per le informazioni di sistema
app.get('/api/v1/system/info', (req, res) => {
    logger.info('Richiesta informazioni di sistema');
    
    res.json({
        name: 'Lulu Test Server',
        version: '1.0.0',
        environment: 'development',
        timestamp: new Date().toISOString(),
        platform: {
            os: process.platform,
            version: process.version,
            memory: process.memoryUsage()
        },
        modules: {
            active: ['core', 'api'],
            count: 2
        }
    });
});

// Fallback per rotte non trovate API
app.use('/api', (req, res) => {
    logger.warn(`Endpoint API non trovato: ${req.originalUrl}`);
    res.status(404).json({
        error: true,
        message: `Endpoint non trovato: ${req.originalUrl}`
    });
});

// Fallback per tutte le altre rotte (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Avvia il server
app.listen(PORT, () => {
    logger.info(`Server di test avviato su http://localhost:${PORT}`);
    logger.info(`Apri il browser e visita http://localhost:${PORT} per interagire con Lulu`);
});

// Funzioni di utilità

/**
 * Genera un ID univoco per le conversazioni
 * @returns {string} ID generato
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Genera una risposta simulata in base al messaggio
 * @param {string} message - Messaggio dell'utente
 * @param {string} conversationId - ID della conversazione
 * @returns {string} Risposta generata
 */
function generateResponse(message, conversationId) {
    const lowerMessage = message.toLowerCase();
    
    // Risposte predefinite per parole chiave comuni
    if (lowerMessage.includes('ciao') || lowerMessage.includes('salve') || lowerMessage.includes('buongiorno')) {
        return 'Ciao! Come posso aiutarti oggi?';
    }
    
    if (lowerMessage.includes('come stai') || lowerMessage.includes('come va')) {
        return 'Sto funzionando perfettamente, grazie per averlo chiesto! Come posso esserti utile?';
    }
    
    if (lowerMessage.includes('aiuto') || lowerMessage.includes('help')) {
        return 'Sono qui per aiutarti! Posso rispondere a domande, fornire informazioni, o aiutarti con varie attività. Dimmi pure cosa ti serve.';
    }
    
    if (lowerMessage.includes('chi sei') || lowerMessage.includes('cosa sei')) {
        return 'Sono Lulu, un assistente AI personale. Sono progettato per aiutarti con varie attività, rispondere alle tue domande e fornire supporto. Al momento questo è un server di test per lo sviluppo dell\'interfaccia.';
    }
    
    if (lowerMessage.includes('grazie')) {
        return 'Di niente! Sono qui per aiutare. C\'è altro di cui hai bisogno?';
    }
    
    if (lowerMessage.includes('meteo') || lowerMessage.includes('tempo')) {
        return 'Mi dispiace, non ho accesso ai dati meteo in tempo reale in questa versione di test. In futuro potrei integrare servizi meteo per fornirti previsioni accurate.';
    }
    
    if (lowerMessage.includes('codice') || lowerMessage.includes('programmazione') || lowerMessage.includes('sviluppo')) {
        return 'Ecco un esempio di codice JavaScript:\n\n```javascript\n// Una semplice funzione per il calcolo del fattoriale\nfunction fattoriale(n) {\n  if (n === 0 || n === 1) {\n    return 1;\n  }\n  return n * fattoriale(n - 1);\n}\n\nconsole.log(fattoriale(5)); // Output: 120\n```\n\nSpero che questo esempio ti sia utile! Posso aiutarti con altro codice?';
    }
    
    if (lowerMessage.includes('lulu')) {
        return 'Sì, sono Lulu! Sono qui per assisterti. Come posso aiutarti oggi?';
    }
    
    // Risposte generiche per quando non ci sono match specifici
    const genericResponses = [
        "Interessante! Puoi dirmi di più?",
        "Capisco. In che modo posso aiutarti con questo?",
        "Sto elaborando la tua richiesta. Potresti darmi qualche dettaglio in più?",
        "Grazie per la tua domanda. Sto facendo del mio meglio per fornirti le informazioni più utili.",
        "Questo è un server di test per l'interfaccia di Lulu. Le risposte sono predefinite e non riflettono le capacità complete dell'assistente.",
        "Sto ancora imparando, ma farò del mio meglio per aiutarti.",
        "Mi dispiace, ma non ho abbastanza informazioni per rispondere a questa domanda in modo completo.",
        "In una versione completa, potrei rispondere in modo più approfondito a questa richiesta.",
        "Questa è una simulazione di risposta. Nell'implementazione finale, Lulu utilizzerà Claude o altri modelli AI per generare risposte più pertinenti.",
        "Interessante! In che contesto ti serve questa informazione?"
    ];
    
    // Se c'è una storia di conversazione, usa informazioni dal contesto
    if (conversations.has(conversationId) && conversations.get(conversationId).length > 2) {
        const history = conversations.get(conversationId);
        const lastAssistantMessage = [...history].reverse().find(msg => msg.role === 'assistant');
        
        if (lastAssistantMessage && Math.random() > 0.5) {
            genericResponses.push(`Come ti ho menzionato prima, sono un server di test. Le mie risposte sono predefinite.`);
            genericResponses.push(`Per continuare la nostra conversazione, potresti specificare meglio cosa ti interessa?`);
        }
    }
    
    // Seleziona una risposta casuale
    const randomIndex = Math.floor(Math.random() * genericResponses.length);
    return genericResponses[randomIndex];
}