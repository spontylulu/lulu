import { sendMessage, setupChat } from './chat.js';
import { setupUI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    setupUI();
    setupChat(sendMessage);
});
