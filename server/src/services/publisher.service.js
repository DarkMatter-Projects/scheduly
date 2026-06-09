const axios = require('axios');
const pool = require('../config/db');
const { publishToPage } = require('./facebook.service');
const { publishToInstagram, postInstagramComment } = require('./instagram.service');
const { publishToTikTok } = require('./tiktok_posting.service');
const { publishToLinkedIn } = require('./linkedin.service');
const { publishToYouTube } = require('./youtube.service');
const twitterService = require('./twitter.service');
const { decrypt, encrypt } = require('./token.service');
const storage = require('./storage.service');
const logger = require('../utils/logger');
const env = require('../config/env');

// Public URL we can hand to Meta / Google / X so they can pull the
// asset directly. Mirrors the helper in facebook.service so we don't
// need to cross-require — small enough to copy.
function publicMediaUrl(media) {
  const url = storage.publicUrlFor(media.filePath);
  if (url && url.startsWith('http')) return url;
  const base = env.igPublicBaseUrl || process.env.IG_PUBLIC_BASE_URL || null;
  if (!base) throw new Error('publisher: no public base URL for media');
  return `${base.replace(/\/+$/, '')}/${String(media.filePath).replace(/^\/+/, '')}`;
}

async function publishPost(postId) {
  // Get post with media + TikTok-specific options
  const [postRows] = await pool.execute(
    `SELECT id, content, instagram_first_comment, instagram_collaborators, custom_thumbnail_media_id,
            linkedin_article_url,
            tiktok_post_mode, tiktok_privacy_level,
            tiktok_disable_duet, tiktok_disable_stitch, tiktok_disable_comment,
            youtube_privacy, youtube_title, youtube_made_for_kids, youtube_is_short,
            geo_label, geo_lat, geo_lng, geo_facebook_place_id, geo_twitter_place_id
       FROM posts WHERE id = ?`,
    [postId]
  );
  if (postRows.length === 0) throw new Error('Post not found');
  const post = postRows[0];

  // Get media files
  const [mediaRows] = await pool.execute(
    `SELECT m.* FROM media m
     JOIN post_media pm ON m.id = pm.media_id
     WHERE pm.post_id = ?
     ORDER BY pm.sort_order`,
    [postId]
  );

  const mediaFiles = mediaRows.map(m => ({
    id: m.id,
    filePath: m.file_path,
    mimeType: m.mime_type,
    originalName: m.original_name,
  }));

  // Get targets
  const [targets] = await pool.execute(
    `SELECT pt.id, pt.social_account_id, sa.id AS social_account_row_id,
            sa.platform, sa.platform_account_id, sa.access_token,
            sa.refresh_token, sa.token_expires_at
     FROM post_targets pt
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE pt.post_id = ? AND pt.status = 'pending'`,
    [postId]
  );

  if (targets.length === 0) {
    return { allSuccess: true, results: [] };
  }

  const results = [];
  let allSuccess = true;

  for (const target of targets) {
    try {
      let platformPostId;

      if (target.platform === 'facebook_page') {
        platformPostId = await publishToPage(
          target.platform_account_id,
          target.access_token,
          post.content,
          mediaFiles,
          // FB Page /feed accepts place=<page-id>. We only pass it when
          // the user picked a place via the geotag picker.
          { placeId: post.geo_facebook_place_id || null }
        );
      } else if (target.platform === 'instagram_business') {
        const publicBaseUrl = env.igPublicBaseUrl || null;
        // Parse the JSON column once — IG container accepts an array
        // of usernames as `collaborators`.
        let collaborators = [];
        if (post.instagram_collaborators) {
          try {
            collaborators = typeof post.instagram_collaborators === 'string'
              ? JSON.parse(post.instagram_collaborators)
              : post.instagram_collaborators;
          } catch { collaborators = []; }
        }
        platformPostId = await publishToInstagram(
          target.platform_account_id,
          target.access_token,
          post.content,
          mediaFiles,
          publicBaseUrl,
          { collaborators: Array.isArray(collaborators) ? collaborators : [] }
        );
        // IG treats any single-video post as a Reel (see instagram.service:
        // params.media_type = 'REELS'). Tag the post so dashboard widgets
        // that group by post_type put it in the Reel bucket instead of
        // "Photo or video".
        const onlyMedia = mediaFiles.length === 1 ? mediaFiles[0] : null;
        const isReel = onlyMedia && (onlyMedia.mimeType || onlyMedia.mime_type || '').startsWith('video/');
        if (isReel) {
          await pool.execute("UPDATE posts SET post_type = 'reel' WHERE id = ?", [postId]);
        }
        // First comment — best effort, failure here doesn't unwind the
        // publish status (the post still went live, only the comment
        // dropped). Log + continue.
        if (post.instagram_first_comment && platformPostId) {
          try {
            await postInstagramComment(platformPostId, target.access_token, post.instagram_first_comment);
            logger.info(`Post ${postId}: IG first comment posted on ${platformPostId}`);
          } catch (commentErr) {
            logger.warn(`Post ${postId}: IG first comment failed on ${platformPostId}: ${commentErr.response?.data?.error?.message || commentErr.message}`);
          }
        }
      } else if (target.platform === 'linkedin') {
        platformPostId = await publishToLinkedIn(
          target.social_account_row_id,
          post.content,
          mediaFiles,
          { articleUrl: post.linkedin_article_url || null }
        );
      } else if (target.platform === 'youtube') {
        // Resolve the custom thumbnail media row if the user set one
        // on the composer, so publishToYouTube can call
        // /thumbnails/set after the upload completes.
        let customThumbnail = null;
        if (post.custom_thumbnail_media_id) {
          const [thumbRows] = await pool.execute(
            'SELECT * FROM media WHERE id = ?',
            [post.custom_thumbnail_media_id]
          );
          if (thumbRows.length > 0) {
            const t = thumbRows[0];
            customThumbnail = {
              id: t.id,
              filePath: t.file_path,
              mimeType: t.mime_type,
              originalName: t.original_name,
            };
          }
        }
        // For YouTube Shorts append "#Shorts" to the description if
        // it's not already there — YouTube's identifier for Shorts is
        // the hashtag presence + vertical aspect + <=60s duration.
        // Aspect / duration are properties of the uploaded video we
        // can't influence; the hashtag is the only knob we control.
        let contentForYT = post.content || '';
        if (post.youtube_is_short && !/#shorts\b/i.test(contentForYT)) {
          contentForYT = `${contentForYT}\n\n#Shorts`.trim();
        }
        platformPostId = await publishToYouTube(
          target.social_account_row_id,
          contentForYT,
          mediaFiles,
          {
            privacy: post.youtube_privacy || 'private',
            // Dedicated YouTube title (max 100 chars). Falls back to caption
            // first line if the user didn't set one.
            title: post.youtube_title || undefined,
            madeForKids: !!post.youtube_made_for_kids,
            customThumbnail,
          }
        );
        // Tag the post_type as 'reel' for Shorts so the dashboard's
        // "Shorts performance" widget bucket can find it (the resolver
        // shares the IG Reels filter — both surface short-form video).
        if (post.youtube_is_short) {
          await pool.execute("UPDATE posts SET post_type = 'reel' WHERE id = ?", [postId]);
        }
      } else if (target.platform === 'twitter') {
        // X / Twitter: text post (with optional media) via OAuth 2.0.
        // Refresh the access token first if it's expired (X access
        // tokens last ~2h).
        let accessToken = decrypt(target.access_token);
        const expiresAt = target.token_expires_at ? new Date(target.token_expires_at).getTime() : 0;
        if (expiresAt && expiresAt < Date.now() + 60000 && target.refresh_token) {
          const refreshed = await twitterService.refreshAccessToken(decrypt(target.refresh_token));
          accessToken = refreshed.accessToken;
          const newExpires = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null;
          await pool.execute(
            `UPDATE social_accounts SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?`,
            [encrypt(refreshed.accessToken), refreshed.refreshToken ? encrypt(refreshed.refreshToken) : null, newExpires, target.social_account_row_id]
          );
        }
        // Upload each attached media to X via the chunked v2 flow, then
        // pass the resulting media_id strings on the tweet. Up to 4
        // images / 1 GIF / 1 video; if multiple videos are attached
        // we just take the first to match X's limits.
        const mediaIds = [];
        if (mediaFiles && mediaFiles.length > 0) {
          const hasVideo = mediaFiles.some(m => (m.mimeType || '').startsWith('video/'));
          const toUpload = hasVideo
            ? mediaFiles.filter(m => (m.mimeType || '').startsWith('video/')).slice(0, 1)
            : mediaFiles.filter(m => (m.mimeType || '').startsWith('image/')).slice(0, 4);
          for (const m of toUpload) {
            const url = publicMediaUrl(m);
            const { data: bytes } = await axios.get(url, {
              responseType: 'arraybuffer',
              timeout: 120000,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            });
            const mediaId = await twitterService.uploadMedia(accessToken, {
              bytes: Buffer.from(bytes),
              mimeType: m.mimeType || (hasVideo ? 'video/mp4' : 'image/jpeg'),
            });
            mediaIds.push(mediaId);
          }
        }
        platformPostId = await twitterService.publishTweet(accessToken, post.content, {
          geoPlaceId: post.geo_twitter_place_id || null,
          mediaIds,
        });
      } else if (target.platform === 'tiktok') {
        // TikTok returns a publish_id, not a platform post id — the post
        // finishes processing async on TikTok's side. We store the publish_id
        // in platform_post_id and a status checker can resolve the final
        // post URL later.
        platformPostId = await publishToTikTok(
          target.social_account_row_id,
          post.content,
          mediaFiles,
          {
            mode: post.tiktok_post_mode || 'INBOX',
            privacyLevel: post.tiktok_privacy_level || 'SELF_ONLY',
            disableDuet: !!post.tiktok_disable_duet,
            disableStitch: !!post.tiktok_disable_stitch,
            disableComment: !!post.tiktok_disable_comment,
          }
        );
      } else {
        throw new Error(`Unsupported platform: ${target.platform}`);
      }

      await pool.execute(
        "UPDATE post_targets SET status = 'published', platform_post_id = ?, published_at = NOW() WHERE id = ?",
        [platformPostId, target.id]
      );

      results.push({ targetId: target.id, platform: target.platform, success: true, platformPostId });
      logger.info(`Post ${postId}: published to ${target.platform} (${target.platform_account_id})`);
    } catch (err) {
      allSuccess = false;
      // Surface the real platform error body if available — what we get
      // tells us *why* it failed. Meta uses .error.message, X uses
      // .title/.detail, LinkedIn .message — try each shape.
      const body = err.response?.data;
      const fbErr = body?.error;
      let detail;
      if (fbErr && (fbErr.message || fbErr.type)) {
        detail = `${fbErr.message || fbErr.type || ''} ${fbErr.error_user_msg ? '— ' + fbErr.error_user_msg : ''} (code=${fbErr.code}/${fbErr.error_subcode || '-'})`.trim();
      } else if (body && (body.title || body.detail)) {
        // X / Twitter shape: { title: 'CreditsDepleted', detail: '...' }
        detail = `${body.title || ''}${body.detail ? ': ' + body.detail : ''}`.trim();
      } else if (body && body.message) {
        detail = body.message;
      } else {
        detail = err.message;
      }

      await pool.execute(
        "UPDATE post_targets SET status = 'failed', error_message = ? WHERE id = ?",
        [detail.slice(0, 500), target.id]
      );
      results.push({ targetId: target.id, platform: target.platform, success: false, error: detail });
      logger.error(`Post ${postId}: failed to publish to ${target.platform}: ${detail}`, {
        responseBody: err.response?.data,
        status: err.response?.status,
      });
    }
  }

  return { allSuccess, results };
}

module.exports = { publishPost };
