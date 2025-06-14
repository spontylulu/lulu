import { API } from './config.js';
import { resolveSourceIcon } from './response-source.js';
import { appendMessage, getInputText, clearInput } from './ui.js';

export function setupChat(callback) {
  const input = document.getElementById('user-input');
  const button = document.getElementById('send-button');

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') callback();
  });
  button.addEventListener('click', callback);
}

export async function sendMessage() {
  const text = getInputText();
  if (!text) return;

  appendMessage('user', text);
  clearInput();

  try {
    const res = await fetch(API.chat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    const icon = resolveSourceIcon(data);
    const content = data.content || '[vuoto]';
    appendMessage('ai', content, icon);
  } catch (err) {
    appendMessage('ai', '⚠️ Errore');
    console.error(err);
  }
}
