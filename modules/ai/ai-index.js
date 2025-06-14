/**
 * ai-index.js
 * Modulo AI principale con supporto a Ollama (Llama3.1:8B primario) e Claude (fallback)
 */

const logger = require('../../utils/logger').getLogger('ai:index');
const axios = require('axios');
const prompt = require('./ai-prompt-service');
const conversation = require('./ai-conversation-service');

let _config = {};
let _cache = null;
let _active = false;

async function initialize(config = {}, cacheModule = null) {
  console.log('=== AI INITIALIZE DEBUG ===');
  console.log('Config ricevuto:', config);
  console.log('Cache module presente:', !!cacheModule);
  
  _config = {
    defaultProvider: 'ollama',
    defaultModel: 'llama3.1:8b',
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: 'Rispondi sempre e solo in italiano con tono professionale.',
    services: {
      ollama: {
        enabled: true,
        host: 'http://192.168.0.174:11434',
        defaultModel: 'llama3.1:8b'
      },
      claude: {
        enabled: process.env.CLAUDE_API_KEY != null,
        apiKey: process.env.CLAUDE_API_KEY,
        defaultModel: 'claude-3-opus-20240229'
      }
    },
    caching: {
      enabled: true,
      similarity: true,
      similarityThreshold: 0.8
    },
    ...config
  };

  console.log('Configurazione finale _config:', _config);
  console.log('_config.services:', _config.services);

  _cache = cacheModule;
  await prompt.initialize({ defaultSystemPrompt: _config.systemPrompt });
  await conversation.initialize();

  _active = true;
  logger.info('Modulo AI inizializzato con Ollama (Llama3.1:8B) primario e Claude fallback');
  return module.exports;
}

async function shutdown() {
  await prompt.shutdown?.();
  await conversation.shutdown();
  _active = false;
  logger.info('Modulo AI chiuso');
}

function isActive() {
  return _active;
}

async function complete(promptText, options = {}) {
  console.log('=== AI COMPLETE DEBUG ===');
  console.log('_config presente:', !!_config);
  console.log('_config keys:', Object.keys(_config));
  console.log('_config.services presente:', !!_config.services);
  console.log('_config.services:', _config.services);
  
  // Controllo di sicurezza per configurazione
  if (!_config || !_config.services) {
    console.log('❌ ERRORE: Configurazione AI non inizializzata!');
    throw new Error('Modulo AI non inizializzato correttamente - configurazione mancante');
  }

  const settings = buildSettings(promptText, options);
  const cacheKey = generateCacheKey(promptText, settings);

  // Controlla cache prima di chiamare AI
  if (settings.useCache && _cache) {
    const cached = await _cache.get(promptText, { key: cacheKey });
    if (cached) {
      logger.debug('Cache hit - risposta trovata in cache');
      return { completion: cached.content || cached, model: settings.model };
    }
  }

  let response;
  
  // Prova prima Ollama (Llama3.1:8B)
  if (_config.services.ollama && _config.services.ollama.enabled) {
    try {
      logger.info('Tentativo connessione Ollama (Llama3.1:8B)');
      response = await callOllama(promptText, settings);
      logger.info('✅ Risposta ricevuta da Ollama');
    } catch (err) {
      logger.warn('❌ Ollama fallito, provo Claude come fallback:', err.message);
      
      // Fallback su Claude
      if (_config.services.claude && _config.services.claude.enabled) {
        try {
          logger.info('Tentativo fallback su Claude');
          response = await callClaude(promptText, settings);
          logger.info('✅ Risposta ricevuta da Claude (fallback)');
        } catch (claudeErr) {
          logger.error('❌ Anche Claude fallito:', claudeErr.message);
          throw claudeErr;
        }
      } else {
        logger.error('❌ Claude non configurato, nessun fallback disponibile');
        throw err;
      }
    }
  } else if (_config.services.claude && _config.services.claude.enabled) {
    // Solo Claude disponibile
    logger.info('Solo Claude disponibile');
    response = await callClaude(promptText, settings);
  } else {
    throw new Error('Nessun servizio AI disponibile');
  }

  // Salva in cache se abilitato
  if (settings.useCache && _cache) {
    await _cache.set(promptText, response.content, { key: cacheKey });
    logger.debug('Risposta salvata in cache');
  }

  return {
    completion: response.content,
    model: response.model
  };
}

