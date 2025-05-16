/**
 * public/js/response-source.js
 * Componente che indica la fonte della risposta nell'interfaccia di Lulu
 */

// Configurazione delle fonti di risposta possibili
const RESPONSE_SOURCES = {
  CLAUDE: {
    name: 'Claude',
    color: '#8A57DF',  // Viola chiaro
    icon: 'brain'
  },
  CACHE: {
    name: 'Cache',
    color: '#4CAF50',  // Verde
    icon: 'database'
  },
  MULTI_AI: {
    name: 'Multi-AI',
    color: '#2196F3',  // Blu
    icon: 'layers'
  }
};

/**
 * Classe principale per il componente di indicazione fonte
 */
class ResponseSourceIndicator {
  constructor() {
    this.currentSource = null;
    this.container = null;
    this.detailsContainer = null;
    this.isDetailVisible = false;
    this.multiAiContributions = {};
    
    // Inizializza il componente
    this.initialize();
  }
  
  /**
   * Inizializza il componente e aggiunge alla DOM
   */
  initialize() {
    // Crea il container principale
    this.container = document.createElement('div');
    this.container.className = 'response-source-indicator';
    this.container.style.position = 'fixed';
    this.container.style.bottom = '20px';
    this.container.style.right = '20px';
    this.container.style.backgroundColor = '#FFF';
    this.container.style.borderRadius = '8px';
    this.container.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    this.container.style.padding = '8px 12px';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.fontFamily = 'Segoe UI, sans-serif';
    this.container.style.fontSize = '14px';
    this.container.style.zIndex = '1000';
    this.container.style.transition = 'all 0.3s ease';
    this.container.style.cursor = 'pointer';
    
    // Crea il contenitore per i dettagli
    this.detailsContainer = document.createElement('div');
    this.detailsContainer.className = 'response-source-details';
    this.detailsContainer.style.position = 'fixed';
    this.detailsContainer.style.bottom = '70px';
    this.detailsContainer.style.right = '20px';
    this.detailsContainer.style.backgroundColor = '#FFF';
    this.detailsContainer.style.borderRadius = '8px';
    this.detailsContainer.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    this.detailsContainer.style.padding = '15px';
    this.detailsContainer.style.width = '250px';
    this.detailsContainer.style.display = 'none';
    this.detailsContainer.style.zIndex = '999';
    this.detailsContainer.style.fontSize = '14px';
    
    // Aggiungi il container al documento
    document.body.appendChild(this.container);
    document.body.appendChild(this.detailsContainer);
    
    // Imposta lo stato iniziale (nascosto, verrà mostrato solo quando arriva una risposta)
    this.container.style.display = 'none';
    
    // Aggiungi gli event listener
    this.container.addEventListener('click', () => this.toggleDetails());
    
    // Aggiungi event listener per chiudere i dettagli quando si clicca fuori
    document.addEventListener('click', (event) => {
      if (this.isDetailVisible && 
          !this.container.contains(event.target) && 
          !this.detailsContainer.contains(event.target)) {
        this.toggleDetails();
      }
    });
  }
  
  /**
   * Imposta la fonte della risposta corrente
   * @param {string} sourceType - Tipo di fonte (chiave di RESPONSE_SOURCES)
   * @param {Object} metadata - Metadati aggiuntivi della risposta
   */
  setSource(sourceType, metadata = {}) {
    if (!RESPONSE_SOURCES[sourceType]) {
      return;
    }
    
    const source = RESPONSE_SOURCES[sourceType];
    this.currentSource = sourceType;
    
    // Salva metadati
    this.metadata = metadata;
    
    // Per Multi-AI, trattiene le contribuzioni
    if (sourceType === 'MULTI_AI' && metadata.contributions) {
      this.multiAiContributions = metadata.contributions;
    }
    
    // Aggiorna l'aspetto del container
    this.container.innerHTML = '';  // Pulisci il contenuto
    
    // Aggiungi l'icona
    const icon = document.createElement('span');
    icon.className = `icon icon-${source.icon}`;
    icon.innerHTML = this._getIconSvg(source.icon);
    icon.style.marginRight = '8px';
    icon.style.color = source.color;
    this.container.appendChild(icon);
    
    // Aggiungi il testo
    const text = document.createElement('span');
    text.textContent = source.name;
    text.style.fontWeight = '500';
    this.container.appendChild(text);
    
    // Se c'è stato un recupero da cache, mostra il badge della percentuale
    if (sourceType === 'CACHE' && metadata.similarity) {
      const similarity = Math.round(metadata.similarity * 100);
      const badge = document.createElement('span');
      badge.textContent = `${similarity}%`;
      badge.style.backgroundColor = source.color;
      badge.style.color = 'white';
      badge.style.borderRadius = '10px';
      badge.style.padding = '2px 6px';
      badge.style.fontSize = '12px';
      badge.style.marginLeft = '8px';
      this.container.appendChild(badge);
    }
    
    // Mostra il container
    this.container.style.display = 'flex';
    
    // Aggiorna i dettagli
    this._updateDetails();
  }
  
