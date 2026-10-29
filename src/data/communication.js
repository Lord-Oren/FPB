// Public destinations only. Configure delivery in the receiving service, never in this file.
export const communication = {
  email: '',
  socials: [],
  contactAction: '',
  joinAction: '',
  privacyUrl: '',
};
export const cvMaxBytes = 5 * 1024 * 1024;

export function httpsDestination(value) {
  if (!value || !value.trim()) return undefined;
  if (/[\u0000-\u001f\u007f]|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) throw new Error('Control characters are not allowed in public destinations.');
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a public HTTPS destination without credentials.');
  return url.href;
}
export function submissionSettings(kind, settings = communication) {
  if (!['contact', 'join'].includes(kind)) throw new Error('Unknown form.');
  const action = httpsDestination(kind === 'join' ? settings.joinAction : settings.contactAction);
  return { action, ready: Boolean(action), method: action ? 'post' : 'dialog' };
}
export function contactChannels(settings = communication) {
  const email = settings.email.trim();
  if (email && !/^[^\s@?&#%]+@[^\s@?&#%]+\.[^\s@?&#%]+$/.test(email)) throw new Error('Invalid public contact email.');
  const socials = settings.socials.map(({ label, url }) => {
    const href = httpsDestination(url);
    if (!label?.trim() || !href) throw new Error('Each social link needs a name and an HTTPS URL.');
    return { label: label.trim(), href };
  });
  return { email, socials, privacyUrl: httpsDestination(settings.privacyUrl) };
}
