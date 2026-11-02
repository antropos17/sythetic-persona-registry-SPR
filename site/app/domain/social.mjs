function socialHref(channel) {
  const hosts = {
    TikTok: 'tiktok.com',
    Instagram: 'instagram.com',
    YouTube: 'youtube.com',
    X: 'x.com',
  };
  if (!channel || typeof channel.url !== 'string' || !hosts[channel.platform]) return null;
  try {
    const url = new URL(channel.url);
    const host = url.hostname.toLowerCase(),
      allowed = hosts[channel.platform];
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      (host !== allowed && host !== 'www.' + allowed) ||
      url.pathname === '/'
    )
      return null;
    if (channel.platform !== 'YouTube') {
      const expected = channel.handle?.trim().replace(/^@/, '').toLowerCase();
      const actual = decodeURIComponent(url.pathname.split('/')[1] || '')
        .replace(/^@/, '')
        .toLowerCase();
      if (!expected || actual !== expected) return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export { socialHref };