  /**
   * Aggiorna il contenuto del pannello dettagli
   * @private
   */
  _updateDetails() {
    this.detailsContainer.innerHTML = '';
    
    // Titolo
    const title = document.createElement('h3');
    title.textContent = 'Dettagli Risposta';
    title.style.margin = '0 0 10px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    this.detailsContainer.appendChild(title);
    
    // Fonte principale
    const sourceElem = document.createElement('div');
    sourceElem.style.marginBottom = '10px';
    sourceElem.innerHTML = `<strong>Fonte:</strong> ${RESPONSE_SOURCES[this.currentSource].name}`;
    this.detailsContainer.appendChild(sourceElem);
    
    // Casi specifici per ogni tipo di fonte
    switch (this.currentSource) {
      case 'CACHE':
        this._addCacheDetails();
        break;
      case 'CLAUDE':
        this._addClaudeDetails();
        break;
      case 'MULTI_AI':
        this._addMultiAiDetails();
        break;
    }
    
    // Aggiungi informazioni generali se disponibili
    if (this.metadata.timestamp) {
      const timestamp = new Date(this.metadata.timestamp);
      const timeElem = document.createElement('div');
      timeElem.style.marginTop = '10px';
      timeElem.style.fontSize = '12px';
      timeElem.style.color = '#666';
      timeElem.textContent = `Timestamp: ${timestamp.toLocaleString()}`;
      this.detailsContainer.appendChild(timeElem);
    }
  }
  
