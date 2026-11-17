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
  for (const key of ['POND_PUBLIC_SITE', 'POND_PUBLIC_B']) {
    if (env[key] && !['true', 'false'].includes(env[key])) throw new Error(key + ' must be true or false.');
  }
  const publicSite = env.POND_PUBLIC_SITE === 'true';
  const publicB = env.POND_PUBLIC_B === 'true';
  if (publicB && !publicSite) throw new Error('Public B requires public site mode.');
  return { hosts, www, publicSite, publicB };
}

// Private previews build both designs; public B requires its own explicit opt-in.
export function publicationVariants({publicSite, publicB}) {
  return publicSite && !publicB ? ['a'] : ['a', 'b'];
}
