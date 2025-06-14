export function setupUI() {
  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.addEventListener('click', toggleTheme);
}

export function appendMessage(role, text, icon = '') {
  const msg = document.createElement('div');
  msg.className = 'message ' + (role === 'ai' ? 'ai' : 'user');
  msg.innerHTML = `<span>${text}</span> ${icon ? `<span class="source-icon">${icon}</span>` : ''}`;
  document.getElementById('chat').appendChild(msg);
  msg.scrollIntoView({ behavior: 'smooth' });
}

export function getInputText() {
  return document.getElementById('user-input').value.trim();
}

export function clearInput() {
  document.getElementById('user-input').value = '';
}

export function toggleTheme() {
  const root = document.documentElement;
  const light = getComputedStyle(root).getPropertyValue('--bg') === '#f5f5f5';
  root.style.setProperty('--bg', light ? '#1e1e1e' : '#f5f5f5');
  root.style.setProperty('--fg', light ? '#f5f5f5' : '#333');
  root.style.setProperty('--card', light ? '#2c2c2c' : '#fff');
}