  /**
   * Aggiunge dettagli specifici per le risposte da cache
   * @private
   */
  _addCacheDetails() {
    if (this.metadata.similarity) {
      const similarityElem = document.createElement('div');
      similarityElem.innerHTML = `<strong>Similarità:</strong> ${Math.round(this.metadata.similarity * 100)}%`;
      this.detailsContainer.appendChild(similarityElem);
    }
    
    if (this.metadata.cachedAt) {
      const date = new Date(this.metadata.cachedAt);
      const dateElem = document.createElement('div');
      dateElem.innerHTML = `<strong>Cachato il:</strong> ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
      this.detailsContainer.appendChild(dateElem);
    }
    
    // Mostra se la risposta è stata compressa
    if (this.metadata.compressed !== undefined) {
      const compressedElem = document.createElement('div');
      compressedElem.innerHTML = `<strong>Compressione:</strong> ${this.metadata.compressed ? 'Sì' : 'No'}`;
      this.detailsContainer.appendChild(compressedElem);
    }
  }
  
  /**
   * Aggiunge dettagli specifici per le risposte di Claude
   * @private
   */
  _addClaudeDetails() {
    if (this.metadata.model) {
      const modelElem = document.createElement('div');
      modelElem.innerHTML = `<strong>Modello:</strong> ${this.metadata.model}`;
      this.detailsContainer.appendChild(modelElem);
    }
    
    if (this.metadata.usage) {
      const tokensElem = document.createElement('div');
      tokensElem.innerHTML = `<strong>Token:</strong> ${this.metadata.usage.total_tokens || '?'} totali`;
      this.detailsContainer.appendChild(tokensElem);
      
      if (this.metadata.usage.prompt_tokens && this.metadata.usage.completion_tokens) {
        const breakdownElem = document.createElement('div');
        breakdownElem.style.fontSize = '12px';
        breakdownElem.style.color = '#666';
        breakdownElem.style.marginLeft = '10px';
        breakdownElem.innerHTML = `Prompt: ${this.metadata.usage.prompt_tokens} | Risposta: ${this.metadata.usage.completion_tokens}`;
        this.detailsContainer.appendChild(breakdownElem);
      }
    }
    
    // Tempo di risposta se disponibile
    if (this.metadata.duration) {
      const timeElem = document.createElement('div');
      timeElem.innerHTML = `<strong>Tempo:</strong> ${this.metadata.duration}ms`;
      this.detailsContainer.appendChild(timeElem);
    }
  }
  
  /**
   * Aggiunge dettagli specifici per le risposte Multi-AI
   * @private
   */
  _addMultiAiDetails() {
    // Titolo sezione contribuzioni
    const contributionsTitle = document.createElement('div');
    contributionsTitle.innerHTML = '<strong>Contribuzioni:</strong>';
    contributionsTitle.style.marginTop = '10px';
    contributionsTitle.style.marginBottom = '5px';
    this.detailsContainer.appendChild(contributionsTitle);
    
    // Aggiungi un grafico/visualizzazione delle contribuzioni
    const chart = document.createElement('div');
    chart.className = 'contributions-chart';
    chart.style.height = '20px';
    chart.style.width = '100%';
    chart.style.display = 'flex';
    chart.style.marginBottom = '10px';
    chart.style.borderRadius = '4px';
    chart.style.overflow = 'hidden';
    
    // Crea le barre del grafico
    for (const [model, percentage] of Object.entries(this.multiAiContributions)) {
      const bar = document.createElement('div');
      bar.style.height = '100%';
      bar.style.width = `${percentage}%`;
      
      // Assegna colore in base al modello
      let color;
      if (model.toLowerCase().includes('claude')) {
        color = RESPONSE_SOURCES.CLAUDE.color;
      } else if (model.toLowerCase().includes('gpt')) {
        color = '#10A37F'; // Verde OpenAI
      } else {
        color = '#FF9800'; // Arancione per altri modelli
      }
      
      bar.style.backgroundColor = color;
      bar.title = `${model}: ${percentage}%`;
      chart.appendChild(bar);
    }
    
    this.detailsContainer.appendChild(chart);
    
    // Lista delle contribuzioni
    const list = document.createElement('ul');
    list.style.margin = '0';
    list.style.padding = '0 0 0 20px';
    list.style.fontSize = '13px';
    
    for (const [model, percentage] of Object.entries(this.multiAiContributions)) {
      const item = document.createElement('li');
      item.textContent = `${model}: ${percentage}%`;
      list.appendChild(item);
    }
    
    this.detailsContainer.appendChild(list);
  }
  
  /**
   * Mostra/nasconde il pannello dei dettagli
   */
  toggleDetails() {
    this.isDetailVisible = !this.isDetailVisible;
    this.detailsContainer.style.display = this.isDetailVisible ? 'block' : 'none';
  }
  
  /**
   * Ottiene il codice SVG per un'icona
   * @private
   * @param {string} iconName - Nome dell'icona
   * @returns {string} Codice SVG
   */
  _getIconSvg(iconName) {
    // SVG icons based on Feather Icons (https://feathericons.com/)
    const icons = {
      'brain': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2h.13a2 2 0 0 1 1.74 1A2 2 0 0 0 13 4h2a2 2 0 0 1 2 2v.5"></path><path d="M20 15a2 2 0 0 1-2 2h-.5a2 2 0 0 0-2 2 2 2 0 0 1-2 2h-2"></path><path d="M8 9h.13a2 2 0 0 1 1.74 1h.26a2 2 0 0 1 2 2a2 2 0 0 0 2 2a2 2 0 0 1 2 2"></path><path d="M18 19a2 2 0 0 0-2-2h-.5a2 2 0 0 1-2-2 2 2 0 0 0-2-2h-3"></path><path d="M15.5 12h.01"></path><path d="M11.5 12h.01"></path><path d="M13.5 16h.01"></path><path d="M9.5 16h.01"></path><path d="M7.5 12h.01"></path><path d="M9.5 20h.01"></path><path d="M3 8a3 3 0 0 1 3-3h.1"></path><path d="M3 17a3 3 0 0 0 3 3h.1"></path></svg>',
      'database': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>',
      'layers': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>'
    };
    
    return icons[iconName] || '';
  }
}

// Espone globalmente per accesso da altri script
window.ResponseSourceIndicator = ResponseSourceIndicator;
