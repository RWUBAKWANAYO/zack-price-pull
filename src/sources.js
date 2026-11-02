export const UNABLE = 'Unable to pull data';

export const COMPANIES = [
  { key: 'uber', name: 'Uber' },
  { key: 'bolt', name: 'Bolt' },
  { key: 'indrive', name: 'inDrive' },
];

export function sourceKey(value) {
  const key = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return key || 'uber';
}

export function unableToPull(source) {
  return { source: sourceKey(source), products: [], error: UNABLE };
}
