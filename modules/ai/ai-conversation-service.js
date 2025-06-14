/**
 * ai-conversation-service.js
 * Gestione conversazioni con memoria su disco
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const logger = require('../../utils/logger').getLogger('ai:conversation');

const storePath = './data/conversations';

const conversationService = {
  _conversations: new Map(),

  async initialize() {
    await fs.mkdir(storePath, { recursive: true });
    logger.info('Servizio conversazioni inizializzato');
    return this;
  },

  async shutdown() {
    logger.info('Servizio conversazioni chiuso');
  },

  async createConversation(userId) {
    const id = crypto.randomUUID();
    const convo = { id, userId, messages: [], createdAt: Date.now() };
    this._conversations.set(id, convo);
    return convo;
  },

  async getConversation(id) {
    return this._conversations.get(id) || null;
  },

  async getUserConversations(userId) {
    return [...this._conversations.values()].filter(c => c.userId === userId);
  },

  async addMessage(convoId, message) {
    const convo = this._conversations.get(convoId);
    if (!convo) return false;
    convo.messages.push({ ...message, timestamp: Date.now() });
    return true;
  },

  async updateConversation(id, changes = {}) {
    const convo = this._conversations.get(id);
    if (!convo) return false;
    Object.assign(convo, changes);
    return true;
  },

  async deleteConversation(id) {
    return this._conversations.delete(id);
  },

  getCount() {
    return this._conversations.size;
  }
};

module.exports = conversationService;
