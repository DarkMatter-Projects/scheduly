// Build a "view on platform" URL from a post_target row.
//   target = { platform, platformPostId, accountName, ... }
//
// Returns null when we can't construct a stable URL without extra data
// (e.g. IG needs a permalink we don't store from the publish call).
export function platformPostUrl(target) {
  if (!target?.platformPostId) return null;
  const pid = target.platformPostId;

  if (target.platform === 'facebook_page') {
    // FB accepts "{pageId}_{postId}" or bare post IDs at the root URL and
    // redirects to the canonical permalink.
    return `https://www.facebook.com/${pid}`;
  }

  if (target.platform === 'youtube') {
    // We store the video id returned by the upload as platform_post_id.
    return `https://www.youtube.com/watch?v=${pid}`;
  }

  if (target.platform === 'linkedin') {
    // We store the activity URN (urn:li:share:... or urn:li:ugcPost:...).
    // LinkedIn's feed URL accepts the urn-encoded form.
    const encoded = encodeURIComponent(pid);
    return `https://www.linkedin.com/feed/update/${encoded}/`;
  }

  if (target.platform === 'tiktok') {
    // TikTok returns a publish_id immediately, but the public video id only
    // resolves after async processing (we'd need to poll status). Without a
    // public video id we can't deep-link — fall back to the channel page.
    // accountName here is the user's display_name from user.info.basic.
    return target.accountName ? `https://www.tiktok.com/@${encodeURIComponent(target.accountName)}` : null;
  }

  if (target.platform === 'instagram_business') {
    // IG's Graph publish call returns a media id, not a shortcode, and the
    // /p/{shortcode}/ public URL needs the shortcode. We don't store the
    // permalink from the publish response (only the ingestion path does).
    // Best we can offer: the IG account's profile page.
    return target.accountName ? `https://www.instagram.com/${encodeURIComponent(target.accountName)}/` : null;
  }

  return null;
}

export function platformPostUrlLabel(platform) {
  return {
    facebook_page: 'View on Facebook',
    instagram_business: 'Open on Instagram',
    tiktok: 'Open on TikTok',
    youtube: 'View on YouTube',
    linkedin: 'View on LinkedIn',
  }[platform] || 'View on platform';
}
