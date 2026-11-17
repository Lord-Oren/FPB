// Which network a link points to, read from its address (T13, client feedback of 17 Nov 2026).
// The owners choose a footer link's icon by giving it an address in Pond Desk: put an x.com address in a slot and the
// slot shows the X icon, whatever it was called before. An unknown address keeps the slot's own icon (its ID).
// Pond Desk keeps the same table (editor/v2/app.js, NETWORK_HOSTS); scripts/front-social-network.test.mjs compares them.
export const NETWORK_HOSTS = {
  instagram: ['instagram.com'], linkedin: ['linkedin.com'], x: ['x.com', 'twitter.com'], facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'], youtube: ['youtube.com', 'youtu.be'], vimeo: ['vimeo.com'], threads: ['threads.net', 'threads.com'],
  bluesky: ['bsky.app'], spotify: ['spotify.com'], soundcloud: ['soundcloud.com'], pinterest: ['pinterest.com'], behance: ['behance.net'],
};
export const NETWORK_NAMES = { instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', vimeo: 'Vimeo', threads: 'Threads', bluesky: 'Bluesky', spotify: 'Spotify', soundcloud: 'SoundCloud', pinterest: 'Pinterest', behance: 'Behance' };
export function networkOf(url, fallback = '') {
  let host = '';
  try { host = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ''); } catch { host = ''; }
  for (const [network, hosts] of Object.entries(NETWORK_HOSTS)) if (hosts.some(h => host === h || host.endsWith('.' + h))) return network;
  const own = String(fallback).toLowerCase().replace(/^footer-/, '');
  return NETWORK_NAMES[own] ? own : '';
}
