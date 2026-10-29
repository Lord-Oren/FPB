// Shared routing configuration. Public access is opt-in; the editor always needs Access.
export function deploymentConfig(env = {}) {
  const hosts = {
    a: env.POND_PUBLIC_HOST || 'frogpondboys.com',
    b: env.POND_PREVIEW_HOST || 'preview.frogpondboys.com',
    desk: env.POND_DESK_HOST || 'desk.frogpondboys.com',
  };
  const www = env.POND_WWW_HOST || 'www.frogpondboys.com';
  const names = [...Object.values(hosts), www];
  if (names.some(name => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(name)) || new Set(names).size !== names.length) {
    throw new Error('Configure distinct, lowercase domain names without schemes or paths.');
  }
  if (env.POND_PUBLIC_SITE && !['true', 'false'].includes(env.POND_PUBLIC_SITE)) throw new Error('POND_PUBLIC_SITE must be true or false.');
  return { hosts, www, publicSite: env.POND_PUBLIC_SITE === 'true' };
}
