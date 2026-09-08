export function rememberMedia(cache, assets, now = Date.now()) {
  const visible = new Set(assets.map((a) => a.id));
  for (const id of cache.keys()) if (!visible.has(id)) cache.delete(id);
  for (const asset of assets) {
    const existing = cache.get(asset.id);
    if (asset.url && (!existing || existing.expiresAt <= now + 60000)) {
      cache.set(asset.id, {
        url: asset.url,
        expiresAt: asset.expiresAt || now + 240000,
      });
    }
  }
}
