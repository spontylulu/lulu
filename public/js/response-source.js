export function resolveSourceIcon(data) {
  if (data.fromCache) return '💾';
  if (data.source === 'local') return '🧠';
  if (data.source === 'api') return '☁️';
  return '🤖';
}