function buildSettings(input, options = {}) {
  return {
    model: options.model || _config.defaultModel,
    temperature: options.temperature ?? _config.temperature,
    maxTokens: options.maxTokens || _config.maxTokens,
    systemPrompt: options.systemPrompt || _config.systemPrompt,
    useCache: options.useCache ?? _config.caching.enabled,
    userId: options.userId || 'anon'
  };
}

function generateCacheKey(text, opts = {}) {
  const key = `${text}|${opts.model}|${opts.userId}`;
  const hash = require('crypto').createHash('md5').update(key).digest('hex');
  return `ai:${hash}`;
}

async function callOllama(promptText, settings) {
  const { host, defaultModel } = _config.services.ollama;
  
  // Payload per Ollama API
  const payload = {
    model: settings.model || defaultModel,
    prompt: `${settings.systemPrompt}\n\nUtente: ${promptText}\nAssistente:`,
    stream: false,
    options: {
      temperature: settings.temperature,
      num_predict: settings.maxTokens
    }
  };

  logger.debug(`Chiamata Ollama: ${host}/api/generate`);
  logger.debug(`Modello: ${payload.model}`);

  const res = await axios.post(`${host}/api/generate`, payload, {
    timeout: 30000,  // 30 secondi timeout
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const content = res.data?.response || '[risposta vuota da Ollama]';
  logger.debug(`Risposta Ollama ricevuta: ${content.substring(0, 100)}...`);
  
  return { 
    content: content.trim(), 
    model: payload.model 
  };
}

async function callClaude(promptText, settings) {
  if (!_config.services.claude.apiKey) {
    throw new Error('Claude API key non configurata');
  }

  const payload = {
    model: _config.services.claude.defaultModel,
    max_tokens: settings.maxTokens,
    temperature: settings.temperature,
    messages: [
      { role: 'user', content: promptText }
    ]
  };

  logger.debug('Chiamata Claude API');
  
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    payload,
    {
      timeout: 30000,
      headers: {
        'x-api-key': _config.services.claude.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }
  );

  const content = res.data?.content?.[0]?.text || '[risposta vuota da Claude]';
  logger.debug(`Risposta Claude ricevuta: ${content.substring(0, 100)}...`);
  
  return { 
    content: content.trim(), 
    model: _config.services.claude.defaultModel 
  };
}

async function getAvailableModels() {
  const models = [];
  
  if (_config.services.ollama.enabled) {
    models.push({
      id: 'llama3.1:8b',
      name: 'Llama 3.1 8B (Ollama)',
      provider: 'ollama',
      capabilities: ['complete'],
      isDefault: _config.defaultProvider === 'ollama'
    });
  }
  
  if (_config.services.claude.enabled) {
    models.push({
      id: 'claude',
      name: 'Claude (Anthropic)',
      provider: 'anthropic',
      capabilities: ['complete'],
      isDefault: _config.defaultProvider === 'claude'
    });
  }
  
  return models;
}

async function getStatus() {
  return {
    active: _active,
    provider: _config.defaultProvider,
    defaultModel: _config.defaultModel,
    services: {
      ollama: {
        enabled: _config.services.ollama.enabled,
        host: _config.services.ollama.host
      },
      claude: {
        enabled: _config.services.claude.enabled,
        configured: !!_config.services.claude.apiKey
      }
    }
  };
}

module.exports = {
  initialize,
  shutdown,
  isActive,
  complete,
  getAvailableModels,
  getStatus
};